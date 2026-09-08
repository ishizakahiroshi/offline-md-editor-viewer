use serde::Serialize;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

#[derive(Serialize)]
struct DesktopFileEntry {
    kind: String,
    name: String,
    path: String,
    parent_path: String,
    modified: u128,
}

#[derive(Serialize)]
struct DesktopDirectoryListing {
    entries: Vec<DesktopFileEntry>,
    truncated: bool,
    warnings: Vec<String>,
}

#[derive(Default)]
struct DirectoryListingState {
    entries: Vec<DesktopFileEntry>,
    truncated: bool,
    warnings: Vec<String>,
}

#[derive(Default)]
struct CloseGuardState {
    frontend_ready: AtomicBool,
}

// LAUNCH-RS-001: 2 本目の exe 起動（別インスタンス）から届いたパスを、フロントエンドが
// 準備完了になるまで一時的に溜めておくキュー。emit イベントの取りこぼしと、初回起動自身の
// 引数（desktop_get_launch_file_path 側で処理済み）との二重処理を避けるための経路。
#[derive(Default)]
struct PendingLaunchPathsState {
    paths: Mutex<Vec<String>>,
}

const RAW_PATH_HEADER: &str = "x-offline-md-editor-path";

fn path_to_string(path: &Path) -> String {
    // 全コマンドで一貫した '/' 区切り表現を返す（HTML 側のキー比較を破綻させないため）。
    // Windows のバックスラッシュは '/' に正規化する。MAINT-002。
    path.to_string_lossy().replace('\\', "/")
}

fn reject_nul_in_path(path: &str) -> Result<(), String> {
    if path.contains('\0') {
        Err("Invalid path.".to_string())
    } else {
        Ok(())
    }
}

// SEC-RS-002: BUG-RS-004 / SEC-RS-001 はディレクトリ列挙中に見つかった symlink を除外するだけで、
// フロントエンドが単一の操作対象として直接渡すパス（読み書き・削除・改名・移動元・コピー元）自体が
// symlink やジャンクションだった場合までは検査していなかった。列挙済みリストは既に除外済みだが、
// 列挙してから操作するまでの間に対象が symlink へ差し替えられる TOCTOU も塞ぐため、破壊的操作の
// 直接対象はここで検査する。ユーザーが明示的に選ぶフォルダそのもの（ダイアログで開いた
// ルートフォルダ・親ディレクトリ）はここでは対象にしない。ジャンクション経由でプロジェクトフォルダを
// 運用する既存の使い方を壊さないため。
fn reject_symlink_or_reparse(path: &str) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(err.to_string()),
    };
    if metadata.file_type().is_symlink() {
        return Err("Symbolic links are not supported.".to_string());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err("Reparse points are not supported.".to_string());
        }
    }
    Ok(())
}

const VIEWABLE_EXTENSIONS: &[&str] = &[
    "md", "markdown", "txt", "log", "rst", "adoc", "json", "yml", "yaml", "toml", "ini", "conf",
    "xml", "csv", "tsv", "sql", "diff", "patch",
];

const VIEWABLE_DOTFILES: &[&str] = &[
    ".gitignore",
    ".gitattributes",
    ".editorconfig",
    ".dockerignore",
    ".npmrc",
    ".prettierrc",
    ".eslintrc",
];

fn is_markdown_file(path: &Path) -> bool {
    let name_lower = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    if VIEWABLE_DOTFILES.contains(&name_lower.as_str()) {
        return true;
    }
    if name_lower == ".env" || name_lower.starts_with(".env.") {
        return true;
    }
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let lower = ext.to_ascii_lowercase();
            VIEWABLE_EXTENSIONS.contains(&lower.as_str())
        })
        .unwrap_or(false)
}

fn modified_millis(path: &Path) -> u128 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

const MAX_LIST_DEPTH: usize = 32;
const MAX_LIST_ENTRIES: usize = 50_000;
const MAX_LIST_WARNINGS: usize = 8;

fn record_listing_warning(
    state: &mut DirectoryListingState,
    path: &Path,
    detail: impl Into<String>,
) {
    state.truncated = true;
    if state.warnings.len() < MAX_LIST_WARNINGS {
        state
            .warnings
            .push(format!("{}: {}", path_to_string(path), detail.into()));
    }
}

fn collect_markdown_files(dir: &Path) -> Result<DesktopDirectoryListing, String> {
    let mut state = DirectoryListingState::default();
    collect_markdown_files_inner(dir, &mut state, 0)?;
    Ok(DesktopDirectoryListing {
        entries: state.entries,
        truncated: state.truncated,
        warnings: state.warnings,
    })
}

fn collect_markdown_files_inner(
    dir: &Path,
    state: &mut DirectoryListingState,
    depth: usize,
) -> Result<(), String> {
    if depth > MAX_LIST_DEPTH {
        record_listing_warning(state, dir, "Directory tree is too deep to list.");
        return Ok(());
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) if depth == 0 => return Err(err.to_string()),
        Err(err) => {
            record_listing_warning(state, dir, err.to_string());
            return Ok(());
        }
    };
    for entry in entries {
        if state.entries.len() >= MAX_LIST_ENTRIES {
            record_listing_warning(
                state,
                dir,
                "Too many entries to list. Please open a smaller folder.",
            );
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                record_listing_warning(state, dir, err.to_string());
                continue;
            }
        };
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(err) => {
                record_listing_warning(state, &path, err.to_string());
                continue;
            }
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        // Windows のジャンクション/マウントポイント（REPARSE_POINT）も除外し、再帰ループや
        // 想定外ボリュームへの侵入を防ぐ。BUG-RS-004。
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
            if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                continue;
            }
        }
        if metadata.is_dir() {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string();
            let parent_path = path.parent().map(path_to_string).unwrap_or_default();
            state.entries.push(DesktopFileEntry {
                kind: "dir".to_string(),
                name,
                path: path_to_string(&path),
                parent_path,
                modified: modified_millis(&path),
            });
            collect_markdown_files_inner(&path, state, depth + 1)?;
        } else if metadata.is_file() {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string();
            let parent_path = path.parent().map(path_to_string).unwrap_or_default();
            state.entries.push(DesktopFileEntry {
                kind: "file".to_string(),
                name,
                path: path_to_string(&path),
                parent_path,
                modified: modified_millis(&path),
            });
        }
    }
    Ok(())
}

#[tauri::command]
fn desktop_open_file_dialog() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown"])
        .add_filter(
            "Plain text",
            &[
                "txt", "log", "rst", "adoc", "json", "yml", "yaml", "toml", "ini", "conf", "xml",
                "csv", "tsv", "sql", "diff", "patch",
            ],
        )
        .add_filter("All files", &["*"])
        .pick_file()
        .map(|path| path_to_string(&path))
}

#[tauri::command]
fn desktop_save_file_dialog(suggested_name: Option<String>) -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown"])
        .add_filter(
            "Plain text",
            &[
                "txt", "log", "rst", "adoc", "json", "yml", "yaml", "toml", "ini", "conf", "xml",
                "csv", "tsv", "sql", "diff", "patch",
            ],
        )
        .add_filter("All files", &["*"])
        .set_file_name(suggested_name.as_deref().unwrap_or("untitled.md"))
        .save_file()
        .map(|path| path_to_string(&path))
}

#[tauri::command]
fn desktop_open_directory_dialog() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path_to_string(&path))
}

// BUG-RS-106: 巨大ファイルの一括メモリ展開で OOM / 長時間応答停止を起こすのを防ぐ。
// HTML 側は数 MB の Markdown を想定しており、64 MiB を超えるテキストは編集対象外として明示拒否する。
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;

fn decode_hex_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn decode_path_header_value(encoded: &str) -> Result<String, String> {
    if encoded.is_empty() || encoded.len() % 2 != 0 {
        return Err("Invalid raw path header.".to_string());
    }
    let encoded_bytes = encoded.as_bytes();
    let mut bytes = Vec::with_capacity(encoded_bytes.len() / 2);
    for pair in encoded_bytes.chunks_exact(2) {
        let high =
            decode_hex_nibble(pair[0]).ok_or_else(|| "Invalid raw path header.".to_string())?;
        let low =
            decode_hex_nibble(pair[1]).ok_or_else(|| "Invalid raw path header.".to_string())?;
        bytes.push((high << 4) | low);
    }
    String::from_utf8(bytes).map_err(|_| "Raw path header is not valid UTF-8.".to_string())
}

fn path_from_raw_request(request: &tauri::ipc::Request<'_>) -> Result<String, String> {
    let mut values = request.headers().get_all(RAW_PATH_HEADER).iter();
    let value = values
        .next()
        .ok_or_else(|| "Missing raw path header.".to_string())?;
    if values.next().is_some() {
        return Err("Duplicate raw path header.".to_string());
    }
    let encoded = value
        .to_str()
        .map_err(|_| "Raw path header is not valid ASCII.".to_string())?;
    let path = decode_path_header_value(encoded)?;
    reject_nul_in_path(&path)?;
    Ok(path)
}

fn read_bounded<R: Read>(
    reader: R,
    initial_size: Option<u64>,
    max_bytes: u64,
) -> Result<Vec<u8>, String> {
    let capacity = initial_size
        .unwrap_or(0)
        .min(max_bytes)
        .try_into()
        .unwrap_or(0usize);
    let mut limited_reader = reader.take(max_bytes.saturating_add(1));
    let mut bytes = Vec::with_capacity(capacity);
    limited_reader
        .read_to_end(&mut bytes)
        .map_err(|err| err.to_string())?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!(
            "File is too large to open in this editor (limit: {} MiB).",
            max_bytes / (1024 * 1024)
        ));
    }
    Ok(bytes)
}

#[tauri::command]
fn desktop_read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    reject_nul_in_path(&path)?;
    reject_symlink_or_reparse(&path)?;
    // BUG-RS-NEW-205: metadata と fs::read の間にファイルが成長すると、事前サイズ検査だけでは
    // 64 MiB 上限が fail-open になる。先にハンドルを開き、そのハンドルから上限 + 1 byte だけ読む。
    let file = fs::File::open(&path).map_err(|err| err.to_string())?;
    let initial_size = file.metadata().ok().map(|metadata| metadata.len());
    let bytes = read_bounded(file, initial_size, MAX_FILE_BYTES)?;
    Ok(tauri::ipc::Response::new(bytes))
}

fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "Target path has no parent directory.".to_string())?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "Target path has no file name.".to_string())?;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id();
    let mut tmp_name = std::ffi::OsString::from(file_name);
    tmp_name.push(format!(".tmp.{}.{}", pid, nanos));
    let tmp_path = parent.join(tmp_name);

    let result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&tmp_path).map_err(|err| err.to_string())?;
        file.write_all(data).map_err(|err| err.to_string())?;
        file.flush().map_err(|err| err.to_string())?;
        file.sync_all().map_err(|err| err.to_string())?;
        drop(file);
        fs::rename(&tmp_path, path).map_err(|err| {
            // Windows で対象ファイルが他プロセスにロックされていると ACCESS_DENIED で失敗する。
            // 原本は保持されるため、ユーザーが状況を把握しやすい文脈付きメッセージへ整形する。
            // BUG-RS-010。
            let raw = err.raw_os_error();
            if raw == Some(5) || raw == Some(32) || raw == Some(33) {
                format!(
                    "保存に失敗しました。対象ファイルが他のアプリで開かれていないか確認してください（原本は保持されています）: {}",
                    err
                )
            } else {
                err.to_string()
            }
        })?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }
    result
}

#[tauri::command]
fn desktop_write_file_text(path: String, text: String) -> Result<(), String> {
    reject_nul_in_path(&path)?;
    reject_symlink_or_reparse(&path)?;
    // BUG-RS-106: 巨大ペイロードの書き込みは fs::File::create → write_all 経由でメモリ・I/O を圧迫する。
    if text.len() as u64 > MAX_FILE_BYTES {
        return Err(format!(
            "Content is too large to save (limit: {} MiB).",
            MAX_FILE_BYTES / (1024 * 1024)
        ));
    }
    atomic_write(Path::new(&path), text.as_bytes())
}

#[tauri::command]
fn desktop_write_file_bytes(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let path = path_from_raw_request(&request)?;
    reject_symlink_or_reparse(&path)?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes,
        tauri::ipc::InvokeBody::Json(_) => {
            return Err("Raw byte request body is required.".to_string());
        }
    };
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(format!(
            "Content is too large to save (limit: {} MiB).",
            MAX_FILE_BYTES / (1024 * 1024)
        ));
    }
    atomic_write(Path::new(&path), bytes.as_slice())
}

#[tauri::command]
fn desktop_list_shallow_entries(dir_path: String) -> Result<DesktopDirectoryListing, String> {
    reject_nul_in_path(&dir_path)?;
    let dir = PathBuf::from(&dir_path);
    let read_dir = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut state = DirectoryListingState::default();
    for entry in read_dir {
        // BUG-RS-105: collect_markdown_files_inner と同様に上限を設け、
        // 1 ディレクトリに数百万エントリある pathological ケースで UI 無応答を防ぐ。
        if state.entries.len() >= MAX_LIST_ENTRIES {
            record_listing_warning(
                &mut state,
                &dir,
                "Too many entries to list. Please open a smaller folder.",
            );
            break;
        }
        // FBL-002 (2026-07-03): エントリ単位の取得失敗（列挙中の削除競合・ACL 拒否等）で
        // 列挙全体を Err にせず skip する。deep 列挙 collect_markdown_files_inner と同方針。
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                record_listing_warning(&mut state, &dir, err.to_string());
                continue;
            }
        };
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = match fs::symlink_metadata(&entry_path) {
            Ok(metadata) => metadata,
            Err(err) => {
                record_listing_warning(&mut state, &entry_path, err.to_string());
                continue;
            }
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        // BUG-RS-NEW-204: collect_markdown_files_inner と同じく、Windows のジャンクション
        // /マウントポイント (REPARSE_POINT) を浅い列挙でも除外して、深い列挙との整合を取る。
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
            if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                continue;
            }
        }
        if metadata.is_dir() {
            state.entries.push(DesktopFileEntry {
                kind: "dir".to_string(),
                name,
                path: path_to_string(&entry_path),
                parent_path: path_to_string(&dir),
                modified: modified_millis(&entry_path),
            });
        } else if metadata.is_file() {
            state.entries.push(DesktopFileEntry {
                kind: "file".to_string(),
                name,
                path: path_to_string(&entry_path),
                parent_path: path_to_string(&dir),
                modified: modified_millis(&entry_path),
            });
        }
    }
    Ok(DesktopDirectoryListing {
        entries: state.entries,
        truncated: state.truncated,
        warnings: state.warnings,
    })
}

fn is_already_exists_error(err: &io::Error) -> bool {
    err.kind() == io::ErrorKind::AlreadyExists || matches!(err.raw_os_error(), Some(80) | Some(183))
}

fn already_exists_error(kind: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::AlreadyExists,
        format!("An item with that name already exists: {}", kind),
    )
}

fn unique_temp_sibling(parent: &Path) -> io::Result<PathBuf> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id();
    for counter in 0..1000u32 {
        let candidate = parent.join(format!(
            ".offline-md-editor-viewer-temp-{}-{}-{}",
            pid, nanos, counter
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "Could not allocate a temporary sibling path.",
    ))
}

#[cfg(windows)]
fn move_without_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    const MOVEFILE_WRITE_THROUGH: u32 = 0x00000008;
    let source_wide: Vec<u16> = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let result = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn move_without_replace(source: &Path, destination: &Path) -> io::Result<()> {
    if destination.exists() {
        return Err(already_exists_error(destination.to_string_lossy().as_ref()));
    }
    fs::rename(source, destination)
}

#[cfg(windows)]
fn windows_file_identity(path: &Path) -> io::Result<(u32, u64)> {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;

    #[allow(dead_code)]
    #[repr(C)]
    struct ByHandleFileInformation {
        file_attributes: u32,
        creation_time_low: u32,
        creation_time_high: u32,
        last_access_time_low: u32,
        last_access_time_high: u32,
        last_write_time_low: u32,
        last_write_time_high: u32,
        volume_serial_number: u32,
        file_size_high: u32,
        file_size_low: u32,
        number_of_links: u32,
        file_index_high: u32,
        file_index_low: u32,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateFileW(
            file_name: *const u16,
            desired_access: u32,
            share_mode: u32,
            security_attributes: *mut c_void,
            creation_disposition: u32,
            flags_and_attributes: u32,
            template_file: isize,
        ) -> isize;
        fn GetFileInformationByHandle(
            file: isize,
            information: *mut ByHandleFileInformation,
        ) -> i32;
        fn CloseHandle(object: isize) -> i32;
    }

    const INVALID_HANDLE_VALUE: isize = -1;
    const FILE_SHARE_READ: u32 = 0x00000001;
    const FILE_SHARE_WRITE: u32 = 0x00000002;
    const FILE_SHARE_DELETE: u32 = 0x00000004;
    const OPEN_EXISTING: u32 = 3;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x02000000;
    let path_wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let handle = unsafe {
        CreateFileW(
            path_wide.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null_mut(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            0,
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }
    let mut information: ByHandleFileInformation = unsafe { std::mem::zeroed() };
    let result = unsafe { GetFileInformationByHandle(handle, &mut information) };
    let close_result = unsafe { CloseHandle(handle) };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    if close_result == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok((
        information.volume_serial_number,
        (u64::from(information.file_index_high) << 32) | u64::from(information.file_index_low),
    ))
}

#[cfg(windows)]
fn same_file_identity(source: &Path, destination: &Path) -> io::Result<bool> {
    Ok(windows_file_identity(source)? == windows_file_identity(destination)?)
}

#[cfg(not(windows))]
fn same_file_identity(source: &Path, destination: &Path) -> io::Result<bool> {
    Ok(fs::canonicalize(source)? == fs::canonicalize(destination)?)
}

fn case_only_rename(source: &Path, destination: &Path) -> io::Result<()> {
    let parent = source
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Source has no parent."))?;
    let temporary = unique_temp_sibling(parent)?;
    move_without_replace(source, &temporary)?;
    match move_without_replace(&temporary, destination) {
        Ok(()) => Ok(()),
        Err(err) => {
            if let Err(restore_err) = move_without_replace(&temporary, source) {
                return Err(io::Error::other(format!(
                    "Rename failed and the temporary path could not be restored ({}): {}",
                    restore_err, err
                )));
            }
            Err(err)
        }
    }
}

fn rename_without_replace(source: &Path, destination: &Path) -> io::Result<()> {
    if source == destination {
        return Ok(());
    }
    if destination.exists() {
        // Windows treats paths differing only by case as the same directory entry. Move through
        // an owned sibling temporary name so a case-only rename does not trip the no-clobber rule.
        if same_file_identity(source, destination).unwrap_or(false) {
            return case_only_rename(source, destination);
        }
        return Err(already_exists_error(destination.to_string_lossy().as_ref()));
    }
    move_without_replace(source, destination)
}

#[tauri::command]
fn desktop_rename_file(path: String, new_name: String) -> Result<String, String> {
    reject_nul_in_path(&path)?;
    reject_symlink_or_reparse(&path)?;
    if !is_valid_child_name(&new_name) {
        return Err("Invalid file name.".to_string());
    }
    let old_path = PathBuf::from(path);
    let parent = old_path
        .parent()
        .ok_or_else(|| "File has no parent directory".to_string())?;
    let new_path = parent.join(new_name.trim());
    rename_without_replace(&old_path, &new_path).map_err(|err| {
        if is_already_exists_error(&err) {
            "ALREADY_EXISTS: A file with that name already exists.".to_string()
        } else {
            err.to_string()
        }
    })?;
    Ok(path_to_string(&new_path))
}

fn is_cross_device_error(err: &io::Error) -> bool {
    // Windows: ERROR_NOT_SAME_DEVICE = 17. Linux/macOS: EXDEV = 18.
    matches!(err.raw_os_error(), Some(17) | Some(18))
}

fn remove_owned_path(path: &Path, is_dir: bool) {
    if is_dir {
        let _ = fs::remove_dir_all(path);
    } else {
        let _ = fs::remove_file(path);
    }
}

fn move_across_devices(
    source: &Path,
    destination: &Path,
    source_is_dir: bool,
) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Target path has no parent directory.".to_string())?;
    let temporary = unique_temp_sibling(parent).map_err(|err| err.to_string())?;
    let copy_result = if source_is_dir {
        copy_dir_recursive(source, &temporary)
    } else {
        copy_file_no_replace(source, &temporary)
    };
    if let Err(err) = copy_result {
        remove_owned_path(&temporary, source_is_dir);
        return Err(err);
    }

    if let Err(err) = move_without_replace(&temporary, destination) {
        remove_owned_path(&temporary, source_is_dir);
        if is_already_exists_error(&err) {
            return Err("ALREADY_EXISTS: An item with that name already exists.".to_string());
        }
        return Err(format!("Could not finalize the moved item: {}", err));
    }

    let remove_result = if source_is_dir {
        fs::remove_dir_all(source)
    } else {
        fs::remove_file(source)
    };
    if let Err(err) = remove_result {
        return Err(format!(
            "Copied to {} but failed to remove the original: {}. The complete copy is at the new location; the original may still exist.",
            path_to_string(destination),
            err
        ));
    }
    Ok(())
}

#[tauri::command]
fn desktop_move_entry(source_path: String, target_dir_path: String) -> Result<String, String> {
    reject_nul_in_path(&source_path)?;
    reject_nul_in_path(&target_dir_path)?;
    reject_symlink_or_reparse(&source_path)?;
    let source = PathBuf::from(source_path);
    let target_dir = PathBuf::from(target_dir_path);
    if !source.exists() {
        return Err("Source does not exist.".to_string());
    }
    if !target_dir.is_dir() {
        return Err("Target directory does not exist.".to_string());
    }
    let source_name = source
        .file_name()
        .ok_or_else(|| "Source has no file name.".to_string())?;
    let source_parent = source
        .parent()
        .ok_or_else(|| "Source has no parent directory.".to_string())?;
    let canonical_source = fs::canonicalize(&source).map_err(|err| err.to_string())?;
    let canonical_target_dir = fs::canonicalize(&target_dir).map_err(|err| err.to_string())?;
    let canonical_parent = fs::canonicalize(source_parent).map_err(|err| err.to_string())?;
    if canonical_parent == canonical_target_dir {
        return Ok(path_to_string(&source));
    }
    if canonical_source.is_dir() && canonical_target_dir.starts_with(&canonical_source) {
        return Err(
            "MOVE_INVALID: Cannot move a directory into itself or one of its subdirectories."
                .to_string(),
        );
    }
    let target = target_dir.join(source_name);
    if target.exists() {
        return Err("ALREADY_EXISTS: An item with that name already exists.".to_string());
    }
    let source_is_dir = source.is_dir();
    if let Err(err) = move_without_replace(&source, &target) {
        if is_cross_device_error(&err) {
            move_across_devices(&source, &target, source_is_dir)?;
        } else if is_already_exists_error(&err) {
            return Err("ALREADY_EXISTS: An item with that name already exists.".to_string());
        } else {
            return Err(err.to_string());
        }
    }
    Ok(path_to_string(&target))
}

#[tauri::command]
fn desktop_delete_file(path: String) -> Result<(), String> {
    reject_nul_in_path(&path)?;
    reject_symlink_or_reparse(&path)?;
    fs::remove_file(path).map_err(|err| err.to_string())
}

fn is_valid_child_name(name: &str) -> bool {
    let trimmed = name.trim();
    let base_name = trimmed
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let is_windows_reserved = matches!(
        base_name.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    );
    !trimmed.is_empty()
        && trimmed != "."
        && trimmed != ".."
        && !trimmed.ends_with('.')
        && !trimmed.ends_with(' ')
        && !is_windows_reserved
        && !trimmed.chars().any(|ch| {
            ch.is_control() || matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
}

#[tauri::command]
fn desktop_create_directory(parent_path: String, name: String) -> Result<String, String> {
    reject_nul_in_path(&parent_path)?;
    if !is_valid_child_name(&name) {
        return Err("Invalid folder name.".to_string());
    }
    let parent = PathBuf::from(parent_path);
    if !parent.is_dir() {
        return Err("Parent directory does not exist.".to_string());
    }
    let new_path = parent.join(name.trim());
    if new_path.exists() {
        return Err("ALREADY_EXISTS: A folder with that name already exists.".to_string());
    }
    fs::create_dir(&new_path).map_err(|err| err.to_string())?;
    Ok(path_to_string(&new_path))
}

#[tauri::command]
fn desktop_create_file(parent_path: String, name: String) -> Result<String, String> {
    reject_nul_in_path(&parent_path)?;
    if !is_valid_child_name(&name) {
        return Err("Invalid file name.".to_string());
    }
    let parent = PathBuf::from(parent_path);
    if !parent.is_dir() {
        return Err("Parent directory does not exist.".to_string());
    }
    let new_path = parent.join(name.trim());
    // BUG-RS-NEW-201: 事前 `exists()` チェックと `fs::write` の間に同名ファイルが作られると、
    // fs::write は既存ファイルを truncate して空にする（サイレントなデータ消失）。
    // create_new(true) で OS レベルの原子的な「無ければ作る／あれば失敗」に置き換える。
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&new_path)
    {
        Ok(_) => Ok(path_to_string(&new_path)),
        Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
            Err("ALREADY_EXISTS: A file with that name already exists.".to_string())
        }
        Err(err) => Err(err.to_string()),
    }
}

/// Copy a single file or directory tree from `source_path` into `target_dir_path`.
/// If an entry with the same name already exists, a numeric suffix " (1)", " (2)", …
/// is appended to the stem (or bare name for folders) until a free slot is found.
/// Returns the final destination path.
#[tauri::command]
fn desktop_copy_entry(source_path: String, target_dir_path: String) -> Result<String, String> {
    reject_nul_in_path(&source_path)?;
    reject_nul_in_path(&target_dir_path)?;
    reject_symlink_or_reparse(&source_path)?;
    let source = PathBuf::from(&source_path);
    let target_dir = PathBuf::from(&target_dir_path);
    if !source.exists() {
        return Err("Source does not exist.".to_string());
    }
    if !target_dir.is_dir() {
        return Err("Target directory does not exist.".to_string());
    }
    if source.is_dir() {
        let canonical_source = fs::canonicalize(&source).map_err(|err| err.to_string())?;
        let canonical_target_dir = fs::canonicalize(&target_dir).map_err(|err| err.to_string())?;
        if canonical_target_dir.starts_with(&canonical_source) {
            return Err(
                "COPY_INVALID: Cannot copy a directory into itself or one of its subdirectories."
                    .to_string(),
            );
        }
    }
    let name = source
        .file_name()
        .ok_or_else(|| "Source has no file name.".to_string())?
        .to_string_lossy()
        .into_owned();
    let dest_name = resolve_unique_name(&target_dir, &name);
    let dest = target_dir.join(&dest_name);
    if source.is_dir() {
        copy_dir_recursive(&source, &dest)?;
    } else {
        copy_file_no_replace(&source, &dest)?;
    }
    Ok(path_to_string(&dest))
}

/// Returns a name that does not yet exist inside `dir`.  If `name` is already free,
/// returns it unchanged.  Otherwise appends " (1)", " (2)", … to the stem.
fn resolve_unique_name(dir: &Path, name: &str) -> String {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return name.to_string();
    }
    // Split into stem + extension (extension may be empty for folders or dotfiles)
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| name.to_string());
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let mut counter: u32 = 1;
    loop {
        let candidate_name = format!("{} ({}){}", stem, counter, ext);
        if !dir.join(&candidate_name).exists() {
            return candidate_name;
        }
        counter += 1;
    }
}

const MAX_COPY_DEPTH: usize = 64;

fn copy_file_no_replace(source: &Path, destination: &Path) -> Result<(), String> {
    let mut source_file = fs::File::open(source).map_err(|err| err.to_string())?;
    let mut destination_file = match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
    {
        Ok(file) => file,
        Err(err) => return Err(err.to_string()),
    };
    let result = (|| -> Result<(), String> {
        io::copy(&mut source_file, &mut destination_file).map_err(|err| err.to_string())?;
        destination_file.sync_all().map_err(|err| err.to_string())?;
        Ok(())
    })();
    drop(destination_file);
    if result.is_err() {
        let _ = fs::remove_file(destination);
    }
    result
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    // The root is claimed with create_dir, so cleanup on failure can only remove a directory
    // created by this operation. No existing destination is ever replaced.
    fs::create_dir(dest).map_err(|err| err.to_string())?;
    match copy_dir_recursive_inner(src, dest, 0) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = fs::remove_dir_all(dest);
            Err(e)
        }
    }
}

fn copy_dir_recursive_inner(src: &Path, dest: &Path, depth: usize) -> Result<(), String> {
    if depth > MAX_COPY_DEPTH {
        return Err("Directory tree is too deep to copy.".to_string());
    }
    for entry in fs::read_dir(src).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let src_child = entry.path();
        // symlink を辿らず種別判定。symlink はコピー対象から除外（ループ・脱出防止）
        let meta = fs::symlink_metadata(&src_child).map_err(|err| err.to_string())?;
        if meta.file_type().is_symlink() {
            continue;
        }
        // SEC-RS-001: list API と同様に Windows のジャンクション/マウントポイント
        // (REPARSE_POINT) をコピー対象から除外する。is_symlink() だけでは拾えない
        // reparse を辿ると想定外ボリュームの内容が混入しうる。
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
            if meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                continue;
            }
        }
        let dest_child = dest.join(entry.file_name());
        if meta.is_dir() {
            fs::create_dir(&dest_child).map_err(|err| err.to_string())?;
            copy_dir_recursive_inner(&src_child, &dest_child, depth + 1)?;
        } else {
            copy_file_no_replace(&src_child, &dest_child)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn desktop_delete_directory(path: String, recursive: bool) -> Result<(), String> {
    reject_nul_in_path(&path)?;
    reject_symlink_or_reparse(&path)?;
    let target = PathBuf::from(path);
    if !target.is_dir() {
        return Err("Directory does not exist.".to_string());
    }
    if recursive {
        fs::remove_dir_all(target).map_err(|err| err.to_string())
    } else {
        fs::remove_dir(target).map_err(|err| err.to_string())
    }
}

#[tauri::command]
fn desktop_open_path_in_explorer(path: String) -> Result<(), String> {
    if path.contains("://") {
        return Err("Invalid path.".to_string());
    }
    reject_nul_in_path(&path)?;
    // canonicalize は symlink/ジャンクションを辿ってしまうため、辿る前に対象そのものを検査する。
    reject_symlink_or_reparse(&path)?;
    let target = PathBuf::from(&path);
    let canonical = fs::canonicalize(&target).map_err(|err| err.to_string())?;
    if !canonical.is_dir() {
        return Err("Path is not a directory.".to_string());
    }
    let canonical_str = canonical.to_string_lossy();
    // BUG-RS-101: UNC verbatim パス \\?\UNC\server\share\... を strip_prefix(r"\\?\") だけで処理すると
    // "UNC\server\share\..." という壊れた文字列になり Explorer が開けない。UNC を先に検出して \\ プレフィックスへ復元する。
    let cleaned: String = if let Some(rest) = canonical_str.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{}", rest)
    } else if let Some(rest) = canonical_str.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        canonical_str.to_string()
    };
    // SEC-CMD-001: bare "explorer" 名で起動すると PATH 解決に依存し PATH 先取り攻撃に弱い。
    // %SystemRoot% から絶対パスを組み立てて起動する（取得できない場合のみ bare 名にフォールバック）。
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| String::from(r"C:\Windows"));
    let explorer_path = format!(r"{}\explorer.exe", system_root.trim_end_matches('\\'));
    Command::new(explorer_path)
        .arg(&cleaned)
        .spawn()
        .map(|_| ())
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn desktop_open_external_url(url: String) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return Err("Only http/https URLs can be opened.".to_string());
    }
    if url.contains('\0') || url.chars().any(|ch| ch.is_control()) {
        return Err("Invalid URL.".to_string());
    }
    // SEC-CMD-001: bare "rundll32" 名で起動すると PATH 解決に依存。System32 配下を明示する。
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| String::from(r"C:\Windows"));
    let rundll32_path = format!(
        r"{}\System32\rundll32.exe",
        system_root.trim_end_matches('\\')
    );
    Command::new(rundll32_path)
        .arg("url.dll,FileProtocolHandler")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn desktop_get_launch_file_path() -> Option<String> {
    let arg = std::env::args().nth(1)?;
    let path = PathBuf::from(&arg);
    if !path.is_file() {
        return None;
    }
    if !is_markdown_file(&path) {
        return None;
    }
    Some(path_to_string(&path))
}

// LAUNCH-RS-001: フロントエンドは desktop_frontend_ready の成功直後にこれを呼ぶ。
// 別インスタンス起動イベント（desktop-open-launch-paths）を取りこぼした場合でも、
// このキューから同じパス集合を回収できるようにするための二重経路。
#[tauri::command]
fn desktop_take_pending_launch_paths(
    state: tauri::State<'_, PendingLaunchPathsState>,
) -> Vec<String> {
    let mut queue = state
        .paths
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    std::mem::take(&mut *queue)
}

#[tauri::command]
fn desktop_force_close_window<R: tauri::Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.destroy().map_err(|err| err.to_string())
}

#[tauri::command]
fn desktop_frontend_ready(state: tauri::State<'_, CloseGuardState>) -> Result<(), String> {
    state.frontend_ready.store(true, Ordering::Release);
    Ok(())
}

fn should_prevent_close(frontend_ready: bool) -> bool {
    frontend_ready
}

#[tauri::command]
fn desktop_get_file_directory(file_path: String) -> Result<DesktopDirectoryListing, String> {
    reject_nul_in_path(&file_path)?;
    let path = PathBuf::from(&file_path);
    let parent = path
        .parent()
        .ok_or_else(|| "File has no parent directory".to_string())?;
    collect_markdown_files(parent)
}

fn inspect_drag_drop_path(path: &Path) -> Result<&'static str, String> {
    let metadata = fs::symlink_metadata(path).map_err(|err| err.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Symbolic links are not accepted for drag and drop.".to_string());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err("Reparse points are not accepted for drag and drop.".to_string());
        }
    }
    if metadata.is_dir() {
        Ok("dir")
    } else if metadata.is_file() {
        Ok("file")
    } else {
        Err("The dropped path is not a regular file or directory.".to_string())
    }
}

// LAUNCH-RS-005: WebView2 のデータ位置を identifier から切り離して固定するための名前。
// 指定が無い場合の既定は %LOCALAPPDATA%\<identifier> になるため、LAUNCH-RS-002 で
// identifier を配置別へ書き換えると、exe 隣に userdata を作れない配置（MSIX の
// 読み取り専用インストール先など）で保存先が別フォルダへ移り、既に配布済みの版を
// 使っているユーザーの localStorage（テーマ・履歴・最後に開いたフォルダ・表示モード）
// が空になる。0.3.3 までが使っていた名前をそのまま定数として持ち、以後は identifier に
// 依存せずこのフォルダを指し続ける。**この値は変更しない。**
const LEGACY_WEBVIEW_DATA_DIR_NAME: &str = "com.ishizakahiroshi.offline-md-editor-viewer";

// exe 隣に userdata を作れないときの保存先を返す。読み取り専用の配置でも
// 既配布版と同じフォルダを指すことが目的。
fn fallback_webview_data_dir(local_app_data: Option<&str>) -> Option<PathBuf> {
    let base = local_app_data?;
    if base.is_empty() {
        return None;
    }
    Some(PathBuf::from(base).join(LEGACY_WEBVIEW_DATA_DIR_NAME))
}

fn configure_portable_userdata() {
    let exe_path = match std::env::current_exe() {
        Ok(path) => path,
        Err(_) => return,
    };
    let exe_dir = match exe_path.parent() {
        Some(dir) => dir.to_path_buf(),
        None => return,
    };
    let userdata = exe_dir.join("offline-md-editor-viewer-userdata");
    if fs::create_dir_all(&userdata).is_ok() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &userdata);
        return;
    }
    // ポータブル配置に書けない場合のみ、既配布版と同じ固定フォルダへ明示的に寄せる。
    let local_app_data = std::env::var("LOCALAPPDATA").ok();
    if let Some(fallback) = fallback_webview_data_dir(local_app_data.as_deref()) {
        if fs::create_dir_all(&fallback).is_ok() {
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &fallback);
        }
    }
}

// FNV-1a 64bit。std::collections::hash_map::DefaultHasher はハッシュアルゴリズムの詳細を
// rustc バージョン間で保証しないため、配置別 identifier のように同一プロセス内で
// 決定的な値が要る用途には使わない。新規依存を増やさず数行で書ける自前実装で足りる。
fn fnv1a64(data: &[u8]) -> u64 {
    const FNV_OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
    const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash = FNV_OFFSET_BASIS;
    for byte in data {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

// LAUNCH-RS-002: tauri-plugin-single-instance の Windows 実装は、排他キー（mutex / window
// class 名）を app.config().identifier だけから作る。Store 版・portable 版・開発版はすべて
// 同じ identifier（com.ishizakahiroshi.offline-md-editor-viewer）を使うため、素のまま渡すと
// 別フォルダに置かれた別配置のコピー同士が誤って単一インスタンスに統合されてしまう。
// exe が置かれているディレクトリを正規化してハッシュへ混ぜ込み、配置ごとに別の
// identifier へ分離する。大文字小文字とパス区切りの違いは同一の配置とみなすため、
// ハッシュ計算前に小文字化しバックスラッシュを '/' へそろえる。
fn placement_scoped_identifier(base: &str, exe_dir: &str) -> String {
    let normalized_exe_dir = exe_dir.to_ascii_lowercase().replace('\\', "/");
    let hash = fnv1a64(normalized_exe_dir.as_bytes());
    format!("{base}-p{hash:016x}")
}

// LAUNCH-RS-003: 上限に達した状態で新規パスが届いた場合は新規パスを破棄し、既存キューは
// そのまま保持する。大量の外部起動が連続する異常系でもメモリ増加を止めつつ、
// フロントエンドが起動した時点で最初に受け取った要求（ユーザーが最初に開こうとした
// ファイル）から順に開けることを優先するため、後着ではなく先着を残す設計にした。
const MAX_PENDING_LAUNCH_PATHS: usize = 64;

fn push_pending_launch_path(queue: &mut Vec<String>, path: String) {
    if queue.iter().any(|existing| existing == &path) {
        return;
    }
    if queue.len() >= MAX_PENDING_LAUNCH_PATHS {
        return;
    }
    queue.push(path);
}

// LAUNCH-RS-004: 2 本目の起動から届いた argv を、既存画面へ渡してよいパスの集合へ絞り込む。
// argv[0]（実行ファイル自身のパス）は対象外。相対パスは cwd を基準に解決し、引数は
// シェルコマンドとして解釈しない（単なるパス文字列としてのみ扱う）。既存のパス検証ヘルパ
// （reject_nul_in_path → is_file → is_markdown_file → reject_symlink_or_reparse）を
// そのまま流用し、1 つでも弾かれたパスは黙って捨てる。
fn resolve_secondary_instance_launch_paths(argv: &[String], cwd: &str) -> Vec<String> {
    let cwd_path = PathBuf::from(cwd);
    let mut seen = std::collections::HashSet::new();
    let mut resolved = Vec::new();
    for arg in argv.iter().skip(1) {
        if reject_nul_in_path(arg).is_err() {
            continue;
        }
        let candidate = PathBuf::from(arg);
        let absolute = if candidate.is_absolute() {
            candidate
        } else {
            cwd_path.join(candidate)
        };
        if !absolute.is_file() {
            continue;
        }
        if !is_markdown_file(&absolute) {
            continue;
        }
        let normalized = path_to_string(&absolute);
        if reject_symlink_or_reparse(&normalized).is_err() {
            continue;
        }
        if seen.insert(normalized.clone()) {
            resolved.push(normalized);
        }
    }
    resolved
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_portable_userdata();

    // LAUNCH-RS-002: identifier を配置別へ書き換えてから .run(context) へ渡す。
    // config_mut() は tauri 2.11 で public かつ安定 API。
    let mut context = tauri::generate_context!();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .map(|dir| path_to_string(&dir))
        .unwrap_or_default();
    let scoped_identifier = placement_scoped_identifier(&context.config().identifier, &exe_dir);
    context.config_mut().identifier = scoped_identifier;

    let run_result = tauri::Builder::default()
        .manage(CloseGuardState::default())
        .manage(PendingLaunchPathsState::default())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // 2 本目の起動から届いたパスを既存ウィンドウへ渡す。フロントエンド準備前は
            // ペンディングキューへ積み、準備済みならイベントで即時通知する。
            let paths = resolve_secondary_instance_launch_paths(&argv, &cwd);
            if !paths.is_empty() {
                let frontend_ready = app
                    .state::<CloseGuardState>()
                    .frontend_ready
                    .load(Ordering::Acquire);
                if frontend_ready {
                    let _ = app.emit(
                        "desktop-open-launch-paths",
                        serde_json::json!({ "paths": paths }),
                    );
                } else {
                    let pending = app.state::<PendingLaunchPathsState>();
                    let mut queue = pending
                        .paths
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    for path in paths {
                        push_pending_launch_path(&mut queue, path);
                    }
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_open_file_dialog,
            desktop_save_file_dialog,
            desktop_open_directory_dialog,
            desktop_read_file_bytes,
            desktop_write_file_text,
            desktop_write_file_bytes,
            desktop_rename_file,
            desktop_move_entry,
            desktop_copy_entry,
            desktop_delete_file,
            desktop_create_directory,
            desktop_create_file,
            desktop_delete_directory,
            desktop_open_path_in_explorer,
            desktop_open_external_url,
            desktop_get_launch_file_path,
            desktop_take_pending_launch_paths,
            desktop_force_close_window,
            desktop_frontend_ready,
            desktop_get_file_directory,
            desktop_list_shallow_entries
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, position }) => {
                    // Convert physical pixel position to logical (CSS) coordinates.
                    let scale = window.scale_factor().unwrap_or(1.0);
                    let lx = position.x / scale;
                    let ly = position.y / scale;

                    // Inspect the link itself before any path-following check. Reparse points and
                    // symlinks are rejected and the reason is sent to the frontend for display.
                    let mut entries = Vec::new();
                    let mut rejected = Vec::new();
                    for path in paths {
                        match inspect_drag_drop_path(path) {
                            Ok(kind) => entries.push(
                                serde_json::json!({ "path": path_to_string(path), "kind": kind }),
                            ),
                            Err(reason) => rejected.push(serde_json::json!({
                                "path": path_to_string(path),
                                "reason": reason
                            })),
                        }
                    }

                    if entries.is_empty() && rejected.is_empty() {
                        return;
                    }

                    // For backward-compatibility keep "path" / "kind" pointing at the first entry.
                    let first_path = entries
                        .first()
                        .and_then(|entry| entry.get("path"))
                        .and_then(|value| value.as_str())
                        .unwrap_or_default();
                    let first_kind = entries
                        .first()
                        .and_then(|entry| entry.get("kind"))
                        .and_then(|value| value.as_str())
                        .unwrap_or_default();
                    let payload = serde_json::json!({
                        "path": first_path,
                        "kind": first_kind,
                        "paths": entries,
                        "rejected": rejected,
                        "position": { "x": lx, "y": ly }
                    });
                    let _ = window.emit("desktop-drag-drop", payload);
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Before frontend readiness, native close remains available even if the webview
                    // failed to initialize. Only the ready handshake enables the async unsaved guard.
                    let frontend_ready = window
                        .app_handle()
                        .state::<CloseGuardState>()
                        .frontend_ready
                        .load(Ordering::Acquire);
                    if should_prevent_close(frontend_ready) {
                        api.prevent_close();
                    }
                }
                _ => {}
            }
        })
        .run(context);
    if let Err(err) = run_result {
        // windows_subsystem = "windows" 下では panic してもユーザーに無言クラッシュとして
        // 見えるため、stderr へ詳細を出してから明示的に異常終了する。WebView2 Runtime 不在
        // などの可能性をログに残す。BUG-RS-002。
        eprintln!(
            "Failed to start offline-md-editor-viewer: {}. \
             WebView2 Runtime が未導入の可能性があります。\
             https://developer.microsoft.com/microsoft-edge/webview2/ から導入してください。",
            err
        );
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{self, Cursor, Read};

    fn encode_path_header_value(path: &str) -> String {
        path.as_bytes()
            .iter()
            .map(|byte| format!("{:02X}", byte))
            .collect()
    }

    struct FailingReader;

    impl Read for FailingReader {
        fn read(&mut self, _buffer: &mut [u8]) -> io::Result<usize> {
            // `ErrorKind::Interrupted` is retried forever by `Read::read_to_end`'s default
            // implementation, so an always-failing reader must use a non-retried kind or
            // `bounded_reader_rejects_growth_past_limit` hangs instead of asserting.
            Err(io::Error::other("injected read error"))
        }
    }

    fn test_directory(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!(
            "offline-md-editor-viewer-{}-{}-{}",
            label,
            std::process::id(),
            nanos
        ));
        fs::create_dir_all(&path).expect("create test directory");
        path
    }

    #[test]
    fn bounded_reader_rejects_growth_past_limit() {
        assert!(read_bounded(Cursor::new(Vec::<u8>::new()), Some(0), 2).is_ok());
        let bytes = read_bounded(Cursor::new(vec![1u8, 2, 3]), Some(2), 2);
        assert!(bytes.is_err());

        let bytes = read_bounded(Cursor::new(vec![1u8, 2]), Some(2), 2)
            .expect("small file should be readable");
        assert_eq!(bytes, vec![1u8, 2]);
        assert!(read_bounded(FailingReader, None, 2).is_err());
    }

    #[test]
    fn no_clobber_copy_preserves_existing_destination() {
        let root = test_directory("copy");
        let source = root.join("source.md");
        let destination = root.join("destination.md");
        fs::write(&source, b"source").expect("write source");
        fs::write(&destination, b"destination").expect("write destination");

        let result = copy_file_no_replace(&source, &destination);
        assert!(result.is_err());
        assert_eq!(fs::read(&source).expect("read source"), b"source");
        assert_eq!(
            fs::read(&destination).expect("read destination"),
            b"destination"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn no_clobber_move_preserves_existing_destination() {
        let root = test_directory("move");
        let source = root.join("source.md");
        let destination = root.join("destination.md");
        fs::write(&source, b"source").expect("write source");
        fs::write(&destination, b"destination").expect("write destination");

        let result = move_without_replace(&source, &destination);
        assert!(result.is_err());
        assert_eq!(fs::read(&source).expect("read source"), b"source");
        assert_eq!(
            fs::read(&destination).expect("read destination"),
            b"destination"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn case_only_rename_uses_a_temporary_sibling() {
        let root = test_directory("case-only");
        let source = root.join("README.md");
        let destination = root.join("readme.md");
        fs::write(&source, b"content").expect("write source");

        rename_without_replace(&source, &destination).expect("case-only rename");
        assert_eq!(
            fs::read(&destination).expect("read renamed file"),
            b"content"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn listing_warning_marks_partial_results() {
        let mut state = DirectoryListingState::default();
        record_listing_warning(&mut state, Path::new("folder"), "permission denied");
        assert!(state.truncated);
        assert_eq!(state.warnings.len(), 1);
    }

    #[test]
    fn raw_path_header_codec_round_trips_unicode_and_special_characters() {
        for path in [
            r"C:\資料 %25.md",
            r"C:\folder with spaces\note.md",
            r"C:\100%\日本語.md",
        ] {
            let encoded = encode_path_header_value(path);
            assert_eq!(
                decode_path_header_value(&encoded).expect("decode path"),
                path
            );
        }
        assert!(decode_path_header_value("").is_err());
        assert!(decode_path_header_value("0").is_err());
        assert!(decode_path_header_value("GG").is_err());
        assert!(decode_path_header_value("FF").is_err());
    }

    #[test]
    fn close_guard_stays_disabled_until_frontend_ready() {
        assert!(!should_prevent_close(false));
        assert!(should_prevent_close(true));
    }

    #[test]
    fn fallback_webview_data_dir_pins_the_legacy_identifier_folder() {
        // identifier を配置別へ書き換えても、既配布版が使っていたフォルダを指し続ける。
        let dir = fallback_webview_data_dir(Some("C:/Users/example/AppData/Local"))
            .expect("fallback directory");
        assert!(dir.ends_with(LEGACY_WEBVIEW_DATA_DIR_NAME));
        assert_eq!(
            LEGACY_WEBVIEW_DATA_DIR_NAME,
            "com.ishizakahiroshi.offline-md-editor-viewer"
        );
        assert!(fallback_webview_data_dir(None).is_none());
        assert!(fallback_webview_data_dir(Some("")).is_none());
    }

    #[test]
    fn placement_scoped_identifier_is_deterministic_and_placement_sensitive() {
        let base = "com.ishizakahiroshi.offline-md-editor-viewer";
        let first = placement_scoped_identifier(base, "C:/apps/one");
        let second = placement_scoped_identifier(base, "C:/apps/one");
        assert_eq!(first, second);

        let different = placement_scoped_identifier(base, "C:/apps/two");
        assert_ne!(first, different);
        assert!(first.starts_with(&format!("{base}-p")));
    }

    #[test]
    fn placement_scoped_identifier_normalizes_case_and_separators() {
        let base = "com.ishizakahiroshi.offline-md-editor-viewer";
        let backslash_upper = placement_scoped_identifier(base, r"C:\Apps\One");
        let forward_lower = placement_scoped_identifier(base, "c:/apps/one");
        assert_eq!(backslash_upper, forward_lower);
    }

    #[test]
    fn secondary_instance_launch_paths_filters_and_dedupes() {
        let root = test_directory("launch-argv");
        let markdown = root.join("note.md");
        fs::write(&markdown, b"# note").expect("write markdown");
        let rejected_ext = root.join("app.exe");
        fs::write(&rejected_ext, b"binary").expect("write rejected extension file");
        let missing = root.join("missing.md");

        let cwd = path_to_string(&root);
        let argv = vec![
            "offline-md-editor-viewer.exe".to_string(), // argv[0]: always excluded
            "note.md".to_string(),                      // relative: resolved against cwd
            path_to_string(&markdown),                  // absolute duplicate of the same file
            path_to_string(&rejected_ext),              // wrong extension: dropped
            path_to_string(&missing),                   // does not exist: dropped
        ];

        let resolved = resolve_secondary_instance_launch_paths(&argv, &cwd);
        assert_eq!(resolved, vec![path_to_string(&markdown)]);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn secondary_instance_launch_paths_returns_empty_for_argv0_only() {
        let resolved = resolve_secondary_instance_launch_paths(
            &["offline-md-editor-viewer.exe".to_string()],
            "C:/",
        );
        assert!(resolved.is_empty());
    }

    #[test]
    fn pending_launch_queue_deduplicates_paths() {
        let mut queue: Vec<String> = Vec::new();
        push_pending_launch_path(&mut queue, "a.md".to_string());
        push_pending_launch_path(&mut queue, "a.md".to_string());
        assert_eq!(queue, vec!["a.md".to_string()]);
    }

    #[test]
    fn pending_launch_queue_drops_new_entries_once_full() {
        let mut queue: Vec<String> = Vec::new();
        for index in 0..MAX_PENDING_LAUNCH_PATHS {
            push_pending_launch_path(&mut queue, format!("fill-{index}.md"));
        }
        assert_eq!(queue.len(), MAX_PENDING_LAUNCH_PATHS);

        push_pending_launch_path(&mut queue, "overflow.md".to_string());
        assert_eq!(queue.len(), MAX_PENDING_LAUNCH_PATHS);
        assert!(!queue.contains(&"overflow.md".to_string()));
        // The earliest entry must survive the overflow attempt.
        assert_eq!(queue.first(), Some(&"fill-0.md".to_string()));
    }
}

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

#[derive(Serialize)]
struct DesktopFileEntry {
    kind: String,
    name: String,
    path: String,
    parent_path: String,
    modified: u128,
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn reject_nul_in_path(path: &str) -> Result<(), String> {
    if path.contains('\0') {
        Err("Invalid path.".to_string())
    } else {
        Ok(())
    }
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

fn collect_markdown_files(dir: &Path, files: &mut Vec<DesktopFileEntry>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|err| err.to_string())?;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string();
            let parent_path = path.parent().map(path_to_string).unwrap_or_default();
            files.push(DesktopFileEntry {
                kind: "dir".to_string(),
                name,
                path: path_to_string(&path),
                parent_path,
                modified: 0,
            });
            let _ = collect_markdown_files(&path, files);
        } else if metadata.is_file() && is_markdown_file(&path) {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string();
            let parent_path = path.parent().map(path_to_string).unwrap_or_default();
            files.push(DesktopFileEntry {
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

#[tauri::command]
fn desktop_read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    reject_nul_in_path(&path)?;
    fs::read(path).map_err(|err| err.to_string())
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
        fs::rename(&tmp_path, path).map_err(|err| err.to_string())?;
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
    atomic_write(Path::new(&path), text.as_bytes())
}

#[tauri::command]
fn desktop_write_file_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    reject_nul_in_path(&path)?;
    atomic_write(Path::new(&path), &bytes)
}

#[tauri::command]
fn desktop_list_markdown_files(directory_path: String) -> Result<Vec<DesktopFileEntry>, String> {
    reject_nul_in_path(&directory_path)?;
    let mut files = Vec::new();
    collect_markdown_files(Path::new(&directory_path), &mut files)?;
    Ok(files)
}

#[tauri::command]
fn desktop_list_shallow_entries(dir_path: String) -> Result<Vec<serde_json::Value>, String> {
    reject_nul_in_path(&dir_path)?;
    let read_dir = fs::read_dir(&dir_path).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path().to_string_lossy().replace('\\', "/");
        if entry.path().is_dir() {
            entries.push(serde_json::json!({
                "name": name,
                "kind": "dir",
                "path": path
            }));
        } else if entry.path().is_file() && is_markdown_file(&entry.path()) {
            entries.push(serde_json::json!({
                "name": name,
                "kind": "file",
                "path": path
            }));
        }
    }
    Ok(entries)
}

#[tauri::command]
fn desktop_rename_file(path: String, new_name: String) -> Result<String, String> {
    reject_nul_in_path(&path)?;
    if !is_valid_child_name(&new_name) {
        return Err("Invalid file name.".to_string());
    }
    let old_path = PathBuf::from(path);
    let parent = old_path
        .parent()
        .ok_or_else(|| "File has no parent directory".to_string())?;
    let new_path = parent.join(new_name.trim());
    if new_path.exists() {
        return Err("A file with that name already exists.".to_string());
    }
    fs::rename(&old_path, &new_path).map_err(|err| err.to_string())?;
    Ok(path_to_string(&new_path))
}

#[tauri::command]
fn desktop_move_entry(source_path: String, target_dir_path: String) -> Result<String, String> {
    reject_nul_in_path(&source_path)?;
    reject_nul_in_path(&target_dir_path)?;
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
            "Cannot move a directory into itself or one of its subdirectories.".to_string(),
        );
    }
    let target = target_dir.join(source_name);
    if target.exists() {
        return Err("An item with that name already exists.".to_string());
    }
    fs::rename(&source, &target).map_err(|err| err.to_string())?;
    Ok(path_to_string(&target))
}

#[tauri::command]
fn desktop_delete_file(path: String) -> Result<(), String> {
    reject_nul_in_path(&path)?;
    fs::remove_file(path).map_err(|err| err.to_string())
}

fn is_valid_child_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty()
        && trimmed != "."
        && trimmed != ".."
        && !trimmed
            .chars()
            .any(|ch| matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
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
        return Err("A folder with that name already exists.".to_string());
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
    if new_path.exists() {
        return Err("A file with that name already exists.".to_string());
    }
    fs::write(&new_path, "").map_err(|err| err.to_string())?;
    Ok(path_to_string(&new_path))
}

/// Copy a single file or directory tree from `source_path` into `target_dir_path`.
/// If an entry with the same name already exists, a numeric suffix " (1)", " (2)", …
/// is appended to the stem (or bare name for folders) until a free slot is found.
/// Returns the final destination path.
#[tauri::command]
fn desktop_copy_entry(source_path: String, target_dir_path: String) -> Result<String, String> {
    reject_nul_in_path(&source_path)?;
    reject_nul_in_path(&target_dir_path)?;
    let source = PathBuf::from(&source_path);
    let target_dir = PathBuf::from(&target_dir_path);
    if !source.exists() {
        return Err("Source does not exist.".to_string());
    }
    if !target_dir.is_dir() {
        return Err("Target directory does not exist.".to_string());
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
        fs::copy(&source, &dest).map_err(|err| err.to_string())?;
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

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|err| err.to_string())?;
    for entry in fs::read_dir(src).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let src_child = entry.path();
        let dest_child = dest.join(entry.file_name());
        if src_child.is_dir() {
            copy_dir_recursive(&src_child, &dest_child)?;
        } else {
            fs::copy(&src_child, &dest_child).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn desktop_delete_directory(path: String, recursive: bool) -> Result<(), String> {
    reject_nul_in_path(&path)?;
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
    let target = PathBuf::from(&path);
    let canonical = fs::canonicalize(&target).map_err(|err| err.to_string())?;
    if !canonical.is_dir() {
        return Err("Path is not a directory.".to_string());
    }
    let canonical_str = canonical.to_string_lossy();
    let cleaned: String = canonical_str
        .strip_prefix(r"\\?\")
        .map(|s| s.to_string())
        .unwrap_or_else(|| canonical_str.to_string());
    Command::new("explorer")
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
    Command::new("rundll32")
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

#[tauri::command]
fn desktop_force_close_window<R: tauri::Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.destroy().map_err(|err| err.to_string())
}

#[tauri::command]
fn desktop_get_file_directory(file_path: String) -> Result<Vec<DesktopFileEntry>, String> {
    reject_nul_in_path(&file_path)?;
    let path = PathBuf::from(&file_path);
    let parent = path
        .parent()
        .ok_or_else(|| "File has no parent directory".to_string())?;
    let mut files = Vec::new();
    collect_markdown_files(parent, &mut files)?;
    Ok(files)
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
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_portable_userdata();
    tauri::Builder::default()
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
            desktop_list_markdown_files,
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
            desktop_force_close_window,
            desktop_get_file_directory,
            desktop_list_shallow_entries
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, position }) = event {
                // Convert physical pixel position to logical (CSS) coordinates.
                let scale = window.scale_factor().unwrap_or(1.0);
                let lx = position.x / scale;
                let ly = position.y / scale;

                // Collect all valid paths with kind.
                let entries: Vec<serde_json::Value> = paths.iter()
                    .filter(|p| p.exists())
                    .filter_map(|p| {
                        let kind = if p.is_dir() { "dir" } else if p.is_file() { "file" } else { return None; };
                        Some(serde_json::json!({ "path": p.to_string_lossy().into_owned(), "kind": kind }))
                    })
                    .collect();

                if entries.is_empty() { return; }

                // For backward-compatibility keep "path" / "kind" pointing at the first entry.
                let first = &entries[0];
                let payload = serde_json::json!({
                    "path": first["path"],
                    "kind": first["kind"],
                    "paths": entries,
                    "position": { "x": lx, "y": ly }
                });
                let _ = window.emit("desktop-drag-drop", payload);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

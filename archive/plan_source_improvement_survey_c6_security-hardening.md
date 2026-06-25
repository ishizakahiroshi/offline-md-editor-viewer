# [完了] C6: セキュリティ／堅牢性強化

> 親: [plan_source_improvement_survey.md](plan_source_improvement_survey.md)
> 最終更新: 2026-05-25(月) 19:00:47
> 親 plan の C6 を担当する子 plan。

## context配分

この子 plan 内の内部 C は、親 plan C6 の単一作業をさらに5つの実装単位に割ったもの。種別は実装着手前は全 `plan`、完了時に `fix` へ更新する。

| 内部C | 種別 | 内容 | 主対象 | 並列 |
|---|---|---|---|---|
| C1 | fix | 相対リンク `..` 正規化 + ルート外参照拒否（`getTauriRelativeLinkTarget`） | HTML/JS | [並列OK] 低コスト・高効果 |
| C2 | fix | Tauri 読み書き削除コマンドのルート封じ込めバリデータ（設計判断あり・見送り可） | Rust + HTML/JS | C1 完了後（同じ「ルート」概念を共有） |
| C3 | fix | `copy_dir_recursive` の symlink スキップ + 深さ制限 | Rust | [並列OK] |
| C4 | fix | プレビュー外部リンク rel 付与を大小非依存判定へ統一 | HTML/JS | [並列OK] |
| C5 | fix | CSP のブラウザ版/Tauri 版差分の意図確認と統一 | HTML + tauri.conf.json | [並列OK] |

実行順序: `(C1, C3, C4, C5) → C2`

> 注: C1/C3/C4/C5 は編集箇所が完全に分離（C1=`getTauriRelativeLinkTarget` 周辺の JS、C3=`copy_dir_recursive` の Rust、C4=`renderMarkdown` 内 rel 付与 1 行、C5=CSP メタ行 + tauri.conf.json）のため並列実行可。C2 はルート封じ込めの設計判断が重く、C1 と「開いているルート配下か」という同じ概念を共有するため C1 の後に着手する。C2 は内部Cごと見送り可（後述の判断材料参照）。

---

## 目的

親 plan の D（セキュリティ・堅牢性）調査で検出された軽微な強化案のうち、コードに手を入れるもの（D-1〜D-4）を実装する。

**重要な前提（深刻度）**: これらは親 plan の調査で **すべて深刻度 Low** と判定済みである。理由:

- 動作環境がローカル・オフライン（CSP `connect-src 'none'` で外部送信は不可能）
- 攻撃にはユーザー自身の操作（悪意ある .md を開く / そのリンクをクリックする）が必要
- 「読める」と言っても表示のみで、ユーザーが既にOS権限を持つファイルに限られる

したがって本 C6 は **重大度 Low の予防的強化（多層防御）** であり、**UX やポータビリティ・オフライン1ファイル設計を犠牲にしてまで過剰防御しない** ことを方針とする。特に C2（ルート封じ込め）は「フォルダを開いて使う」「単体ファイルを開く」「複数フォルダ／別フォルダのファイルを開く」という基本 UX を壊さないよう慎重に設計し、UX を損なう懸念があれば内部Cごと見送る判断材料を残す。

## 前提

- 本 C6 は親 plan で `[並列OK with C5（CSS）]`。編集対象は `apps/desktop/src-tauri/src/lib.rs` と `apps/browser/offline-md-editor-viewer.html` の **JS 領域・CSP メタ行**、および `apps/desktop/src-tauri/tauri.conf.json`。HTML の **CSS 領域（行 10〜3540）には一切触れない**（親 C5 と衝突回避）。
- 設計思想（オフライン・CDN 不使用・ポータブル・単一 HTML）を壊さない。新規ライブラリ追加・外部通信・ビルド手順変更は禁止。
- 行番号は精読時点（2026-05-25）の値。実装時は関数名で再確認してから編集する（先行 C のマージで行がずれている可能性あり）。
- ビルド確認が必要な場合は `.\scripts\local\build-win.ps1` を使う（Rust 変更を含む C2/C3 のコンパイル確認）。ユーザー指示なしの自動ビルドはしないが、本 plan 記載の検証目的でのビルドは許可済み。

### 関連する既存実装（精読済みの事実）

- Tauri の「ルート」は HTML 側 `activeDirectoryHandle`（行 4808・Tauri 環境では **絶対パス文字列**）が保持する。`getTauriDisplayPath(path, root)`（8583）・`collectTauriShallowFiles(dirPath, rootPath)`（10459）がこの root を相対表示の基準に使う。
- 単体ファイル起動／drop 時は `desktop_get_file_directory`（lib.rs:499）が親ディレクトリを列挙し、その親がツリーのルートになる。
- Rust 側コマンドは現状 `reject_nul_in_path`（lib.rs:22）のみで、ルート配下検証は無い（任意絶対パス操作が可能）。
- `desktop_move_entry`（lib.rs:265）・`desktop_open_path_in_explorer`（441）は既に `fs::canonicalize` を使っており、canonicalize ベースの検証パターンは既存実装と整合する。
- 外部リンク判定は `isHttpUrl`（8386, `/^https?:\/\//i` 大小非依存）→ `normalizeLinkHref`（8390, 制御文字・空白除去）→ `getExternalHref`（8394）→ `getExternalLinkAnchors`（8400）に既に統一されている。プレビューの rel 付与（7765）だけがこの統一判定を使わず生セレクタ `a[href^='http']`（大小区別・前後空白に弱い）を使っている。

---

## C1: 相対リンク `..` 正規化 + ルート外参照拒否

### 作業内容

`getTauriRelativeLinkTarget(anchor)`（HTML 8534）は、現状 base ディレクトリと相対パスを単純連結するだけで `..` を正規化しない。

```js
// 現状（8538〜8541）
const baseDir = getPathDirectoryName(currentFileHandle.tauriPath);
if (!baseDir) return "";
const separator = baseDir.includes("\\") ? "\\" : "/";
return `${baseDir}${separator}${decodedPath.replace(/[\\/]+/g, separator)}`;
```

`decodedPath` に `../../secret.txt` のような相対脱出が含まれると、そのまま OS パスとして組み上がり `loadTauriFilePath`（8544 経由）に渡る。

**改善**: `resolveRelativeDisplayPath(basePath, relativePath)`（8499 付近、`..` で `parts.pop()` する既存ヘルパ）が既にあるので、これを使って正規化したうえで、ルート外参照なら空文字（= リンク無効）を返す。

具体手順:

1. `getTauriRelativeLinkTarget` 内で、現状の単純連結をやめ、`baseDir` と `decodedPath` を `resolveRelativeDisplayPath` で正規化して結合する。`resolveRelativeDisplayPath` は `/` 区切りの正規化済みパスを返すので、Windows の場合は最終的に separator を戻す。
2. 正規化後のパスが Tauri ルート（`activeDirectoryHandle` が文字列のときその値）配下かを `normalizePathForCompare`（8579）でチェックする。ルート外なら `""` を返す（`handleTauriRelativeLinkClick` 8544 は空なら `false` を返し通常リンク扱いになる → 読み込みは起きない）。
3. ルート情報が無い場合（単体ファイル起動で `activeDirectoryHandle` が未設定のケース）は、後方互換のため **base ディレクトリ（開いているファイルの親）配下** を許容範囲とする。少なくとも親より上（`..` 脱出）は拒否する。

実装イメージ:

```js
function getTauriRelativeLinkTarget(anchor) {
  if (!isTauri || !anchor || !currentFileHandle || !currentFileHandle.tauriPath) return "";
  const decodedPath = getRelativeLinkPathPart(anchor);
  if (!decodedPath) return "";
  const baseDir = getPathDirectoryName(currentFileHandle.tauriPath);
  if (!baseDir) return "";
  const separator = baseDir.includes("\\") ? "\\" : "/";
  // 正規化（`..`/`.` を解決）。resolveRelativeDisplayPath は `/` 区切りを返す
  const resolved = resolveRelativeDisplayPath(baseDir, decodedPath); // 例: "C:/dir/sub/a.md"
  if (!resolved) return "";
  // ルート外参照を拒否（containment）
  const containmentRoot = (isTauri && typeof activeDirectoryHandle === "string" && activeDirectoryHandle)
    ? activeDirectoryHandle
    : baseDir;
  const normRoot = normalizePathForCompare(containmentRoot);
  const normResolved = normalizePathForCompare(resolved);
  if (normResolved !== normRoot && !normResolved.startsWith(normRoot + "/")) {
    return ""; // ルート外 → リンク無効
  }
  // OS separator に戻して返す
  return separator === "\\" ? resolved.replace(/\//g, "\\") : resolved;
}
```

注意点:
- `resolveRelativeDisplayPath` は `basePath` を `split(/[\\/]+/).filter(Boolean)` してから連結する（8500〜8510）。Windows ドライブレター `C:` は filter を通るので `C:` が parts[0] になり、`parts.join("/")` で `C:/...` が再構成される。UNC パス（`\\server\share`）の場合は先頭の空要素が filter(Boolean) で消えてホスト名が先頭に来るため、UNC では containment 判定が緩くなる可能性がある。UNC は稀なので **判定が緩くなっても「読めるのは本人権限内ファイル・表示のみ」で深刻度は据え置き Low**。過剰対応しない（コメントで明記するに留める）。
- `decodedPath` が絶対パス（`C:\other` や `/etc/passwd`）の場合、`resolveRelativeDisplayPath` は basePath parts に push し続けるだけなので絶対パス置換は起きない（むしろ安全側）。Markdown の相対リンク用途として正しい。

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - `getTauriRelativeLinkTarget`（8534〜8542）を上記実装に置換

### 完了条件

- **攻撃シナリオ封鎖の検証**: ルートフォルダ配下の `evil.md` に `[x](../../../Windows/System32/drivers/etc/hosts)`（または任意のルート外相対リンク）を書き、Tauri 版で開いてクリックしても **読み込まれずステータスは通常リンク扱い**（フォルダ外ファイルがプレビューに出ない）。
- **回帰なし**: 同一フォルダ内の `[sub](sub/child.md)` / `[up](../sibling/x.md)`（ルート配下に収まる範囲）は従来どおり開ける。
- 単体ファイル起動（フォルダ未オープン）でも親ディレクトリ配下の相対リンクは開け、親より上は拒否される。

---

## C2: Tauri 読み書き削除コマンドのルート封じ込めバリデータ

> このCは設計判断が重く、UX を壊すリスクがある。**下記「設計案比較」を読み、推奨案で進める。過剰と判断したら内部Cごと見送り可**（見送り時は親 plan 表で C6 内部C2 を `plan` のまま残し、本ファイルに「見送り」と追記）。

### 背景（塞ぎたい穴）

`desktop_read_file_bytes`（lib.rs:162）/`desktop_write_file_text`（200）/`desktop_write_file_bytes`（206）/`desktop_delete_file`（301）/`desktop_delete_directory`（426）は、`reject_nul_in_path` 以外の経路検証が無く、任意絶対パスを操作できる。C1 で HTML 側の相対リンク脱出は塞がるが、Rust 側は「最後の砦」として未防御のまま。多層防御の観点で「開いているルート配下のみ許可」したい。

### 設計案比較（ルート情報を Rust にどう渡すか）

| 案 | 概要 | 長所 | 短所／UX影響 |
|---|---|---|---|
| 案A: コマンド引数に `root_path` 追加 | 各コマンドに `root_path: Option<String>` を追加し、Rust 側で `canonicalize` 後 prefix 検証。HTML 側 `invokeTauri(...)` 呼び出しに `activeDirectoryHandle` を渡す | グローバル状態を持たずステートレス。`Option` で後方互換（root 無しは検証スキップ） | 全呼び出し箇所（read/write/delete）に引数追加が必要。HTML 側修正が広範 |
| 案B: グローバル state で root 保持 | Tauri `State<Mutex<Option<PathBuf>>>` に root を保持し、フォルダを開いた時に `desktop_set_root(path)` で更新。各コマンドが state を参照して検証 | コマンド引数を増やさない | **複数フォルダ／別フォルダのファイルを開く運用で root が1つに固定され破綻**。単体ファイル起動・drop で root 概念が曖昧。状態同期バグの温床 |
| 案C: 実施見送り | C1（HTML 側相対リンク正規化）のみで多層防御の主目的は達成済みとみなし、Rust 側は変更しない | UX・ポータビリティを一切壊さない。コード変更ゼロ | Rust が「最後の砦」にならない（ただし深刻度 Low・本人権限内・表示のみで実害ほぼ無し） |

**運用実態の確認（UX影響の核心）**:
- 本アプリは「単体ファイルを開く」「フォルダを開く」「別フォルダのファイルをドラッグして開く」「相対リンクで隣接ファイルへ飛ぶ」を許容する設計。
- root を1つに固定する案B は、ユーザーが root 外のファイルを意図的に開く（ファイルダイアログで別フォルダのファイルを選ぶ等）正当な操作まで拒否し、**基本 UX を壊す**。→ 案B は不採用。
- 案A は `root_path` を **Option** にし「ツリー経由のリンク追従（相対リンク）でのみ検証、ユーザーが明示的にダイアログで選んだファイルは検証スキップ（root_path 未指定で呼ぶ）」という使い分けができ、UX を壊さない。ただし呼び出し箇所が多く、検証が効くのは結局 C1 と同じ相対リンク経路に限られる。

**推奨**: まず **案C（見送り）を第一候補** とする。理由: C1 で相対リンク脱出（唯一の現実的攻撃経路）は HTML 側で塞がる。Rust 側の任意パス操作は、悪意 .md からは C1 後に到達経路が無く、残るのは「ユーザーが自分で別フォルダを開く」正当操作のみ。案A を入れても検証が効くのは相対リンク経路（C1 で既に防御済み）であり、二重防御の費用対効果が低い割に呼び出し箇所改修のリスク（UX 回帰）が高い。

**ただし** 多層防御を明示的に望む場合は **案A を限定適用**（相対リンク追従の `loadTauriFilePath` 経路で読む `desktop_read_file_bytes` 呼び出しにのみ `root_path` を渡し、書き込み・削除はツリー操作＝既に root 配下のノードに対してのみ呼ばれるため対象外）する。

### 作業内容（案A を採用する場合の具体手順）

> 見送り（案C）を選んだ場合、本節はスキップし完了条件の「見送り記録」のみ行う。

1. lib.rs に共通バリデータを追加:

```rust
/// `path` が `root`（あれば）配下にあるか canonicalize 後に検証する。
/// root が None の場合は検証をスキップ（後方互換）。
fn ensure_within_root(path: &Path, root: &Option<String>) -> Result<(), String> {
    let root = match root {
        Some(r) if !r.is_empty() => r,
        _ => return Ok(()), // root 未指定 → 検証スキップ
    };
    let canonical_root = fs::canonicalize(root).map_err(|err| err.to_string())?;
    // path 自体が存在しない（新規書き込み）場合は親を canonicalize して判定
    let canonical_target = match fs::canonicalize(path) {
        Ok(p) => p,
        Err(_) => {
            let parent = path.parent().ok_or_else(|| "No parent.".to_string())?;
            fs::canonicalize(parent).map_err(|err| err.to_string())?
        }
    };
    if canonical_target == canonical_root || canonical_target.starts_with(&canonical_root) {
        Ok(())
    } else {
        Err("Path is outside the opened folder.".to_string())
    }
}
```

2. `desktop_read_file_bytes` の引数に `root_path: Option<String>` を追加し、`reject_nul_in_path` の後に `ensure_within_root(Path::new(&path), &root_path)?;` を呼ぶ。

```rust
#[tauri::command]
fn desktop_read_file_bytes(path: String, root_path: Option<String>) -> Result<Vec<u8>, String> {
    reject_nul_in_path(&path)?;
    ensure_within_root(Path::new(&path), &root_path)?;
    fs::read(path).map_err(|err| err.to_string())
}
```

3. HTML 側 `readTauriMarkdownFile(path)`（8601）→ `invokeTauri("desktop_read_file_bytes", { path })`（8602）を、相対リンク追従経路では `root_path: (typeof activeDirectoryHandle === "string" ? activeDirectoryHandle : null)` を渡すよう変更。ダイアログ・単体起動の経路は `root_path` を渡さない（= 検証スキップ）。
   - 経路の出し分けが煩雑なら、`readTauriMarkdownFile(path, { enforceRoot } = {})` のように引数化し、`loadTauriFilePath` の相対リンク経由呼び出しだけ `enforceRoot: true` を立てる。
4. `desktop_write_file_*` / `desktop_delete_*` は **対象外**（ツリー操作＝既に root 配下ノードに対してのみ呼ばれ、悪意 .md から直接呼ぶ経路が無いため）。費用対効果が低い割に保存／削除の UX 回帰リスクがあるので触らない。

### 変更ファイル

- `apps/desktop/src-tauri/src/lib.rs`（`ensure_within_root` 追加、`desktop_read_file_bytes` 162〜165 改修）
- `apps/browser/offline-md-editor-viewer.html`（`readTauriMarkdownFile` 8601〜8605、`loadTauriFilePath` 8607〜 の呼び出し）

### 完了条件

- **案A 採用時の攻撃シナリオ封鎖**: 相対リンク経由で root 外の絶対パスを `desktop_read_file_bytes` に渡しても Rust 側が `"Path is outside the opened folder."` で拒否する（C1 をすり抜けても Rust が最後の砦になる）。
- **回帰なし**: ユーザーがダイアログで root 外のファイルを開く・単体ファイルを開く・通常のツリーファイルを開く／保存／削除が従来どおり動作する。
- **見送り（案C）採用時**: 本ファイル C2 節末尾に「案C で見送り。理由: C1 で相対リンク脱出は防御済み、Rust 側追加防御は費用対効果が低く UX 回帰リスクが上回る」と1行追記し、親 plan 表の C6 を `fix` にする際 C2 を見送り扱いと明記する。`cargo build` 不要。

> **判断記録（2026-05-25）**: 案C で見送り。理由: C1 で相対リンク脱出は防御済み、Rust 側追加防御は費用対効果が低く UX 回帰リスクが上回る。

---

## C3: `copy_dir_recursive` の symlink スキップ + 深さ制限

### 作業内容

`copy_dir_recursive`（lib.rs:411）は `src_child.is_dir()`（417）で分岐するが、`is_dir()` は **symlink のターゲットを辿る**。コピー元にディレクトリへの symlink（特に親や自分自身を指すループ）があると無限再帰 → スタックオーバーフロー／ディスク枯渇のリスク。

**改善**: `entry.metadata()` ではなく `fs::symlink_metadata`（lnk を辿らない）で種別を判定し、symlink はスキップする。加えて再帰深さ上限（保険）を設ける。

```rust
const MAX_COPY_DEPTH: usize = 64;

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    copy_dir_recursive_inner(src, dest, 0)
}

fn copy_dir_recursive_inner(src: &Path, dest: &Path, depth: usize) -> Result<(), String> {
    if depth > MAX_COPY_DEPTH {
        return Err("Directory tree is too deep to copy.".to_string());
    }
    fs::create_dir_all(dest).map_err(|err| err.to_string())?;
    for entry in fs::read_dir(src).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let src_child = entry.path();
        // symlink を辿らず種別判定。symlink はコピー対象から除外（ループ・脱出防止）
        let meta = fs::symlink_metadata(&src_child).map_err(|err| err.to_string())?;
        if meta.file_type().is_symlink() {
            continue;
        }
        let dest_child = dest.join(entry.file_name());
        if meta.is_dir() {
            copy_dir_recursive_inner(&src_child, &dest_child, depth + 1)?;
        } else {
            fs::copy(&src_child, &dest_child).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}
```

注意:
- 既存呼び出し `copy_dir_recursive(&source, &dest)`（lib.rs:377）はシグネチャ不変なのでそのまま動く。
- symlink を「スキップ」する（=コピーしない）方針は、本アプリのコピー機能（フォルダの複製）として妥当。Windows ではディレクトリ symlink/junction は稀で、スキップしても通常運用に影響しない。

### 変更ファイル

- `apps/desktop/src-tauri/src/lib.rs`（`copy_dir_recursive` 411〜424 を上記に置換、`MAX_COPY_DEPTH` 定数追加）

### 完了条件

- **攻撃シナリオ封鎖の検証**: コピー元フォルダ内に自分自身（または親）を指すディレクトリ symlink/junction を作り、`desktop_copy_entry` でコピーしても **無限再帰せず**（symlink がスキップされ）正常終了する。深いツリー（>64 段）はエラーで安全に止まる。
- **回帰なし**: 通常のネストフォルダ（symlink 無し）のコピーが従来どおり全ファイル複製される。`.\scripts\local\build-win.ps1` でコンパイルが通る。

---

## C4: プレビュー外部リンク rel 付与を大小非依存判定へ統一

### 作業内容

`renderMarkdown` 内（HTML 7765）の rel/target 付与は生セレクタ:

```js
preview.querySelectorAll("a[href^='http']").forEach((a) => {
  a.setAttribute("target", "_blank");
  a.setAttribute("rel", "noopener noreferrer");
});
```

このセレクタは大小区別（`HTTP://` に付かない）かつ前後空白付き href に弱い。一方、アプリには既に統一判定 `getExternalHref`（8394, `isHttpUrl` で大小非依存 + `normalizeLinkHref` で制御文字・空白除去）がある。プレビュー要素に限定して同じ判定へ統一する。

```js
preview.querySelectorAll("a[href]").forEach((a) => {
  if (!getExternalHref(a)) return; // 外部 http/https のみ
  a.setAttribute("target", "_blank");
  a.setAttribute("rel", "noopener noreferrer");
});
```

- 効果: `HTTP://example.com` や ` http://...`（前後空白）にも確実に rel が付く。
- 実害は元々ほぼ無い（クリックは `openExternalHref` 経由で保護）が、付与漏れを無くし判定ロジックを1本化する保守性改善も兼ねる。
- `getExternalHref` は `renderMarkdown`（7745）より後方の 8394 で定義されるが、関数宣言（hoisting 対象）かつ実行は描画時なので呼び出し順の問題は無い（既に同関数内 7771 で `updateExternalLinkAvailability` → `getExternalLinkAnchors` 経由で `getExternalHref` を使っている実績あり）。

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`（`renderMarkdown` 内 7765〜7768）

### 完了条件

- **検証**: `[a](HTTP://example.com)` と `[b]( http://example.com )` を含む .md をプレビューし、両アンカーに `rel="noopener noreferrer"` と `target="_blank"` が付くことを DevTools で確認。
- **回帰なし**: 通常の `http://`/`https://` リンク・内部リンク（rel 不要）の挙動が変わらない。外部リンク ON/OFF トグルの動作が回帰なし。

---

## C5: CSP のブラウザ版/Tauri 版差分の意図確認と統一

### 作業内容

2つの CSP に差分がある。

ブラウザ版（HTML 行6）:
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none';
object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'
```

Tauri 版（tauri.conf.json 行24）:
```
default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src ipc: http://ipc.localhost;
object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'
```

主な差分と意図確認:

| ディレクティブ | ブラウザ版 | Tauri 版 | 判断 |
|---|---|---|---|
| `img-src` | `'self' data: blob:` | `'self' data:` | **`blob:` を Tauri にも追加**して統一推奨。プレビュー画像等で blob URL を使う可能性に備える（許可しても外部通信はしない blob のためリスク増なし）。ただし現状 Tauri で blob 画像表示の不具合報告が無いなら **現状維持でも可**（過剰変更を避ける） |
| `frame-ancestors` | `'none'` あり | 無し | Tauri は WebView 単独で iframe 埋め込みされないため `frame-ancestors` は実害に直結しないが、**意図統一のため Tauri にも `frame-ancestors 'none'` 追加**を推奨（防御は多いほうが整合的、副作用なし） |
| `connect-src` | `'none'` | `ipc: http://ipc.localhost` | **意図的差分（統一しない）**。Tauri は invoke のため ipc 接続が必須。ブラウザは外部通信ゼロ。これは設計上正しい差で、揃えてはいけない |
| `default-src` / `base-uri` | `'self'` | `'none'` / `'none'` | Tauri のほうが厳格。frontendDist の読み込み方式の差によるもので **意図的差分（統一しない）** |
| `font-src` | `'self' data:` | `'self'` | data: フォントを使っていなければ差は無害。統一の必要性低いが、揃えるなら Tauri に `data:` 追加も可（任意・低優先） |

**推奨対応（最小・副作用なしのみ）**:
1. Tauri 版 CSP に `frame-ancestors 'none'` を追加（防御整合・副作用なし）。
2. Tauri 版 `img-src` に `blob:` を追加（ブラウザ版と統一・blob は外部通信なし）。
3. `connect-src` / `default-src` / `base-uri` の差は **意図的差分として維持**。本 plan のコメント or CLAUDE.md には記載しないが、ここに「揃えない理由」を記録しておく。

> 過剰変更を避ける方針として、1・2 も「現状で不具合が無く、統一の積極的メリットが薄い」と判断するなら見送り可。その場合は本節を「差分は意図的と確認、変更なし」で完了とする。

### 変更ファイル

- `apps/desktop/src-tauri/src/tauri.conf.json`（行24 の `csp` 文字列、`frame-ancestors 'none'` と `img-src` の `blob:` 追加）
- `apps/browser/offline-md-editor-viewer.html`（行6 — 変更不要の見込み。Tauri 側を寄せる方針）

### 完了条件

- **検証**: 変更後、ブラウザ版・Tauri 版とも DevTools コンソールに CSP 違反エラーが出ない（画像・フォント・スクリプト・スタイルが従来どおり表示・動作）。
- `connect-src` をブラウザ版に合わせて `'none'` にして Tauri の invoke が壊れていないこと（= 誤って統一しなかったこと）を確認。
- 変更を見送る場合は「差分は意図的と確認、変更なし」と本節に追記し完了とする。

---

## 完了報告フォーマット

各内部 C 完了時、親へは以下3点のみ返す（調査ログ・思考過程は返さない）:

1. `fix:完了 / plan:未完了`（内部Cごと。C2 見送り時は「C2:見送り（案C）」）
2. 変更ファイル一覧（絶対パス）
3. 検証結果1行（攻撃シナリオ封鎖 + 回帰なしの要約）

全内部 C 完了後、親 plan `plan_source_improvement_survey.md` の `## context配分` 表で C6 を `plan` → `fix` に更新する（C2 見送り時はその旨を注記）。

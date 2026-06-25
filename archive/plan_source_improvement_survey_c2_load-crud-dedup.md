# [完了] C2: ファイルロード／CRUD 処理の共通化

> 親: [plan_source_improvement_survey.md](plan_source_improvement_survey.md)
> 最終更新: 2026-05-25(月) 20:36:56
> 親 plan の C2 を担当する子 plan。

## context配分

この子 plan 内部の作業チェックリスト。内部 C 番号は実行順を表す。各内部 C 完了時に該当行を `plan` → `fix` に更新する。

| C | 種別 | 内容 | 並列 |
|---|---|---|---|
| C1 | fix | `applyLoadedContent(buffer, fileName, fileHandle, options)` の抽出（共通ロード関数の新設） | — |
| C2 | fix | ロード処理9箇所（+読み取り専用1箇所）を `applyLoadedContent` 呼び出しへ置換 | C1 の成果物に依存 |
| C3 | fix | CRUD 系（move/create/rename/delete）の Tauri/Web 二分を最小 FS 抽象へ切り出し | C1/C2 とは別関数群のため独立着手可だが同一ファイルにつき直列実行 |
| C4 | fix | Rust エラーの文字列マッチを構造化エラー（`code` フィールド）化（lib.rs + JS 両側、後方互換維持） | C3 の move エラー分岐に依存 |

実行順序: `C1 → C2 → C3 → C4`

> 注: 全内部 C が `apps/browser/offline-md-editor-viewer.html` を編集対象に含むため、実装は1セッション内で C1→C4 を直列に進める。`[並列OK]` は付与しない（同一ファイル編集の衝突回避）。

---

## 目的

`offline-md-editor-viewer` 後半 JS のうち、ファイルロード処理（同一ブロックが9箇所コピー）と CRUD 系処理（Tauri 分岐 / Web API 分岐の前後処理重複）を共通化し、保守性を上げる。あわせて `moveDirectoryEntry` / `createMarkdownFileEntry` で行っている Rust エラーの**文字列マッチ**（`message.includes("already exists")` 等）を構造化エラー（`{ code }`）に置き換え、Rust 側の文言変更でサイレントに壊れる脆さを解消する。

設計思想（オフライン・CDN 不使用・1ファイル完結・ブラウザ/Tauri 共用）は一切崩さない。新規関数はすべて既存 IIFE スコープ内に追加し、外部依存は増やさない。

---

## 前提

- **本 C2 は親 plan の C1（ファイル状態・ディレクトリ状態の変数群をオブジェクト集約）完了後に着手する。** C1 で `fileState = {...}` / `dirState = {...}` への集約が済んでいる前提で、本 C2 の新規共通関数も**フラット変数への直接代入ではなく `fileState` / `dirState` 経由で状態を更新する**こと。
- ただし C1 が未着手のまま本 C2 を先行実装せざるを得ない場合は、現行のフラット変数（`currentFileBuffer` / `currentFileBom` / `currentFileLineEnding` / `currentFileHandle` 等）への代入で実装し、C1 実装時に一括置換する旨を `applyLoadedContent` 内コメントに残す。**どちらの場合も状態更新箇所を1関数（`applyLoadedContent`）に集約しておくことが C1 の置換コストを下げる**ため、本 C2 の主眼は「状態代入の集約」にある。
- 対象ファイル:
  - `apps/browser/offline-md-editor-viewer.html`（JS 領域）
  - `apps/desktop/src-tauri/src/lib.rs`（C4 の構造化エラー化のみ）
- 既存の挙動（開く/保存/D&D/ツリー選択/CRUD）を回帰させない。ロード経路は Tauri 版・Web 版の両方を確認する。

### 現状の共通ロードブロック（C1 の引数設計の根拠）

以下のブロックが9箇所（読み取り専用 `loadFileReadOnly` を含めると実質10箇所）でほぼ同一にコピーされている。バイナリ判定の直後に出現する。

```js
// 共通ブロック（例: loadTauriFilePath 8615〜8622）
currentFileBuffer = buffer;
currentFileBom = hasBom;
currentFileLineEnding = detectLineEnding(text);
setLoadedMarkdown(text, encoding, { viewMode: getFileViewMode(<name|path|file>) });
currentFileHandle = <handle>;            // Tauri: getTauriFileHandle(path) / Web: handle / null
setAppDocumentTitle(<name>);
setDirtyState(false);
setStatus(<getLoadedStatus(...) or chooseMdOnly>, <bool>);
```

各箇所の差分は次の3点のみ:

1. **`buffer`/`text`/`encoding`/`hasBom` の取得元** — Tauri は `readTauriMarkdownFile(path)`、Web は `readMarkdownFile(file)`。→ 呼び出し側で取得して `applyLoadedContent` に渡す。
2. **`fileHandle`** — Tauri は `getTauriFileHandle(path)`、Web は `handle` または `null`（読み取り専用/単体 input）。
3. **`fileName`（タイトル・viewMode・エラー文言用）** — Tauri は `getPathFileName(path)` または `entry.name`、Web は `file.name`。
4. **ロード後の付随処理**（ディレクトリエントリの active 切替・`activeDirectoryEntryPath` 設定・`renderFileList()`・ディレクトリ列挙）は箇所ごとに異なる → `applyLoadedContent` の**外**に残す（共通化しない）。

### バイナリ判定の扱い

全箇所で「`isBinaryBuffer(buffer)` なら `clearLoadedContent()` + `chooseMdOnly` ステータス + return」を行っている。これも `applyLoadedContent` 内に取り込み、戻り値で成否を返す設計にする（下記 C1 参照）。

### CRUD の Tauri/Web 二分構造（C3 の抽象化の根拠）

`moveDirectoryEntry`(9612)/`createDirectoryEntry`(10048)/`createMarkdownFileEntry`(10119)/`renameDirectoryEntry`(10209)/`deleteDirectoryEntryQuiet`(10299) はいずれも:

- **共通の前処理**: `findTreeNode` 解決・バリデーション（`isValidFolderName` 等）・名前衝突チェック・`activeDirectoryHandle` 有無チェック
- **FS 操作部（差し替え対象）**: Tauri は `invokeTauri("desktop_*")`、Web は `FileSystemDirectoryHandle` API（`getFileHandle`/`getDirectoryHandle`/`removeEntry` + `requestPermission`）
- **共通の後処理**: ツリーノード更新（`appendDirectoryNode`/`removeFileNode`/`updateTauriMovedNode`/`updateWebMovedNode`）・`sortDirectoryFiles()`・`renderFileList()`・`setStatus(...)`・`activeDirectoryEntryPath`/`currentFileHandle` 追従

この「FS 操作部」を `fsMoveEntry` / `fsCreateDirectory` / `fsCreateFile` / `fsRenameEntry` / `fsDeleteEntry` の最小抽象に切り出し、前後処理を呼び出し側で共有する。**ただし Web 版の `requestPermission` フローと Tauri 版のパス文字列フローは戻り値の形が大きく異なる**ため、抽象関数は「FS 操作の実行 + 新ノードに必要な最小情報（新パス/新ハンドル）の返却」までに留め、ツリーノードの構築・状態追従は呼び出し側に残す（過度な抽象化を避ける）。

---

## C1: `applyLoadedContent` の抽出（共通ロード関数の新設）

### 作業内容

`setLoadedMarkdown`（7677）の直後（7706 の `}` の後ろ）に新規関数 `applyLoadedContent` を追加する。バイナリ判定・状態代入・タイトル・ステータスまでを内包し、付随処理（ツリー active 切替など）は呼び出し側に残す。

**引数設計**:

```js
// fileName: タイトル/viewMode/エラー文言に使う表示名
// loaded:   { text, encoding, hasBom, buffer }（read* 関数の戻り値そのまま）
// fileHandle: Web の FileSystemFileHandle / Tauri の getTauriFileHandle 結果 / null
// options:
//   viewModeKey      ... getFileViewMode に渡す値（既定 fileName）
//   statusMessage    ... 成功時に出すメッセージ（既定 getLoadedStatus(fileHandle)）
//   statusIsError    ... 通常 false
// 戻り値: true（ロード成功） / false（バイナリで中断）
function applyLoadedContent(fileName, loaded, fileHandle = null, options = {}) {
  const { text, encoding, hasBom, buffer } = loaded;
  if (isBinaryBuffer(buffer)) {
    clearLoadedContent();
    setStatus(t("status", "chooseMdOnly") + fileName, true);
    return false;
  }
  // ↓ C1 完了済みなら fileState.buffer = buffer; ... の形に置換
  currentFileBuffer = buffer;
  currentFileBom = hasBom;
  currentFileLineEnding = detectLineEnding(text);
  setLoadedMarkdown(text, encoding, { viewMode: getFileViewMode(options.viewModeKey || fileName) });
  currentFileHandle = fileHandle;
  setAppDocumentTitle(fileHandle ? (fileHandle.name || fileName) : fileName);
  setDirtyState(false);
  setStatus(options.statusMessage || getLoadedStatus(fileHandle), options.statusIsError || false);
  return true;
}
```

注意点（before/after の差分を埋める）:

- 既存箇所で `setAppDocumentTitle` の引数がまちまち（`currentFileHandle.name` / `file.name` / `entry.name`）→ `fileName` を正にしつつ `fileHandle.name` があればそれを優先（Tauri 版は `getTauriFileHandle(path).name === getPathFileName(path)` で一致）。
- `loadFile`（8637）/`loadFileReadOnly`（8843）/`openWithFileInput`（11472）は `setAppDocumentTitle(file.name)` を `currentFileHandle` 代入の**前**に呼んでいるが、`applyLoadedContent` 内では順序を「状態代入 → タイトル → ステータス」に統一する（最終状態は同一なので回帰なし）。
- `getFileViewMode` は箇所により `path` / `file` / `entry.name || entry.tauriPath` / `fileBaseName` を渡している。`options.viewModeKey` で吸収する。

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - 新規追加: 7706 の `}`（`setLoadedMarkdown` 終端）と 7708 の `clearLoadedContent` の間に `applyLoadedContent` を挿入

### 完了条件

- `applyLoadedContent` が追加され、単体で構文エラーがない（ブラウザで読み込んで `applyLoadedContent` が定義されること）。
- この時点では既存箇所は未置換でよい（C2 で置換）。

---

## C2: ロード処理9箇所を `applyLoadedContent` 呼び出しへ置換

### 作業内容

C1 で抽出した `applyLoadedContent` を使い、以下の各箇所の「バイナリ判定 + 状態代入ブロック」を1〜2行に置換する。**付随処理（active 切替・`activeDirectoryEntryPath` 設定・`renderFileList`・ディレクトリ列挙）は残す。**

置換対象（`currentFileBuffer = buffer` の出現で確定した9箇所 + 読み取り専用1箇所）:

| # | 関数 | 行 | 取得元 | fileHandle | fileName |
|---|------|-----|--------|------------|----------|
| 1 | `loadTauriFilePath` | 8607（ブロック8610〜8622） | `readTauriMarkdownFile(path)` | `getTauriFileHandle(path)` | `getPathFileName(path)` |
| 2 | `loadFile` | 8637（ブロック8640〜8652） | `readMarkdownFile(file)` | 引数 `fileHandle`（既定 null） | `file.name` |
| 3 | `openWithFsAccess` Tauri 分岐 | 8663〜8676 | `readTauriMarkdownFile(path)` | `getTauriFileHandle(path)` | `getPathFileName(path)` |
| 4 | `openWithFsAccess` Web 分岐 | 8686〜8699 | `readMarkdownFile(file)` | `handle` | `file.name` |
| 5 | `loadFileReadOnly` | 8843（ブロック8845〜8857） | `readMarkdownFile(file)` | `null` | `file.name` |
| 6 | `loadDirectoryEntry` Tauri 分岐 | 9368〜9381 | `readTauriMarkdownFile(entry.tauriPath)` | `getTauriFileHandle(entry.tauriPath)` | `entry.name \|\| getPathFileName(entry.tauriPath)` |
| 7 | `openWithFileInput` | 11479〜11491 | `readMarkdownFile(file)` | `null` | `file.name` |
| 8 | 起動ファイル読み込み | 12227〜12240 | `readTauriMarkdownFile(path)` | `getTauriFileHandle(path)` | `getPathFileName(path)` |
| 9 | D&D ファイル分岐 | 12386〜12399 | `readTauriMarkdownFile(filePath)` | `getTauriFileHandle(filePath)` | `fileBaseName` |

> #6 `loadDirectoryEntry` の Web 分岐（9390〜9391）は既に `loadFile` を呼んでおり、`loadFile`（#2）の置換で間接的に共通化されるため**追加置換は不要**。

before/after 例（#1 `loadTauriFilePath`）:

```js
// before（8609〜8622）
const { text, encoding, hasBom, buffer } = await readTauriMarkdownFile(path);
if (isBinaryBuffer(buffer)) {
  clearLoadedContent();
  setStatus(t("status", "chooseMdOnly") + fileName, true);
  return;
}
currentFileBuffer = buffer;
currentFileBom = hasBom;
currentFileLineEnding = detectLineEnding(text);
setLoadedMarkdown(text, encoding, { viewMode: getFileViewMode(path) });
currentFileHandle = getTauriFileHandle(path);
setAppDocumentTitle(currentFileHandle.name);
setDirtyState(false);
setStatus(options.statusMessage || getLoadedStatus(currentFileHandle), false);

// after
const loaded = await readTauriMarkdownFile(path);
const fileHandle = getTauriFileHandle(path);
if (!applyLoadedContent(fileName, loaded, fileHandle, {
  viewModeKey: path,
  statusMessage: options.statusMessage  // undefined なら applyLoadedContent 内で getLoadedStatus にフォールバック
})) return;
```

注意:

- #1 `loadTauriFilePath` は `setStatus(options.statusMessage || getLoadedStatus(...))` だったので `options.statusMessage` を `applyLoadedContent` の `options.statusMessage` に渡す（呼び出し元の `loadTauriFilePath(path, options)` の `options` とは別物なので取り違え注意）。
- #6 `loadDirectoryEntry` Tauri 分岐は置換後に続く「`activeDirectoryEntryPath = entry.path` / `selectedEntryPaths.clear()` / active 切替 / return」（9382〜9388）を**そのまま残す**。
- #8 起動ファイル / #9 D&D は置換後に続く `desktop_get_file_directory` 列挙（12242〜12249 / 12401〜12408）を**そのまま残す**。
- C1 完了済みなら、`applyLoadedContent` 内部が `fileState` 経由になっているため呼び出し側の追従コード（`activeDirectoryEntryPath` 等）も `dirState` 経由に揃っているはず。揃っていなければ C1 の集約漏れとして報告する。

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - 8609〜8622（#1）/ 8639〜8652（#2）/ 8663〜8676（#3）/ 8686〜8699（#4）/ 8845〜8857（#5）/ 9368〜9381（#6）/ 11479〜11491（#7）/ 12227〜12240（#8）/ 12386〜12399（#9）

### 完了条件

- `currentFileBuffer = buffer` の出現が9件 → 1件（`applyLoadedContent` 内のみ）に減る（`grep -n "currentFileBuffer = buffer"` で確認。save の 8837 は `bytes.buffer`、encoding 変更の経路は対象外なので残ってよい）。
- Tauri 版・Web 版でファイルを開く/起動引数/D&D/ツリー選択/読み取り専用が回帰なく動作。バイナリファイル投入時に `chooseMdOnly` が出る挙動を維持。

---

## C3: CRUD 系の Tauri/Web 二分を最小 FS 抽象へ切り出し

### 作業内容

`moveDirectoryEntry`(9612)/`createDirectoryEntry`(10048)/`createMarkdownFileEntry`(10119)/`renameDirectoryEntry`(10209)/`deleteDirectoryEntryQuiet`(10299) について、**FS 操作部のみ**を以下の薄い抽象関数に切り出す。前処理（バリデーション・衝突チェック）と後処理（ツリー更新・`renderFileList`・`setStatus`・active 追従）は呼び出し側に残す。

抽象関数の形（新規追加、`moveDirectoryEntry` の直前 9612 付近にまとめて配置）:

```js
// 戻り値はいずれも「新パス（Tauri）/新ハンドル（Web）」など後処理に必要な最小情報。
// 名前衝突・権限・存在チェックは呼び出し側が事前に行い、ここでは FS 操作のみ。

async function fsMoveEntry(entry, targetEntry) {
  if (isTauri) {
    const targetDirPath = targetEntry && targetEntry.tauriPath ? targetEntry.tauriPath : activeDirectoryHandle;
    const movedPath = await invokeTauri("desktop_move_entry", { sourcePath: entry.tauriPath, targetDirPath });
    return { tauriPath: movedPath };
  }
  // Web: 権限確認は呼び出し側で済ませる方針 or ここで行うかは現行に合わせる（下記注意参照）
  const targetParentHandle = targetEntry ? targetEntry.directoryHandle : activeDirectoryHandle;
  let movedHandle;
  if (entry.kind === "dir") {
    movedHandle = await copyDirectoryHandleToDirectory(entry.directoryHandle, targetParentHandle, entry.name);
    await entry.parentDirectoryHandle.removeEntry(entry.name, { recursive: true });
  } else {
    movedHandle = await copyFileHandleToDirectory(entry.fileHandle, targetParentHandle, entry.name);
    await entry.parentDirectoryHandle.removeEntry(entry.name);
  }
  return { handle: movedHandle };
}

async function fsCreateDirectory(parentEntry, name) { /* desktop_create_directory ↔ getDirectoryHandle({create:true}) */ }
async function fsCreateFile(parentEntry, name)     { /* desktop_create_file ↔ getFileHandle({create:true}) + 空書き込み */ }
async function fsRenameEntry(entry, newName)        { /* desktop_rename_file ↔ copy+removeEntry */ }
async function fsDeleteEntry(entry)                 { /* desktop_delete_directory|file ↔ removeEntry */ }
```

**抽象化の範囲を絞る判断（重要）**:

- Web 版の `requestPermission({ mode: "readwrite" })` と存在チェック（`getDirectoryHandle({create:false})` で `NotFoundError` 判定）は**現行ロジックを壊さないため、当面 fs* 関数の内側に閉じ込めず呼び出し側に残す**選択肢を優先する。理由: 権限拒否時の `permissionDenied` ステータスや「既に存在」時の専用ステータスは関数ごとに文言が異なり、抽象に押し込むと分岐が増えて可読性が下がるため。
- したがって C3 の主目的は「`invokeTauri(...)` 呼び出し ↔ Web API 呼び出し」の **FS 実行行だけ**を fs* 関数に寄せ、`if (isTauri) { ... } else { ... }` の二重構造を各 CRUD 関数の本体から1回の `await fsXxx(...)` に縮約することにある。前後処理は共通化済みの体裁に揃える。
- ただし `createMarkdownFileEntry` のように Tauri/Web で後処理が完全一致（`appendDirectoryNode` → `sortDirectoryFiles` → `renderFileList` → `setStatus(fileCreateDone)` → `loadDirectoryEntry(newEntry)`）の場合は、fs* 関数が返した新ノード情報から共通の後処理を1本化する。

before/after 例（`createMarkdownFileEntry` の FS 部）:

```js
// before（10140〜10205, Tauri と Web で newEntry を別々に構築）
if (isTauri) { createdPath = await invokeTauri("desktop_create_file", {...}); ... newEntry = {...tauri...}; }
else { ...getFileHandle... newEntry = {...web...}; }

// after
const created = await fsCreateFile(parentEntry, trimmedName);  // { tauriPath, parentPath } or { handle, parentHandle }
const newEntry = created.tauriPath
  ? { kind: "file", name: trimmedName, path: getTauriDisplayPath(created.tauriPath, activeDirectoryHandle), tauriPath: created.tauriPath, tauriParentPath: created.parentPath, modified: Date.now() }
  : { kind: "file", name: trimmedName, path: parentEntry && parentEntry.path ? `${parentEntry.path}/${trimmedName}` : trimmedName, fileHandle: created.handle, parentDirectoryHandle: created.parentHandle, modified: Date.now() };
appendDirectoryNode(parentEntry, newEntry);
sortDirectoryFiles();
renderFileList();
setStatus(t("status", "fileCreateDone"), false);
await loadDirectoryEntry(newEntry);
```

**move エラーの文字列マッチ（9640〜9646）は C3 では現状維持**し、C4 で構造化エラー化する（C3 と C4 の責務を分離して回帰範囲を限定するため）。同様に `createMarkdownFileEntry` の `includes("already exists")`（10150）も C4 で扱う。

C1/C2 と同じく、状態追従（`currentFileHandle` / `activeDirectoryEntryPath` の付け替え、`selectedEntryPaths.clear()`）は C1 完了済みなら `fileState`/`dirState` 経由に揃える。

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - 新規追加: 9612 直前に `fsMoveEntry`/`fsCreateDirectory`/`fsCreateFile`/`fsRenameEntry`/`fsDeleteEntry`
  - 改変: `moveDirectoryEntry`（9628〜9657 の Tauri 分岐 FS 行 / 9680〜9690 の Web 分岐 FS 行）/ `createDirectoryEntry`（10065〜10112）/ `createMarkdownFileEntry`（10140〜10206）/ `renameDirectoryEntry`（10219〜10296）/ `deleteDirectoryEntryQuiet`（10302〜10362）

### 完了条件

- 各 CRUD 関数本体から `if (isTauri) { invokeTauri(...) } else { ...handle API... }` の二重 FS ブロックが消え、`await fsXxx(...)` 1回 + 共通後処理に縮約されている。
- Tauri 版・Web 版で「フォルダ作成 / ファイル作成 / リネーム / 削除 / D&D 移動」が回帰なく動作。名前衝突・権限拒否・移動不正（自分の子へ移動）の各ステータスが従来通り出る。

---

## C4: Rust エラーの文字列マッチを構造化エラー化（後方互換維持）

### 作業内容

`moveDirectoryEntry`（9640〜9646）と `createMarkdownFileEntry`（10150）が Rust の `Err(String)` を `message.includes("already exists")` / `includes("Cannot move")` の**文字列マッチ**で分岐している。Rust 側の文言を変えるとサイレントに壊れるため、機械可読な `code` を付与する。

**後方互換のための方針（推奨: プレフィックス方式）**:

Tauri の `invoke` は `Err(String)` をそのまま JS の reject 値（文字列）として返す。`Result<T, E>` の `E` を構造体にすると `serde::Serialize` 実装が必要で変更範囲が広がる。そこで**エラー文字列の先頭に機械可読コードを `CODE:` 形式で埋め込む**方式を採る（既存の人間可読文言は温存 = 後方互換）。

Rust 側（`lib.rs`）:

```rust
// 例: desktop_move_entry（295付近 / 290付近）
// before: return Err("An item with that name already exists.".to_string());
// after : return Err("ALREADY_EXISTS: An item with that name already exists.".to_string());

// before: return Err("Cannot move a directory into itself ...".to_string());
// after : return Err("MOVE_INVALID: Cannot move a directory into itself ...".to_string());

// desktop_create_file / desktop_create_directory / desktop_rename_file の
// "A file/folder with that name already exists." も "ALREADY_EXISTS: ..." を前置
```

付与するコード一覧（最小セット）:

| code | 付与する Rust 箇所 | 用途（JS 側） |
|------|-------------------|--------------|
| `ALREADY_EXISTS` | `desktop_move_entry`(295) / `desktop_create_file`(347) / `desktop_create_directory`(329) / `desktop_rename_file`(258) | `moveExists` / `fileNameExists` / `folderNameExists` / `renameExists` |
| `MOVE_INVALID` | `desktop_move_entry`(289) | `moveInvalid` |

JS 側（`offline-md-editor-viewer.html`）— コード抽出ヘルパを追加し、文字列マッチを置換:

```js
// invokeTauri 付近（8378 直後）に追加
function parseTauriErrorCode(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const m = /^([A-Z_]+):\s*/.exec(msg);
  return { code: m ? m[1] : "", message: m ? msg.slice(m[0].length) : msg };
}

// moveDirectoryEntry 9638〜9648 の catch
} catch (err) {
  const { code } = parseTauriErrorCode(err);
  if (code === "ALREADY_EXISTS") { setStatus(t("status", "moveExists"), true); return; }
  if (code === "MOVE_INVALID")   { setStatus(t("status", "moveInvalid"), true); return; }
  throw err;
}

// createMarkdownFileEntry 10148〜10155 の catch
} catch (err) {
  const { code } = parseTauriErrorCode(err);
  if (code === "ALREADY_EXISTS") { setStatus(t("status", "fileNameExists"), true); return; }
  throw err;
}
```

**後方互換の担保**: `parseTauriErrorCode` はコードが無ければ `code === ""` を返し、従来の文字列はそのまま `message` に入る。万一 Rust 側のコード付与が漏れても、`code` が空になるだけでクラッシュはせず、`throw err` で上位の汎用エラーステータスへフォールバックする（現行と同等以上の堅さ）。移行期に旧文字列マッチを残す折衷案も可能だが、本 plan では Rust/JS を同時更新するため不要と判断する（残す場合は `||` で `code === "ALREADY_EXISTS" || /already exists/i.test(message)` とする）。

> 代替案（構造化 struct を返す）も検討したが、`Result<String, AppError>` 化は全 `desktop_*` コマンドのシグネチャと `serde` 派生に波及し、本 C2 のスコープ（保守性向上）に対して変更範囲が過大。プレフィックス方式が最小差分で目的を達する。

### 変更ファイル

- `apps/desktop/src-tauri/src/lib.rs`
  - `desktop_move_entry`: 289〜291（`MOVE_INVALID:` 前置）/ 295（`ALREADY_EXISTS:` 前置）
  - `desktop_create_file`: 347（`ALREADY_EXISTS:` 前置）
  - `desktop_create_directory`: 329（`ALREADY_EXISTS:` 前置）
  - `desktop_rename_file`: 258（`ALREADY_EXISTS:` 前置）
- `apps/browser/offline-md-editor-viewer.html`
  - 新規追加: 8384（`invokeTauri` 終端）直後に `parseTauriErrorCode`
  - 改変: `moveDirectoryEntry` 9638〜9648 / `createMarkdownFileEntry` 10148〜10155

### 完了条件

- `message.includes("already exists")` / `includes("Cannot move")` の文字列マッチが JS から消え、`parseTauriErrorCode` の `code` 比較に置換されている（`grep -n "includes(\"already exists\")"` / `includes("Cannot move")` で 0 件）。
- Tauri 版で「既存名へ移動 / 自分の子へ移動 / 既存名でファイル作成」を行うと、それぞれ `moveExists` / `moveInvalid` / `fileNameExists` のステータスが従来通り出る。
- Rust 側コードのコンパイルが通る（ビルドはユーザー指示があるまで実行しない。コンパイル可否は型・文字列リテラルの妥当性をコードレビューで確認）。

---

## 完了報告フォーマット

各内部 C 完了時、および本子 plan 全体完了時に以下3点のみ返す:

1. `fix:完了 / plan:未完了`（内部 C 単位の状態）
2. 変更ファイル一覧
3. 検証結果1行（例: 「Tauri/Web 両経路でロード・CRUD が回帰なし、`currentFileBuffer = buffer` 重複が9→1に縮約」）

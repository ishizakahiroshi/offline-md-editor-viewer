# [完了] C1: ファイル状態・ディレクトリ状態の変数群をオブジェクトに集約

> 親: [plan_source_improvement_survey.md](plan_source_improvement_survey.md)
> 最終更新: 2026-05-25(月) 19:48:40
> 親 plan の C1 を担当する子 plan。

## context配分

| C | 種別 | 内容 | 並列 |
|---|---|---|---|
| C1 | fix | ファイル状態10変数を `fileState` オブジェクトへ集約（宣言＋全参照書き換え） | — |
| C2 | fix | ディレクトリ状態12変数を `dirState` オブジェクトへ集約（宣言＋全参照書き換え） | C1 完了後 |
| C3 | fix | `STORAGE_KEY_PREFIX` を残り12キーに適用（文字列リテラルを `STORAGE_KEY_PREFIX + "xxx"` 形式に統一） | C1・C2 完了後 |

実行順序: `C1 → C2 → C3`

---

## 目的

`apps/browser/offline-md-editor-viewer.html` のトップレベル `let` 変数としてフラットに散在しているファイル状態・ディレクトリ状態の変数群を、それぞれ `fileState` / `dirState` という単一オブジェクトへ集約する。加えて `STORAGE_KEY_PREFIX` が定義されているのにハードコードリテラルのまま放置されている12個のストレージキーを、プレフィックス連結形式に統一する。

変更後も「オフライン・CDN 不使用・単一 HTML 完結」の設計思想は一切変えない。外部依存ゼロ・ビルドレス前提を維持する。

## 前提

- 対象ファイル: `apps/browser/offline-md-editor-viewer.html`（全12,576行）
- 変更は JS 領域のみ（CSS・HTML 構造・Rust 側には触れない）
- `setLoadedMarkdown`（行7677）/ `clearLoadedContent`（行7708）は `fileState` への書き換えを優先的に行う（呼び出し元9箇所への影響が大きいため C1 の最重要箇所）
- `favoriteDirs`（Set）は `localStorage` 復元処理が宣言直後（行4804〜4807）にあるため `dirState` 集約後も初期化順序を維持する

---

## C1: ファイル状態10変数を `fileState` オブジェクトへ集約

### 作業内容

#### 1. 現状の変数宣言（行4761〜4771）を確認

実際の宣言（精読済み）:

```js
// 行4761〜4771 付近（行4761 syncingScrollの直後）
let currentFileHandle = null;           // 行4762  参照55箇所
let currentFileEncoding = "utf-8";      // 行4763  参照16箇所
let currentFileBom = false;             // 行4764  参照20箇所
let currentFileLineEnding = "lf";       // 行4765  参照19箇所
let currentFileBuffer = null;           // 行4766  参照23箇所
let hasUnsavedChanges = false;          // 行4767  参照22箇所
let isReadOnlyMode = false;             // 行4768  参照20箇所
let hasContent = false;                 // 行4769  参照16箇所
let currentFileViewMode = "markdown";   // 行4770  参照11箇所
let previewAutoCollapsed = false;       // 行4771  参照7箇所
```

#### 2. 宣言を `fileState` オブジェクトに置き換える

**Before（行4762〜4771）:**

```js
let currentFileHandle = null;
let currentFileEncoding = "utf-8";
let currentFileBom = false;
let currentFileLineEnding = "lf";
let currentFileBuffer = null;
let hasUnsavedChanges = false;
let isReadOnlyMode = false;
let hasContent = false; // true after new/open/file load
let currentFileViewMode = "markdown"; // "markdown" | "plain"
let previewAutoCollapsed = false; // true while a non-Markdown file is loaded
```

**After（同行位置に差し替え）:**

```js
const fileState = {
  handle: null,           // 旧: currentFileHandle
  encoding: "utf-8",      // 旧: currentFileEncoding
  bom: false,             // 旧: currentFileBom
  lineEnding: "lf",       // 旧: currentFileLineEnding
  buffer: null,           // 旧: currentFileBuffer
  unsaved: false,         // 旧: hasUnsavedChanges
  readOnly: false,        // 旧: isReadOnlyMode
  hasContent: false,      // 旧: hasContent（true after new/open/file load）
  viewMode: "markdown",   // 旧: currentFileViewMode（"markdown" | "plain"）
  previewAutoCollapsed: false, // 旧: previewAutoCollapsed（true while a non-Markdown file is loaded）
};
```

> `const` で宣言してよい理由: オブジェクト参照自体を再代入しないため。プロパティの書き換えのみ発生する。

#### 3. 全参照箇所を一括置換（旧変数名 → `fileState.xxx`）

置換マッピング表（正規表現置換で実施）:

| 旧変数名 | 新参照 | 参照数 |
|---------|--------|--------|
| `currentFileHandle` | `fileState.handle` | 55 |
| `currentFileEncoding` | `fileState.encoding` | 16 |
| `currentFileBom` | `fileState.bom` | 20 |
| `currentFileLineEnding` | `fileState.lineEnding` | 19 |
| `currentFileBuffer` | `fileState.buffer` | 23 |
| `hasUnsavedChanges` | `fileState.unsaved` | 22 |
| `isReadOnlyMode` | `fileState.readOnly` | 20 |
| `hasContent` | `fileState.hasContent` | 16 |
| `currentFileViewMode` | `fileState.viewMode` | 11 |
| `previewAutoCollapsed` | `fileState.previewAutoCollapsed` | 7 |

**注意点:**
- `hasContent` は他の変数（`hasUnsavedChanges` など）名の一部にならないため単純置換可。ただし `hasBom`（デコード結果の局所変数）と混同しないよう注意。`hasBom` は `fileState.bom` に **代入する** ローカル変数であり、`fileState.bom` とは別物。
- `isReadOnlyMode` は `setReadOnlyMode(bool)` 関数内でも参照されている。同関数内の参照も置換対象。

#### 4. `setLoadedMarkdown`（行7677〜7706）の書き換え

**Before:**

```js
function setLoadedMarkdown(text, encoding, options = {}) {
  if (options.viewMode === "markdown" || options.viewMode === "plain") {
    currentFileViewMode = options.viewMode;
  } else {
    currentFileViewMode = "markdown";
  }
  previewAutoCollapsed = currentFileViewMode === "plain";
  // ...
  currentFileEncoding = encoding;
  // ...
  hasContent = true;
  hasUnsavedChanges = false;
  // ...
}
```

**After:**

```js
function setLoadedMarkdown(text, encoding, options = {}) {
  if (options.viewMode === "markdown" || options.viewMode === "plain") {
    fileState.viewMode = options.viewMode;
  } else {
    fileState.viewMode = "markdown";
  }
  fileState.previewAutoCollapsed = fileState.viewMode === "plain";
  // ...
  fileState.encoding = encoding;
  // ...
  fileState.hasContent = true;
  fileState.unsaved = false;
  // ...
}
```

呼び出し元9箇所（行8618/8648/8672/8695/8854/9377/11488/11988/12236/12395）での `setLoadedMarkdown` 呼び出し前に行っている個別代入も置換対象:

```js
// 例: 行8615〜8618 の Before
currentFileBuffer = buffer;
currentFileBom = hasBom;
currentFileLineEnding = detectLineEnding(text);
setLoadedMarkdown(text, encoding, { viewMode: getFileViewMode(path) });

// After
fileState.buffer = buffer;
fileState.bom = hasBom;
fileState.lineEnding = detectLineEnding(text);
setLoadedMarkdown(text, encoding, { viewMode: getFileViewMode(path) });
```

#### 5. `clearLoadedContent`（行7708〜7735）の書き換え

**Before（抜粋）:**

```js
function clearLoadedContent() {
  currentFileHandle = null;
  currentFileEncoding = "utf-8";
  currentFileBuffer = null;
  currentFileBom = false;
  currentFileLineEnding = "lf";
  // ...
  hasContent = false;
  // ...
  currentFileViewMode = "markdown";
  previewAutoCollapsed = false;
  // ...
  hasUnsavedChanges = false;
  // ...
}
```

**After:**

```js
function clearLoadedContent() {
  fileState.handle = null;
  fileState.encoding = "utf-8";
  fileState.buffer = null;
  fileState.bom = false;
  fileState.lineEnding = "lf";
  // ...
  fileState.hasContent = false;
  // ...
  fileState.viewMode = "markdown";
  fileState.previewAutoCollapsed = false;
  // ...
  fileState.unsaved = false;
  // ...
}
```

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - 行4762〜4771: 宣言を `const fileState = {...}` に差し替え
  - 行7677〜7706（`setLoadedMarkdown`）: 参照を `fileState.xxx` に書き換え
  - 行7708〜7735（`clearLoadedContent`）: 参照を `fileState.xxx` に書き換え
  - 上記以外の参照箇所（合計約209箇所）: 一括置換

### 完了条件

- `let currentFileHandle` / `let currentFileBuffer` 等の旧フラット宣言がゼロになっている（`grep` で確認）
- アプリ起動 → ファイルを開く → 編集 → 保存 → モード切替 が回帰なし
- `setLoadedMarkdown` / `clearLoadedContent` が `fileState.xxx` 形式のみで状態を更新している

---

## C2: ディレクトリ状態12変数を `dirState` オブジェクトへ集約

### 作業内容

#### 1. 現状の変数宣言（行4801〜4821）を確認

実際の宣言（精読済み）:

```js
let directoryFiles = [];                        // 行4801  参照65箇所
let expandedDirs = new Set();                   // 行4802  参照12箇所
let favoriteDirs = new Set();                   // 行4803  参照15箇所
// 行4804〜4807: favoriteDirs の localStorage 復元処理
try {
  const savedFavorites = localStorage.getItem(STORAGE_FAVORITES_KEY);
  if (savedFavorites) favoriteDirs = new Set(JSON.parse(savedFavorites));
} catch (_err) {}
let activeDirectoryHandle = null;               // 行4808  参照65箇所
let activeDirectoryPath = "";                   // 行4809  参照6箇所
let activeDirectoryDisplayName = "";            // 行4810  参照3箇所
let activeDirectoryEntryPath = "";              // 行4811  参照41箇所
let activeDirectoryEntryTauriPath = "";         // 行4812  参照15箇所
let selectedEntryPaths = new Set();             // 行4813  参照33箇所
let lastSelectedEntryPath = "";                 // 行4814  参照20箇所
let draggedDirectoryEntryPath = "";             // 行4815  参照12箇所
let draggedEntryPaths = [];                     // 行4816  参照13箇所
let tauriDropPendingTimer = 0;                  // 行4817  参照7箇所
let contextMenuEntry = null;                    // 行4818  参照12箇所
let clipboardEntry = null;                      // 行4819  参照13箇所
let directoryRefreshTimer = null;               // 行4820  参照4箇所
let directorySortMode = getInitialFileSortMode(); // 行4821  参照14箇所
```

> `favoriteDirs` は元々 `new Set()` で宣言後に localStorage 復元で上書きされている。`dirState` 集約後は宣言時の初期値を `new Set()` とし、復元処理でも `dirState.favoriteDirs = new Set(...)` に書き換えることで順序を維持する。

#### 2. 宣言を `dirState` オブジェクトに置き換える

**Before（行4801〜4821）:**（上記参照）

**After（同行位置に差し替え）:**

```js
const dirState = {
  files: [],                          // 旧: directoryFiles
  expandedDirs: new Set(),            // 旧: expandedDirs
  favoriteDirs: new Set(),            // 旧: favoriteDirs
  handle: null,                       // 旧: activeDirectoryHandle
  path: "",                           // 旧: activeDirectoryPath
  displayName: "",                    // 旧: activeDirectoryDisplayName
  entryPath: "",                      // 旧: activeDirectoryEntryPath
  entryTauriPath: "",                 // 旧: activeDirectoryEntryTauriPath
  selectedPaths: new Set(),           // 旧: selectedEntryPaths
  lastSelectedPath: "",               // 旧: lastSelectedEntryPath
  draggedPath: "",                    // 旧: draggedDirectoryEntryPath
  draggedPaths: [],                   // 旧: draggedEntryPaths
  tauriDropPendingTimer: 0,           // 旧: tauriDropPendingTimer
  contextMenuEntry: null,             // 旧: contextMenuEntry
  clipboardEntry: null,               // 旧: clipboardEntry
  refreshTimer: null,                 // 旧: directoryRefreshTimer
  sortMode: getInitialFileSortMode(), // 旧: directorySortMode
};
// favoriteDirs の localStorage 復元（順序維持）
try {
  const savedFavorites = localStorage.getItem(STORAGE_FAVORITES_KEY);
  if (savedFavorites) dirState.favoriteDirs = new Set(JSON.parse(savedFavorites));
} catch (_err) {}
```

#### 3. 全参照箇所を一括置換

置換マッピング表:

| 旧変数名 | 新参照 | 参照数 |
|---------|--------|--------|
| `directoryFiles` | `dirState.files` | 65 |
| `expandedDirs` | `dirState.expandedDirs` | 12 |
| `favoriteDirs` | `dirState.favoriteDirs` | 15 |
| `activeDirectoryHandle` | `dirState.handle` | 65 |
| `activeDirectoryPath` | `dirState.path` | 6 |
| `activeDirectoryDisplayName` | `dirState.displayName` | 3 |
| `activeDirectoryEntryPath` | `dirState.entryPath` | 41 |
| `activeDirectoryEntryTauriPath` | `dirState.entryTauriPath` | 15 |
| `selectedEntryPaths` | `dirState.selectedPaths` | 33 |
| `lastSelectedEntryPath` | `dirState.lastSelectedPath` | 20 |
| `draggedDirectoryEntryPath` | `dirState.draggedPath` | 12 |
| `draggedEntryPaths` | `dirState.draggedPaths` | 13 |
| `tauriDropPendingTimer` | `dirState.tauriDropPendingTimer` | 7 |
| `contextMenuEntry` | `dirState.contextMenuEntry` | 12 |
| `clipboardEntry` | `dirState.clipboardEntry` | 13 |
| `directoryRefreshTimer` | `dirState.refreshTimer` | 4 |
| `directorySortMode` | `dirState.sortMode` | 14 |

**注意点:**
- `saveFavoriteDirs()`（行4754〜4756）が `favoriteDirs` を参照している。同関数内も `dirState.favoriteDirs` に置換する:
  ```js
  // Before
  function saveFavoriteDirs() {
    safeLocalStorageSet(STORAGE_FAVORITES_KEY, JSON.stringify(Array.from(favoriteDirs)));
  }
  // After
  function saveFavoriteDirs() {
    safeLocalStorageSet(STORAGE_FAVORITES_KEY, JSON.stringify(Array.from(dirState.favoriteDirs)));
  }
  ```
- `flattenTreeFiles(directoryFiles)` は `flattenTreeFiles(dirState.files)` に置換。`flattenTreeFiles` 自体の引数は変更しない。
- `dirState.sortMode = getInitialFileSortMode()` は `const` 宣言時の初期化のため、関数 `getInitialFileSortMode` が `dirState` 宣言より前に定義されていることを事前確認する（現状 `getInitialFileSortMode` は行4821 の直前に定義済みであれば問題なし）。

#### 4. `getInitialFileSortMode` の定義位置確認

`dirState` 宣言時に `getInitialFileSortMode()` を呼ぶため、その関数が `dirState` 宣言より前に定義されている必要がある。実装前に `grep` で定義行を確認し、定義が後続行にある場合は `dirState.sortMode` の初期化を宣言後の1行として分離する:

```js
// もし getInitialFileSortMode が dirState 宣言より後にある場合の代替
const dirState = {
  // ...
  sortMode: null, // 後で初期化
  // ...
};
dirState.sortMode = getInitialFileSortMode(); // 宣言後に設定
```

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - 行4801〜4821: 宣言を `const dirState = {...}` + 復元処理に差し替え
  - 行4754〜4756（`saveFavoriteDirs`）: `favoriteDirs` → `dirState.favoriteDirs`
  - 上記以外の参照箇所（合計約315箇所）: 一括置換

### 完了条件

- 旧フラット変数宣言（`let directoryFiles` 等）がゼロ
- フォルダを開く → ツリー表示 → ファイルクリック → rename/delete/move が回帰なし
- お気に入り登録・復元が回帰なし

---

## C3: `STORAGE_KEY_PREFIX` を残り12キーに適用

### 作業内容

#### 1. 現状の確認（行4699〜4730）

現在プレフィックス連結されているのは `STORAGE_FAVORITES_KEY`（行4722）の **1個のみ**:

```js
const STORAGE_KEY_PREFIX = "offline_md_editor_viewer_";         // 行4699
const STORAGE_LANG_KEY = "offline_md_editor_viewer_lang";       // 行4700 ← ハードコード
const STORAGE_THEME_KEY = "offline_md_editor_viewer_theme";     // 行4701 ← ハードコード
const STORAGE_THEME_SCHEMA_KEY = "offline_md_editor_viewer_theme_schema"; // 行4702 ← ハードコード
const STORAGE_FONT_SCALE_KEY = "offline_md_editor_viewer_font_scale";     // 行4703 ← ハードコード
const STORAGE_DENSITY_KEY = "offline_md_editor_viewer_density"; // 行4704 ← ハードコード
// ...
const STORAGE_FILE_SORT_KEY = "offline_md_editor_viewer_file_sort";       // 行4715 ← ハードコード
const STORAGE_FILE_TOOLS_VISIBLE_KEY = "offline_md_editor_viewer_file_tools_visible"; // 行4716 ← ハードコード
const STORAGE_CARD_VISIBILITY_KEY = "offline_md_editor_viewer_card_visibility";       // 行4717 ← ハードコード
const STORAGE_CARD_WIDTH_KEY = "offline_md_editor_viewer_card_width";                 // 行4718 ← ハードコード
const STORAGE_WRAP_ENABLED_KEY = "offline_md_editor_viewer_wrap_enabled";             // 行4719 ← ハードコード
const STORAGE_EOF_MARKER_KEY = "offline_md_editor_viewer_eof_marker_enabled";         // 行4720 ← ハードコード
const STORAGE_FILE_TREE_SHOW_ALL_KEY = "offline_md_editor_viewer_file_tree_show_all"; // 行4721 ← ハードコード
const STORAGE_FAVORITES_KEY = STORAGE_KEY_PREFIX + "favorites"; // 行4722 ← 連結済み
const STORAGE_EXTERNAL_LINKS_ENABLED_KEY = "offline_md_editor_viewer_external_links_enabled";             // 行4723 ← ハードコード
const STORAGE_EXTERNAL_LINKS_BLOCKED_NOTICE_SEEN_KEY = "offline_md_editor_viewer_external_links_blocked_notice_seen"; // 行4724 ← ハードコード
const STORAGE_DISMISSED_HINTS_KEY = "offline_md_editor_viewer_dismissed_hints";       // 行4725 ← ハードコード
// IndexedDB 関連（3件）はプレフィックス対象外: 行4726〜4730
const DIRECTORY_DB_NAME = "offline_md_editor_viewer_directory"; // 行4726
const STORAGE_LAST_DIRECTORY_TAURI_KEY = "offline_md_editor_viewer_last_directory_tauri_path"; // 行4729
const LEGACY_STORAGE_LAST_DIRECTORY_TAURI_KEY = "lastDirectory_tauri_path"; // 行4730
```

> `DIRECTORY_DB_NAME`（IndexedDB名）/ `LEGACY_STORAGE_LAST_DIRECTORY_TAURI_KEY`（旧キー・移行用） は変更しない。`LEGACY_STORAGE_LAST_DIRECTORY_TAURI_KEY` を変えると旧キーからの移行ロジックが壊れる。

#### 2. ハードコード12キーをプレフィックス連結に書き換える

**Before → After（行4700〜4725、`STORAGE_FAVORITES_KEY` 以外の12件）:**

```js
// Before
const STORAGE_LANG_KEY = "offline_md_editor_viewer_lang";

// After
const STORAGE_LANG_KEY = STORAGE_KEY_PREFIX + "lang";
```

全12件の対応表:

| 定数名 | サフィックス部分（連結後） |
|-------|------------------------|
| `STORAGE_LANG_KEY` | `"lang"` |
| `STORAGE_THEME_KEY` | `"theme"` |
| `STORAGE_THEME_SCHEMA_KEY` | `"theme_schema"` |
| `STORAGE_FONT_SCALE_KEY` | `"font_scale"` |
| `STORAGE_DENSITY_KEY` | `"density"` |
| `STORAGE_FILE_SORT_KEY` | `"file_sort"` |
| `STORAGE_FILE_TOOLS_VISIBLE_KEY` | `"file_tools_visible"` |
| `STORAGE_CARD_VISIBILITY_KEY` | `"card_visibility"` |
| `STORAGE_CARD_WIDTH_KEY` | `"card_width"` |
| `STORAGE_WRAP_ENABLED_KEY` | `"wrap_enabled"` |
| `STORAGE_EOF_MARKER_KEY` | `"eof_marker_enabled"` |
| `STORAGE_FILE_TREE_SHOW_ALL_KEY` | `"file_tree_show_all"` |
| `STORAGE_EXTERNAL_LINKS_ENABLED_KEY` | `"external_links_enabled"` |
| `STORAGE_EXTERNAL_LINKS_BLOCKED_NOTICE_SEEN_KEY` | `"external_links_blocked_notice_seen"` |
| `STORAGE_DISMISSED_HINTS_KEY` | `"dismissed_hints"` |
| `STORAGE_LAST_DIRECTORY_TAURI_KEY` | `"last_directory_tauri_path"` |

> 上記は15件（12件 + 既存1件 + 追加3件）だが、`STORAGE_FAVORITES_KEY` はすでに連結済みのため実際の変更対象は14件。合計15キー全てが `STORAGE_KEY_PREFIX + "<suffix>"` 形式に揃う。

#### 3. 変更の検証

変更後に各キーの実際の文字列値が変わらないことを確認する（JS 式として評価した結果が旧リテラルと等しいかを目視チェック）。例:

```
STORAGE_KEY_PREFIX + "lang"
= "offline_md_editor_viewer_" + "lang"
= "offline_md_editor_viewer_lang"  ✓ 旧リテラルと一致
```

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - 行4700〜4725 の対象14定数の文字列リテラルを `STORAGE_KEY_PREFIX + "<suffix>"` 形式に書き換え

### 完了条件

- `grep "offline_md_editor_viewer_"` でヒットするストレージキー定数が `STORAGE_KEY_PREFIX` と `LEGACY_STORAGE_LAST_DIRECTORY_TAURI_KEY` 以外にゼロ
- ブラウザで開き、localStorage の各キーが既存の値（言語・テーマ等）を正常に読み込めること（キー文字列値が変わっていないため既存設定が失われないことを確認）

---

## 完了報告フォーマット

各内部 C 完了時に以下の3点を報告すること:

1. **完了/未完了**: 各 C の状態
2. **変更ファイル一覧**: 変更したファイルと変更箇所の概要
3. **検証結果1行**: 動作確認の結果（例: 「ファイル開閉・保存・フォルダツリーが回帰なし確認」）

加えて、各 C 完了時に以下の両方を `plan` → `fix` に更新すること:

- 本ファイル（子 plan `plan_source_improvement_survey_c1_state-object.md`）の `## context配分` 表の該当行
- 親 plan `plan_source_improvement_survey.md` の `## context配分` 表の C1 行（子 plan 全 C が `fix` になった時点で更新）

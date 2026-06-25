# [完了] ソースコード改善調査レポート

> 最終更新: 2026-05-25(月) 21:22:35

## context配分

各改善を実装単位の C に割り当てたロードマップ。本レポートは調査段階のため全 C `plan`（未着手）。ユーザーが実装を決定した時点で該当 C を実行し `fix` に更新する。各 C の詳細実装手順は子 plan に分割済み（subagent が子 plan 単体で実装できる粒度）。

| C | 種別 | 内容 | 主対象 | 子 plan | 並列 |
|---|---|---|---|---|---|
| C1 | fix | ファイル状態・ディレクトリ状態の変数群をオブジェクトに集約 | JS | [`..._c1_state-object.md`](plan_source_improvement_survey_c1_state-object.md) | — |
| C2 | fix | ファイルロード／CRUD 処理の共通化（`applyLoadedContent` 抽出ほか） | JS | [`..._c2_load-crud-dedup.md`](plan_source_improvement_survey_c2_load-crud-dedup.md) | C1 の成果物に依存 |
| C3 | fix | ファイルツリー描画最適化（イベント委譲化 + SVG テンプレートクローン化） | JS | [`..._c3_filetree-render.md`](plan_source_improvement_survey_c3_filetree-render.md) | — |
| C4 | fix | 共通ユーティリティ抽出 + エラーハンドリング統一 + 大ファイル通知の i18n 化 | JS | [`..._c4_utils-errors-i18n.md`](plan_source_improvement_survey_c4_utils-errors-i18n.md) | — |
| C5 | fix | CSS 整理（トグル統合・未定義変数・!important 連鎖・オーバーレイ共通化・区切りコメント・未使用削除） | CSS | [`..._c5_css-cleanup.md`](plan_source_improvement_survey_c5_css-cleanup.md) | [並列OK with C6] |
| C6 | fix | セキュリティ／堅牢性強化（Tauri ルート封じ込め・symlink 対策・rel 付与漏れ）※C2(Rust ルート封じ込め)は案C見送り | Rust + JS | [`..._c6_security-hardening.md`](plan_source_improvement_survey_c6_security-hardening.md) | [並列OK with C5] |

実行順序: `C1 → C2 → C3 → C4 → (C5, C6)`

> 注: 全 C が同一ファイル `apps/browser/offline-md-editor-viewer.html` を編集対象に含むため、`[並列OK]` 表記の C5/C6 も実行時はマージ衝突に注意する（C5 は CSS 領域 ≈ 行10〜3540、C6 は JS 領域 + `lib.rs` で編集箇所は分離している）。

---

## 概要

`offline-md-editor-viewer`（オフライン・ビルドレス・単一 HTML の Markdown エディタ/ビューア、ブラウザ版と Tauri デスクトップ版を共用）の全ソースを横断的に精査した。調査は4観点（JS 前半アーキテクチャ／JS 後半アーキテクチャ／CSS／セキュリティ・堅牢性）に分け、各観点を専門エージェントが実コードを精読して実施した。

総評：

- **セキュリティ・堅牢性は良好**。Critical/High の問題は検出されなかった。XSS 防御（`marked.parse` → `DOMPurify.sanitize` → `innerHTML` の一貫適用、ファイル名は全て `textContent`）、コマンドインジェクション対策（引数分離 + スキーム検証）、CSP（`connect-src 'none'`）、Tauri 権限最小化（`core:default` のみ）はいずれも堅実。
- **改善余地の中心は「保守性」**。12,576 行（CSS 約3,530／HTML 約580／JS 約8,450・351 関数）の単一ファイルゆえに、状態の分散・コード重複・全再描画パターンが蓄積している。いずれも「オフライン・CDN 不使用・1ファイル完結」という設計思想を崩さずに改善可能。
- **検出した指摘の深刻度はほぼ「中」以下**。バグと言えるのはクリップボード `.catch` 漏れ（1箇所）と CSS 未定義変数（`--input-bg` / `--focus-ring`）程度。

スコープ外（今回提案しないこと）：

- フレームワーク（React/Vue 等）導入やバンドラ前提のモジュール分割 — 設計思想（ビルドレス単一 HTML）と矛盾するため除外。
- 外部 CSS/JS ファイルへの物理分離 — リリースは単一 HTML インライン化が前提のため、分離は本質的改善にならない（論点としては C5 で言及）。

---

## 調査サマリー（観点別の総括）

| 観点 | 総評 | 重大度の最大 | 主な改善 |
|---|---|---|---|
| JS 前半（4125〜8000） | グローバル状態95変数が無構造に散在。`applyLanguage` が135行の神関数 | 高 | 状態オブジェクト化、神関数分割、コピー処理共通化 |
| JS 後半（8000〜12574） | ファイルロード処理が9箇所重複。ツリーが全再描画 + 各ノードに個別リスナ | 高 | `applyLoadedContent` 抽出、イベント委譲、SVG テンプレート化 |
| CSS（10〜3540） | トグルスイッチ3クラスが完全重複（約120行）。未定義変数2件。区切りコメント皆無 | 高 | トグル統合、未定義変数追加、!important 連鎖解消、共通化 |
| セキュリティ・堅牢性 | 重大問題なし。XSS/インジェクション/CSP/権限すべて堅実 | Low | Tauri ルート封じ込め、symlink 対策、rel 付与漏れ |

---

## 詳細調査結果

### A. JS 前半（行 4125〜8000）

**A-1. グローバル状態管理（重大度: 中）**

- IIFE スコープ内トップレベル `let` 変数が **約95個**、DOM 参照 `const` が **約168個**。
- ファイル状態10変数（`currentFileHandle` / `currentFileEncoding` / `currentFileBom` / `currentFileLineEnding` / `currentFileBuffer` / `hasUnsavedChanges` / `isReadOnlyMode` / `hasContent` / `currentFileViewMode` / `previewAutoCollapsed`、行4761〜4785付近）がフラットに散在。`fileState = {...}` への集約で `setLoadedMarkdown`（7677）／`clearLoadedContent`（7708）の個別代入が単純化できる。
- ディレクトリ状態10変数（`activeDirectoryHandle` / `activeDirectoryPath` / `directoryFiles` / `expandedDirs` / `favoriteDirs` ほか、行4801〜4821付近）も同様に `dirState = {}` へ集約可能。
- `STORAGE_KEY_PREFIX`（4699）が定義されているのに、13ストレージキーのうち実際にプレフィックス連結しているのは `STORAGE_FAVORITES_KEY`（4722）の1個だけ。残り12個は文字列リテラルでハードコード（プレフィックス変更時の修正漏れリスク）。

**A-2. 関数の責務と長さ**

- `applyLanguage(lang)`（行6177〜6311、**135行**、重大度: 高）— UI全文字列更新／ソートオプション描画／フォントサイズ描画／カードレイアウト更新／ファイルリスト描画／コードブロック拡張など15種類以上の責務が混在。`renderAllUiText()` 等への分割で、言語以外の変更時の不要処理を回避できる。
- `renderAboutDialogText()`（行5876〜5921）— ライブラリ名+バージョン（`marked 15.0.12`／`DOMPurify 3.4.1`／`Tauri 2.11.0`）がハードコード。バージョン定数へ切り出すべき（CLAUDE.md のバージョン二重管理ルールとも整合する）。

**A-3. コード重複**

- コピー成功時のアイコン切り替えパターンが3箇所で重複（行6153／7536／7610）。`showCopySuccess(btn, duration=1500)` に共通化可能。
- オフスクリーン DOM プローブの初期化（フォント系プロパティ十数個の設定）が `updateEofMarker`（6373〜6402）と `getMeasuredLineHeights`（6466〜6497）でほぼ同一実装。`applySourceFontStyle(el, style, widthPx)` に共通化可能。
- `SPLITTER_W = 14`（4757）が定義済みなのに `updateCardLayout` 内では `"14px"` リテラル（6047／6049）を使用。

**A-4. エラーハンドリング**

- `copyFileNameBtn` のクリップボード書き込み（行6149〜6163、重大度: 中）— `.catch` が **欠落**。他3箇所（7508／7522／7547）には `.catch` があるのにここだけ無く、非セキュアコンテキストや権限拒否時にエラーが無言になる。**実質的なバグ**。
- `dismissHint()`（7937）／`undismissHint`（7953）／`favoriteDirs` 復元（4804）／`hljs.highlight` フォールバック（6567）— `catch` が完全サイレント（`console.warn` 1行も無い）。デバッグ困難。

**A-5. 命名・可読性**

- `renderMarkdown` 内の大ファイル通知（行7754〜7756、重大度: 中）— `currentLang === "ja"` の2値分岐で、13言語サポートのうち**11言語が英語フォールバック**。`STR` テーブルへキー追加すべき。
- `copyFileNameFailed` キーが行コピー／全体コピー／コードコピー／テーブルコピーのエラーにも流用され、キー名が意味的に誤解を招く。

**A-6. イベントリスナ**

- `setupUiTooltipHandlers`（5841〜5874）の `mouseover`/`focusin` がほぼ同一ロジックの重複。
- `resize` リスナに `passive: true` が未付与（`scroll` には付いている）。
- `source` の `select`/`keyup`/`mouseup` が毎回 `scheduleMirroredSelectionUpdate` を予約。選択変化のないキーの早期リターンガードが無い。

### B. JS 後半（行 8000〜12574）

**B-1. ファイルロード処理の9箇所重複（重大度: 高）**

- 「パス読み取り → バイナリ判定 → 状態変数セット → ステータス更新」の同一ブロックが `openWithFsAccess`（8655）／`loadTauriFilePath`（8607）／`loadDirectoryEntry`（9366）／`loadFile`（8637）／launch file 読み込み（12222）／drag drop（12383）など **9箇所**でコピーされている（`currentFileBuffer = buffer` の出現が9件）。
- `applyLoadedContent(buffer, fileName, fileHandle, options)` への抽出で、Tauri 版／Web 版とも「読み取り → `applyLoadedContent` 呼び出し」だけに集約できる。**最もインパクトの大きい改善**。

**B-2. ファイルツリーの全再描画 + 個別リスナ（重大度: 高）**

- `renderFileList`（9108）は `fileList.innerHTML = ""` から `renderTreeNode` 再帰で毎回全ノードを生成。ファイル1個クリック（9314）でも全ノードの `createElement` + `addEventListener` + SVG `innerHTML` が走る。1,000ファイル超で体感もたつき。
- `renderTreeNode`（9175〜9347）は各ノードに `click`/`contextmenu`/`dragstart`/`dragend` を個別登録。100ノードで最低400リスナが再描画ごとに生成・破棄。
- 改善：`fileList` への**イベント委譲**（`e.target.closest(...)` → `dataset.path` → `findTreeNode`）。ファイルクリック時の active クラス付け替えのみで済むケースは全再描画を回避。

**B-3. 環境分岐（isTauri）の散在**

- `moveDirectoryEntry`（9628〜9701）／`createDirectoryEntry`（10048）／`createMarkdownFileEntry`（10119）／`renameDirectoryEntry`（10209）／`deleteDirectoryEntryQuiet`（10299）が、いずれも「Tauri invoke 分岐」と「Web API 分岐」に二分され前後処理が重複。`fsMoveEntry(src, targetDir)` 等の最小 FS 抽象で前後の状態更新を共有できる。
- `moveDirectoryEntry` の Tauri 分岐は Rust エラーを `message.includes("already exists")` の**文字列マッチ**で分岐（9640〜9646）。Rust 側文言変更でサイレントに壊れる。構造化エラー（`{ code: "ALREADY_EXISTS" }`）化を推奨。

**B-4. DOM 構築（SVG innerHTML）**

- `createFileIcon`（9093/9095）／ツリー矢印（9194〜9196）／フォルダアイコン（9202）が、定数 SVG を毎ノード `innerHTML` 文字列パース。SVG 種は5種（markdown/file/folder/chevron-down/chevron-right）。`<template>` 化 + `cloneNode(true)` で大フォルダの描画が高速化。

**B-5. 共通 resolve ブロックの5重複**

- `draggedEntryPaths.map((p) => findTreeNode(...) || findDirectoryNode(...) || flattenTreeFiles(...).find(...))` が5箇所（9921／10027／11033／11375／11227）でコピー。`resolveTreeEntriesFromPaths(paths)` へ抽出。

**B-6. エラーハンドリング**

- `tryGetDroppedFileParentDirectory`（10812〜10822、重大度: 中）— `catch (err) {}` が2箇所、完全サイレント。
- `storeLastDirectoryHandle`（10686）— IndexedDB 失敗を無視（コメントあり・方針は妥当だが `console.warn` 推奨）。

**B-7. 初期化・リスナ統合**

- 初期化シーケンス（12195〜12220）は順序依存（`applyLanguage` が内部で `renderFileList` を呼ぶため最後でなければならない）が暗黙。コメント明記が必要。
- `window.keydown` リスナが**4本独立登録**（11853／12005／12016／12026／12038）。毎キー入力で最大5関数起動。単一ディスパッチャへ統合推奨。

### C. CSS（行 10〜3540）

実測サマリー：`:root` 変数63、blue 58、light 58、`!important` 22回、`@media` 3件、`calc()` 71回、完全一致重複セレクタ9件。

**C-1. CSS 変数の整合性**

- **未定義変数（重大度: 高）**：`--input-bg`（参照1198/2304）と `--focus-ring`（参照2318）がどのテーマにも未定義。`.prompt-input`/`.find-replace-input` の背景が透明化、フォーカスリングが消える。**実質バグ**。全テーマに定義追加が必要。
- フォールバック付きで動いている未定義変数：`--selected-bg`（2133）／`--panel-alt`（1713）／`--border`（1714）。
- ライトテーマで blue 系生値 `rgba(89, 178, 255, ...)` がハードコード（2080/2126ほか）。`--active-tint` 変数化推奨。

**C-2. 重複ルール**

- 完全一致セレクタ重複9件：`.file-list-sort`（1885/1901）／`.file-list-dir.active`（2045/2079）／`.file-list-item.active`（2120/2125）／`.fav-btn.is-favorite`（2185/2189）／`.table-copy-btn:focus-visible`（1448/1453）／`.open-actions .btn`（2908/3458）／`.source-...find-match`（2724/2735）／`.source-header-left...wrap-toggle-wrap`（3533/3537）。
- `#statusText.error.show`／`#statusText.warning.show`（459/463）は `#statusText.show`（453）の `opacity:1` と重複（実質無効）。

**C-3. 未使用とおぼしきセレクタ**

- 確実に未使用（削除候補）：`.drop-wrap`（3225）、`.badge`/`.badge.badge-alert`/`.badge.hidden`（2232/2245/2251）。HTML/JS に対応要素・動的生成が見当たらない（削除前に JS 動的生成を最終確認）。

**C-4. !important の濫用（重大度: 中）**

- 22件中、`find-highlight-on` + `replace-preview-on` 複合クラスの !important 連鎖（8件、2627〜2735）がカスケード破綻寸前。`--find-match-bg`/`--find-current-bg` を状態クラスで上書きする設計に変えれば !important 全廃可能。
- `@media (max-width:640px)` のグリッド !important（3498/3505）は JS が `style` 属性に直接書く幅を上書きするため。JS 側で `removeProperty` するか CSS 変数経由にすれば排除可能。

**C-5. 保守性**

- **トグルスイッチ3クラス完全重複（重大度: 高）**：`.view-toggle-switch`（515）／`.mode-toggle-switch`（3009）／`.theme-switch`（3077）が同一寸法・構造で**約120行重複**。`.toggle-switch`/`.toggle-slider` 共通クラスへ統一可能。
- オーバーレイ背景 `rgba(0,0,0,0.48)` が5箇所（829/1048/1157/1224/1282）。`--overlay-bg` 変数化 + `.modal-overlay` 共通クラス化で約40行削減。
- `calc(0.78rem * var(--app-font-scale))` パターンが約32箇所。`--font-sm` 等のスケール済み変数へまとめると保守容易。

**C-6. レスポンシブ**

- `@media (max-width:1920px)`（3463）は事実上全画面に適用され、メディアクエリ外（3447〜3455）と重複していて**ほぼ無意味**。意図の再整理が必要。

**C-7. 構成**

- 3,530行に**区切りコメントがゼロ**。論理13セクション程度に `/* === Section === */` を15箇所追加するだけで可読性が大幅向上（コードゼロ変更・リスクなし）。
- 検索/置換の色定義（`.find-match` 系）が150行以上に分散。一箇所への集約が望ましい。

### D. セキュリティ・堅牢性

**重大な問題（Critical/High）は検出されなかった。** 以下は良好な点と軽微（Low/Info）な強化案。

良好な点：

- **XSS**：`innerHTML` 全16箇所を確認。プレビュー（7764）と README（11641）は `DOMPurify.sanitize` 通過、ソースハイライト系（7098/7212/6857）は全トークン `escapeHtml` 経由、アイコン系（7530/7604/9093ほか）は `${}` 補間のない完全静的リテラル。ファイル名/パスは全て `textContent`/属性 API。`eval`/`Function`/`document.write`/`insertAdjacentHTML` は皆無。
- **CSP**：ブラウザ版 `connect-src 'none'`（外部通信全遮断）、`object-src/frame-src/frame-ancestors 'none'`、`base-uri 'self'`、`form-action 'none'` 適切。Tauri 版は更に厳しい `default-src 'none'`。
- **Tauri コマンド**：全コマンドで `reject_nul_in_path`、`desktop_open_external_url`/`desktop_open_path_in_explorer` は引数分離 + スキーム検証でインジェクション耐性あり、`atomic_write`（tmp + `sync_all` + `rename`）で堅牢。`is_valid_child_name` で相対脱出防止。
- **権限**：`capabilities/default.json` は `core:default` のみ。fs/dialog/shell プラグイン権限を付与せず app-owned invoke に置換。過剰権限なし。
- **localStorage/IndexedDB**：`JSON.parse` 全箇所 try/catch + 型チェック + 健全フォールバック。

軽微な強化案（すべて Low/Info）：

1. **Tauri 読み書き削除コマンドのルート封じ込め（Low）**：`desktop_read_file_bytes`（lib.rs:162）/`desktop_write_file_*`/`desktop_delete_*` はルート配下検証が無く任意絶対パス操作が可能。HTML 側 `getTauriRelativeLinkTarget`（8534）が `..` 未正規化のため、悪意 .md の相対リンク `[x](../../secret.txt)` クリックでフォルダ外ファイルを読み込ませうる（ただし読めるのはユーザーが既に権限を持つファイルで表示のみ、CSP で外部送信不可）。`canonicalize` 後にルート prefix を検証する共通バリデータ + HTML 側 `..` 正規化を推奨。
2. **プレビュー外部リンクの rel 付与漏れ（Low）**：7765 のセレクタ `a[href^='http']` が大小区別。`HTTP://` や前後空白付き href に `rel="noopener noreferrer"` が付かない（実クリックは `openExternalHref` 経由で保護されるため実害ほぼ無し）。
3. **`copy_dir_recursive` の symlink・深さ対策（Low）**：lib.rs:411 が symlink を辿る（`is_dir()` が target を見る）。リンクループ・巨大ツリーで無限再帰/ディスク枯渇。`symlink_metadata` でスキップまたは深さ制限。
4. **CSP のブラウザ版/Tauri 版整合（Low）**：`img-src blob:` と `frame-ancestors 'none'` の有無差を意図確認の上で統一。
5. **エラーメッセージの内部パス（Info）**：Rust の `err.to_string()` 直返しで絶対パスが UI に出る。ローカル前提で実害小だが、ユーザー向け汎用文言 + 詳細はログ送りがより堅牢。

---

## C1: ファイル状態・ディレクトリ状態の変数群をオブジェクトに集約

### 作業内容

- ファイル状態10変数を `fileState = {...}` に、ディレクトリ状態10変数を `dirState = {...}` に集約。
- `setLoadedMarkdown` / `clearLoadedContent` の個別代入を集約後オブジェクトの更新に書き換え。
- `STORAGE_KEY_PREFIX` を全13キーに適用して連結を統一。

### 変更予定ファイル

- `apps/browser/offline-md-editor-viewer.html`（JS 領域 4761〜4821 ほか、参照全箇所）

### 完了条件

- 既存の開く/保存/編集/モード切替が回帰なく動作。状態変数のフラット宣言が解消。

---

## C2: ファイルロード／CRUD 処理の共通化

### 作業内容

- 9箇所重複のロード処理を `applyLoadedContent(buffer, fileName, fileHandle, options)` に抽出。
- CRUD 系（move/create/rename/delete）の Tauri/Web 二分を最小 FS 抽象（`fsMoveEntry` 等）に切り出し、前後の状態更新を共有。
- Rust エラーの文字列マッチ（`includes("already exists")`）を構造化エラー（`{ code }`）化（lib.rs 側変更を伴う）。

### 変更予定ファイル

- `apps/browser/offline-md-editor-viewer.html`（8607/8637/8655/9366/9628〜/10048〜/12222/12383 ほか）
- `apps/desktop/src-tauri/src/lib.rs`（構造化エラー化する場合）

### 完了条件

- 全ロード経路・CRUD が回帰なし。`currentFileBuffer = buffer` の重複が1箇所に集約。

---

## C3: ファイルツリー描画最適化

### 作業内容

- `renderTreeNode` の個別リスナを `fileList` へのイベント委譲に移行（`closest` + `dataset.path` + `findTreeNode`）。
- ファイルクリック時の active 切替を全再描画から `classList` 付け替えのみに分離。
- 5種 SVG アイコンを `<template>` + `cloneNode(true)` 化。

### 変更予定ファイル

- `apps/browser/offline-md-editor-viewer.html`（9093〜9347、11321〜11469 ほか）

### 完了条件

- 大フォルダ（数百〜千ファイル）で描画もたつきが軽減。ツリー操作（開閉/選択/D&D/右クリック）が回帰なし。

---

## C4: 共通ユーティリティ抽出 + エラーハンドリング統一 + i18n 化

### 作業内容

- `showCopySuccess(btn)` / `applySourceFontStyle(el, style, w)` / `resolveTreeEntriesFromPaths(paths)` を抽出。
- `copyFileNameBtn` の `.catch` 漏れ修正（6163）。サイレント catch（7937/7953/4804/6567/10812/10686）に `console.warn` 追加。
- 大ファイル通知（7754〜7756）を `STR` テーブル + `t()` 化（全13言語）。`SPLITTER_W` リテラル化解消。
- `window.keydown` 4リスナを単一ディスパッチャへ統合。

### 変更予定ファイル

- `apps/browser/offline-md-editor-viewer.html`（上記各行 + `STR` テーブル）

### 完了条件

- コピー/フォント計測/D&D resolve の重複が共通関数化。クリップボード失敗時にユーザー/コンソールへ通知。大ファイル通知が現在言語で表示。

---

## C5: CSS 整理 [並列OK with C6]

### 作業内容

- `--input-bg` / `--focus-ring` を全3テーマに定義追加（バグ修正）。
- トグル3クラス（`.view-toggle-switch`/`.mode-toggle-switch`/`.theme-switch`）を `.toggle-switch`/`.toggle-slider` 共通クラスへ統合。
- `find-highlight-on` + `replace-preview-on` の !important 連鎖を CSS 変数（`--find-match-bg`/`--find-current-bg`）状態上書きへ置換。
- オーバーレイ5箇所を `--overlay-bg` + `.modal-overlay` 共通クラス化。
- 完全一致重複セレクタ9件を統合。未使用セレクタ（`.drop-wrap`/`.badge*`）を JS 動的生成確認の上で削除。
- 区切りコメント `/* === Section === */` を15箇所追加。

### 変更予定ファイル

- `apps/browser/offline-md-editor-viewer.html`（CSS 領域 10〜3540）

### 完了条件

- 3テーマで入力欄背景・フォーカスリングが表示。トグル/オーバーレイの見た目が回帰なし。!important が削減。

---

## C6: セキュリティ／堅牢性強化 [並列OK with C5]

### 作業内容

- `desktop_read_file_bytes`/`desktop_write_file_*`/`desktop_delete_*` に「開いているルート配下か」を `canonicalize` で検証する共通バリデータを追加。
- HTML `getTauriRelativeLinkTarget`（8534）で `..` を正規化しルート外参照を拒否。
- `copy_dir_recursive`（lib.rs:411）を `symlink_metadata` で symlink スキップ + 深さ制限。
- プレビュー rel 付与（7765）を大小非依存判定へ統一。
- CSP のブラウザ版/Tauri 版差分（`img-src blob:`/`frame-ancestors`）を意図確認の上で統一。

### 変更予定ファイル

- `apps/desktop/src-tauri/src/lib.rs`
- `apps/browser/offline-md-editor-viewer.html`（8534/7765/CSP 行6）

### 完了条件

- フォルダ外の相対リンクが読み込めない。symlink を含むコピーがハングしない。外部リンクに rel が確実に付く。

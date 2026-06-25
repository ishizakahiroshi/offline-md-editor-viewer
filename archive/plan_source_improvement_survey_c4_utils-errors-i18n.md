# [完了] C4: 共通ユーティリティ抽出 + エラーハンドリング統一 + i18n 化

> 親: [plan_source_improvement_survey.md](plan_source_improvement_survey.md)
> 最終更新: 2026-05-25(月) 20:36:56
> 親 plan の C4 を担当する子 plan。

## context配分

| C | 種別 | 内容 | 並列 |
|---|---|---|---|
| C1 | fix | `showCopySuccess(btn, duration)` 共通関数抽出（コピーアイコン切替3重複の統合） | [並列OK with C2, C3, C4] |
| C2 | fix | `applySourceFontStyle(el, style, widthPx)` 共通関数抽出（DOMプローブ初期化2重複の統合） | [並列OK with C1, C3, C4] |
| C3 | fix | `resolveTreeEntriesFromPaths(paths)` 共通関数抽出（D&D resolveブロック3重複の統合） | [並列OK with C1, C2, C4] |
| C4 | fix | `SPLITTER_W` 定数参照化（`"14px"` リテラル2箇所を `${SPLITTER_W}px` に）+ `window.keydown` 5リスナの統合ディスパッチャ化 | [並列OK with C1, C2, C3] |
| C5 | fix | `.catch` 漏れ修正（`copyFileNameBtn` の clipboard.writeText に `.catch` 追加） | — |
| C6 | fix | サイレント catch に `console.warn` 追加（5箇所） | — |
| C7 | fix | 大ファイル通知の i18n 化（`renderMarkdown` 内の `currentLang === "ja"` 2値分岐を STR テーブルキーに置換） | — |

実行順序: `(C1, C2, C3, C4) → C5 → C6 → C7`

> C1〜C4 は編集箇所が重複しないため並列実行可。C5〜C7 は前グループ完了後に直列で実施（C5/C6 も独立しているが subagent 1体で連続処理して差分を最小化する）。

---

## 目的

`apps/browser/offline-md-editor-viewer.html` の保守性・デバッグ容易性・多言語完全対応を改善する。設計思想（ビルドレス・CDN 不使用・単一 HTML）は一切変えない。機能的な変更は C5 のバグ修正（`.catch` 欠落）のみ。それ以外はリファクタリングのみ。

## 前提

- 編集対象: `apps/browser/offline-md-editor-viewer.html` のみ
- 対応言語は `LANGS` 配列の 13 言語（行 4826）: `en`, `ja`, `zh-TW`, `zh-CN`, `es`, `de`, `ko`, `pt-BR`, `ru`, `vi`, `fr`, `it`, `id`
- `STR` テーブルの各配列は **必ず LANGS と同じ 13 要素**でなければならない。行 5693〜5699 の `validateStrTable()` が長さ不一致を `console.error` で検出するため、要素数違反はブラウザコンソールに即現れる
- `t(group, key)` 関数（行 5715）は `STR[${group}.${key}]` 配列から `LANGS.indexOf(currentLang)` 番目の文字列を返す
- 親 plan の C4 実施前に C1〜C3 は完了している前提（本 plan 内の C1〜C4 は並列で完結）

---

## C1: `showCopySuccess(btn, duration)` 共通関数抽出

### 作業内容

**重複の確認（3箇所）:**

| # | 場所 | 行番号 | 関数/コンテキスト |
|---|---|---|---|
| 1 | `copyFileNameBtn` click ハンドラ | 6153〜6161 | 無名ハンドラ |
| 2 | `createCodeCopyButton` | 7536〜7545 | `then()` コールバック内 |
| 3 | `createTableCopyButton` | 7610〜7619 | `then()` コールバック内 |

**共通パターン（各箇所）:**

```js
// before（各箇所でこのパターンが繰り返される）
const iconCopy = btn.querySelector(".icon-copy");
const iconCheck = btn.querySelector(".icon-check");
iconCopy.style.display = "none";
iconCheck.style.display = "";
iconCheck.style.stroke = "var(--accent)";
setTimeout(() => {
  iconCopy.style.display = "";
  iconCheck.style.display = "none";
}, 1500);
```

**追加する共通関数（`setBtnLabel` 関数（行 6165）の直前に挿入）:**

```js
// after: 行 6165 の直前に追加
function showCopySuccess(btn, duration) {
  if (duration === undefined) duration = 1500;
  const iconCopy = btn.querySelector(".icon-copy");
  const iconCheck = btn.querySelector(".icon-check");
  if (!iconCopy || !iconCheck) return;
  iconCopy.style.display = "none";
  iconCheck.style.display = "";
  iconCheck.style.stroke = "var(--accent)";
  setTimeout(() => {
    iconCopy.style.display = "";
    iconCheck.style.display = "none";
  }, duration);
}
```

**各箇所の置換:**

箇所1（行 6153〜6161）— `copyFileNameBtn` click ハンドラの `.then()` 内:
```js
// before
const iconCopy = copyFileNameBtn.querySelector(".icon-copy");
const iconCheck = copyFileNameBtn.querySelector(".icon-check");
iconCopy.style.display = "none";
iconCheck.style.display = "";
iconCheck.style.stroke = "var(--accent)";
setTimeout(() => {
  iconCopy.style.display = "";
  iconCheck.style.display = "none";
}, 1500);
```
```js
// after
showCopySuccess(copyFileNameBtn);
```

箇所2（行 7536〜7545）— `createCodeCopyButton` 内 `.then()` コールバック:
```js
// before（button は createCodeCopyButton のローカル変数）
const iconCopy = button.querySelector(".icon-copy");
const iconCheck = button.querySelector(".icon-check");
iconCopy.style.display = "none";
iconCheck.style.display = "";
iconCheck.style.stroke = "var(--accent)";
setStatus(t("status", "copyCodeDone"), false);
setTimeout(() => {
  iconCopy.style.display = "";
  iconCheck.style.display = "none";
}, 1500);
```
```js
// after
showCopySuccess(button);
setStatus(t("status", "copyCodeDone"), false);
```

箇所3（行 7610〜7619）— `createTableCopyButton` 内 `.then()` コールバック:
```js
// before（button は createTableCopyButton のローカル変数）
const iconCopy = button.querySelector(".icon-copy");
const iconCheck = button.querySelector(".icon-check");
iconCopy.style.display = "none";
iconCheck.style.display = "";
iconCheck.style.stroke = "var(--accent)";
setStatus(t("status", "copyTableDone"), false);
setTimeout(() => {
  iconCopy.style.display = "";
  iconCheck.style.display = "none";
}, 1500);
```
```js
// after
showCopySuccess(button);
setStatus(t("status", "copyTableDone"), false);
```

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - 行 6165 直前: `showCopySuccess` 関数を挿入（+12行）
  - 行 6153〜6161: 9行 → 1行（`showCopySuccess(copyFileNameBtn);`）
  - 行 7536〜7545: 9行 → 2行（`showCopySuccess(button);` + `setStatus(...)` ）
  - 行 7610〜7619: 9行 → 2行（`showCopySuccess(button);` + `setStatus(...)` ）

### 完了条件

- `showCopySuccess` が定義され3箇所から呼び出されている
- ファイル名コピー・コードコピー・テーブルコピーのアイコン切り替えが動作する（目視確認）
- `.icon-copy` / `.icon-check` が存在しない要素に渡しても例外が出ない（ガード確認）

---

## C2: `applySourceFontStyle(el, style, widthPx)` 共通関数抽出

### 作業内容

**重複の確認（2箇所）:**

| # | 場所 | 行番号 | 関数 |
|---|---|---|---|
| 1 | DOMプローブ設定 | 6373〜6402 | `updateEofMarker` |
| 2 | DOMプローブ設定 | 6466〜6487 | `getMeasuredLineHeights` |

**共通パターン（各箇所のプローブ初期化部分）:**

```js
// before: updateEofMarker（6373付近）- 幅あり・wrap設定あり
probe.textContent = "";
probe.style.position = "fixed";
probe.style.left = "-9999px";
probe.style.top = "0";
probe.style.visibility = "hidden";
probe.style.padding = "0";
probe.style.border = "0";
probe.style.margin = "0";
probe.style.width = `${contentWidth}px`;
probe.style.boxSizing = "border-box";
probe.style.whiteSpace = wrapEnabled ? "pre-wrap" : "pre";
probe.style.overflowWrap = wrapEnabled ? "break-word" : "normal";
probe.style.wordBreak = "normal";
probe.style.fontFamily = style.fontFamily;
probe.style.fontSize = style.fontSize;
probe.style.fontWeight = style.fontWeight;
probe.style.fontStyle = style.fontStyle;
probe.style.fontStretch = style.fontStretch;
probe.style.letterSpacing = style.letterSpacing;
probe.style.lineHeight = style.lineHeight;
probe.style.fontVariantLigatures = "none";
probe.style.tabSize = style.tabSize || "4";  // ← updateEofMarker のみ
```

```js
// before: getMeasuredLineHeights（6466付近）- 幅あり・wrap固定
probe.textContent = "";
probe.style.position = "fixed";
probe.style.left = "-9999px";
probe.style.top = "0";
probe.style.visibility = "hidden";
probe.style.width = `${contentWidth}px`;
probe.style.padding = "0";
probe.style.border = "0";
probe.style.margin = "0";
probe.style.whiteSpace = "pre-wrap";       // ← 固定
probe.style.overflowWrap = "break-word";   // ← 固定
probe.style.wordBreak = "normal";
probe.style.fontFamily = style.fontFamily;
probe.style.fontSize = style.fontSize;
probe.style.fontWeight = style.fontWeight;
probe.style.fontStyle = style.fontStyle;
probe.style.fontStretch = style.fontStretch;
probe.style.letterSpacing = style.letterSpacing;
probe.style.lineHeight = style.lineHeight;
probe.style.fontVariantLigatures = "none";
// tabSize なし
```

2箇所の差異: `whiteSpace`/`overflowWrap` の設定値と `tabSize` の有無。`opts` オブジェクトで吸収する。

**追加する共通関数（`updateEofMarker` 関数（行 6363）の直前に挿入）:**

```js
// after: 行 6363 の直前に追加
function applySourceFontStyle(el, style, widthPx, opts) {
  const o = opts || {};
  el.textContent = "";
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  el.style.visibility = "hidden";
  el.style.padding = "0";
  el.style.border = "0";
  el.style.margin = "0";
  el.style.width = `${widthPx}px`;
  el.style.boxSizing = "border-box";
  if (o.fixedWrap) {
    el.style.whiteSpace = "pre-wrap";
    el.style.overflowWrap = "break-word";
  } else {
    el.style.whiteSpace = wrapEnabled ? "pre-wrap" : "pre";
    el.style.overflowWrap = wrapEnabled ? "break-word" : "normal";
  }
  el.style.wordBreak = "normal";
  el.style.fontFamily = style.fontFamily;
  el.style.fontSize = style.fontSize;
  el.style.fontWeight = style.fontWeight;
  el.style.fontStyle = style.fontStyle;
  el.style.fontStretch = style.fontStretch;
  el.style.letterSpacing = style.letterSpacing;
  el.style.lineHeight = style.lineHeight;
  el.style.fontVariantLigatures = "none";
  if (o.tabSize) el.style.tabSize = style.tabSize || "4";
}
```

**各箇所の置換:**

`updateEofMarker` 内（行 6373〜6394 相当部分）:
```js
// before（21行）
probe.textContent = "";
probe.style.position = "fixed";
// ...（上記 before と同じ）
probe.style.tabSize = style.tabSize || "4";
```
```js
// after（1行）
applySourceFontStyle(probe, style, contentWidth, { tabSize: true });
```

`getMeasuredLineHeights` 内（行 6466〜6487 相当部分）:
```js
// before（18行）
probe.textContent = "";
probe.style.position = "fixed";
// ...（上記 before と同じ）
probe.style.fontVariantLigatures = "none";
```
```js
// after（1行）
applySourceFontStyle(probe, style, contentWidth, { fixedWrap: true });
```

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - 行 6363 直前: `applySourceFontStyle` 関数を挿入（+24行）
  - `updateEofMarker` 内の初期化ブロック（21行）→ 1行
  - `getMeasuredLineHeights` 内の初期化ブロック（18行）→ 1行

### 完了条件

- `applySourceFontStyle` が定義され2箇所から呼ばれている
- EOF マーカーの位置表示、行番号の高さ計算が正常に動作する
- `{ fixedWrap: true }` と `{ tabSize: true }` が混同されていない

---

## C3: `resolveTreeEntriesFromPaths(paths)` 共通関数抽出

### 作業内容

**重複の確認（5箇所）:**

| # | 行番号（概算） | コンテキスト |
|---|---|---|
| 1 | 9921〜9923 | `setTreeDirDropHandlers` 内 dir ドロップ（内部 drag） |
| 2 | 10027〜10029 | `setTreeFileDropHandlers` 内 file ドロップ（内部 drag） |
| 3 | 11033〜11035 | `handleRootMoveDrop` 内（file list root area drop） |
| 4 | 11375〜11377 | `fileList.addEventListener("drop")` 内 file ボタンへのドロップ |
| 5 | 11227〜11229 | `tauriTreeDnd.onMouseUp` 内（Tauri 自前 DnD） |

**共通パターン（各箇所）:**

```js
// before: 全5箇所でこのパターン
const allSources = draggedEntryPaths.length >= 2
  ? draggedEntryPaths.map((path) => findTreeNode(directoryFiles, { path }) || findDirectoryNode(directoryFiles, path) || flattenTreeFiles(directoryFiles).find((node) => node.path === path)).filter(Boolean)
  : [sourceEntry];
```

**追加する共通関数（`handleRootMoveDrop` 関数（行 11032 付近）の直前に挿入）:**

```js
// after: handleRootMoveDrop 直前に追加
function resolveTreeEntriesFromPaths(paths, fallbackEntry) {
  if (!paths || paths.length < 2) return [fallbackEntry].filter(Boolean);
  return paths.map((path) =>
    findTreeNode(directoryFiles, { path })
    || findDirectoryNode(directoryFiles, path)
    || flattenTreeFiles(directoryFiles).find((node) => node.path === path)
  ).filter(Boolean);
}
```

**各箇所の置換（5箇所とも同じパターン）:**

```js
// before（3行）
const allSources = draggedEntryPaths.length >= 2
  ? draggedEntryPaths.map((path) => findTreeNode(directoryFiles, { path }) || findDirectoryNode(directoryFiles, path) || flattenTreeFiles(directoryFiles).find((node) => node.path === path)).filter(Boolean)
  : [sourceEntry];
```
```js
// after（1行）
const allSources = resolveTreeEntriesFromPaths(draggedEntryPaths, sourceEntry);
```

> `tauriTreeDnd.onMouseUp`（箇所5）では変数名が `capturedSources`/`capturedSource` で異なるため注意:
>
> ```js
> // before（箇所5, 11227付近）
> const allSources = capturedSources.length >= 2 ? capturedSources : [capturedSource];
> // → 上記の共通パターンとは少し違い、findTreeNode ルックアップをしない（既に resolve 済みの entry 配列）
> ```
>
> 箇所5は `capturedSources` が既に entry オブジェクト配列なのでルックアップ不要。共通関数に入れると findTreeNode を無駄に呼ぶ。**箇所5は対象外**とし、コメントで説明を残す:
>
> ```js
> // capturedSources は既に entry 配列（tauriTreeDnd が保持）のため resolveTreeEntriesFromPaths 不要
> const allSources = capturedSources.length >= 2 ? capturedSources : [capturedSource];
> ```

実際の統合対象は **4箇所**（9921/10027/11033/11375）。

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - `handleRootMoveDrop` 直前: `resolveTreeEntriesFromPaths` 関数を挿入（+9行）
  - 箇所1（9921〜9923）: 3行 → 1行
  - 箇所2（10027〜10029）: 3行 → 1行
  - 箇所3（11033〜11035）: 3行 → 1行
  - 箇所4（11375〜11377）: 3行 → 1行
  - 箇所5（11227付近）: 変更なし（コメント追加のみ）

### 完了条件

- `resolveTreeEntriesFromPaths` が定義され4箇所から呼ばれている
- Web 版・Tauri 版の D&D ファイル移動が正常に動作する

---

## C4: `SPLITTER_W` 定数参照化 + `window.keydown` 統合ディスパッチャ化

### 作業内容

#### サブタスク 4-A: SPLITTER_W 参照化

**対象箇所:**

行 6047・6049（`updateCardLayout` 内 `columns.push("14px")` 2箇所）:

```js
// before（行 6047）
if (showFileListSplitter) columns.push("14px");
// before（行 6049）
if (showSourcePreviewSplitter) columns.push("14px");
```
```js
// after
if (showFileListSplitter) columns.push(`${SPLITTER_W}px`);
if (showSourcePreviewSplitter) columns.push(`${SPLITTER_W}px`);
```

確認: `SPLITTER_W = 14`（行 4757）。定数は既に宣言済み。

#### サブタスク 4-B: window.keydown 4リスナ統合

**現状:**

| # | 行番号 | 役割 |
|---|---|---|
| 1 | 11853 | Escape キー: ダイアログ/FindBar/AppMenu/ContextMenu 閉じ |
| 2 | 12005 | Ctrl+S / Ctrl+Shift+S: 保存/名前を付けて保存 |
| 3 | 12016 | Ctrl+F / Ctrl+H / Ctrl+R: FindBar 開く |
| 4 | 12026 | F2: ファイル名変更（ファイルリスト選択時） |
| 5 | 12038 | Ctrl+C / Ctrl+V: ファイルツリーのコピー/ペースト |

> 実際は11853を含めて5リスナが独立登録されているが、B-7の調査メモでは「4本」と記載。5本が実数。全5本を統合する。

**統合後のディスパッチャ（行 12056 の `window.addEventListener("beforeunload"` の直前に挿入し、既存5リスナを削除）:**

```js
// after: 単一ディスパッチャ
window.addEventListener("keydown", (e) => {
  // --- Escape: close dialogs / bars / menus ---
  if (e.key === "Escape") {
    if (!confirmOverlay.hidden) { closeConfirmDialog(false); return; }
    if (!promptOverlay.hidden) { closeTextPrompt(null); return; }
    if (!licenseTextsOverlay.hidden) { closeLicenseTextsDialog(); }
    if (isFindBarOpen()) { closeFindBar(); return; }
    if (!aboutOverlay.hidden) { closeAboutDialog(); }
    closeAppMenu();
    hideFileContextMenu();
    return;
  }
  // --- Ctrl/Cmd+S: save ---
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (!hasUnsavedChanges && !e.shiftKey) return;
    const action = e.shiftKey ? saveAsFile : saveToCurrentFile;
    action().catch((err) => {
      setStatus(t("status", "saveFailed") + (err && err.message ? err.message : String(err)), true);
    });
    return;
  }
  // --- Ctrl/Cmd+F/H/R: find bar ---
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const key = e.key.toLowerCase();
    if ((key === "f" || key === "h" || (key === "r" && !e.shiftKey)) && hasContent && !isReadOnlyMode) {
      e.preventDefault();
      openFindBar(key === "h" || key === "r");
      return;
    }
  }
  // --- F2: rename selected file ---
  if (e.key === "F2" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    if (!activeDirectoryHandle || !shouldHandleFileListShortcut()) return;
    const entry = resolveActiveDirectoryEntry();
    if (!entry || entry.kind === "dir") return;
    e.preventDefault();
    hideFileContextMenu();
    renameDirectoryEntry(entry).catch((err) => {
      setStatus(t("status", "renameFailed") + (err && err.message ? err.message : String(err)), true);
    });
    return;
  }
  // --- Ctrl/Cmd+C / Ctrl/Cmd+V: tree clipboard ---
  if ((e.ctrlKey || e.metaKey) && !shouldHandleFileListShortcut()) return;
  if ((e.ctrlKey || e.metaKey) && activeDirectoryHandle) {
    const key = e.key.toLowerCase();
    if (key === "c") {
      e.preventDefault();
      const entry = resolveActiveDirectoryEntry();
      if (entry) copyEntryToClipboard(entry);
    } else if (key === "v") {
      e.preventDefault();
      pasteClipboardEntry().catch((err) => {
        setStatus(t("status", "pasteEntryFailed") + (err && err.message ? err.message : String(err)), true);
      });
    }
  }
});
```

> 注意点: `Ctrl+C`/`Ctrl+V` の既存リスナ（12038〜12054）は `shouldHandleFileListShortcut()` を先にチェックし、ファイルリストにフォーカスがない場合は早期リターンする。統合ディスパッチャでも同じ早期リターンロジックを維持する。`shouldHandleFileListShortcut()` のチェックはファイルリスト操作が対象のキー処理のみに適用すること（Escape/Ctrl+S/Ctrl+F などには不要）。

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - 行 6047・6049: `"14px"` → `` `${SPLITTER_W}px` ``（2箇所）
  - 行 11853〜12054: 5つの独立 `window.addEventListener("keydown", ...)` を削除し、統合ディスパッチャ1本に置き換え

### 完了条件

- `columns.push("14px")` がコード内に残っていない（grep 確認）
- Escape/Ctrl+S/Ctrl+Shift+S/Ctrl+F/F2/Ctrl+C/Ctrl+V が正常に動作する
- `window.addEventListener("keydown"` の登録数が `tauriTreeDnd` 内の `onKeyDown` を除いて1本になっている

---

## C5: `.catch` 漏れ修正（`copyFileNameBtn`）

### 作業内容

**対象箇所（行 6149〜6163）:**

```js
// before
copyFileNameBtn.addEventListener("click", () => {
  const name = currentFileName.textContent;
  if (!name) return;
  navigator.clipboard.writeText(name).then(() => {
    const iconCopy = copyFileNameBtn.querySelector(".icon-copy");
    const iconCheck = copyFileNameBtn.querySelector(".icon-check");
    iconCopy.style.display = "none";
    iconCheck.style.display = "";
    iconCheck.style.stroke = "var(--accent)";
    setTimeout(() => {
      iconCopy.style.display = "";
      iconCheck.style.display = "none";
    }, 1500);
  });
  // ← .catch が存在しない（バグ）
});
```

C1 の共通関数化完了後は `.then()` 内が `showCopySuccess(copyFileNameBtn)` に置き換わっているため、そこに `.catch` を追加する:

```js
// after（C1 完了後の状態にさらに .catch を追加）
copyFileNameBtn.addEventListener("click", () => {
  const name = currentFileName.textContent;
  if (!name) return;
  navigator.clipboard.writeText(name).then(() => {
    showCopySuccess(copyFileNameBtn);
  }).catch((err) => {
    setStatus(t("status", "copyFileNameFailed") + (err && err.message ? err.message : String(err)), true);
  });
});
```

参照パターン（他3箇所の既存 `.catch`）:
- 行 7507〜7508（`copyLine`）: `.catch((err) => { setStatus(t("status", "copyFileNameFailed") + ..., true); })`
- 行 7521〜7522（`copyAllText`）: 同上
- 行 7546〜7548（`createCodeCopyButton`）: 同上

> キー `"copyFileNameFailed"` はファイル名コピー失敗以外にも流用されているが、C4 の本スコープではキー名の変更は行わない（別の改善 C として切り出す判断は親 plan レベルでの判断）。

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - `copyFileNameBtn` click ハンドラに `.catch` 追加

### 完了条件

- `copyFileNameBtn` の `navigator.clipboard.writeText(...).then(...).catch(...)` チェーンが完結している
- 非セキュアコンテキスト（http）での動作時にエラーがステータスバーに表示される

---

## C6: サイレント catch に `console.warn` 追加

### 作業内容

**対象箇所（5箇所）:**

| # | 行番号 | 関数/コンテキスト | 現状 | 修正後 |
|---|---|---|---|---|
| 1 | 6567 | `setupMarkdownCodeHighlight` 内 hljs フォールバック | `catch (_) { body = escapeHtml(code); }` | `catch (_) { console.warn("hljs.highlight failed, falling back to escapeHtml"); body = escapeHtml(code); }` |
| 2 | 7941〜7943 | `dismissHint` | `catch (err) { // best effort }` | `catch (err) { console.warn("dismissHint: failed to persist", err); }` |
| 3 | 7953〜7955 | `undismissHint` | `catch (err) { // best effort }` | `catch (err) { console.warn("undismissHint: failed to persist", err); }` |
| 4 | 4806〜4807 | `favoriteDirs` 復元（IIFE トップレベル） | `catch (_err) {}` | `catch (_err) { console.warn("favoriteDirs: failed to restore from localStorage", _err); }` |
| 5 | 10812〜10827 | `tryGetDroppedFileParentDirectory`（2箇所の catch） | `catch (err) {}` | `catch (err) { console.warn("tryGetDroppedFileParentDirectory: getAsFileSystemHandle failed", err); }` と `catch (err) { console.warn("tryGetDroppedFileParentDirectory: webkitGetAsEntry failed", err); }` |

> `storeLastDirectoryHandle`（行 10686〜10688）の `catch` はコメント「Remembering the folder is a convenience only.」があり意図的サイレントであることが明示されている。方針は妥当のため console.warn 追加対象には含めない。

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - 上記5箇所の `catch` ブロックに `console.warn` 追加（合計6行追加）

### 完了条件

- 上記5箇所に `console.warn` が追加されている
- コメントのみの空 catch は残っていない（`catch (err) {}` / `catch (_) {}` の形が上記箇所に存在しない）
- `storeLastDirectoryHandle` の catch は変更していない

---

## C7: 大ファイル通知の i18n 化

### 作業内容

**対象箇所（行 7754〜7756）:**

```js
// before
preview.textContent = currentLang === "ja"
  ? "大きなファイルのためプレビューを一時停止しています。編集と保存は利用できます。"
  : "Preview is paused for this large file. Editing and saving are still available.";
```

13言語のうち日本語のみ翻訳、残り12言語は英語フォールバックになっている。

**手順:**

1. `STR` テーブルの `// ===== preview group =====`（行 5684）に `preview.largeFilePaused` キーを追加する。13要素の配列。

```js
// after: 行 5687（"preview.noPreviewForType" 行）の直後、STR オブジェクト閉じ `};` の直前に追加
"preview.largeFilePaused": [
  // en
  "Preview is paused for this large file. Editing and saving are still available.",
  // ja
  "大きなファイルのためプレビューを一時停止しています。編集と保存は利用できます。",
  // zh-TW
  "此檔案較大，預覽已暫停。編輯與儲存仍可使用。",
  // zh-CN
  "文件较大，预览已暂停。编辑和保存仍然可用。",
  // es
  "La vista previa está pausada para este archivo grande. La edición y el guardado siguen disponibles.",
  // de
  "Die Vorschau ist fuer diese grosse Datei pausiert. Bearbeiten und Speichern sind weiterhin verfuegbar.",
  // ko
  "파일이 커서 미리보기가 일시 중지되었습니다. 편집과 저장은 계속 사용 가능합니다.",
  // pt-BR
  "A previa esta pausada para este arquivo grande. Edicao e salvamento ainda estao disponiveis.",
  // ru
  "Предпросмотр приостановлен для этого большого файла. Редактирование и сохранение по-прежнему доступны.",
  // vi
  "Xem trước đã tạm dừng cho tệp lớn này. Chỉnh sửa và lưu vẫn khả dụng.",
  // fr
  "L'aperçu est mis en pause pour ce grand fichier. L'édition et la sauvegarde restent disponibles.",
  // it
  "L'anteprima è in pausa per questo file di grandi dimensioni. La modifica e il salvataggio sono ancora disponibili.",
  // id
  "Pratinjau dijeda untuk berkas besar ini. Pengeditan dan penyimpanan tetap tersedia.",
],
```

> 翻訳品質について: 既存の STR テーブル各言語の文体（簡潔・丁寧語なし）に合わせた。質に懸念がある場合は `<TODO: ネイティブレビュー>` を残すか、暫定として English フォールバックを維持する選択もある。本 plan では実装を優先し、コメントで `// TODO: native review` を添える。

2. 行 7754〜7756 を `t()` 呼び出しに置換:

```js
// after
preview.textContent = t("preview", "largeFilePaused");
```

**検証（STR 長さバリデーション）:** `validateStrTable()` が自動で配列長を検証するため、ブラウザ開発者ツールのコンソールにエラーが出なければ 13要素であることが確認できる。

### 変更ファイル

- `apps/browser/offline-md-editor-viewer.html`
  - `STR` テーブルに `"preview.largeFilePaused"` 13要素配列を追加
  - 行 7754〜7756: `currentLang === "ja"` 2値分岐 → `t("preview", "largeFilePaused")`（3行 → 1行）

### 完了条件

- `STR["preview.largeFilePaused"]` が 13要素配列として存在する
- コンソールに `i18n: STR["preview.largeFilePaused"] length mismatch` が出ない
- `currentLang === "ja"` の2値分岐がコード内に残っていない（grep: `currentLang === .ja.` の出力が `renderMarkdown` 周辺から消える）
- 大ファイル（`PREVIEW_RENDER_SOFT_LIMIT_CHARS` 超）を開いたときにプレビューに通知テキストが表示される

---

## 完了報告フォーマット

各 C の subagent は以下の形式で報告する:

```
完了/未完了: <C番号> <完了|未完了>
変更ファイル:
- apps/browser/offline-md-editor-viewer.html（<変更概要>）
検証結果: <1行で確認できた動作または grep 結果>
```

全 C 完了後、親 plan `plan_source_improvement_survey.md` の `context配分` 表の C4 行を `plan` → `fix` に更新すること。

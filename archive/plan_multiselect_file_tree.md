# [完了] ファイルツリー複数選択・右クリック削除・DnD移動

> 最終更新: 2026-05-06(水) 12:12:46

## context配分

| C | 内容 | 状態 | 並列 |
|---|------|------|------|
| C1 | 状態変数追加 + CSS `.selected` スタイル追加 | fix | — |
| C2 | `renderFileList` クリックハンドラー修正（Ctrl/Shift+click 複数選択） | fix | — |
| C3 | 右クリックメニュー複数選択対応 + 複数削除実装 + i18n | fix | C4と並列OK |
| C4 | DnD 複数選択対応（Web版 + Tauri版） | fix | C3と並列OK |

**実行順序**: C1 → C2 → (C3, C4)

---

## 概要

ファイルツリーに複数選択 UI を追加し、複数ファイルをまとめて削除・移動できるようにする。

**決定事項（ユーザー確認済み）**
- 通常クリック：既存のまま（ファイルオープン）。複数選択を解除して新規選択。
- Ctrl/Meta+クリック：選択トグル（ファイルを開かない）
- Shift+クリック：範囲選択（可視ノードの順序に基づく）
- DnD は Web 版・Tauri 版の両方を対応

**対象ファイル**: `apps/browser/offline-md-editor-viewer.html` のみ（単一ファイルアーキテクチャ）

---

## C1: 状態変数追加 + CSS `.selected` スタイル追加

### 変更箇所

**状態変数（行 4684 付近）**

既存変数 `activeDirectoryEntryPath`（行 4689）の直下に追加：

```js
let selectedEntryPaths = new Set();   // Ctrl/Shift クリックで選択されたパスのセット
let lastSelectedEntryPath = "";       // Shift+click の起点パス
```

**CSS（`.file-list-item` の `.active` スタイル付近に追加）**

既存 `.file-list-item.active` のスタイルを参考に、`.selected` を追加する。
`grep -n "file-list-item.active\|file-list-dir.active"` で行番号を特定してから隣接挿入する。

```css
.file-list-item.selected,
.file-list-dir.selected {
  background: var(--selected-bg, rgba(59,130,246,0.18));
}
```

CSS 変数 `--selected-bg` はテーマごとに定義しなくても rgba 直値でよい（`.active` と区別できれば十分）。

### 完了条件

- `selectedEntryPaths` と `lastSelectedEntryPath` が `directoryFiles` などと同じスコープで定義されている
- `.selected` CSS が存在し、`.active` と視覚的に区別できる（active より薄いハイライト）

---

## C2: `renderFileList` クリックハンドラー修正

### 変更方針

`renderFileList` 内の `renderTreeNode` 関数内で、ファイルとフォルダそれぞれの `click` イベントリスナーを修正する。

**renderFileList 先頭部分**（行 8980 付近 `visibleNodes.forEach` の前）でボタンに `.selected` を付与する処理を追加：

```js
// renderTreeNode 内、button.classList.toggle("active", ...) の直後
button.classList.toggle("selected", selectedEntryPaths.has(entry.path));
```

### ファイルノードのクリックハンドラー（行 8961〜8974）

```js
button.addEventListener("click", (e) => {
  hideFileContextMenu();

  // Ctrl/Meta+click: 選択トグル（ファイルを開かない）
  if (e.ctrlKey || e.metaKey) {
    if (selectedEntryPaths.has(entry.path)) {
      selectedEntryPaths.delete(entry.path);
    } else {
      selectedEntryPaths.add(entry.path);
      lastSelectedEntryPath = entry.path;
    }
    renderFileList();
    return;
  }

  // Shift+click: 範囲選択（可視ノード順序）
  if (e.shiftKey && lastSelectedEntryPath) {
    const visibleFiles = getVisibleDirectoryNodes()
      .flatMap(n => n.kind === "file" ? [n] : flattenTreeFiles([n]));
    const paths = visibleFiles.map(n => n.path);
    const fromIdx = paths.indexOf(lastSelectedEntryPath);
    const toIdx   = paths.indexOf(entry.path);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      selectedEntryPaths = new Set(paths.slice(lo, hi + 1));
    }
    renderFileList();
    return;
  }

  // 通常クリック: 選択解除してファイルオープン
  selectedEntryPaths.clear();
  lastSelectedEntryPath = entry.path;

  if (!viewable) {
    setStatus(t("status", "unsupportedFile"), "warning");
    return;
  }
  if (!confirmDiscardUnsavedChanges()) return;
  loadDirectoryEntry(entry).catch((err) => {
    setStatus(t("status", "fileReadFailed") + (err && err.message ? err.message : String(err)), true);
  });
});
```

### フォルダノードのクリックハンドラー（行 8894〜8923）

```js
button.addEventListener("click", async (e) => {
  hideFileContextMenu();

  // Ctrl/Meta+click: 選択トグル（開閉しない）
  if (e.ctrlKey || e.metaKey) {
    if (selectedEntryPaths.has(entry.path)) {
      selectedEntryPaths.delete(entry.path);
    } else {
      selectedEntryPaths.add(entry.path);
      lastSelectedEntryPath = entry.path;
    }
    renderFileList();
    return;
  }

  // 通常クリック: 選択解除して開閉（既存ロジック）
  selectedEntryPaths.clear();
  // ... 既存の expand/collapse ロジックをそのまま維持 ...
});
```

### `renderFileList` で選択状態を反映

`renderFileList()` が呼ばれるたびに、ノードの `.selected` クラスが `selectedEntryPaths` に基づいて正しく付与されること。これは `renderTreeNode` 内で `classList.toggle("selected", selectedEntryPaths.has(entry.path))` を追加するだけでよい。

### Shift+click 用のヘルパー

`getVisibleDirectoryNodes()` は `dir` と `file` が混在した flat 配列を返すことを確認する。ファイルのみ対象なら `flattenTreeFiles` でフィルタする。
実際の実装では `getVisibleDirectoryNodes()` の挙動を Read で確認してから実装すること。

### `activeDirectoryEntryPath` との関係

- `activeDirectoryEntryPath`: 現在開いているファイルのパス（青いハイライト `.active`）。変更しない。
- `selectedEntryPaths`: Ctrl/Shift 選択されたパスのセット（`.selected` で薄いハイライト）。
- 両方同時に付く場合がある（`.active.selected`）。CSS は問題なし。

### 選択解除のタイミング

以下の処理で `selectedEntryPaths.clear()` を追加する：
- `loadDirectoryEntry` 完了時（別ファイルを普通に開いたとき）
- フォルダ選択時の通常クリック
- コンテキストメニューの単一削除/リネーム実行後

### 完了条件

- Ctrl+クリックでファイルが `.selected` ハイライトされ、ファイルが開かない
- Shift+クリックで範囲選択ができる
- 通常クリックで選択が解除されファイルが開く

---

## C3: 右クリックメニュー複数選択対応 + 複数削除

### `showFileContextMenu` の修正

`showFileContextMenu(entry, x, y)` 内（行 8814〜8831）で、複数選択時の表示制御を追加する。

```js
function showFileContextMenu(entry, x, y) {
  contextMenuEntry = entry;
  const isDir = entry && entry.kind === "dir";
  const isEmpty = !entry;
  const multiSelected = selectedEntryPaths.size >= 2;

  // 複数選択中は削除のみ表示
  if (multiSelected) {
    newMarkdownFileMenuBtn.hidden = true;
    newFolderMenuBtn.hidden = true;
    renameFileMenuBtn.hidden = true;
    copyFileNameMenuBtn.hidden = true;
    copyEntryMenuBtn.hidden = true;
    pasteEntryMenuBtn.hidden = true;
    deleteFileMenuBtn.hidden = false;
  } else {
    // 既存の単一選択ロジックそのまま
    newMarkdownFileMenuBtn.hidden = !(isDir || isEmpty);
    newFolderMenuBtn.hidden = !(isDir || isEmpty);
    renameFileMenuBtn.hidden = isDir || isEmpty;
    copyFileNameMenuBtn.hidden = isEmpty;
    copyEntryMenuBtn.hidden = isEmpty || !activeDirectoryHandle;
    pasteEntryMenuBtn.hidden = !clipboardEntry || !activeDirectoryHandle;
    deleteFileMenuBtn.hidden = isEmpty;
  }

  // 位置計算（既存ロジックそのまま）
  fileContextMenu.classList.remove("hidden");
  const menuRect = fileContextMenu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - menuRect.width - 8);
  const top = Math.min(y, window.innerHeight - menuRect.height - 8);
  fileContextMenu.style.left = `${Math.max(8, left)}px`;
  fileContextMenu.style.top = `${Math.max(8, top)}px`;
}
```

### 削除メニューボタンのハンドラー修正

`deleteFileMenuBtn.addEventListener("click", ...)` の実装箇所（行 11270 付近）を確認して修正する。

```js
deleteFileMenuBtn.addEventListener("click", () => {
  hideFileContextMenu();
  if (selectedEntryPaths.size >= 2) {
    // 複数削除
    deleteSelectedEntries().catch((err) => {
      setStatus(t("status", "deleteFailed") + (err && err.message ? err.message : String(err)), true);
    });
  } else if (contextMenuEntry) {
    // 既存の単一削除
    deleteDirectoryEntry(contextMenuEntry).catch((err) => {
      setStatus(t("status", "deleteFailed") + (err && err.message ? err.message : String(err)), true);
    });
  }
});
```

### `deleteSelectedEntries()` 新関数の追加

`deleteDirectoryEntry` 関数（行 9894）の直前に追加する。

```js
async function deleteSelectedEntries() {
  const paths = Array.from(selectedEntryPaths);
  const count = paths.length;
  const confirmed = await openConfirmDialog(
    t("ui", "deleteFile"),
    t("status", "deleteSelectedConfirm").replace("{count}", String(count)),
    t("ui", "deleteFile")
  );
  if (!confirmed) return;

  const entries = paths
    .map(p => findTreeNode(directoryFiles, { path: p }) || flattenTreeFiles(directoryFiles).find(n => n.path === p))
    .filter(Boolean);

  let deletedCount = 0;
  for (const entry of entries) {
    try {
      await deleteDirectoryEntryQuiet(entry);
      deletedCount += 1;
    } catch (err) {
      setStatus(t("status", "deleteFailed") + (err && err.message ? err.message : String(err)), true);
    }
  }
  selectedEntryPaths.clear();
  renderFileList();
  setStatus(t("status", "deleteSelectedDone").replace("{count}", String(deletedCount)), false);
}
```

**`deleteDirectoryEntryQuiet`** は `deleteDirectoryEntry` から確認ダイアログと `renderFileList()` / `setStatus()` を取り除いた内部版。または `deleteDirectoryEntry` をリファクタして `{ quiet: boolean }` オプションを追加してもよい。

実装方針の選択：
- `deleteDirectoryEntry` が大きい関数なので、「共通ロジック部分を `_doDeleteEntry(entry)` に抽出し、`deleteDirectoryEntry` は確認ダイアログを含む公開版、`deleteSelectedEntries` は確認なしの `_doDeleteEntry` を直接ループ呼び出し」とする。
- ただしフォルダは複数選択でも削除対応する（ただし右クリック複数選択時はフォルダを含む場合はファイルだけ削除してフォルダはスキップ、またはすべて削除のどちらかを選ぶ）。
- 実装時の判断：**ファイルのみ削除**（フォルダ誤削除防止のため）。フォルダが選択に含まれていた場合はスキップしてステータスで通知する。

### i18n の追加

13 言語対応が必要。`status.deleteSelectedConfirm`（{count} を含む）と `status.deleteSelectedDone` を追加する。

追加位置：`status.deleteFolderDone`（行 5476）の直後。

```
"status.deleteSelectedConfirm": [
  "Delete {count} selected files? This cannot be undone.",
  "{count} 個のファイルを削除します。元に戻せません。",
  "確定要刪除 {count} 個選取的檔案嗎？此操作無法復原。",
  "删除所选的 {count} 个文件吗？此操作无法撤销。",
  "¿Eliminar {count} archivos seleccionados? Esto no se puede deshacer.",
  "{count} ausgewaehlte Dateien loeschen? Dies kann nicht rueckgaengig gemacht werden.",
  "선택한 파일 {count}개를 삭제할까요? 되돌릴 수 없습니다.",
  "Excluir {count} arquivos selecionados? Isso nao pode ser desfeito.",
  "Удалить {count} выбранных файла(ов)? Это нельзя отменить.",
  "Xóa {count} tệp đã chọn? Không thể hoàn tác.",
  "Supprimer {count} fichiers sélectionnés ? Cette action est irréversible.",
  "Eliminare {count} file selezionati? L'operazione non può essere annullata.",
  "Hapus {count} file yang dipilih? Tindakan ini tidak dapat dibatalkan.",
],
"status.deleteSelectedDone": [
  "{count} files deleted.",
  "{count} 個のファイルを削除しました。",
  "已刪除 {count} 個檔案。",
  "已删除 {count} 个文件。",
  "{count} archivos eliminados.",
  "{count} Dateien geloescht.",
  "파일 {count}개를 삭제했습니다.",
  "{count} arquivos excluidos.",
  "{count} файл(ов) удалено.",
  "Đã xóa {count} tệp.",
  "{count} fichiers supprimés.",
  "{count} file eliminati.",
  "{count} file dihapus.",
],
```

### 完了条件

- 複数選択状態で右クリック → 「削除」のみのメニューが出る
- 確認ダイアログに件数が表示される
- フォルダはスキップしてファイルのみ削除、完了ステータスに件数が表示される
- 単一選択での既存の削除動作が壊れていない

---

## C4: DnD 複数選択対応（Web版 + Tauri版）

### Web 版: `setTreeEntryDragHandlers`（行 9479〜9493）

**dragstart ハンドラー修正**

```js
button.addEventListener("dragstart", (e) => {
  hideFileContextMenu();

  // ドラッグ対象の決定: selectedEntryPaths に含まれていれば複数ドラッグ
  const isMulti = selectedEntryPaths.size >= 2 && selectedEntryPaths.has(entry.path);
  const dragPaths = isMulti
    ? Array.from(selectedEntryPaths)
    : [entry.path];

  draggedDirectoryEntryPath = entry.path;  // 既存変数は先頭エントリのパスを保持
  draggedEntryPaths = dragPaths;           // 新変数: 全ドラッグ対象パスの配列

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-offline-md-tree-path", entry.path);
    e.dataTransfer.setData("text/plain", entry.path);
  }
  window.setTimeout(() => button.classList.add("dragging"), 0);
});
```

状態変数（行 4691 付近）に `let draggedEntryPaths = [];` を追加する。

**dragend ハンドラー修正**

```js
button.addEventListener("dragend", () => {
  draggedDirectoryEntryPath = "";
  draggedEntryPaths = [];
  clearTreeDropClasses();
});
```

### Web 版: `setTreeDirectoryDropHandlers` の drop ハンドラー修正（行 9526〜9536）

```js
button.addEventListener("drop", (e) => {
  const sourceEntry = getDraggedTreeEntry();
  if (sourceEntry) {
    e.preventDefault();
    e.stopPropagation();
    button.classList.remove("drop-target");

    // 複数ドラッグの場合は全エントリを順次移動
    const allSources = draggedEntryPaths.length >= 2
      ? draggedEntryPaths.map(p => findTreeNode(directoryFiles, { path: p }) || flattenTreeFiles(directoryFiles).find(n => n.path === p)).filter(Boolean)
      : [sourceEntry];

    (async () => {
      for (const src of allSources) {
        try {
          await moveDirectoryEntry(src, targetEntry);
        } catch (err) {
          setStatus(t("status", "moveFailed") + (err && err.message ? err.message : String(err)), true);
        }
      }
      selectedEntryPaths.clear();
    })();
    return;
  }
  // 外部ドラッグ（既存ロジックそのまま）
  ...
});
```

`setTreeFileDropHandlers`（ファイル上へのドロップ）も同様に修正する。

### Tauri 版: `tauriTreeDnd` の修正（行 10545〜）

`tauriTreeDnd` はクロージャで `sourceEntry` を単一エントリとして管理している。

**追加フィールド**

```js
let sourceEntries = [];  // 複数ドラッグ時の全エントリ
```

**onMouseDown の修正**

```js
onMouseDown(e, button, entry) {
  // ... 既存ロジック ...
  sourceEntry = entry;
  const isMulti = selectedEntryPaths.size >= 2 && selectedEntryPaths.has(entry.path);
  sourceEntries = isMulti
    ? Array.from(selectedEntryPaths).map(p => findTreeNode(directoryFiles, { path: p }) || flattenTreeFiles(directoryFiles).find(n => n.path === p)).filter(Boolean)
    : [entry];
  // ...
}
```

**ghost ラベルの修正**（`createGhost` 呼び出し箇所）

```js
const label = sourceEntries.length >= 2
  ? `${sourceEntries.length} items`
  : (entry.name || entry.path);
createGhost(label);
```

ただし `label` は i18n 対応不要（ghost は一時表示 UI）。

**mouseup の移動処理修正**

既存の単一 `moveDirectoryEntry(sourceEntry, targetEntry)` 呼び出しを、`sourceEntries` ループに変更する。

```js
(async () => {
  for (const src of sourceEntries) {
    try {
      await moveDirectoryEntry(src, targetEntry);
    } catch (err) {
      setStatus(t("status", "moveFailed") + (err && err.message ? err.message : String(err)), true);
    }
  }
  selectedEntryPaths.clear();
  sourceEntries = [];
})();
```

### ルートへのドロップ `handleRootMoveDrop`（行 10537）

```js
function handleRootMoveDrop(sourceEntry) {
  const allSources = draggedEntryPaths.length >= 2
    ? draggedEntryPaths.map(p => findTreeNode(directoryFiles, { path: p }) || flattenTreeFiles(directoryFiles).find(n => n.path === p)).filter(Boolean)
    : [sourceEntry];

  (async () => {
    for (const src of allSources) {
      await moveDirectoryEntry(src, null).catch((err) => {
        setStatus(t("status", "moveFailed") + (err && err.message ? err.message : String(err)), true);
      });
    }
    selectedEntryPaths.clear();
  })();
}
```

### 完了条件

- Web版: 複数選択ファイルをドラッグしてフォルダにドロップ → 全ファイルが移動する
- Tauri版: 同様に全ファイルが移動する
- ゴーストに件数が表示される（複数時）
- 移動完了後に `selectedEntryPaths` がクリアされる

---

## 実装時の注意事項

### `findTreeNode` の動作確認

`findTreeNode(directoryFiles, { path: p })` が path マッチで動作するかを Read で確認すること。
現状の実装が `===` でオブジェクト参照比較をしている場合は `flattenTreeFiles(directoryFiles).find(n => n.path === p)` を使う。

### `getVisibleDirectoryNodes()` の確認

Shift+click の範囲選択で使用。dir ノードと file ノードが混在したフラット配列を返すことを確認する（行番号を grep で特定）。

### 既存の DnD 動作を壊さない

- 単一ファイルのドラッグ（selectedEntryPaths が 0 または 1 の場合）は従来通り動作すること
- 外部ドラッグ（OS からのファイルドロップ）は影響を受けないこと

### テスト観点

- 通常クリック → ファイルオープン（選択なし）
- Ctrl+クリック → 複数選択、ファイル開かない
- Shift+クリック → 範囲選択
- 複数選択後 → 右クリック → 削除のみメニュー → 確認 → 削除実行
- 複数選択後 → ドラッグ → フォルダへドロップ → 全ファイル移動
- 単一選択の既存動作（右クリックメニュー全項目、DnD）が壊れていない

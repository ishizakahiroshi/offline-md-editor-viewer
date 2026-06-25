# [完了] フォルダ再スキャンボタン実装計画

> 最終更新: 2026-05-06(水) 15:53:41

## context配分

| C# | 種別 | 内容 | 状態 |
|----|------|------|------|
| C1 | fix | HTML・CSS・i18n：再スキャンボタンの追加 | fix |
| C2 | fix | JS：rescanCurrentDirectory 関数・ボタン表示制御・イベントハンドラ | fix |

実行順序: C1 → C2

---

## 概要

フォルダを開いた後に外部で追加された MD ファイルがフォルダツリーに反映されない問題を解消するため、
「現在のフォルダを再スキャン」するボタンをファイルリストヘッダーに追加する。

- **ブラウザ版**：`activeDirectoryHandle`（`FileSystemDirectoryHandle`）で `collectDirectoryHandleFiles` を再実行
- **デスクトップ版（Tauri）**：`activeDirectoryHandle`（パス文字列）で `collectTauriShallowFiles` を再実行

ページリロードや再度フォルダを選び直す操作なしに、ワンクリックで最新状態に同期できる。

---

## C1：HTML・CSS・i18n

### 対象ファイル

`apps/browser/offline-md-editor-viewer.html` のみ

### HTML — ボタン追加位置

`#openFolderIconBtn` の直後（フォルダ開くアイコンの隣）に追加する。

```html
<button id="rescanDirBtn" class="icon-btn" type="button" hidden>
  <!-- 循環矢印アイコン（refresh/reload）: viewBox="0 0 24 24" -->
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
</button>
```

- `hidden` 属性をデフォルトで付ける（フォルダ未選択時は非表示）
- フォルダ選択後に JS 側で `hidden` を外す

### CSS — 追加不要

既存 `.icon-btn` スタイルを流用するため新規 CSS は不要。

### i18n — 追加キー

多言語対応のため以下を追加する（英語・日本語を必須とし、他言語は英語に倣う）。

**`ui.rescanDirBtn`**（ボタンの tooltip / aria-label）

```
en: "Rescan folder"
ja: "フォルダを再スキャン"
zh-TW: "重新掃描資料夾"
zh-CN: "重新扫描文件夹"
es: "Volver a escanear carpeta"
de: "Ordner erneut scannen"
ko: "폴더 다시 스캔"
pt: "Redigitalizar pasta"
ru: "Пересканировать папку"
vi: "Quét lại thư mục"
fr: "Rescanner le dossier"
it: "Scansiona di nuovo la cartella"
id: "Pindai ulang folder"
```

**`status.folderRescanned`**（再スキャン完了ステータス）

```
en: "Folder rescanned."
ja: "フォルダを再スキャンしました。"
zh-TW: "已重新掃描資料夾。"
zh-CN: "已重新扫描文件夹。"
es: "Carpeta reescaneada."
de: "Ordner erneut gescannt."
ko: "폴더를 다시 스캔했습니다."
pt: "Pasta reescaneada."
ru: "Папка пересканирована."
vi: "Đã quét lại thư mục."
fr: "Dossier re-scanné."
it: "Cartella riscansionata."
id: "Folder dipindai ulang."
```

### i18n 追加場所の特定方法

```
grep -n "ui.folderBtn" apps/browser/offline-md-editor-viewer.html
grep -n "status.folderLoaded" apps/browser/offline-md-editor-viewer.html
```

それぞれの行の直後に追記する。

---

## C2：JS ロジック

### 対象ファイル

`apps/browser/offline-md-editor-viewer.html` のみ

### DOM 取得

```js
const rescanDirBtn = document.getElementById("rescanDirBtn");
```

既存の DOM 取得ブロック（4098行付近）に追記。

### rescanCurrentDirectory 関数

`openFolder()` 関数（10425行付近）の直前に追加する。

```js
async function rescanCurrentDirectory() {
  if (!activeDirectoryHandle) return;
  setStatus(t("status", "folderLoading"), "loading");
  if (isTauri) {
    const files = await collectTauriShallowFiles(activeDirectoryHandle);
    directoryFiles = getSortedDirectoryFiles(files);
    updateCardLayout();
    renderFileList();
    setStatus(t("status", "folderRescanned"));
    return;
  }
  // ブラウザ版：FileSystemDirectoryHandle から再収集
  const files = await collectDirectoryHandleFiles(activeDirectoryHandle);
  showDirectoryFiles(files, activeDirectoryHandle.name, activeDirectoryHandle);
  setStatus(t("status", "folderRescanned"));
}
```

### ボタン表示制御

`showDirectoryFiles()` 関数（8919行付近）内、`renderFileList()` 呼び出しの近くに追加。

```js
rescanDirBtn.hidden = !activeDirectoryHandle;
```

`hideFileList()` や `showDirectoryFiles()` の中で `activeDirectoryHandle = null` するタイミングにも `rescanDirBtn.hidden = true` を追加する。
`activeDirectoryHandle` を null にする箇所を grep して網羅する：

```
grep -n "activeDirectoryHandle = null" apps/browser/offline-md-editor-viewer.html
```

### tooltip / aria-label の設定

`updateUi()` または `renderFileList()` の中で以下を追加：

```js
setUiTooltip(rescanDirBtn, t("ui", "rescanDirBtn"));
rescanDirBtn.setAttribute("aria-label", t("ui", "rescanDirBtn"));
```

既存の `setUiTooltip(openFolderIconBtn, ...)` の直後が適切な位置。

### イベントハンドラ登録

既存の `openFolderIconBtn.addEventListener` の直後に追加：

```js
rescanDirBtn.addEventListener("click", () => {
  rescanCurrentDirectory().catch((err) => handleError(err));
});
```

### 完了条件

- [ ] フォルダ未選択時：ボタン非表示
- [ ] フォルダ選択後：ボタン表示、クリックで再スキャン実行
- [ ] ブラウザ版：外部で追加したファイルが再スキャン後にツリーに現れる
- [ ] Tauri版：同上
- [ ] 言語切り替え後も tooltip が正しい言語になる

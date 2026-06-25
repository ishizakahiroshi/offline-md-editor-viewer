# [完了] ファイルツリー：祖先Sticky表示 + お気に入り固定セクション

> 最終更新: 2026-05-06(水) 10:28:22

## context配分

| C | 内容 | 状態 | 並列 |
|---|------|------|------|
| C1 | 基盤：localStorage定数・状態変数・CSS変数追加 | fix | — |
| C2 | Sticky祖先表示：CSS `position: sticky` + `z-index` 設定 | fix | C3と並列OK |
| C3 | お気に入りUI：固定セクション描画 + ☆/★ボタン + クリックハンドラー | fix | C2と並列OK |
| C4 | 右クリックメニュー「お気に入りに追加/削除」+ i18n 13言語 | fix | — |

**実行順序**: C1 → (C2, C3) → C4

---

## 概要

### 機能1: 祖先フォルダの Sticky 表示

孫ディレクトリを表示中、`#fileList`（`overflow: auto`）内でスクロールしても
深さ0（親フォルダ）と深さ1（子フォルダ）の行が上部に固定表示される。

- 深さ0の `.file-list-dir` → `position: sticky; top: 0; z-index: 3`
- 深さ1の `.file-list-dir` → `position: sticky; top: var(--sticky-dir-height); z-index: 2`
- 深さ2以降 → sticky なし（通常スクロール）

`--sticky-dir-height` は `.file-list-dir` ボタンの実際の高さ（標準密度: 28px、compact密度: 22px 程度）。

### 機能2: お気に入りディレクトリ（A案: 上部固定セクション）

- ディレクトリ行に ☆ アイコンを表示（ホバーで常に表示、平常時は薄く表示）
- クリックで ★ に切り替え → localStorage に保存
- ファイルリスト最上部に「お気に入り」セクションを固定描画
- ★ ディレクトリをクリック → ツリー内の該当フォルダを展開してスクロール

**対象ファイル**: `apps/browser/offline-md-editor-viewer.html` のみ

---

## C1: 基盤追加

### localStorage 定数（行 4620 付近、`STORAGE_` 定数群の末尾）

```js
const STORAGE_FAVORITES_KEY = STORAGE_KEY_PREFIX + "favorites";
```

### 状態変数（行 4689 付近、`expandedDirs` の直下）

```js
let favoriteDirs = new Set();   // お気に入りディレクトリのパス Set
```

### 初期化（`initApp` または localStorage 読み込み箇所）

`STORAGE_CARD_VISIBILITY_KEY` 等を読み込む処理の近くに追加：

```js
try {
  const saved = localStorage.getItem(STORAGE_FAVORITES_KEY);
  if (saved) favoriteDirs = new Set(JSON.parse(saved));
} catch {}
```

### お気に入り保存ヘルパー関数（`safeLocalStorageSet` 呼び出し箇所の近くに追加）

```js
function saveFavoriteDirs() {
  safeLocalStorageSet(STORAGE_FAVORITES_KEY, JSON.stringify(Array.from(favoriteDirs)));
}
```

### CSS 追加（`.file-list-dir` のスタイル付近に追加）

```css
/* お気に入りセクション */
.favorites-section-header {
  font-size: 0.72em;
  color: var(--text-muted);
  padding: 6px 8px 2px;
  letter-spacing: 0.05em;
  user-select: none;
}
.favorites-section-divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 4px 0 6px;
}
/* お気に入りボタン（☆/★）*/
.fav-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  font-size: 0.9em;
  color: var(--text-muted);
  opacity: 0;
  transition: opacity 0.1s;
  line-height: 1;
  flex-shrink: 0;
}
.file-list-dir:hover .fav-btn,
.fav-btn.is-favorite {
  opacity: 1;
}
.fav-btn.is-favorite {
  color: var(--accent, #f59e0b);
}
```

### CSS 変数（sticky 高さ）

```css
:root {
  --sticky-dir-height: 28px;
}
/* compact 密度時（既存 .density-compact セレクタ内に追加）*/
.density-compact {
  --sticky-dir-height: 22px;
}
```

### 完了条件

- `STORAGE_FAVORITES_KEY` 定数が存在する
- `favoriteDirs` Set が初期化時に localStorage から復元される
- `saveFavoriteDirs()` 関数が存在する
- CSS クラス `.fav-btn`, `.favorites-section-header`, `.favorites-section-divider` が存在する
- CSS 変数 `--sticky-dir-height` が定義されている

---

## C2: Sticky 祖先表示（CSS + renderTreeNode 修正）

### CSS 追加（`.file-list-dir` のスタイル付近）

```css
/* Sticky 祖先表示 */
.file-list-dir.sticky-ancestor-0 {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--bg-card);
}
.file-list-dir.sticky-ancestor-1 {
  position: sticky;
  top: var(--sticky-dir-height);
  z-index: 2;
  background: var(--bg-card);
}
```

`background: var(--bg-card)` は、スクロール中に下のコンテンツが透けないよう必須。
`--bg-card` が定義されていなければ `var(--bg)` または `var(--surface)` 等の既存変数に合わせること。

### `renderTreeNode` 修正（行 8867〜8983）

`renderTreeNode(entry, depth)` 内のディレクトリボタン生成箇所（行 8871 付近）に追加：

```js
// 深さ 0/1 に sticky クラスを付与
if (depth === 0) button.classList.add("sticky-ancestor-0");
else if (depth === 1) button.classList.add("sticky-ancestor-1");
```

### 注意事項

- `.file-list-children` に `overflow: hidden` が設定されていると sticky が効かない。
  該当行を Read で確認し、もし `overflow: hidden` があれば削除またはコメントアウトする。
  （折りたたみは CSS `height: 0` や `display: none` で実現されているはずなので影響なし）
- sticky 適用は `depth` 引数に基づくため、depth 変数は `renderTreeNode` の引数として
  常に正しく渡されていることを確認する。

### 完了条件

- 深さ0のフォルダ行が `#fileList` 内スクロール時に最上部に固定される
- 深さ1のフォルダ行が深さ0ヘッダーの真下に固定される
- 深さ2以降（孫）は通常スクロールする
- 折りたたみ（expandedDirs）の動作が壊れていない

---

## C3: お気に入りUI（固定セクション + ☆/★ボタン）

### `renderFileList` 修正（行 8849〜8985）

関数先頭の空状態チェックの直後、tree 描画の前にお気に入りセクションを挿入する。

```js
function renderFileList() {
  // ... 既存の空状態チェック（fileList.innerHTML = "" 等）...

  // === お気に入りセクション ===
  if (favoriteDirs.size > 0) {
    const header = document.createElement("div");
    header.className = "favorites-section-header";
    header.textContent = t("ui", "favorites");
    fileList.appendChild(header);

    for (const favPath of favoriteDirs) {
      const favBtn = document.createElement("button");
      favBtn.className = "file-list-dir";
      favBtn.style.setProperty("--depth", "0");
      // パス末尾のフォルダ名を表示
      const favName = favPath.split("/").filter(Boolean).pop() || favPath;
      favBtn.textContent = "📁 " + favName;
      favBtn.title = favPath;
      favBtn.addEventListener("click", () => {
        // ツリー内で該当フォルダを展開してスクロール
        expandToPath(favPath);
      });
      fileList.appendChild(favBtn);
    }

    const divider = document.createElement("hr");
    divider.className = "favorites-section-divider";
    fileList.appendChild(divider);
  }

  // === 通常ツリー描画（既存コード）===
  // ...
}
```

### `expandToPath(path)` ヘルパー関数を追加

`expandedDirs` の更新と `renderFileList` 再描画、スクロールを行う。

```js
function expandToPath(path) {
  // path の全祖先を expandedDirs に追加
  const parts = path.split("/").filter(Boolean);
  let accumulated = "";
  for (const part of parts) {
    accumulated = accumulated ? accumulated + "/" + part : part;
    expandedDirs.add(accumulated);
  }
  expandedDirs.add(path);
  renderFileList();
  // 該当ボタンを検索してスクロール
  const btn = fileList.querySelector(`[data-path="${CSS.escape(path)}"]`);
  if (btn) btn.scrollIntoView({ block: "nearest" });
}
```

**注意**: `renderTreeNode` 内のディレクトリボタンに `data-path` 属性を追加する必要がある：

```js
// renderTreeNode 内、button 生成直後
button.dataset.path = entry.path;
```

### ☆/★ボタンを `renderTreeNode` のディレクトリボタンに追加

```js
// renderTreeNode 内、ディレクトリボタンのテキスト設定の後
const favStar = document.createElement("span");
favStar.className = "fav-btn" + (favoriteDirs.has(entry.path) ? " is-favorite" : "");
favStar.textContent = favoriteDirs.has(entry.path) ? "★" : "☆";
favStar.setAttribute("aria-label", t("ui", "toggleFavorite"));
favStar.addEventListener("click", (e) => {
  e.stopPropagation();  // フォルダ開閉を阻止
  if (favoriteDirs.has(entry.path)) {
    favoriteDirs.delete(entry.path);
  } else {
    favoriteDirs.add(entry.path);
  }
  saveFavoriteDirs();
  renderFileList();
});
button.appendChild(favStar);
```

ただし、ディレクトリボタンの現在のレイアウトを確認して、`flex` 等が使われているか確認する。
☆ボタンを右端に置くため `button` に `display: flex; align-items: center; justify-content: space-between;` が必要かもしれない。

### i18n キー追加（C4でまとめて追加するため、C3では JS 側の参照のみ記載）

- `t("ui", "favorites")` → 「お気に入り」
- `t("ui", "toggleFavorite")` → 「お気に入りに追加/削除」

### 完了条件

- `favoriteDirs` が空でない場合、ファイルリスト最上部にお気に入りセクションが表示される
- セクション内のディレクトリをクリックするとツリー内で展開・スクロールされる
- ディレクトリ行にホバーすると ☆ が表示される
- ☆ をクリックすると ★ になり、お気に入りセクションに追加される
- ★ を再クリックするとお気に入り解除され、セクションから消える
- localStorage にお気に入りが保存・復元される

---

## C4: 右クリックメニュー + i18n 13言語

### コンテキストメニュー HTML 追加（行 3861〜3868、`fileContextMenu` 内）

`deleteFileMenuBtn` の直前に追加：

```html
<button id="toggleFavoriteMenuBtn" data-i18n-key="ui.addToFavorites"></button>
```

### `showFileContextMenu` 修正（行 8818〜8835）

```js
function showFileContextMenu(entry, x, y) {
  // ... 既存コード ...
  const isDir = entry && entry.kind === "dir";
  // お気に入りボタン: ディレクトリのみ表示
  toggleFavoriteMenuBtn.hidden = !isDir || !entry;
  if (isDir && entry) {
    const isFav = favoriteDirs.has(entry.path);
    toggleFavoriteMenuBtn.textContent = isFav
      ? t("ui", "removeFromFavorites")
      : t("ui", "addToFavorites");
  }
  // ... 既存コード続き ...
}
```

### `toggleFavoriteMenuBtn` クリックハンドラー追加

```js
toggleFavoriteMenuBtn.addEventListener("click", () => {
  hideFileContextMenu();
  if (!contextMenuEntry) return;
  const path = contextMenuEntry.path;
  if (favoriteDirs.has(path)) {
    favoriteDirs.delete(path);
  } else {
    favoriteDirs.add(path);
  }
  saveFavoriteDirs();
  renderFileList();
});
```

### i18n 追加（13言語）

追加位置: `status.deleteFolderDone` 行の近くの `ui` グループ末尾。

```
"ui.favorites": ["Favorites", "お気に入り", "我的最愛", "收藏夹", "Favoritos", "Favoriten", "즐겨찾기", "Favoritos", "Избранное", "Yêu thích", "Favoris", "Preferiti", "Favorit"],
"ui.addToFavorites": ["Add to Favorites", "お気に入りに追加", "加入我的最愛", "添加到收藏", "Añadir a favoritos", "Zu Favoriten hinzufügen", "즐겨찾기에 추가", "Adicionar aos favoritos", "Добавить в избранное", "Thêm vào yêu thích", "Ajouter aux favoris", "Aggiungi ai preferiti", "Tambahkan ke favorit"],
"ui.removeFromFavorites": ["Remove from Favorites", "お気に入りから削除", "從我的最愛移除", "从收藏中移除", "Eliminar de favoritos", "Aus Favoriten entfernen", "즐겨찾기에서 삭제", "Remover dos favoritos", "Удалить из избранного", "Xóa khỏi yêu thích", "Retirer des favoris", "Rimuovi dai preferiti", "Hapus dari favorit"],
"ui.toggleFavorite": ["Toggle Favorite", "お気に入り切替", "切換我的最愛", "切换收藏", "Alternar favorito", "Favorit umschalten", "즐겨찾기 전환", "Alternar favorito", "Переключить избранное", "Chuyển đổi yêu thích", "Basculer le favori", "Attiva/disattiva preferito", "Alihkan favorit"],
```

### 完了条件

- ディレクトリを右クリック → 「お気に入りに追加」または「お気に入りから削除」が表示される
- クリック後、お気に入りセクションとツリー内の ☆/★ が即時更新される
- ファイル・空白を右クリックした場合はメニューに「お気に入り」項目が出ない
- 既存の右クリック動作（削除・リネーム等）が壊れていない

---

## 実装時の注意事項

### `--bg-card` 変数の存在確認

sticky ヘッダーの背景色に使う `--bg-card` が定義されているか `grep -n "\-\-bg-card"` で確認する。
未定義の場合は `var(--bg)` や `var(--surface)` 等の既存変数を使う。

### `.file-list-children` の overflow 確認

```bash
grep -n "file-list-children" apps/browser/offline-md-editor-viewer.html
```

`overflow: hidden` があれば sticky が効かない。展開/折りたたみが別手段（height/display）で
実現されていれば `overflow: hidden` を削除できる。

### path の区切り文字

`expandToPath` での path 分割は `/` を前提としているが、
Tauri 版では `\` が混在する可能性がある。既存コードの path 処理（`activeDirectoryEntryPath` 等）
の区切り文字を確認して合わせること。

### お気に入りの有効期限・孤立パス

フォルダを削除・名前変更した場合、`favoriteDirs` 内に存在しないパスが残る。
お気に入りセクション描画時に `directoryFiles` から存在確認を行い、
存在しないパスは表示しない（削除はしない、次回フォルダ再選択で復活する可能性があるため）。

```js
// お気に入りセクション描画時の存在チェック
const allPaths = new Set(flattenTreeFiles(directoryFiles).map(n => n.path));
// dir も含めるため directoryFiles の全ノードを走査
function collectAllPaths(nodes, set) {
  for (const n of nodes) {
    set.add(n.path);
    if (n.children) collectAllPaths(n.children, set);
  }
}
const allNodePaths = new Set();
collectAllPaths(directoryFiles, allNodePaths);

for (const favPath of favoriteDirs) {
  if (!allNodePaths.has(favPath)) continue;  // 存在しないパスはスキップ
  // ... セクション描画 ...
}
```

ただし `directoryFiles` が空（フォルダ未選択）の場合はチェックをスキップし、
全お気に入りを表示してもよい（フォルダ未選択時にお気に入りから素早く開ける）。

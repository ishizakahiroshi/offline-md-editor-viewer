# [完了] コードブロック・シンタックスハイライト実装計画

> 最終更新: 2026-05-14(木) 17:06:39

## 背景

現在、Markdown プレビューは `marked.parse(...)` → `DOMPurify.sanitize(...)` の素直なパイプラインのみで、コードブロック（\`\`\`go / \`\`\`js …）はトークン色分けがされず、`<pre><code>` の単色テキストになっている。

姉妹プロジェクト `any-ai-cli` 側で **highlight.js v11.10.0 (common 言語サブセット, BSD-3-Clause)** を同じ marked 出力に被せて言語別ハイライトを実装したので、本リポジトリにも同等の改修を入れる。

採用 OSS と理由：

| 候補 | ライセンス | 採用判断 |
|---|---|---|
| **highlight.js v11.10.0** | **BSD-3-Clause** | **採用**。オフライン MD ビューア／エディタの定番、common 38 言語をワンファイル提供、auto detect あり |
| Prism.js | MIT | 不採用。本プロジェクトは BSD-3-Clause 表記の追加で OSS 配布上問題ないため、より定番の highlight.js を選ぶ |

BSD-3-Clause は MIT と同じく再配布可。必要なのは「著作権表示・ライセンス文の保持」「バイナリ配布時のライセンス文同梱」「プロジェクト名を派生物の宣伝に無断使用しない」の3条件のみ。すべて `LICENSES/highlight.js-LICENSE.txt` 追加と About ダイアログ・`THIRD_PARTY_NOTICES.md` への記載で満たせる。

---

## context配分

| C# | 種別 | 内容 | 状態 |
|----|------|------|------|
| C1 | feat | ライブラリ vendor 配置 + HTML 統合（`<link>` / `<script>` / `marked.use({ renderer })`） | fix |
| C2 | feat | About ダイアログの OSS 一覧追加（HTML / i18n 13言語 / details ライセンス本文プレースホルダ） | fix |
| C3 | feat | ノーティス・ライセンス文書追加（`THIRD_PARTY_NOTICES.md` / `LICENSES/highlight.js-LICENSE.txt`） | fix |
| C4 | feat | ビルド・検証スクリプト更新（single-HTML inliner / third-party check） | fix |
| C5 | test | サンプル MD で各言語が色付けされることをデスクトップ／ブラウザ／single-HTML で確認 | fix |

実行順序: C1 → C3 → C2 → C4 → C5（ライセンス文書とインライナーが揃ってから About に出すと整合性が崩れない）

---

## C1：ライブラリ vendor 配置 + HTML 統合

### 1.1 ファイル取得・配置

`apps/browser/lib/` に以下 2 ファイルを追加する（cdnjs v11.10.0 / 既存 lib と同じ minified 形式）。

```powershell
$dest = 'apps/browser/lib'
Invoke-WebRequest 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js' -OutFile "$dest/highlight.min.js" -UseBasicParsing
Invoke-WebRequest 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css' -OutFile "$dest/hljs-github-dark.min.css" -UseBasicParsing
```

- `highlight.min.js` は common サブセット（38 言語）。先頭バナーに `Highlight.js v11.10.0 ... License: BSD-3-Clause` が残っていることを確認（後続の check-third-party.ps1 の `LibPattern` で参照）。
- CSS は **github-dark テーマ**（既存 UI のダーク基調と整合）。

### 1.2 `apps/browser/offline-md-editor-viewer.html` の `<head>` 追加

既存の `<link>` 群の末尾、または `<style>` 直前に挿入。

```html
<link rel="stylesheet" href="lib/hljs-github-dark.min.css">
```

### 1.3 既存スクリプト読み込み箇所（行 4098-4100 付近）に追記

```html
<script src="lib/marked.min.js"></script>
<script src="lib/purify.min.js"></script>
<script src="lib/highlight.min.js"></script>           ← ★追加
<script src="./lib/encoding.min.js"></script>
```

### 1.4 marked renderer 差し替え（モジュール初期化部）

`marked.parse(...)` は2箇所で呼ばれている（行 7672 のプレビュー本体 / 行 11554 の README ダイアログ）。両方に同じ挙動を効かせるため、**スクリプト最上位の初期化で `marked.use({ renderer })` を1回だけ実行**して差し替える。場所は `marked` グローバル定義後・最初の `marked.parse` 呼び出し前であればどこでも可（既存 `marked` 関連の構成行があればその直後に置く）。

```js
// ```lang ... ``` → highlight.js で色付け
// 未指定ブロックは highlightAuto に任せる（短すぎる時は無色になる）。
// 未知の言語名はエスケープのみ。hljs 未ロード時はプレーン表示にフォールバック。
(function setupMarkdownCodeHighlight() {
  if (typeof marked === 'undefined') return;
  const renderer = new marked.Renderer();
  const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

  renderer.code = function (codeObj, infoArg) {
    let code = '';
    let lang = '';
    if (codeObj && typeof codeObj === 'object') {
      code = codeObj.text != null ? codeObj.text : '';
      lang = (codeObj.lang || '').trim().split(/\s+/)[0] || '';
    } else {
      code = codeObj || '';
      lang = (infoArg || '').trim().split(/\s+/)[0] || '';
    }
    let body = '';
    let langClass = '';
    if (typeof hljs !== 'undefined') {
      try {
        if (lang && hljs.getLanguage(lang)) {
          body = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
          langClass = ' language-' + lang;
        } else if (lang) {
          body = escapeHtml(code);
          langClass = ' language-' + lang;
        } else {
          const auto = hljs.highlightAuto(code);
          body = auto.value;
          if (auto.language) langClass = ' language-' + auto.language;
        }
      } catch (_) {
        body = escapeHtml(code);
      }
    } else {
      body = escapeHtml(code);
    }
    return `<pre><code class="hljs${langClass}">${body}</code></pre>`;
  };

  marked.use({ renderer });
})();
```

> `escapeHtml` ヘルパが既存にあればそれを再利用してこの IIFE 内では再定義しない。

### 1.5 CSS 競合の解消

既存の `pre code` 系スタイルが hljs テーマの span 配色（`.hljs-keyword` 等）を上書きすると色が出ないので、**`.hljs` クラス付き code は除外**する。既存 CSS 中で `pre code { color: ... }` のような指定があれば `pre code:not(.hljs) { color: ... }` に変更する。

具体的には `<style>` 内（行 219-500 周辺）で `pre code` を `color: var(--text)` 等で当てている箇所を grep して、`:not(.hljs)` を付加する。

DOMPurify 側は `USE_PROFILES: { html: true }` のままで OK（`<span class="hljs-keyword">` はデフォルトで通る）。

### 1.6 動作上の注意

- `marked.parse(normalized)` の戻り値が DOMPurify を通った後に hljs の span が残るか必ず確認。
- README ダイアログ側（行 11554）の `marked.parse(mdSrc)` も同じ renderer を経由するので、自動的にハイライトが効くはず。

---

## C2：About ダイアログの OSS 一覧追加

既存 4 OSS（marked / DOMPurify / encoding-japanese / Tauri）に並べて **highlight.js v11.10.0** を追加する。

### 2.1 HTML：リンク section（行 3766-3791）

`</ul>` 直前に以下の `<li>` を追加（位置は Tauri の前、つまり「Web 同梱物の最後・デスクトップフレームワークの前」）。

```html
<li>
  <a id="aboutHighlightJsLink" class="about-license-link" href="https://github.com/highlightjs/highlight.js/releases/tag/11.10.0" target="_blank" rel="noopener noreferrer">
    <span class="about-license-name">highlight.js 11.10.0</span>
    <span id="aboutHighlightJsLicense" class="about-license-detail"></span>
  </a>
</li>
```

### 2.2 HTML：ライセンス本文 details（行 3837-3851）

`marked` / `DOMPurify` / `encoding-japanese` の `<details>` の並びに追加する（`Feather Icons` の前）。

```html
<details class="license-details">
  <summary>highlight.js 11.10.0 (BSD-3-Clause)</summary>
  <pre class="license-text" id="licenseHighlightJsText"><!-- HIGHLIGHTJS_LICENSE_PLACEHOLDER --></pre>
</details>
```

### 2.3 JS：DOM 参照取得＆テキスト設定

行 4152-4154 付近の `getElementById` 列に追加：

```js
const aboutHighlightJsLicense = document.getElementById("aboutHighlightJsLicense");
```

行 5846-5848 付近の `textContent` 設定列に追加：

```js
aboutHighlightJsLicense.textContent = t("about", "highlightJsLicense");
```

### 2.4 i18n：13 言語の説明文を追加

`about.encodingJapaneseLicense` の直後（行 5053 付近）に新キー `about.highlightJsLicense` を追加。13 要素配列（en / ja / zh-TW / zh-CN / es / de / ko / pt / ru / vi / fr / it / id の順、既存配列と同順）。

```js
"about.highlightJsLicense": [
  "BSD 3-Clause License. Used to apply per-language syntax coloring to code blocks.",
  "BSD 3-Clause License。コードブロックを言語別に色付けするために使用しています。",
  "BSD 3-Clause License。用於對程式碼區塊套用各語言的語法著色。",
  "BSD 3-Clause License. Used to apply per-language syntax coloring to code blocks.",
  "BSD 3-Clause License. Se usa para aplicar coloreado de sintaxis por lenguaje a los bloques de código.",
  "BSD 3-Clause License. Wird verwendet, um Codeblöcke nach Sprache farblich hervorzuheben.",
  "BSD 3-Clause License. 코드 블록에 언어별 구문 색상을 적용하는 데 사용됩니다.",
  "BSD 3-Clause License. Usado para aplicar realce de sintaxe por linguagem em blocos de código.",
  "BSD 3-Clause License. Используется для подсветки синтаксиса блоков кода по языкам.",
  "BSD 3-Clause License. Dùng để tô màu cú pháp theo ngôn ngữ cho khối mã.",
  "BSD 3-Clause License. Utilisé pour appliquer une coloration syntaxique par langage aux blocs de code.",
  "BSD 3-Clause License. Usato per applicare la colorazione della sintassi per linguaggio ai blocchi di codice.",
  "BSD 3-Clause License. Digunakan untuk menerapkan pewarnaan sintaks per bahasa pada blok kode.",
],
```

> 注：他キーは 13 要素のものと 1 要素のみのものが混在しているが、`encodingJapaneseLicense` と同じく 13 要素で揃える。

---

## C3：ノーティス・ライセンス文書追加

### 3.1 `LICENSES/highlight.js-LICENSE.txt`（新規）

upstream の同バージョン `LICENSE` を **改変せずそのまま**置く。check-third-party.ps1 が SHA-256 で照合するため、改行コード・末尾改行も上流に揃える。

ソース URL: `https://raw.githubusercontent.com/highlightjs/highlight.js/11.10.0/LICENSE`

### 3.2 `THIRD_PARTY_NOTICES.md` への追記

既存セクションに揃えて追加（marked / DOMPurify / encoding-japanese の後、Feather Icons の前を推奨）。

```markdown
## highlight.js

- Project: https://github.com/highlightjs/highlight.js
- Version: 11.10.0
- License: BSD 3-Clause License
- Usage: Per-language syntax coloring for code blocks in Markdown preview
- Source bundle: `apps/browser/lib/highlight.min.js`, `apps/browser/lib/hljs-github-dark.min.css`
- Browser release: inlined into `offline-md-editor-viewer.html` (browser release ZIP)
- License text: `LICENSES/highlight.js-LICENSE.txt`
```

---

## C4：ビルド・検証スクリプト更新

### 4.1 `scripts/release/build-browser-single-html.ps1`

現状は JS 3 ファイルを `<script src="...">` → `<script>...</script>` で置換するだけ。**CSS インライン化が必要**。

#### 4.1.1 ライブラリ存在チェックへの追加（行 35 周辺）

```powershell
foreach ($lib in @('marked.min.js', 'purify.min.js', 'encoding.min.js', 'highlight.min.js')) {
```

加えて CSS チェックも追加：

```powershell
$hljsCss = Join-Path $LibDir 'hljs-github-dark.min.css'
if (-not (Test-Path $hljsCss)) {
  Write-Error "CSS not found: $hljsCss"
  exit 1
}
```

#### 4.1.2 JS インライン置換テーブル拡張（行 59-63）

```powershell
$replacements = [ordered]@{
  '<script src="lib/marked.min.js"></script>'    = 'marked.min.js'
  '<script src="lib/purify.min.js"></script>'    = 'purify.min.js'
  '<script src="lib/highlight.min.js"></script>' = 'highlight.min.js'
  '<script src="./lib/encoding.min.js"></script>' = 'encoding.min.js'
}
```

#### 4.1.3 CSS インライン置換を追加

JS インラインのループ後に追記：

```powershell
# Inline CSS: <link rel="stylesheet" href="lib/hljs-github-dark.min.css"> → <style>...</style>
$cssLinkTag = '<link rel="stylesheet" href="lib/hljs-github-dark.min.css">'
$cssContent = [System.IO.File]::ReadAllText($hljsCss, [System.Text.Encoding]::UTF8)
# Escape </style> inside CSS content (rare but possible)
$cssContent = $cssContent -replace '</style>', '<\/style>'
$inlineCssTag = "<style>`n$cssContent`n</style>"
if (-not $result.Contains($cssLinkTag)) {
  Write-Error "CSS link tag not found in source HTML: $cssLinkTag"
  exit 1
}
$result = $result.Replace($cssLinkTag, $inlineCssTag)
```

#### 4.1.4 通知コメント拡張（行 77）

```powershell
$noticeComment = '<!-- Bundled libraries: marked (MIT), DOMPurify (Apache-2.0 / MPL-2.0), encoding-japanese (MIT), highlight.js (BSD-3-Clause). See THIRD_PARTY_NOTICES.md and LICENSES/ in the release bundle. -->'
```

#### 4.1.5 ライセンス本文プレースホルダ追加（行 81-88）

```powershell
$licensePlaceholders = [ordered]@{
  '<!-- APP_LICENSE_PLACEHOLDER -->'               = 'LICENSE'
  '<!-- MARKED_LICENSE_PLACEHOLDER -->'            = 'LICENSES/marked-LICENSE.md'
  '<!-- DOMPURIFY_LICENSE_PLACEHOLDER -->'         = 'LICENSES/DOMPurify-LICENSE.txt'
  '<!-- ENCODING_JAPANESE_LICENSE_PLACEHOLDER -->' = 'LICENSES/encoding-japanese-LICENSE.txt'
  '<!-- HIGHLIGHTJS_LICENSE_PLACEHOLDER -->'       = 'LICENSES/highlight.js-LICENSE.txt'
  '<!-- FEATHER_LICENSE_PLACEHOLDER -->'           = 'LICENSES/feather-LICENSE.txt'
  '<!-- DESKTOP_LICENSES_PLACEHOLDER -->'          = 'LICENSES/desktop-third-party.txt'
}
```

#### 4.1.6 Verify ブロック拡張（行 162-208）

以下のチェックを追加：

```powershell
if ($html -match 'lib/highlight\.min\.js') {
  $errors += 'FAIL: lib/highlight.min.js reference still present'
}
if ($html -match 'lib/hljs-github-dark\.min\.css') {
  $errors += 'FAIL: lib/hljs-github-dark.min.css reference still present'
}
if ($html -notmatch '\bhljs\b') {
  $errors += 'FAIL: "hljs" not found in output'
}
if ($html -notmatch 'BSD 3-Clause License') {
  $errors += 'FAIL: BSD 3-Clause license phrase not found in inlined output'
}
```

プレースホルダ列挙にも `<!-- HIGHLIGHTJS_LICENSE_PLACEHOLDER -->` を追加。

### 4.2 `scripts/local/check-third-party.ps1`

`$thirdParty` 配列（行 11-54）に highlight.js エントリを追加：

```powershell
@{
    Name = "highlight.js"
    Version = "11.10.0"
    LibFile = "apps/browser/lib/highlight.min.js"
    LibPattern = "Highlight.js v11.10.0"
    NoticeName = "## highlight.js"
    NoticeVersion = "- Version: 11.10.0"
    HtmlPatterns = @(
        "highlight.js 11.10.0",
        "https://github.com/highlightjs/highlight.js/releases/tag/11.10.0"
    )
    LicenseFile = "LICENSES/highlight.js-LICENSE.txt"
    LicenseUrl = "https://raw.githubusercontent.com/highlightjs/highlight.js/11.10.0/LICENSE"
}
```

CSS テーマ自体は同じ highlight.js v11.10.0 リポからの派生かつライセンスは同条件なので、`LibFile` チェックは JS だけで足りる（必要なら theme CSS 用エントリも追加しても良いが冗長）。

> **注意**：upstream の `LICENSE` ファイル末尾改行や CRLF/LF の違いで SHA-256 が不一致になる場合がある。最初の `-SkipLicenseDownload` 付き実行で HTML/notice/lib のチェックを通したあと、フル実行で hash 比較を確認する。

---

## C5：動作確認手順

### 5.1 サンプル MD

`apps/browser/docs/syntax-sample.md` 等の既存サンプルにフェンス付きコードを追加して目視確認：

````markdown
```js
function hello(name) {
  return `Hello, ${name}!`;
}
```

```python
def fizzbuzz(n):
    for i in range(1, n+1):
        print('FizzBuzz' if i%15==0 else 'Fizz' if i%3==0 else 'Buzz' if i%5==0 else i)
```

```go
package main
import "fmt"
func main() { fmt.Println("hi") }
```

```html
<div class="x">こんにちは</div>
```
````

### 5.2 各リリース形態でのチェックリスト

- [ ] ブラウザ版（生 HTML）：`apps/browser/offline-md-editor-viewer.html` を直接ブラウザで開き、syntax-sample.md をプレビューしてキーワード／文字列／コメントが色分けされる
- [ ] About ダイアログ：highlight.js 11.10.0 (BSD 3-Clause License) が一覧に表示・リンクが GitHub 11.10.0 タグへ
- [ ] ライセンス本文ダイアログ：highlight.js 11.10.0 (BSD-3-Clause) の details に LICENSE 全文が展開される
- [ ] single-HTML 版：`scripts/release/build-browser-single-html.ps1 -Clean -Verify` が成功し、`dist/browser/offline-md-editor-viewer.html` 単独でも色分け＋About 全文表示が動く
- [ ] デスクトップ版（Tauri）：`apps/desktop` 経由でも同様に動く（同じ HTML を WebView に読ませているだけなので自動で効くはず）
- [ ] `scripts/local/check-third-party.ps1`（フル実行・hash 比較込み）が成功する
- [ ] 13 言語切り替えで about.highlightJsLicense が翻訳される（少なくとも en/ja/zh-TW/de/ko/pt/ru/fr/it をクリック確認）

---

## ロールバック方針

問題が出た場合は以下のいずれかで切り戻し可能：

1. **完全ロールバック**：本 plan で追加・変更した全ファイルを git で戻す
2. **ハイライトのみ無効化**：renderer.code の差し替えを削除し、`<script src="lib/highlight.min.js">` と `<link rel="stylesheet" href="lib/hljs-github-dark.min.css">` をコメントアウト。ライブラリと About 記載は残しておけば次回再有効化が容易

---

## 付録：姉妹実装の参照

`any-ai-cli` リポ（`C:\dev\any-ai-cli`）に同等改修済み。差分は以下のコミット相当：

- `web/src/vendor/highlight.min.js`, `web/src/vendor/hljs-github-dark.min.css`（新規）
- `web/src/vendor/THIRD_PARTY_LICENSES.txt` に highlight.js 11.10.0 / BSD-3-Clause エントリ追加
- `web/src/index.html` で `<link>` / `<script>` 追加
- `web/src/app.js` の `DocsPreview.renderMarkdown` 内 `renderer.code` 差し替え
- `web/src/styles.css` で `pre code:not(.hljs)` 化

挙動仕様（renderer.code の `text/lang` 二系統 API 対応、`highlightAuto` フォールバック、未知言語のエスケープ）はそのまま流用すること。

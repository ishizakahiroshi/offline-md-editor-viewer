# offline-md-editor-viewer

[![GitHub](https://img.shields.io/badge/GitHub-repository-black?logo=github)](https://github.com/ishizakahiroshi/offline-md-editor-viewer)
![Languages](https://img.shields.io/badge/UI_languages-13-blue)
![Platform](https://img.shields.io/badge/platform-Browser%20%7C%20Windows-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

<p>
  <img src="./docs/assets/screenshot-browser-en.png" alt="ブラウザ版スクリーンショット" width="49%">
  <img src="./docs/assets/screenshot-desktop-ja.png" alt="Windows デスクトップ版スクリーンショット" width="49%">
</p>

手元の Markdown をブラウザまたは Windows デスクトップアプリで編集・プレビューするための、オフラインファーストなツールです。

`.md` を開いて左側で編集、右側でプレビュー、そのまま元のファイルに上書き保存。アカウント登録も同期もなく、起動から終了までネットワークに触れずに完結します。

**完全オフラインで動作します。** `marked`、`DOMPurify`、`encoding-japanese` はインライン化して同梱しており、`Feather Icons` の SVG アイコンも HTML に埋め込み済みのため、アプリ読み込み時に CDN や外部サービスへの通信は発生しません。外部リンクは、設定の「外部リンク」を有効にして `http` / `https` リンクをクリックした場合だけブラウザで開きます。

[English README](./README.md)

> **まずはブラウザ版がおすすめです。** 使ってみて、ちょっと使いにくいと感じたり、デスクトップ版の機能が必要と感じたときにデスクトップ版をお試しください。

## すぐ使う

最新版は [GitHub Releases](https://github.com/ishizakahiroshi/offline-md-editor-viewer/releases/latest) からダウンロードできます。

| やりたいこと | ダウンロード |
| --- | --- |
| Chrome ですぐ試す | `offline-md-editor-viewer.html` |
| Windows アプリとして使う | `offline-md-editor-viewer.exe` |
| ブラウザ版を保管・再配布する | `offline-md-editor-viewer-browser-vX.X.X.zip` |
| Windows 版を保管・再配布する | `offline-md-editor-viewer-desktop-vX.X.X-win-x64-portable.zip` |

## こんな人に向いています

- **ビルドもインストールも不要。** ブラウザ版は単一 HTML ファイルを開くだけで動作し、Windows デスクトップ版は USB に置けるポータブル `.exe` です。
- **書いたものは手元に残ります。** ファイル内容をどこかへ送信する処理はなく、保存は元ファイルへの上書きだけです。
- **書きながら結果が見えます。** タイプに合わせてプレビューが更新され、左右パネルはスクロール同期します。
- **フォルダ単位で扱えます。** 一度フォルダを指定すれば、左側のツリーから `.md` を選んで開けます。ノート集やドキュメントツリーの確認に。
- **読みやすいデフォルト。** 見出し・表・引用・コードブロックに調整したダーク/ライトテーマ、文字サイズ変更にも対応。
- **UI は 13 言語。** English / 日本語 / 简体中文 / 繁體中文 / Español / Deutsch / 한국어 / Português (Brasil) / Русский / Tiếng Việt / Français / Italiano / Bahasa Indonesia

## セキュリティ / プライバシー

- **ファイルをアップロードしません。** Markdown ファイルはブラウザまたはデスクトップ WebView 内でローカルに読み込み・描画します。
- **CDN を使いません。** 実行時ライブラリとアイコンはアプリに同梱しています。
- **アプリから外部通信しません。** リリース版は Content Security Policy の `connect-src 'none'` を使います。
- **外部リンクは任意です。** `http` / `https` リンクは、設定で「外部リンク」を有効にしてクリックした場合だけ開きます。

## 使い方の流れ

```mermaid
flowchart LR
    A[📁 フォルダ<br/>を開く] --> B[📝 ファイル<br/>を選ぶ]
    B --> C[✏️ 左で<br/>編集]
    C --> D[👁 右で<br/>プレビュー]
    D --> E[💾 上書き<br/>保存]
    C -.即時反映.-> D
```

左側のソースを編集すると右側のプレビューに即時反映され、`保存（上書き）` で元のファイルへ書き戻します。単体ファイルだけを開くこともできます。

編集モードでは `Ctrl/Cmd+F` でフローティング検索バーを開き、`Ctrl/Cmd+H` または `Ctrl/Cmd+R` で置換操作まで展開できます。`Enter` で次の一致、`Shift+Enter` で前の一致へ移動し、`Esc` で閉じます。大小文字区別、単語単位、正規表現検索に対応しています。

## ブラウザだけで使う

[GitHub Releases](https://github.com/ishizakahiroshi/offline-md-editor-viewer/releases) ページに2つの選択肢があります。

1. **`offline-md-editor-viewer.html`** — 単一ファイル。すぐ試したい方はこちら。ダウンロードしてそのまま Chrome で開けます。
2. **`offline-md-editor-viewer-browser-vX.X.X.zip`** — README / CHANGELOG / LICENSE / LICENSES/ を同梱。保管や再配布にはこちらを推奨。

単体 HTML は完全な self-contained ファイルです。`marked`・`DOMPurify`・`encoding-japanese`・`Feather Icons` の SVG セットがすべてインライン化されており、余分なフォルダは不要で、ファイルを開くだけでオフライン動作します。ライセンス全文は About ダイアログ → **ライセンス本文を表示** からいつでも確認できます。

1. `offline-md-editor-viewer.html`（またはブラウザ版 ZIP から展開）を Chrome で開く（ダブルクリックまたは Chrome へドラッグ&ドロップ）
2. `.md` を読み込む（ドラッグ&ドロップ または ファイル選択）
3. 左側で編集し、`保存（上書き）`

> **リポジトリを clone した場合:** `apps/browser/offline-md-editor-viewer.html` を開き、`apps/browser/lib/` はそのままにしてください。ソース版 HTML はこのフォルダのライブラリを読み込むため、`lib/` を削除すると Markdown のレンダリングが動かなくなります。なお、ソース版では About ダイアログの「ライセンス本文を表示」が空になります（ライセンス全文の埋め込みはリリース版のみ）。ライセンスファイルは `LICENSES/` ディレクトリを直接参照してください。

macOS / Linux では当面ブラウザ版をご利用ください。デスクトップアプリは現在 Windows のみビルド対象です。

## Windows デスクトップアプリで使う

[GitHub Releases](https://github.com/ishizakahiroshi/offline-md-editor-viewer/releases) ページに2つの選択肢があります。

1. **`offline-md-editor-viewer.exe`** — 単一ポータブルファイル。すぐ試したい方はこちら。ダウンロードしてそのまま実行できます（インストール不要）。
2. **`offline-md-editor-viewer-desktop-vX.X.X-win-x64-portable.zip`** — README / CHANGELOG / LICENSE / LICENSES/ を同梱。保管や再配布にはこちらを推奨。

exe はポータブルです。インストール不要で、USB メモリからも直接実行できます。デスクトップ版はブラウザ版と同じ単一 HTML を Tauri の WebView で読み込むため、フロントエンドコードは両版で完全に共通です。About ダイアログ → **ライセンス本文を表示** から、Web 依存（marked / DOMPurify / encoding-japanese / Feather Icons）と exe に静的リンクされた Tauri/Rust クレートすべてのライセンス全文を確認できます。

- `offline-md-editor-viewer.exe` をダブルクリックで起動（インストール不要）
- ツールバーからファイルやフォルダを開き、編集・保存します

直近のフォルダパスを覚えているので、ブラウザ版のような再許可プロンプトなしで前回の続きから開けます。設定を引き継ぐ必要がなければ、exe 単体で利用できます。初回起動時に、WebView2 のユーザーデータ保存用として exe と同じ階層へ `offline-md-editor-viewer-userdata/` ディレクトリが自動作成されます。設定も一緒に持ち運びたい場合は、exe と `offline-md-editor-viewer-userdata/` を同じフォルダに入れたまま移動してください。未署名の実行ファイルなので、初回起動時に SmartScreen 警告が出ることがあります。

macOS / Linux 版のデスクトップアプリは将来対応予定です。それまではブラウザ版をご利用ください。

## ブラウザ版とデスクトップ版の違い

レンダリング・編集・プレビューの中核機能は両版とも同じ HTML を共有しているため、**機能差はありません**。違いは環境（OS 連携・ブラウザサンドボックス）に由来します。

| 観点 | ブラウザ版 | デスクトップ版 |
| --- | :---: | :---: |
| 保護フォルダ（Desktop / Documents / Downloads 等）への直接アクセス | | ✓ |
| 再許可プロンプトなしで前回フォルダを復元 | | ✓ |
| 設定の持ち運び（exe と `offline-md-editor-viewer-userdata/` を一緒に移動すると、言語・テーマ等を引き継げる） | | ✓ |
| 単体ファイルを開く/ドロップしたときに親フォルダツリーを表示 | | ✓ |
| 関連付け起動（エクスプローラーで右クリック→「プログラムから開く」） | | ✓ |
| エクスプローラー連携（ファイル一覧タイトルのパスをクリックで開く） | | ✓ |
| フォルダのドラッグ&ドロップ | ✓ | ✓ |
| ツリー内でのファイル/フォルダの作成・名前変更・削除 | ✓（Chrome 標準の File System Access API 利用時） | ✓ |
| ツリー内でのファイル/フォルダのドラッグ&ドロップ移動 | ✓（Chrome 標準の File System Access API 利用時） | ✓ |
| 外部からドラッグ&ドロップしたファイル/フォルダを開いているツリーへコピー | ✓（Chrome 標準の File System Access API 利用時） | ✓ |

## Windows デスクトップアプリのビルド

前提: Node.js、Rust stable、Microsoft C++ Build Tools、Windows の WebView2 Runtime。
Tauri CLI は `npm ci` により `@tauri-apps/cli` としてローカルに入るため、グローバルインストールは不要です。

```powershell
cd apps/desktop
npm ci
npm run dev
npm run build
```

`npm run dev` は Tauri の開発ウィンドウを起動します。`npm run build` は `apps/desktop/src-tauri/target/release/offline-md-editor-viewer.exe` をポータブル実行ファイルとして生成します（インストーラーは作成されません）。

> アプリを利用するだけなら、配布されている `offline-md-editor-viewer.exe` を直接実行してください。上記のビルド手順は、自分のローカル環境でビルドを試したい人向けです。

## 対応ファイル形式

バイナリ形式（画像・コンパイル済みバイナリ・アーカイブ等）以外のファイルであれば、拡張子を問わず開いて編集・保存できます。ファイル形式によってプレビューの有無が変わります。

### Markdown（プレビューあり）

- `.md`, `.markdown`

### その他すべてのテキストファイル（プレビューなし。ソース側のみで表示・編集・保存可）

バイナリでないファイルであれば何でも開けます。例：

- ドキュメント: `.txt`, `.log`, `.rst`, `.adoc`
- ソースコード: `.js`, `.ts`, `.py`, `.go`, `.sh`, `.rb`, `.java`, `.c`, `.cpp` 等
- 設定: `.json`, `.yml`, `.yaml`, `.toml`, `.ini`, `.conf`, `.xml`
- データ: `.csv`, `.tsv`
- DB / 差分: `.sql`, `.diff`, `.patch`
- 環境変数: `.env` および `.env.*`（`.env.local`、`.env.production` など）
- ドットファイル: `.gitignore`, `.gitattributes`, `.editorconfig`, `.dockerignore`, `.npmrc`, `.prettierrc`, `.eslintrc`

Markdown 以外を開いた場合は、右側のプレビュー領域に「このファイル形式のプレビューはありません」と表示されます。左側のソース領域では生テキストをそのまま閲覧・編集できます。

## Sample Files

- Markdown 記法サンプルは `apps/browser/docs/` にあります。
- このリポジトリを `フォルダ` で開き、左側の一覧から `apps/browser/docs/syntax-sample.md` または `apps/browser/docs/syntax-sample.ja.md` を選んでください。

## Folder List

- `フォルダ` を使うと、フォルダと対応テキストファイルを左側のツリーに表示できます。
- ブラウザ版と Windows デスクトップ版のどちらでも階層フォルダを表示し、フォルダ行のクリックで開閉できます。
- ツリー内のファイルやフォルダは、別フォルダへドラッグ&ドロップすると移動できます。ツリーの空白へドロップすると、開いているルートフォルダ直下へ移動します。ブラウザ版では、Chrome 標準の File System Access API で書き込み可能なフォルダを開いている場合に利用できます。読み取り専用の旧式フォルダドロップでは移動できない場合があります。
- フォルダ選択は初回はブラウザ/OSの既定位置から始まり、次回以降は前回選択したフォルダ付近から開きます。
- ブラウザが対応している場合は、フォルダのドラッグ&ドロップでも一覧を表示できます。
- ブラウザ版では Chrome の安全制限により、デスクトップやドキュメントなどの特殊フォルダそのものは開けない場合があります。その場合は `Markdown` のような通常のサブフォルダを作って選択してください。
- Windows デスクトップ版のフォルダ一覧はネイティブのファイルアクセスを使うため、Chrome の保護フォルダ判定には制限されません。
- 単体ファイルをドロップすると、そのファイルを開きます。ブラウザ版では単体ファイルの open/drop から親フォルダ一覧を取得できない場合がありますが、Windows デスクトップ版では親フォルダを左側のツリーに表示します。

## Privacy / Security Notes

- ファイル内容を外部サーバーへ送信することはありません。
- `marked`、`DOMPurify`、`encoding-japanese` はインライン化して同梱しており、`Feather Icons` の SVG アイコンも HTML に埋め込み済みのため、アプリ読み込み時に CDN への通信は発生しません。
- Markdown 内のリモート画像 URL は、ローカル限定の Content Security Policy によりブロックされ、自動読み込みされません。
- Markdown 内の外部リンクは、設定の「外部リンク」を有効にした場合だけブラウザで開きます。

## ダウンロードの検証

各リリースには `SHA256SUMS.txt` が添付されており、リリースノートの **SHA-256 Checksums** セクションにも同じ値が掲載されています。ダウンロードした ZIP を [Releases ページ](https://github.com/ishizakahiroshi/offline-md-editor-viewer/releases) の値と照合してください。

```powershell
Get-FileHash .\offline-md-editor-viewer-desktop-vX.X.X-win-x64-portable.zip -Algorithm SHA256
```

## ローカル設定

毎回設定し直さなくて済むように、一部の設定はブラウザのローカル保存領域に記憶します。記憶される項目は以下の通りです。

- UI 言語（初回はシステム/ブラウザ言語から自動判定、ユーザーが選択するとそれ以降は選択値を優先）
- テーマ（ダーク/ライト）と文字サイズ
- ファイル一覧の並び順、ツール行の表示/非表示
- カード（ファイル一覧 / ソース / プレビュー）の表示/非表示と幅
- 直近に開いたフォルダのハンドル（IndexedDB に保存。次回利用時に再度アクセス許可を求められる場合があります）

これらの値は設定したデバイス・ブラウザプロファイル内にのみ残ります。デバイス間・ブラウザ間で同期されることはありません。サイトデータの削除、シークレット/プライベートウィンドウの利用、ブラウザの切り替えで失われます。

## セルフホスト（任意）

本アプリはオフライン動作を主目的としていますが、リリース ZIP に含まれる単一ファイル `offline-md-editor-viewer.html` を Web サーバーに配置すれば、ブラウザから URL アクセスで利用することもできます。md ファイルをブラウザにドロップして整形プレビューする運用が可能です。

サーバー配信時もアプリのスクリプト自体は外部通信を行わず、ファイルはローカルブラウザ内で完結処理されます（`Content-Security-Policy: connect-src 'none'` で担保）。

## Browser Support

- ブラウザ版の動作確認対象: Google Chrome（最新安定版）
- Chrome では File System Access API が標準で利用できるため、通常は追加設定なしで `保存（上書き）`、フォルダ選択、上書きアクセスを使えます
- その他のブラウザはリリース時の動作確認対象外です。閲覧・編集・プレビューは動作する場合がありますが、ローカル上書き保存やフォルダアクセスは利用できない場合があります。
- Windows デスクトップ版は、Chrome などの通常ブラウザではなく、Chromium ベースの Microsoft Edge WebView2 Runtime 上で動作します。Windows 11 では通常同梱されていますが、環境によっては WebView2 Runtime のインストールが必要です。

## Limitations

- Markdown の解釈は `marked` の仕様に依存します。
- レンダリング結果はエディタ表示と完全一致しない場合があります。
- 左右スクロール同期は比率ベースのため、厳密一致ではありません。
- フォルダ一覧にはブラウザの明示的な許可が必要です。Chrome では標準の File System Access API を使いますが、他ブラウザでは同等のローカルフォルダアクセスが使えない場合があります。
- ブラウザ版では、Desktop、Documents、Downloads など、ブラウザが保護対象または特殊フォルダと判断した場所は、ユーザーが選択しても開けないことがあります。

## License

- このリポジトリ: [MIT](./LICENSE)
- サードパーティ: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
- 同梱ライブラリのライセンス本文: [LICENSES](./LICENSES)
- MITライセンスの範囲で、商用利用・改変・再配布を含め自由に利用できます。

## Disclaimer

本ソフトウェアは MIT License に基づき、無保証で提供されます。利用により発生した損害について、作者およびコントリビューターは責任を負いません。

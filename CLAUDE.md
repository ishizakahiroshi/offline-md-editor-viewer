# CLAUDE.md comit

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

ブラウザ版はビルドツール・パッケージマネージャ不使用のHTMLアプリ。`apps/browser/` ディレクトリをそのままブラウザで開くだけで動作する（ビルド不要）。デスクトップ版は `apps/desktop/` の Tauri プロジェクトで、同じHTMLをWebViewで読み込む。

## サーバー配信について（例外運用）

本アプリはオフライン動作を主思想とするが、リリース ZIP に含まれる単一 HTML `offline-md-editor-viewer.html` を Web サーバーへ配置することも可能（例外運用）。`<meta http-equiv="Content-Security-Policy">` で `connect-src 'none'` を強制し、サーバー配信下でも外部通信ゼロを担保する。

オフラインファースト思想自体は維持しており、サーバー配信は「上げても動く」という事実を許容する位置づけ。実例 URL と具体的なデプロイ手順は `docs/local/manual_deploy-sakuravps.md`（git 管理外）を参照。

## アーキテクチャ

### ファイル構成

- `apps/browser/offline-md-editor-viewer.html` — アプリ本体。HTML/CSS/JSがすべて1ファイルに収まっている
- `apps/browser/lib/marked.min.js` — Markdownパーサー（v15.0.12、ローカル同梱）
- `apps/browser/lib/purify.min.js` — XSSサニタイザー（DOMPurify v3.4.1、ローカル同梱）
- `apps/browser/lib/encoding.min.js` — 文字コード変換ライブラリ（encoding-japanese v2.2.0、ローカル同梱）
- `apps/browser/docs/syntax-sample.md` / `apps/browser/docs/syntax-sample.ja.md` — Markdown記法サンプル
- `apps/desktop/` — Windowsデスクトップ版の Tauri プロジェクト。`src-tauri/tauri.conf.json` の `build.frontendDist` は `../../browser` を参照し、既存HTMLをWebViewで読み込む

### 主要な設計ポイント

**ライブラリ**：CDNは使用しない。`marked`、`DOMPurify`、`encoding-japanese` は `apps/browser/lib/` に同梱済み。バージョンアップはセキュリティパッチ等のタイミングで手動で差し替える。

**レンダリングパイプライン**：`marked.parse()` → `DOMPurify.sanitize()` → `preview.innerHTML` の順。`marked.use()` による設定変更はしていない（デフォルト値 `gfm: true, breaks: false` をそのまま使用）。

**多言語対応**：`i18n` オブジェクト（`en`/`ja`）にすべてのUI文字列を集約。`currentLang` 変数で切り替え、`t(group, key)` 関数で参照する。

**環境判定**：HTML側で `window.__TAURI__` と `@tauri-apps/api/core` の `invoke` 有無から `isTauri` を判定する。Tauri環境では Rust 側の app-owned invoke command を使い、ブラウザ環境では File System Access API を使う。

**保存機能**：ブラウザ版は File System Access API（`window.showOpenFilePicker`）が使えるChrome限定。Tauri版は `desktop_open_file_dialog` / `desktop_save_file_dialog` / `desktop_write_file_text` などの invoke command へ分岐する。非対応ブラウザでも閲覧・編集・プレビューは動作する。

**フォルダツリー表示**：`directoryFiles` は `{ kind: "dir" | "file", ... }` のツリーノード配列として保持し、検索・rename/delete などの周辺処理では `flattenTreeFiles()` でファイルノードを抽出する。フォルダ開閉状態は `expandedDirs`（pathキーの `Set`）で管理し、File System Access / webkitGetAsEntry / Tauri の収集結果を同じツリー構造に揃える。

**単体ファイル drop / open 時の親フォルダ展開**：Web 版は File System Access API の制約により、単体ファイルの `showOpenFilePicker` / drop からは親 `FileSystemDirectoryHandle` を取得できないため、左側フォルダツリーは描画しない（仕様。バグではない）。Tauri 版は `src-tauri/src/lib.rs` の `DragDropEvent::Drop` で絶対パスを受け取り、Rust 側で親ディレクトリを列挙して同じツリー構造に整える。ユーザー向け説明は `README.md` / `README.ja.md` の Drag & drop 節に同期済み。

**スクロール同期**：左右パネルのスクロール比率を合わせる簡易実装。`syncingScroll` フラグで無限ループを防止。

**ローカル設定の永続化**：UI設定は `localStorage`、フォルダハンドルのみ IndexedDB に保存する。キーはすべて `offline_md_editor_viewer_` プレフィックス。ユーザー向けの説明は `README.md` / `README.ja.md` の `Local Settings` / `ローカル設定` 節を参照。

| キー（定数名） | localStorage キー | 用途 |
|---------------|-------------------|------|
| `STORAGE_LANG_KEY` | `offline_md_editor_viewer_lang` | UI言語コード（未保存時は `navigator.languages` から `i18n[*].meta.bcp47Match` で判定し、未マッチなら `en`） |
| `STORAGE_THEME_KEY` | `offline_md_editor_viewer_theme` | テーマ（`dark`/`light`） |
| `STORAGE_FONT_SCALE_KEY` | `offline_md_editor_viewer_font_scale` | 文字サイズ（`FONT_SCALE_OPTIONS` のキー） |
| `STORAGE_FILE_SORT_KEY` | `offline_md_editor_viewer_file_sort` | ファイル一覧の並び順 |
| `STORAGE_FILE_TOOLS_VISIBLE_KEY` | `offline_md_editor_viewer_file_tools_visible` | ファイルツール行の表示/非表示（`"true"`/`"false"`） |
| `STORAGE_CARD_VISIBILITY_KEY` | `offline_md_editor_viewer_card_visibility` | 各カード（fileList/source/preview）の表示/非表示（JSON） |
| `STORAGE_CARD_WIDTH_KEY` | `offline_md_editor_viewer_card_width` | 各カード幅（JSON） |
| `STORAGE_LAST_DIRECTORY_TAURI_KEY` | `offline_md_editor_viewer_last_directory_tauri_path` | Tauri 環境の直近選択フォルダ（絶対パス文字列）。旧キー `lastDirectory_tauri_path` は読み取り時に自動移行する |

IndexedDB（`DIRECTORY_DB_NAME = "offline_md_editor_viewer_directory"` / store `handles` / key `lastDirectory`）には、直近に選択したフォルダの `FileSystemDirectoryHandle` を保存する。次回利用時にハンドルからアクセス許可を再要求するため、permission state は別途 `requestPermission()` で確認する。

Tauri環境では直近フォルダを絶対パス文字列として `localStorage`（`STORAGE_LAST_DIRECTORY_TAURI_KEY`）に保存し、Chrome の保護フォルダ判定や IndexedDB のハンドル再許可には依存しない。

## デスクトップ版ビルド

スコープは Windows 限定。macOS / Linux のデスクトップ配布は将来対応で、現時点ではブラウザ版を使う。

前提：Node.js、Rust stable、Microsoft C++ Build Tools、Windows WebView2 Runtime。

```powershell
cd apps/desktop
npm ci
npm run dev
npm run build
```

`npm run dev` は `cargo tauri dev` 相当で開発ウィンドウを起動する。`npm run build` は `cargo tauri build` 相当で、`apps/desktop/src-tauri/target/release/offline-md-editor-viewer.exe` をポータブル実行ファイルとして生成する（`tauri.conf.json` の `bundle.active = false` によりインストーラ生成は抑止）。

WebView2 のユーザーデータは Rust 側 `configure_portable_userdata()` が exe と同階層の `offline-md-editor-viewer-userdata/` ディレクトリへ強制する（`WEBVIEW2_USER_DATA_FOLDER` 環境変数を設定）。exe 配置先が書き込み不可の場合は環境変数を設定せず、Tauri 既定の `%LOCALAPPDATA%\<identifier>\` にフォールバックする。これにより exe と `offline-md-editor-viewer-userdata/` を一緒に別 PC・USB へ移動すると設定が引き継がれる。

## バージョン管理ルール

- バージョン表記箇所: `CHANGELOG.md`、`apps/browser/offline-md-editor-viewer.html` の `APP_VERSION`、`apps/desktop/package.json`、`apps/desktop/package-lock.json`、`apps/desktop/src-tauri/Cargo.toml`、`apps/desktop/src-tauri/Cargo.lock`
- セマンティックバージョニング（`0.x.x` は安定版前）

### Tauri バージョンの二重管理

Tauri のバージョン文字列は `apps/desktop/src-tauri/Cargo.toml` が source of truth だが、About ダイアログ表示用に `apps/browser/offline-md-editor-viewer.html` にもハードコードされている。Tauri を上げたら必ず両方を同期すること。

| 編集箇所 | 対応する更新先 |
|---------|--------------|
| `apps/desktop/src-tauri/Cargo.toml` の `tauri = { version = "X.Y.Z" }` | HTML 内 `<span class="about-license-name">Tauri X.Y.Z</span>` と `aria-label` の `Tauri X.Y.Z` の2箇所 |

`grep -n "Tauri " apps/browser/offline-md-editor-viewer.html` で確認すれば該当行が出る。Cargo.lock に書かれた resolved バージョンと一致させる。

## README の二重管理ルール

`README.md` / `README.ja.md` の内容は、`apps/browser/offline-md-editor-viewer.html` 内の定数 `README_EN` / `README_JA` にも埋め込まれている（アプリ内「使い方」ダイアログ用）。

**どちらか一方を更新したら、必ずもう一方も同じ内容に合わせること。文言修正だけでなく、セクション追加・削除・順序変更などの構造変更時は、英語版（`README.md` / `README_EN`）と日本語版（`README.ja.md` / `README_JA`）の4箇所すべてを同時に揃えること。** 片方の言語だけ修正すると言語間でセクション構成がずれて、後で再同期が必要になる。

| 編集箇所 | 対応する更新先（同時に揃える） |
|---------|--------------|
| `README.md` | `README_EN`（HTML内定数）／ 構造変更なら `README.ja.md` と `README_JA` も |
| `README.ja.md` | `README_JA`（HTML内定数）／ 構造変更なら `README.md` と `README_EN` も |
| `README_EN`（HTML内定数） | `README.md` ／ 構造変更なら `README.ja.md` と `README_JA` も |
| `README_JA`（HTML内定数） | `README.ja.md` ／ 構造変更なら `README.md` と `README_EN` も |

なお、HTML内定数ではバッジ画像（shields.io）・相互言語リンク行・mermaid図・外部リンク URL は除外している（オフライン表示のため）。それ以外の本文・セクション順序は4箇所すべてで同期を保つこと。

## リリース運用

`v0.1.0` のようなバージョンタグを push すると、GitHub Actions（`.github/workflows/release.yml`）が Release を自動作成し、ブラウザ版 ZIP と Windows デスクトップ版ポータブル ZIP（`offline-md-editor-viewer-desktop-<tag>-win-x64-portable.zip`）を添付する。
詳細なリリース手順やブランチ運用が必要な場合は `docs/local/manual_release.md` を参照すること。

Release notes には、アプリ概要、Downloads、GitHub 自動生成ノート、SHA-256 Checksums が自動で入る。既存 Release へ再実行する場合も assets は `--clobber` で更新し、SHA-256 Checksums セクションは差し替える。

タグ push は、必ず release commit と `.github/workflows/release.yml` が `origin/main` に反映された後に行う。タグを先に push すると、GitHub 側に workflow が存在せず Release が作成されないことがある。

```bash
git push origin main
git tag v0.1.0
git push origin v0.1.0
```

タグ push 後は Actions 起動と Release 作成を確認する。

```bash
gh run list --repo ishizakahiroshi/offline-md-editor-viewer --workflow Release --limit 5
gh release view v0.1.0 --repo ishizakahiroshi/offline-md-editor-viewer
```

タグだけ push 済みで Release が作成されなかった場合は、workflow が `origin/main` に存在することを確認してから remote tag を削除し、同じタグを push し直す。

### リリース前のローカル確認（ブラウザ単一HTML）

タグ push 前に、CI が生成するのと同一内容の単一 HTML をローカルで生成して動作確認できる。

```powershell
.\scripts\release\build-browser-single-html.ps1 -Clean -Verify
```

- 出力: `dist/browser/offline-md-editor-viewer.html`（`apps/browser/lib/*.js` をインライン化、`LICENSE` / `LICENSES/` 配下のライセンス本文を placeholder に埋め込み済み）
- **動作チェック対象:** 必ず `dist/browser/offline-md-editor-viewer.html` を使う（正式版）。`apps/browser/offline-md-editor-viewer.html` はソース版のため、最終確認対象にしない
- `-Verify` は placeholder 未置換、`<script src=` 残り、ライセンス文言の存在を機械チェック
- 改行は LF 正規化されるため、Windows / Linux いずれで生成しても CI 成果物と SHA-256 が一致する
- 配布 ZIP まで作る場合は `-Package -Version v0.1.0` を追加（`dist/offline-md-editor-viewer-browser-v0.1.0.zip` も生成）
- 目視確認のポイント: アプリ起動 → About →「ライセンス本文を表示」で MIT / Apache 等の本文が埋まっていること（ソース版の `apps/browser/offline-md-editor-viewer.html` 直開きでは空になる）

### リリース前の最終確認（Web / Desktop 配布物）

Web / Desktop 両方の配布候補をローカルでまとめて作る場合は、次の PowerShell スクリプトを使う。

```powershell
.\scripts\release\build-final-dist.ps1
```

バージョンを明示する場合:

```powershell
.\scripts\release\build-final-dist.ps1 v0.1.0
```

- 出力先: `dist/release-assets/`
- 生成物: `offline-md-editor-viewer.html`、`offline-md-editor-viewer.exe`、ブラウザ版 ZIP、Windows デスクトップ版ポータブル ZIP、`SHA256SUMS.txt`
- 内部処理: ブラウザ単一 HTML 生成・検証、Desktop 用 frontend stage、Tauri release build、Desktop ZIP 作成、SHA-256 生成、Desktop ZIP 内 exe と単体 exe のハッシュ一致検証
- `build-final-dist.ps1` は PowerShell 単体で完結する（bash / cygpath 非依存）。
- 既存の `dist/offline-md-editor-viewer-desktop-*-win-x64-portable/` は手動確認で `offline-md-editor-viewer-userdata/` が作られロックされることがあるため、このスクリプトは作業用ステージに `dist/.build-final-dist/` を使う

## コーディング規約

- **文字コード:** UTF-8
- **インデント:** スペース2文字（既存 `apps/browser/offline-md-editor-viewer.html` に合わせる）
- **ファイル名:** ケバブケース or スネークケース（例: `offline-md-editor-viewer.html`, `syntax-sample.md`）
- **プログラム内識別子:** 言語慣習に従う（JS: キャメルケース、CSSクラス: ケバブケース、定数: アッパースネークケース）

## plan_*.md 作成ルール（必須）

`plan_*.md` を新規作成するとき、**H1直下（最終更新日時の次）に必ず `## context配分` セクションを置く**。

- context番号は `C1`, `C2`, `C3`... の連番（`C2a` 等の細分化禁止）
- context番号は実行順を表す。依存関係がある場合は、先に実施する作業ほど若い番号にする
- 並列実行可能なcontextは `[並列OK]` を明示
- `[並列OK]` は同時着手できる補足であり、C番号の実行順を崩す意味ではない
- 1Context終わらない場合は、親子関係を作成してContext、トークン消費を抑える設計にする
- 親 `plan_*.md` から各contextの子 `plan_*.md` へ分割してよい
- 親 plan は context配分・スケジュール・概要までに留める
- 子 plan は subagent が作業できるように細かい作業指示を書き込むこと
- 親子関係は1階層まで。子計画からさらに孫mdを作らない
- 子計画のファイル名は親計画を作成した年月日時分秒と親計画番号を入れる
  - 例: `plan_<親topic>_c1_overview.md`
- 子計画のファイル名・H1・context番号は、親のcontext番号と対応させる
- 親計画の「実行順序」には `C1 → C2 → (C3, C4) → C5` のように矢印で順番を明示し、並列OKのcontextは括弧に入れる
- 「Step 1 / Step 2」等の表記は使わない。必ず C番号で管理する
- **contextの種別は `plan` / `fix` の2値のみ。`verify` `survey` `audit` 等の規約外種別は使わない**
- **context完了時は `## context配分` 表の該当行を `plan` → `fix` に更新する。「実行結果」セクションへの完了記述だけでは不足**
- **親 plan 1つを指示すれば走り切ることが目標。** ユーザー確認待ちを挟まず C 単位で進める（C 完了 → 次 C 自動進行）
- plan に書かれている作業は「ユーザー承認済み」とみなす。permission prompt が出ても止めず、plan 内記載と一致する操作なら許可して続行する
- Context・トークン消費を抑えるため、調査・確認の重複を避ける（同じファイルを複数回 Read しない、grep 結果を再取得しない）
- 停止条件は次の3つのみ：
  1. plan 記載と矛盾する破壊的変更が必要になった
  2. 外部依存の致命的障害（ビルド不能、Tauri ビルド環境の致命的破損など plan 内で解決不能）
  3. 重大なリリース済み版への退行リスク（既にタグ付けして配布済みのバージョンと挙動が大きく変わる懸念）
- 上記以外（軽微な迷い・選択肢の優劣判断・命名揺れ等）は plan 記載 or 既存実装に倣って自走する。確認に倒さない
- 各 C 完了時の報告は最小化し、`fix:完了/plan:未完了`・`変更ファイル一覧`・`検証結果1行` の3点のみ返す

### plan 実行時の subagent 委託（標準運用）

1指示で plan 全体を走り切りつつメイン context のトークン消費を抑えるため、各 C は subagent に委託する：

- 親セッションは親 plan の `## context配分` 表のみ把握し、C 単位で subagent を起動する
- subagent には「親plan path・担当C番号・子plan path（あれば）」を渡し、`完了/未完了`・`変更ファイル一覧`・`検証結果1行` のみ返させる
- subagent 内での調査ログ・思考過程はメイン context に返さない（親 context 節約のため）
- subagent は plan 記載の操作を確認なしで実行する。停止条件は本ルール記載の3項目のみ
- 並列 OK な C（実行順序の括弧内）は1メッセージで複数 Agent を同時起動する
- C 完了ごとに親 plan の `context配分` 表を `plan` → `fix` に更新するのは subagent 側の責務
- subagent 種別: 実装は `general-purpose`、設計検討が必要なら `Plan`、軽い調査は haiku の subagent を使い分ける
- subagent → 親への内部報告は上記の軽量3点（`完了/未完了`・`変更ファイル一覧`・`検証結果1行`）。一方、**親 → ユーザーへの最終報告**はグローバル `~/.claude/CLAUDE.md` の「ターン終端の出力ルール」（変更ファイル／稼働モデル／次のアクション）に従う

## docs/.md 編集ルール（必須）

`docs/` 配下の `.md` を新規作成・更新するとき、H1見出しの直後に必ず最終更新日時を記載する。

```
> 最終更新: YYYY-MM-DD(曜) HH:MM:SS
```

記入直前に PowerShell で日時を取得してそのまま使う：

```powershell
$d = Get-Date; "{0}({1}) {2}" -f $d.ToString("yyyy-MM-dd"), "日月火水木金土"[$d.DayOfWeek.value__], $d.ToString("HH:mm:ss")
```

# offline-md-editor-viewer の製品・配布ルール

> 最終更新: 2026-08-19(水) 20:37:18

`CLAUDE.md` から降格した、ブラウザ版・Tauri 版・配布物で共有する規約の正本。実装の詳細はコードと CI の検査へ委ね、ここでは判断の境界だけを固定する。

## 製品と配信

- ブラウザ版は `apps/browser/` の単一 HTML をビルドツールなしで開く。デスクトップ版は同じ HTML を `apps/desktop/` の Tauri WebView で読む。
- オフライン動作が主思想。例外として単一 HTML を Web サーバーへ置けるが、CSP の `connect-src 'none'` で外部通信ゼロを維持する。具体的な作者環境の手順は git 管理外の manual を参照する。
- CDN は使わず、marked / DOMPurify / encoding-japanese / highlight.js は `apps/browser/lib/` に同梱する。

## Browser / Tauri runtime safety

- Browser の全量ファイル読み込みは Desktop と同じ 64 MiB 上限を、`arrayBuffer()` より前に検査する。
- Browser の `localStorage` 操作は `safeLocalStorageGet` / `safeLocalStorageSet` / `safeLocalStorageRemove` 経由に限定し、既存のキー接頭辞・JSON 形式を変えない。
- ファイル・フォルダ機能の変更は Browser / Tauri の backend、state、context menu、keyboard shortcut、README 英日、HTML 内蔵英日を一組で確認する。
- この領域を変更したら `node scripts/ci/check-browser-runtime-safety.mjs` を更新・実行する。

## Desktop

- デスクトップ配布は Windows 限定。前提は Node.js、Rust stable、Microsoft C++ Build Tools、WebView2 Runtime。
- `apps/desktop/src-tauri/tauri.conf.json` は tracked browser HTML を参照する。portable userdata の配置と書き込み不可時の fallback は `apps/desktop/src-tauri/src/lib.rs` を正本とする。
- Store 版は Windows 11 以降の MSIX、GitHub Releases の portable exe / ZIP は Windows 10・USB 運用の受け皿。npm はブラウザ版ランチャーだけを配布する。

## バージョンと README 同期

- Tauri の source of truth は `apps/desktop/src-tauri/Cargo.toml`。About 表示の HTML と `Cargo.lock` の整合を確認する。
- `README.md` / `README.ja.md` と HTML 内の `README_EN` / `README_JA` は同時に同期する。セキュリティ・プライバシー節もアプリ内 README と揃える。
- 版の表記箇所は `CHANGELOG*`、browser HTML、desktop package / Cargo files。更新後は `scripts/ci/check-consistency.ps1` を実行する。

## Release

- タグ push 前に `main` へ release commit と workflow が反映済みであることを確認する。tag push 後は Actions と GitHub Release の作成を確認する。
- GitHub Releases は browser ZIP / single HTML / desktop portable ZIP / exe を正本として生成し、npm はその browser 配布物を使う。Store 提出は `msstore-publish.yml` の workflow_dispatch として分離する。
- 最終配布物は `scripts/release/build-browser-single-html.ps1` / `build-final-dist.ps1` で生成・検証し、standalone と ZIP 内成果物の SHA-256 を照合する。
- 詳細手順・Store 初回提出・作者環境の deploy は `docs/local/manual/` と `docs/local/archive/`（git 管理外）に置く。公開ファイルへ秘密や作者固有の URL / パスを写さない。

## コード・作業文書

- 文字コードは UTF-8、インデントはスペース 2 文字。識別子とファイル名は既存の命名慣習に合わせる。
- AI 共通規約、build / commit の禁止、plan の停止条件は各 AI の global settings を正本とする。repo 固有の plan 追加条件は `docs/local/` に記録する。
- `docs/` の公開 Markdown を変更するときは、H1 直後に `> 最終更新: YYYY-MM-DD(曜) HH:MM:SS` を記載する。

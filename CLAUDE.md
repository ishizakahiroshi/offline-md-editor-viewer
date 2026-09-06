# offline-md-editor-viewer 開発ガイド

> このファイルは常時ロードする入口と正典索引。詳細本文は [`docs/reference_offline-md-editor-viewer-operating-rules.md`](docs/reference_offline-md-editor-viewer-operating-rules.md)、コード、CI、作者環境の manual で管理する。

## プロジェクト概要

- ブラウザ版は `apps/browser/` の単一 HTML、デスクトップ版は同じ HTML を Tauri WebView で読む Windows アプリ。
- ビルド不要のオフライン動作が主思想。配信例外、runtime safety、ライブラリの同梱方針は [`docs/reference_offline-md-editor-viewer-operating-rules.md`](docs/reference_offline-md-editor-viewer-operating-rules.md) を読む。
- ユーザー向け仕様と使い方は [`README.md`](README.md) / [`README.ja.md`](README.ja.md) に同期する。

## アーキテクチャの正本

| 領域 | 正本 / 強制層 |
|---|---|
| 単一 HTML と同梱ライブラリ | `apps/browser/offline-md-editor-viewer.html`、`apps/browser/lib/` |
| Browser / Tauri 分岐 | `window.__TAURI__` 判定、`apps/desktop/src-tauri/src/lib.rs` |
| Markdown pipeline | marked → DOMPurify → `preview.innerHTML` |
| runtime safety | `scripts/ci/check-browser-runtime-safety.mjs` |
| browser HTML 検査 | `scripts/ci/check-html-inline-js.mjs`、`scripts/release/build-browser-single-html.ps1` |
| desktop | `apps/desktop/src-tauri/tauri.conf.json` / `tauri.release.conf.json` |

ファイル・フォルダ機能の変更は Browser / Tauri の両実装、state、context menu、keyboard shortcut、README 英日、HTML 内蔵英日を一組で確認する。単一 backend の修正だけで対応済みとしない。

## サーバー配信の例外

単一 HTML を Web サーバーへ置くことは許容するが、CSP の `connect-src 'none'` で外部通信ゼロを維持する。作者環境固有の URL・手順は git 管理外の `docs/local/manual/` に置き、公開ファイルへ移さない。

## Desktop ビルド

- Windows 限定。前提は Node.js、Rust stable、Microsoft C++ Build Tools、WebView2 Runtime。
- `cd apps/desktop; npm ci; npm run dev; npm run build`。portable userdata の配置は `src-tauri/src/lib.rs` を正本とする。
- Store 版は Windows 11 以降の MSIX、GitHub Releases の portable exe / ZIP は Windows 10・USB 運用の受け皿。npm は browser launcher のみ。

## バージョンと README 同期

- Tauri の source of truth は `apps/desktop/src-tauri/Cargo.toml`。About 表示 HTML と `Cargo.lock` を同時に確認する。
- `README.md` / `README.ja.md` と HTML 内の `README_EN` / `README_JA` は常に同時更新する。Security / Privacy 節も含める。
- version 表記は `CHANGELOG*`、browser HTML、desktop package / Cargo files。変更後は `scripts/ci/check-consistency.ps1` を実行する。

## リリース運用

- タグを push する前に release commit と `.github/workflows/release.yml` が `origin/main` に反映済みであることを確認する。タグ後は Actions と Release 作成を確認する。
- GitHub Releases は browser ZIP / single HTML / desktop portable ZIP / exe、npm は browser 配布物、Microsoft Store は `msstore-publish.yml` の workflow_dispatch という分離を保つ。
- 配布物は `scripts/release/build-browser-single-html.ps1` / `build-final-dist.ps1` で生成・検証し、standalone と ZIP 内成果物の SHA-256 を照合する。
- 詳細手順・Store 初回提出・作者環境の手動操作は `docs/local/manual/` と `docs/local/archive/`（git 管理外）を読む。

## コーディング規約

文字コードは UTF-8、インデントはスペース 2 文字。ファイル名はケバブケース / スネークケース、JS 識別子は camelCase、CSS クラスは kebab-case、定数は UPPER_SNAKE_CASE とする。

## AI 作業共通ルール

build・commit 禁止、secrets-scan 責務、plan / bugfix / pending の共通規約は各 AI の global settings を正本とする。このファイルへ再掲しない。

## plan と docs

- repo 固有の plan 追加条件は `docs/local/` に記録する。停止条件と Tauri build 環境の致命的破損、既配布版への退行リスクを明記する。
- `docs/` の公開 Markdown を変更するときは、H1 直後に `> 最終更新: YYYY-MM-DD(曜) HH:MM:SS` を記載する。
- 製品・配布・runtime の詳細は [`docs/reference_offline-md-editor-viewer-operating-rules.md`](docs/reference_offline-md-editor-viewer-operating-rules.md) に集約し、ここへ本文を戻さない。

## 文書変更時の検査

```text
node scripts/check-claude-md.mjs
```

行数・節長・正本リンクを検査する。予算を上げる前に詳細本文を正本側へ降格する。

# Offline MD Editor & Viewer (npm launcher)

Opens the fully offline, single-file Markdown editor/viewer in your default browser with one command. No network access, no install steps, no build tools.

This npm package is a **launcher**: it bundles the released single HTML file and simply opens it. The app itself (browser version and Windows desktop version) is distributed via GitHub Releases.

## Usage

Try it (one-shot):

```bash
npx offline-md-editor-viewer
```

Install globally (regular use):

```bash
npm i -g offline-md-editor-viewer
offline-md-editor-viewer
```

Options:

```bash
offline-md-editor-viewer --path     # print the bundled HTML path (does not open a browser)
offline-md-editor-viewer --help
offline-md-editor-viewer --version
```

Requires Node.js 18+.

## What opens

The **browser version** of Offline MD Editor & Viewer: a single HTML file that runs entirely offline (Content-Security-Policy enforces zero external connections). Editing, live preview, folder tree, and file saving (Chrome, via the File System Access API) all work locally.

- App repository / documentation: https://github.com/ishizakahiroshi/offline-md-editor-viewer
- Downloads (browser ZIP / Windows desktop portable): https://github.com/ishizakahiroshi/offline-md-editor-viewer/releases

## 日本語

`npx offline-md-editor-viewer` の 1 コマンドで、完全オフライン動作の単一 HTML 版 Markdown エディタ／ビューアを既定ブラウザで開きます。この npm パッケージは起動ランチャーであり、アプリ本体の配布正本は GitHub Releases です。

- お試し: `npx offline-md-editor-viewer`
- 常用: `npm i -g offline-md-editor-viewer`
- `--path` で同梱 HTML のパス表示のみ（ブラウザは開きません）
- Node.js 18 以上が必要です
- アプリ本体・Windows デスクトップ版: https://github.com/ishizakahiroshi/offline-md-editor-viewer/releases

## License

MIT

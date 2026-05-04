# Third-Party Notices

This project bundles the following open source software.

Both the **source tree** (`apps/browser/lib/*.js`) and the **browser release single HTML**
(`offline-md-editor-viewer.html` in the browser release ZIP) include these libraries.
The Windows desktop version uses the same source HTML via Tauri WebView, so it is
covered by the source tree entries below.

The Windows desktop release also statically links Tauri and Rust crate
dependencies into `offline-md-editor-viewer.exe`. Their generated notices and
full license texts are included in `LICENSES/desktop-third-party.txt`, generated
from `apps/desktop/src-tauri/Cargo.lock` with `cargo-about`. The standalone exe
and release single HTML expose the same texts from the About dialog.

## marked

- Project: https://github.com/markedjs/marked
- Version: 15.0.12
- License: MIT License
- Usage: Converts Markdown to HTML
- Source bundle: `apps/browser/lib/marked.min.js`
- Browser release: inlined into `offline-md-editor-viewer.html` (browser release ZIP)
- License text: `LICENSES/marked-LICENSE.md`

## DOMPurify

- Project: https://github.com/cure53/DOMPurify
- Version: 3.4.1
- License: Apache License 2.0 or Mozilla Public License 2.0
- Usage: Sanitizes rendered HTML
- Source bundle: `apps/browser/lib/purify.min.js`
- Browser release: inlined into `offline-md-editor-viewer.html` (browser release ZIP)
- License text: `LICENSES/DOMPurify-LICENSE.txt`

## encoding-japanese (encoding.js)

- Project: https://github.com/polygonplanet/encoding.js
- Version: 2.2.0
- License: MIT License
- Usage: Detect/convert non-UTF-8 (Shift_JIS, EUC-JP, etc.) when loading and saving text files
- Source bundle: `apps/browser/lib/encoding.min.js`
- Browser release: inlined into `offline-md-editor-viewer.html` (browser release ZIP)
- License text: `LICENSES/encoding-japanese-LICENSE.txt`

The license headers in the bundled library files are retained.

## Feather Icons

- Project: https://github.com/feathericons/feather
- License: MIT License
- Usage: Toolbar, menu, close, file-list, theme, and other UI SVG icons embedded in `apps/browser/offline-md-editor-viewer.html`. Some icons are modified or combined from Feather Icons for this app (for example the Save As icon combines Feather-style save and edit shapes).
- Source bundle: inline SVG paths in `apps/browser/offline-md-editor-viewer.html`
- Browser release: inline SVG paths in `offline-md-editor-viewer.html` (browser release ZIP)
- License text: `LICENSES/feather-LICENSE.txt`

## Windows Desktop Dependencies

- Scope: Tauri and Rust crates linked into the Windows desktop executable
- Source lockfile: `apps/desktop/src-tauri/Cargo.lock`
- Generated notices and license texts: `LICENSES/desktop-third-party.txt`
- Generator: `cargo-about` via `scripts/local/gen-desktop-licenses.ps1`

## Project Artwork and Icons

- App icon artwork (`apps/browser/img/icon.svg`, the favicon SVG in `apps/browser/offline-md-editor-viewer.html`, and generated desktop icon files under `apps/desktop/src-tauri/icons/`) is custom artwork created for this project with AI assistance from ChatGPT.

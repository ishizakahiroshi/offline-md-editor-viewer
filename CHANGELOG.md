# Changelog

## 0.1.0 - 2026-05-04

### Added

- Initial public release
- Floating find/replace bar in edit mode with next/previous navigation, case-sensitive / whole-word / regex search, single replacement, and replace-all.
- External links setting. `http` / `https` links are blocked by default and open in the browser only after the setting is enabled.
- Local-first Markdown editor and viewer that works fully offline
- Browser edition distributed as a single self-contained HTML file (libraries bundled inline), without any build step
- Windows desktop edition distributed as a portable ZIP (no installer)
- Side-by-side editor and live preview with synchronized scrolling
- Open files and folders, with the last folder remembered between sessions
- 13-language UI with dark / light themes
- Folder list shows nested folders as an expandable tree in both browser and Windows desktop editions
- Windows desktop edition can open a Markdown file passed as a CLI argument, enabling Explorer's "Open with" menu to launch the app with a specific file
- Windows desktop edition supports folder drag & drop: dropping a folder onto the app window opens its file tree, and dropping a single file opens that file
- Release assets are distributed as four files: standalone `offline-md-editor-viewer.html`, standalone `offline-md-editor-viewer.exe`, browser ZIP, and Windows desktop portable ZIP. SHA-256 checksums are published for all four assets, and CI verifies that the HTML inside the browser ZIP matches the standalone HTML and that the exe inside the desktop ZIP matches the standalone exe.
- About dialog exposes a "Show full license texts" link that reveals the application MIT license, the bundled web dependency licenses (marked, DOMPurify, encoding-japanese, Feather Icons), and — in the Windows desktop edition — every Tauri / Rust crate license statically linked into the exe. Desktop-side license texts are generated from `Cargo.lock` via `cargo-about`.
- Windows desktop release builds embed the same single HTML used by the browser release (via a staging directory and `apps/desktop/src-tauri/tauri.release.conf.json`), keeping both editions byte-identical at the frontend layer.

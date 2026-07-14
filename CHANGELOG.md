# Changelog

## Unreleased

## 0.3.0 - 2026-07-14

### Added

- Command palette (`Ctrl/Cmd+K` or `Ctrl/Cmd+Shift+P`) that runs most editor actions from the keyboard.
- Heading outline panel for jumping between Markdown headings.
- Zen mode for distraction-free editing (exit with `Esc`).
- Diff view showing unsaved changes against the last saved content.
- Recent files list with a one-click clear option.
- Status-bar text metrics: character count, word count, estimated reading time, and selected-character count.
- Current document bar in the toolbar showing the open file name, with one-click copy.

### Fixed

- Robustness fixes from the July 2026 code audit: the Windows desktop edition no longer flattens the parent folder tree when launched with (or receiving a drop of) a single file; concurrent file loads can no longer finish out of order and display stale content; rejected binary files no longer update the file selection state; creating a file in the browser edition no longer truncates a same-named file created concurrently; a folder copy that fails midway in the browser edition now cleans up the partially copied files; folder copies on the desktop edition exclude Windows junctions/reparse points; short UTF-16 files without a BOM are now detected correctly.
- Partial failures while deleting multiple selected items are now reported with deleted/failed counts instead of being masked by the last success message.
- Deleting the currently open file now also clears the current document name display.
- The "external links blocked" notice is now translated in all 13 UI languages (previously Japanese/English only).

### Changed

- Updated bundled web dependencies: DOMPurify 3.4.12 (fixes two published advisories in 3.4.8 that were not reachable in this app, which uses a single `sanitize()` call without `setConfig()`/hooks) and marked 18.0.6.
- Hardened the desktop edition Content Security Policy (added `script-src-attr 'none'`, `worker-src 'none'`, `child-src 'none'`, and related directives).

## 0.2.0 - 2026-07-03

### Added

- npm distribution of the browser edition: `npx offline-md-editor-viewer` (or `npm i -g offline-md-editor-viewer`, Node.js 18+) opens the bundled single-HTML browser edition in the default browser. The npm package is a launcher only; GitHub Releases remains the canonical distribution.

### Fixed

- Robustness fixes from the June 2026 security/quality audits: atomic file creation on the desktop edition (no longer truncates a same-named file created concurrently), fail-closed large-file guard, consistent junction/reparse-point exclusion between deep and shallow folder listings, clearer error reporting for cross-volume moves, and search/replace and encoding-status edge cases in the browser edition.
- Folder tree expansion on the desktop edition no longer fails entirely when a single entry in the folder is inaccessible; the affected entry is skipped instead.

### Changed

- Removed an unused internal desktop command (dead code) to reduce the exposed command surface.

## 0.1.1 - 2026-06-05

### Added

- Markdown preview code blocks are syntax-highlighted with highlight.js 11.11.1 using the bundled GitHub Dark theme.
- Demo video, screenshots, and sample Markdown files were added to make browser and desktop behavior easier to verify before release.
- Windows desktop app now starts maximized.

### Changed

- Updated bundled web dependencies: marked 18.0.5 and DOMPurify 3.4.8.
- Updated Tauri/Rust dependency set and regenerated desktop third-party license data.
- Strengthened release asset generation and verification, including standalone/ZIP hash consistency checks.
- Hardened file/folder create and rename validation for control characters, Windows reserved names, and trailing dots/spaces.

### Fixed

- Fixed rename handling for filenames that contain dots.
- Fixed multi-select deletion so selected folders are deleted together with files and nested selections are not double-counted.

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

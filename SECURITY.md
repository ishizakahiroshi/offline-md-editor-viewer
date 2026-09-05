# Security Policy

## Supported versions

Security fixes are applied to the latest release on the default branch and to the most recent tagged release when feasible.

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories for this repository:

https://github.com/ishizakahiroshi/offline-md-editor-viewer/security/advisories/new

If advisories are unavailable, email the maintainer address listed in apps/npm/package.json with subject prefix [SECURITY].

Do not open a public issue for unfixed vulnerabilities.

## Scope notes

- Browser edition: local Markdown rendering with offline CSP; no intentional network calls.
- Desktop edition (Windows/Tauri): local filesystem access through app-owned invoke commands; treat the app like any local trusted editor.
- Please include reproduction steps, affected edition (browser/desktop/npm), and version/tag.

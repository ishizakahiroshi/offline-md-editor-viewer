# Security Policy

## Supported versions

Security fixes are applied to the latest release on `main` and, where feasible, backported to the most recent tagged release.

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories for this repository:

https://github.com/ishizakahiroshi/offline-md-editor-viewer/security/advisories/new

If Security Advisories are unavailable to you, email ishizakahiroshi.dev@gmail.com with the subject prefix `[SECURITY]`.

Do not open a public issue for an unfixed vulnerability.

When reporting, please include reproduction steps, the affected edition (browser / desktop / npm launcher), and the version or tag.

## Scope

- Browser edition: local Markdown rendering with an offline Content Security Policy (`connect-src 'none'`); no intentional network calls. See [README.md](README.md#security--privacy) for details.
- Desktop edition (Windows / Tauri): local filesystem access through app-owned `invoke` commands, scoped to files the user opens or drags in. Treat the app like any other local, trusted editor with the user's own filesystem permissions.
- npm package: a launcher only. It opens the bundled browser HTML in the default browser and performs no network access of its own.

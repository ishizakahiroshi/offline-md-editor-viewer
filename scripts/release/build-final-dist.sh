#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repo_root}"

version="${1:-}"
if [[ -z "${version}" ]]; then
  cargo_version="$(sed -nE 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' apps/desktop/src-tauri/Cargo.toml | head -n 1)"
  if [[ -z "${cargo_version}" ]]; then
    echo "Could not read version from apps/desktop/src-tauri/Cargo.toml" >&2
    exit 1
  fi
  version="v${cargo_version}"
fi

if [[ ! "${version}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  echo "Version must look like v0.1.0: ${version}" >&2
  exit 1
fi

if command -v pwsh >/dev/null 2>&1; then
  ps_cmd=(pwsh -NoProfile -ExecutionPolicy Bypass)
elif command -v powershell.exe >/dev/null 2>&1; then
  ps_cmd=(powershell.exe -NoProfile -ExecutionPolicy Bypass)
else
  echo "PowerShell is required: install pwsh or run from Git Bash with powershell.exe available." >&2
  exit 1
fi

run_ps_file() {
  "${ps_cmd[@]}" -File "$@"
}

run_ps_command() {
  "${ps_cmd[@]}" -Command "$@"
}

desktop_package="offline-md-editor-viewer-desktop-${version}-win-x64-portable"
work_dir="dist/.build-final-dist"
desktop_stage="${work_dir}/${desktop_package}"
release_assets="dist/release-assets"

echo "==> Building browser single HTML and browser ZIP (${version})"
run_ps_file scripts/release/build-browser-single-html.ps1 -Clean -Verify -Package -Version "${version}"

echo "==> Staging desktop frontend from dist/browser/offline-md-editor-viewer.html"
run_ps_file scripts/release/stage-desktop-frontend.ps1

echo "==> Stopping running desktop exe if needed"
run_ps_command "\$exePath = (Resolve-Path 'apps/desktop/src-tauri/target/release/offline-md-editor-viewer.exe' -ErrorAction SilentlyContinue).Path
if (\$exePath) {
  Get-Process | Where-Object {
    try { \$_.Path -eq \$exePath } catch { \$false }
  } | ForEach-Object {
    Write-Host \"Stopping running app process: \$(\$_.Id)\"
    if (\$_.MainWindowHandle -ne 0) {
      [void]\$_.CloseMainWindow()
      if (-not \$_.WaitForExit(5000)) {
        Stop-Process -Id \$_.Id -Force
      }
    } else {
      Stop-Process -Id \$_.Id -Force
    }
  }
}"

echo "==> Building desktop exe"
(
  cd apps/desktop
  npm ci
  npx tauri build --config src-tauri/tauri.release.conf.json
)

echo "==> Packaging desktop ZIP"
rm -rf "${work_dir}"
mkdir -p "${desktop_stage}"
cp apps/desktop/src-tauri/target/release/offline-md-editor-viewer.exe "${desktop_stage}/"
for file in README.md README.ja.md CHANGELOG.md CHANGELOG.ja.md LICENSE THIRD_PARTY_NOTICES.md; do
  if [[ -f "${file}" ]]; then
    cp "${file}" "${desktop_stage}/"
  else
    echo "Missing required release file: ${file}" >&2
    exit 1
  fi
done
cp -R LICENSES "${desktop_stage}/"
run_ps_command "Compress-Archive -Path '${desktop_stage}' -DestinationPath 'dist/${desktop_package}.zip' -Force"

echo "==> Collecting final review assets"
rm -rf "${release_assets}"
mkdir -p "${release_assets}"
cp "dist/offline-md-editor-viewer-browser-${version}.zip" "${release_assets}/"
cp "dist/browser/offline-md-editor-viewer.html" "${release_assets}/"
cp "dist/${desktop_package}.zip" "${release_assets}/"
cp "apps/desktop/src-tauri/target/release/offline-md-editor-viewer.exe" "${release_assets}/"

echo "==> Writing SHA256SUMS.txt"
(
  cd "${release_assets}"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum \
      "offline-md-editor-viewer-browser-${version}.zip" \
      "offline-md-editor-viewer.html" \
      "${desktop_package}.zip" \
      "offline-md-editor-viewer.exe" > SHA256SUMS.txt
  else
    "${ps_cmd[@]}" -Command "& {
      Get-ChildItem -File |
        Where-Object { \$_.Name -ne 'SHA256SUMS.txt' } |
        Sort-Object Name |
        ForEach-Object {
          \$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath \$_.FullName).Hash.ToLowerInvariant()
          \"\$hash  \$(\$_.Name)\"
        }
    }" > SHA256SUMS.txt
  fi
)

echo "==> Verifying desktop ZIP contains the standalone exe"
"${ps_cmd[@]}" -Command "& {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  \$zipPath = 'dist/${desktop_package}.zip'
  \$zip = [System.IO.Compression.ZipFile]::OpenRead(\$zipPath)
  try {
    \$entry = \$zip.Entries | Where-Object { \$_.FullName -eq '${desktop_package}/offline-md-editor-viewer.exe' } | Select-Object -First 1
    if (-not \$entry) { throw 'desktop ZIP does not contain offline-md-editor-viewer.exe at the expected path.' }
    \$stream = \$entry.Open()
    try {
      \$tmp = [System.IO.Path]::GetTempFileName()
      \$out = [System.IO.File]::OpenWrite(\$tmp)
      try { \$stream.CopyTo(\$out) } finally { \$out.Dispose() }
      \$zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath \$tmp).Hash
      \$exeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'apps/desktop/src-tauri/target/release/offline-md-editor-viewer.exe').Hash
      if (\$zipHash -ne \$exeHash) { throw \"desktop ZIP exe hash differs from standalone exe: \$zipHash / \$exeHash\" }
    } finally {
      \$stream.Dispose()
      if (\$tmp -and (Test-Path -LiteralPath \$tmp)) { Remove-Item -LiteralPath \$tmp -Force }
    }
  } finally {
    \$zip.Dispose()
  }
}"

echo
echo "Final dist assets are ready:"
find "${release_assets}" -maxdepth 1 -type f -printf "  %p\n" 2>/dev/null || ls -1 "${release_assets}"

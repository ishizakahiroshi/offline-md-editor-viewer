# stage-desktop-frontend.ps1
# Copies dist/browser/offline-md-editor-viewer.html into the Tauri staging
# directory (apps/desktop/src-tauri/desktop-frontend-dist/) so the desktop
# release build embeds exactly the same single HTML as the browser release.
#
# Prerequisite:
#   scripts/release/build-browser-single-html.ps1 has been run, producing
#   dist/browser/offline-md-editor-viewer.html.
#
# Usage:
#   ./scripts/release/stage-desktop-frontend.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Resolve-Path (Join-Path $ScriptDir '..\..')

$Source   = Join-Path $RepoRoot 'dist\browser\offline-md-editor-viewer.html'
$StageDir = Join-Path $RepoRoot 'apps\desktop\src-tauri\desktop-frontend-dist'

if (-not (Test-Path -LiteralPath $Source)) {
  throw "Source HTML not found: $Source. Run scripts/release/build-browser-single-html.ps1 first."
}

if (Test-Path -LiteralPath $StageDir) {
  Remove-Item -Recurse -Force $StageDir
}
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

$dest = Join-Path $StageDir 'offline-md-editor-viewer.html'
Copy-Item -LiteralPath $Source -Destination $dest

$bytes = (Get-Item -LiteralPath $dest).Length
Write-Host ("Staged: {0} ({1:N0} bytes)" -f $dest, $bytes)

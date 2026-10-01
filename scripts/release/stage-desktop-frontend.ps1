# stage-desktop-frontend.ps1
# Copies dist/browser/offline-md-editor-viewer.html into the Tauri staging
# directory (apps/desktop/src-tauri/desktop-frontend-dist/) so the desktop
# release build embeds exactly the same single HTML as the browser release.
# Also writes tauri.release.generated.conf.json with a CSP that matches the
# staged HTML's sha256 hashes (inlining adds script/style blocks beyond the
# source-tree hashes in tauri.conf.json).
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
$GeneratedConf = Join-Path $RepoRoot 'apps\desktop\src-tauri\tauri.release.generated.conf.json'
$BaseConf = Join-Path $RepoRoot 'apps\desktop\src-tauri\tauri.conf.json'

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

# --- derive desktop release CSP from staged HTML meta + desktop baseline directives ---
$html = [System.IO.File]::ReadAllText($dest, [System.Text.Encoding]::UTF8)
$metaMatch = [regex]::Match($html, '<meta http-equiv="Content-Security-Policy" content="([^"]*)">', 'IgnoreCase')
if (-not $metaMatch.Success) {
  throw 'Staged HTML is missing Content-Security-Policy meta tag'
}
$metaCsp = $metaMatch.Groups[1].Value
if ($metaCsp -match 'unsafe-inline') {
  throw 'Staged HTML CSP still contains unsafe-inline'
}
$scriptSrcMatch = [regex]::Match($metaCsp, "script-src\s[^;]*")
$styleSrcMatch = [regex]::Match($metaCsp, "style-src\s[^;]*")
if (-not $scriptSrcMatch.Success -or -not $styleSrcMatch.Success) {
  throw 'Staged HTML CSP is missing script-src or style-src'
}

$base = Get-Content -LiteralPath $BaseConf -Raw -Encoding UTF8 | ConvertFrom-Json
$baseCsp = [string]$base.app.security.csp
# Keep desktop-only directives from tauri.conf.json; replace script-src/style-src
# with the hash lists taken from the bundled HTML meta CSP.
$releaseCsp = $baseCsp
$releaseCsp = [regex]::Replace($releaseCsp, "script-src\s[^;]*", $scriptSrcMatch.Value.Trim())
$releaseCsp = [regex]::Replace($releaseCsp, "style-src\s[^;]*", $styleSrcMatch.Value.Trim())
if ($releaseCsp -match 'unsafe-inline') {
  throw 'Generated release CSP still contains unsafe-inline'
}

# Overlay merged via `tauri build --config tauri.release.conf.json --config ...generated...`
# so frontendDist stays in the tracked release conf and only CSP is generated here.
$generated = [ordered]@{
  app = [ordered]@{
    security = [ordered]@{
      csp = $releaseCsp
    }
  }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$json = ($generated | ConvertTo-Json -Depth 6) + "`n"
[System.IO.File]::WriteAllText($GeneratedConf, $json, $utf8NoBom)
Write-Host "Wrote release CSP config: $GeneratedConf"

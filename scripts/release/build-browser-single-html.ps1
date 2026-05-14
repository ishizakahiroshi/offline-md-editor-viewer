# build-browser-single-html.ps1
# Generates a single-file browser HTML by inlining lib/*.js and lib/*.css into the source HTML.
# Options: -Clean  -Verify  -Package -Version <vX.X.X>

param(
  [switch]$Clean,
  [switch]$Verify,
  [switch]$Package,
  [string]$Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- paths ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent (Split-Path -Parent $ScriptDir)

$SrcHtml   = Join-Path $RepoRoot 'apps/browser/offline-md-editor-viewer.html'
$LibDir    = Join-Path $RepoRoot 'apps/browser/lib'
$DistDir   = Join-Path $RepoRoot 'dist/browser'
$OutHtml   = Join-Path $DistDir  'offline-md-editor-viewer.html'

# --- validation ---
if ($Package -and -not $Version) {
  Write-Error '-Version <vX.X.X> is required when -Package is specified.'
  exit 1
}

if (-not (Test-Path $SrcHtml)) {
  Write-Error "Source HTML not found: $SrcHtml"
  exit 1
}

foreach ($lib in @('marked.min.js', 'purify.min.js', 'encoding.min.js', 'highlight.min.js')) {
  $p = Join-Path $LibDir $lib
  if (-not (Test-Path $p)) {
    Write-Error "Library not found: $p"
    exit 1
  }
}

$hljsCss = Join-Path $LibDir 'hljs-github-dark.min.css'
if (-not (Test-Path $hljsCss)) {
  Write-Error "CSS not found: $hljsCss"
  exit 1
}

# --- clean ---
if ($Clean -and (Test-Path $DistDir)) {
  Remove-Item -Recurse -Force $DistDir
  Write-Host "Cleaned: $DistDir"
}

# --- prepare output dir ---
if (-not (Test-Path $DistDir)) {
  New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
}

# --- read source ---
$srcContent = [System.IO.File]::ReadAllText($SrcHtml, [System.Text.Encoding]::UTF8)

# --- inline replacement ---
# Map each src attribute pattern -> lib filename
$replacements = [ordered]@{
  '<script src="lib/marked.min.js"></script>'    = 'marked.min.js'
  '<script src="lib/purify.min.js"></script>'    = 'purify.min.js'
  '<script src="lib/highlight.min.js"></script>' = 'highlight.min.js'
  '<script src="./lib/encoding.min.js"></script>' = 'encoding.min.js'
}

$result = $srcContent
foreach ($srcAttr in $replacements.Keys) {
  $libFile = $replacements[$srcAttr]
  $libPath = Join-Path $LibDir $libFile
  $jsContent = [System.IO.File]::ReadAllText($libPath, [System.Text.Encoding]::UTF8)
  # Escape </script> inside JS content to prevent premature tag close
  $jsContent = $jsContent -replace '</script>', '<\/script>'
  $inlineTag = "<script>`n$jsContent`n</script>"
  $result = $result.Replace($srcAttr, $inlineTag)
}

# Inline CSS: <link rel="stylesheet" href="lib/hljs-github-dark.min.css"> -> <style>...</style>
$cssLinkTag = '<link rel="stylesheet" href="lib/hljs-github-dark.min.css">'
$cssContent = [System.IO.File]::ReadAllText($hljsCss, [System.Text.Encoding]::UTF8)
$cssContent = $cssContent -replace '</style>', '<\/style>'
$inlineCssTag = "<style>`n$cssContent`n</style>"
if (-not $result.Contains($cssLinkTag)) {
  Write-Error "CSS link tag not found in source HTML: $cssLinkTag"
  exit 1
}
$result = $result.Replace($cssLinkTag, $inlineCssTag)

# --- inject notice comment after <!DOCTYPE html> ---
$noticeComment = '<!-- Bundled libraries: marked (MIT), DOMPurify (Apache-2.0 / MPL-2.0), encoding-japanese (MIT), highlight.js (BSD-3-Clause). See THIRD_PARTY_NOTICES.md and LICENSES/ in the release bundle. -->'
$result = $result -replace '(<!DOCTYPE html>)', "`$1`n$noticeComment"

# --- inline license texts into placeholders (rendered inside <pre> in About dialog) ---
$licensePlaceholders = [ordered]@{
  '<!-- APP_LICENSE_PLACEHOLDER -->'               = 'LICENSE'
  '<!-- MARKED_LICENSE_PLACEHOLDER -->'            = 'LICENSES/marked-LICENSE.md'
  '<!-- DOMPURIFY_LICENSE_PLACEHOLDER -->'         = 'LICENSES/DOMPurify-LICENSE.txt'
  '<!-- ENCODING_JAPANESE_LICENSE_PLACEHOLDER -->' = 'LICENSES/encoding-japanese-LICENSE.txt'
  '<!-- HIGHLIGHTJS_LICENSE_PLACEHOLDER -->'       = 'LICENSES/highlight.js-LICENSE.txt'
  '<!-- FEATHER_LICENSE_PLACEHOLDER -->'           = 'LICENSES/feather-LICENSE.txt'
  '<!-- DESKTOP_LICENSES_PLACEHOLDER -->'          = 'LICENSES/desktop-third-party.txt'
}

function ConvertTo-PreSafeHtml {
  param([string]$Text)
  $t = $Text -replace '&', '&amp;'
  $t = $t -replace '<', '&lt;'
  $t = $t -replace '>', '&gt;'
  return $t
}

foreach ($placeholder in $licensePlaceholders.Keys) {
  $relPath = $licensePlaceholders[$placeholder]
  $absPath = Join-Path $RepoRoot $relPath
  if (-not (Test-Path -LiteralPath $absPath)) {
    Write-Error "License source not found: $relPath"
    exit 1
  }
  $content = [System.IO.File]::ReadAllText($absPath, [System.Text.Encoding]::UTF8)
  $escaped = ConvertTo-PreSafeHtml $content
  if (-not $result.Contains($placeholder)) {
    Write-Error "Placeholder not found in source HTML: $placeholder"
    exit 1
  }
  $result = $result.Replace($placeholder, $escaped)
}

# --- normalize line endings to LF for cross-OS reproducibility ---
# Without this, the same source can produce different SHA-256 on Windows
# (CRLF after git autocrlf) vs Linux (LF), breaking the "browser ZIP HTML
# equals single-asset HTML" check in the release workflow.
$result = $result -replace "`r`n", "`n"

# --- write output (UTF-8 no BOM) ---
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($OutHtml, $result, $utf8NoBom)
Write-Host "Generated: $OutHtml ($([Math]::Round((Get-Item $OutHtml).Length / 1KB)) KB)"

# --- package ---
if ($Package) {
  $stageName = "offline-md-editor-viewer-browser-$Version"
  $stageDir  = Join-Path $RepoRoot "dist/$stageName"
  $zipPath   = Join-Path $RepoRoot "dist/$stageName.zip"

  # Prepare staging dir
  if (Test-Path $stageDir) {
    Remove-Item -Recurse -Force $stageDir
  }
  New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

  # Copy generated HTML
  Copy-Item $OutHtml (Join-Path $stageDir 'offline-md-editor-viewer.html')

  # Copy docs
  foreach ($f in @('README.md', 'README.ja.md', 'CHANGELOG.md', 'CHANGELOG.ja.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md')) {
    $src = Join-Path $RepoRoot $f
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $stageDir $f)
    } else {
      Write-Warning "File not found (skipped): $f"
    }
  }

  # Copy LICENSES/ recursively
  $licensesDir = Join-Path $RepoRoot 'LICENSES'
  if (Test-Path $licensesDir) {
    Copy-Item -Recurse $licensesDir (Join-Path $stageDir 'LICENSES')
  }

  # Create ZIP
  Compress-Archive -Path $stageDir -DestinationPath $zipPath -Force
  Write-Host "Packaged: $zipPath ($([Math]::Round((Get-Item $zipPath).Length / 1KB)) KB)"
}

# --- verify ---
if ($Verify) {
  $errors = @()
  $html = [System.IO.File]::ReadAllText($OutHtml, [System.Text.Encoding]::UTF8)

  if ($html -match '<script src=') {
    $errors += 'FAIL: <script src= still present in output'
  }
  if ($html -match 'lib/marked\.min\.js') {
    $errors += 'FAIL: lib/marked.min.js reference still present'
  }
  if ($html -match 'lib/purify\.min\.js') {
    $errors += 'FAIL: lib/purify.min.js reference still present'
  }
  if ($html -match 'lib/encoding\.min\.js') {
    $errors += 'FAIL: lib/encoding.min.js reference still present'
  }
  if ($html -match 'lib/highlight\.min\.js') {
    $errors += 'FAIL: lib/highlight.min.js reference still present'
  }
  if ($html -match 'lib/hljs-github-dark\.min\.css') {
    $errors += 'FAIL: lib/hljs-github-dark.min.css reference still present'
  }
  if ($html -notmatch '\bmarked\b') {
    $errors += 'FAIL: "marked" not found in output'
  }
  if ($html -notmatch '\bDOMPurify\b') {
    $errors += 'FAIL: "DOMPurify" not found in output'
  }
  if ($html -notmatch '\bEncoding\b') {
    $errors += 'FAIL: "Encoding" not found in output'
  }
  if ($html -notmatch '\bhljs\b') {
    $errors += 'FAIL: "hljs" not found in output'
  }
  if ($html -notmatch [regex]::Escape('Bundled libraries:')) {
    $errors += 'FAIL: third-party notice comment not found'
  }
  foreach ($ph in @(
    '<!-- APP_LICENSE_PLACEHOLDER -->',
    '<!-- MARKED_LICENSE_PLACEHOLDER -->',
    '<!-- DOMPURIFY_LICENSE_PLACEHOLDER -->',
    '<!-- ENCODING_JAPANESE_LICENSE_PLACEHOLDER -->',
    '<!-- HIGHLIGHTJS_LICENSE_PLACEHOLDER -->',
    '<!-- FEATHER_LICENSE_PLACEHOLDER -->',
    '<!-- DESKTOP_LICENSES_PLACEHOLDER -->'
  )) {
    if ($html.Contains($ph)) {
      $errors += "FAIL: license placeholder still present: $ph"
    }
  }
  # Sanity: license texts should appear (smoke check)
  if ($html -notmatch 'Permission is hereby granted') {
    $errors += 'FAIL: MIT-style license phrase not found in inlined output'
  }
  if ($html -notmatch 'Apache License') {
    $errors += 'FAIL: Apache License phrase not found in inlined output'
  }
  if ($html -notmatch 'BSD 3-Clause License') {
    $errors += 'FAIL: BSD 3-Clause license phrase not found in inlined output'
  }

  if ($Package) {
    $stageName = "offline-md-editor-viewer-browser-$Version"
    $zipPath   = Join-Path $RepoRoot "dist/$stageName.zip"
    if (-not (Test-Path $zipPath)) {
      $errors += "FAIL: ZIP not found at $zipPath"
    } else {
      # Check ZIP contents
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
      try {
        # Normalize to forward slashes for cross-platform comparison
        $entries = $zip.Entries | ForEach-Object { $_.FullName -replace '\\', '/' }
        $hasHtml = $entries | Where-Object { $_ -eq "$stageName/offline-md-editor-viewer.html" }
        if (-not $hasHtml) {
          $errors += "FAIL: ZIP does not contain $stageName/offline-md-editor-viewer.html at expected path"
        }
        $hasLib = $entries | Where-Object { $_ -match 'apps/browser/lib/' }
        if ($hasLib) {
          $errors += 'FAIL: ZIP contains apps/browser/lib/ paths'
        }
      } finally {
        $zip.Dispose()
      }
    }
  }

  if ($errors.Count -gt 0) {
    foreach ($e in $errors) { Write-Error $e }
    exit 1
  }
  Write-Host 'Verify: all checks passed'
}

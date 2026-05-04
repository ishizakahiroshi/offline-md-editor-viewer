param(
  [string]$Version = "",
  [int]$CargoBuildJobs = 2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
Set-Location $RepoRoot.Path

if (-not $Version) {
  $cargoTomlPath = Join-Path $RepoRoot.Path "apps/desktop/src-tauri/Cargo.toml"
  if (-not (Test-Path -LiteralPath $cargoTomlPath)) {
    throw "Could not find Cargo.toml: $cargoTomlPath"
  }
  $cargoToml = Get-Content -Raw -LiteralPath $cargoTomlPath
  $match = [regex]::Match($cargoToml, '(?m)^version\s*=\s*"([^"]+)"')
  if (-not $match.Success) {
    throw "Could not read version from apps/desktop/src-tauri/Cargo.toml"
  }
  $Version = "v$($match.Groups[1].Value)"
}

if ($Version -notmatch "^v\d+\.\d+\.\d+") {
  throw "Version must look like v0.1.0: $Version"
}

if ($CargoBuildJobs -lt 1) {
  throw "CargoBuildJobs must be 1 or greater: $CargoBuildJobs"
}

$desktopPackage = "offline-md-editor-viewer-desktop-$Version-win-x64-portable"
$workDir = Join-Path $RepoRoot.Path "dist/.build-final-dist"
$desktopStage = Join-Path $workDir $desktopPackage
$releaseAssets = Join-Path $RepoRoot.Path "dist/release-assets"
$desktopExe = Join-Path $RepoRoot.Path "apps/desktop/src-tauri/target/release/offline-md-editor-viewer.exe"
$releaseAssetsExe = Join-Path $releaseAssets "offline-md-editor-viewer.exe"

function Assert-DesktopPackageMetadata {
  $packageJsonPath = Join-Path $RepoRoot.Path "apps/desktop/package.json"
  if (-not (Test-Path -LiteralPath $packageJsonPath)) {
    throw "Could not find desktop package.json: $packageJsonPath"
  }

  $packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
  if (-not (Get-Member -InputObject $packageJson -Name "license" -MemberType NoteProperty) -or $packageJson.license -ne "MIT") {
    throw 'apps/desktop/package.json must declare "license": "MIT" before building release assets.'
  }
}

function Stop-ProcessByExactPath {
  param(
    [Parameter(Mandatory = $true)][string]$PathToStop
  )
  $resolved = Resolve-Path -LiteralPath $PathToStop -ErrorAction SilentlyContinue
  if (-not $resolved) { return }
  $target = $resolved.Path
  Get-Process | Where-Object {
    try { $_.Path -eq $target } catch { $false }
  } | ForEach-Object {
    Write-Host "Stopping running app process: $($_.Id) ($target)"
    if ($_.MainWindowHandle -ne 0) {
      [void]$_.CloseMainWindow()
      if (-not $_.WaitForExit(5000)) {
        Stop-Process -Id $_.Id -Force
      }
    } else {
      Stop-Process -Id $_.Id -Force
    }
  }
}

Write-Host "==> Checking desktop package metadata"
Assert-DesktopPackageMetadata

Write-Host "==> Building browser single HTML and browser ZIP ($Version)"
& (Join-Path $RepoRoot.Path "scripts/release/build-browser-single-html.ps1") -Clean -Verify -Package -Version $Version

Write-Host "==> Staging desktop frontend from dist/browser/offline-md-editor-viewer.html"
& (Join-Path $RepoRoot.Path "scripts/release/stage-desktop-frontend.ps1")

Write-Host "==> Stopping running desktop exe if needed"
Stop-ProcessByExactPath -PathToStop $desktopExe
Stop-ProcessByExactPath -PathToStop $releaseAssetsExe

$previousCargoBuildJobs = $env:CARGO_BUILD_JOBS

Write-Host "==> Building desktop exe (CARGO_BUILD_JOBS=$CargoBuildJobs)"
Push-Location (Join-Path $RepoRoot.Path "apps/desktop")
try {
  $env:CARGO_BUILD_JOBS = "$CargoBuildJobs"
  npm ci
  npx tauri build --config src-tauri/tauri.release.conf.json
} finally {
  if ($null -eq $previousCargoBuildJobs) {
    Remove-Item Env:CARGO_BUILD_JOBS -ErrorAction SilentlyContinue
  } else {
    $env:CARGO_BUILD_JOBS = $previousCargoBuildJobs
  }
  Pop-Location
}

Write-Host "==> Packaging desktop ZIP"
if (Test-Path -LiteralPath $workDir) {
  Remove-Item -Recurse -Force -LiteralPath $workDir
}
New-Item -ItemType Directory -Force -Path $desktopStage | Out-Null

Copy-Item -LiteralPath $desktopExe -Destination (Join-Path $desktopStage "offline-md-editor-viewer.exe")

$requiredReleaseFiles = @(
  "README.md",
  "README.ja.md",
  "CHANGELOG.md",
  "CHANGELOG.ja.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md"
)
foreach ($file in $requiredReleaseFiles) {
  $src = Join-Path $RepoRoot.Path $file
  if (-not (Test-Path -LiteralPath $src)) {
    throw "Missing required release file: $file"
  }
  Copy-Item -LiteralPath $src -Destination (Join-Path $desktopStage $file)
}
Copy-Item -Recurse -LiteralPath (Join-Path $RepoRoot.Path "LICENSES") -Destination (Join-Path $desktopStage "LICENSES")

$desktopZip = Join-Path $RepoRoot.Path "dist/$desktopPackage.zip"
Compress-Archive -Path $desktopStage -DestinationPath $desktopZip -Force

Write-Host "==> Collecting final review assets"
Stop-ProcessByExactPath -PathToStop $releaseAssetsExe
if (Test-Path -LiteralPath $releaseAssets) {
  Remove-Item -Recurse -Force -LiteralPath $releaseAssets
}
New-Item -ItemType Directory -Force -Path $releaseAssets | Out-Null

$releaseArtifacts = @(
  (Join-Path $RepoRoot.Path "dist/offline-md-editor-viewer-browser-$Version.zip"),
  (Join-Path $RepoRoot.Path "dist/browser/offline-md-editor-viewer.html"),
  $desktopZip,
  $desktopExe
)

foreach ($src in $releaseArtifacts) {
  $name = [System.IO.Path]::GetFileName($src)
  $dest = Join-Path $releaseAssets $name
  if (Test-Path -LiteralPath $dest) {
    Remove-Item -Force -LiteralPath $dest
  }
  Copy-Item -LiteralPath $src -Destination $dest
}

Write-Host "==> Writing SHA256SUMS.txt"
$shaPath = Join-Path $releaseAssets "SHA256SUMS.txt"
Get-ChildItem -LiteralPath $releaseAssets -File |
  Where-Object { $_.Name -ne "SHA256SUMS.txt" } |
  Sort-Object Name |
  ForEach-Object {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    "$hash  $($_.Name)"
  } | Set-Content -LiteralPath $shaPath -Encoding utf8

Write-Host "==> Verifying desktop ZIP contains the standalone exe"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($desktopZip)
try {
  $entryPath = "$desktopPackage/offline-md-editor-viewer.exe"
  $entry = $zip.Entries | Where-Object { $_.FullName -eq $entryPath } | Select-Object -First 1
  if (-not $entry) {
    throw "desktop ZIP does not contain offline-md-editor-viewer.exe at the expected path."
  }

  $tmp = $null
  $stream = $entry.Open()
  try {
    $tmp = [System.IO.Path]::GetTempFileName()
    $out = [System.IO.File]::OpenWrite($tmp)
    try { $stream.CopyTo($out) } finally { $out.Dispose() }
    $zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $tmp).Hash
    $exeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $desktopExe).Hash
    if ($zipHash -ne $exeHash) {
      throw "desktop ZIP exe hash differs from standalone exe: $zipHash / $exeHash"
    }
  } finally {
    $stream.Dispose()
    if ($tmp -and (Test-Path -LiteralPath $tmp)) {
      Remove-Item -LiteralPath $tmp -Force
    }
  }
} finally {
  $zip.Dispose()
}

Write-Host ""
Write-Host "Final dist assets are ready:"
Get-ChildItem -LiteralPath $releaseAssets -File | Sort-Object Name | ForEach-Object {
  Write-Host "  $($_.FullName)"
}

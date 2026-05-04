param(
  [switch]$SkipInstall,
  [int]$CargoBuildJobs = 2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$DesktopDir = Join-Path $RepoRoot.Path "apps/desktop"
$DesktopExe = Join-Path $DesktopDir "src-tauri/target/release/offline-md-editor-viewer.exe"

if ($CargoBuildJobs -lt 1) {
  throw "CargoBuildJobs must be 1 or greater: $CargoBuildJobs"
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

if (-not (Test-Path -LiteralPath $DesktopDir)) {
  throw "Desktop project not found: $DesktopDir"
}

Write-Host "==> Stopping running desktop exe if needed"
Stop-ProcessByExactPath -PathToStop $DesktopExe

$previousCargoBuildJobs = $env:CARGO_BUILD_JOBS

Write-Host "==> Building desktop exe (CARGO_BUILD_JOBS=$CargoBuildJobs)"
Push-Location $DesktopDir
try {
  $env:CARGO_BUILD_JOBS = "$CargoBuildJobs"
  if (-not $SkipInstall) {
    npm ci
  }
  npx tauri build --config src-tauri/tauri.release.conf.json
} finally {
  if ($null -eq $previousCargoBuildJobs) {
    Remove-Item Env:CARGO_BUILD_JOBS -ErrorAction SilentlyContinue
  } else {
    $env:CARGO_BUILD_JOBS = $previousCargoBuildJobs
  }
  Pop-Location
}

if (-not (Test-Path -LiteralPath $DesktopExe)) {
  throw "Build finished, but exe was not found: $DesktopExe"
}

Write-Host ""
Write-Host "Build complete:"
Write-Host "  $DesktopExe"

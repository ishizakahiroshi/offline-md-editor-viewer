<#
.SYNOPSIS
  Fails when the version strings and the MSIX file association drift apart.

.DESCRIPTION
  This repository keeps the same version in six tracked places and the Tauri
  version string in two (Cargo.lock resolves it, the About dialog hardcodes it).
  It also declares the `.md` file type association only in the tracked MSIX
  manifest, and records which Cargo.lock its bundled Rust license text was
  generated from. Every one of these has already drifted in a shipped release:

    - v0.3.1 went to the Microsoft Store without the `.md` association, which
      broke "Open with" for every Store user.
    - The About dialog's Tauri string has to be updated by hand whenever
      Cargo.toml moves, so it silently goes stale.
    - v0.3.1 and v0.3.2 shipped a LICENSES/desktop-third-party.txt whose
      recorded Cargo.lock hash no longer matched, because the only check for it
      lived in a gitignored local script that had stopped running after v0.3.0.
      The license text happened to stay correct (no dependency was added or
      removed), but nothing would have caught it if it had not.

  None of these are visible at build time, so all of them are checked here.

  Run locally exactly as CI does:
    pwsh -NoProfile -File scripts/ci/check-consistency.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..\..")).Path
$errors = [System.Collections.Generic.List[string]]::new()

function Add-Failure {
  param([Parameter(Mandatory = $true)][string]$Message)
  $errors.Add($Message)
  Write-Host "FAIL $Message"
}

function Read-Text {
  param([Parameter(Mandatory = $true)][string]$RelativePath)
  $path = Join-Path $RepoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { throw "Required file is missing: $RelativePath" }
  Get-Content -Raw -LiteralPath $path
}

function Get-SingleMatch {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $found = [regex]::Matches($Text, $Pattern)
  if ($found.Count -eq 0) {
    Add-Failure "${Label}: pattern did not match, so the value can no longer be checked"
    return $null
  }
  $values = @($found | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
  if ($values.Count -gt 1) {
    Add-Failure "${Label}: found conflicting values: $($values -join ', ')"
    return $null
  }
  return $values[0]
}

# --- App version: Cargo.toml is the source of truth -------------------------

$cargoToml = Read-Text "apps/desktop/src-tauri/Cargo.toml"
$expected = Get-SingleMatch -Text $cargoToml -Label "Cargo.toml [package] version" `
  -Pattern '(?m)^\s*\[package\][\s\S]*?^\s*version\s*=\s*"(\d+\.\d+\.\d+)"'
if (-not $expected) { throw "Could not determine the expected version from Cargo.toml" }
Write-Host "Expected version: $expected (source of truth: apps/desktop/src-tauri/Cargo.toml)"

$checks = @(
  @{
    Label   = "apps/browser/offline-md-editor-viewer.html APP_VERSION"
    Text    = Read-Text "apps/browser/offline-md-editor-viewer.html"
    Pattern = 'const APP_VERSION = "v(\d+\.\d+\.\d+)"'
  },
  @{
    Label   = "apps/desktop/package.json version"
    Text    = Read-Text "apps/desktop/package.json"
    Pattern = '(?m)^\s*"version":\s*"(\d+\.\d+\.\d+)"'
  },
  @{
    Label   = "apps/desktop/package-lock.json root version"
    Text    = Read-Text "apps/desktop/package-lock.json"
    Pattern = '(?m)^\s{2}"version":\s*"(\d+\.\d+\.\d+)"'
  },
  @{
    Label   = "apps/desktop/src-tauri/Cargo.lock package version"
    Text    = Read-Text "apps/desktop/src-tauri/Cargo.lock"
    Pattern = '(?m)^name = "offline-md-editor-viewer"\r?\nversion = "(\d+\.\d+\.\d+)"'
  }
)

foreach ($check in $checks) {
  $actual = Get-SingleMatch -Text $check.Text -Pattern $check.Pattern -Label $check.Label
  if ($actual -and $actual -ne $expected) {
    Add-Failure "$($check.Label): expected $expected but found $actual"
  } elseif ($actual) {
    Write-Host "OK   $($check.Label) = $actual"
  }
}

# --- CHANGELOG must document the version before it can be tagged -----------

foreach ($changelog in @("CHANGELOG.md", "CHANGELOG.ja.md")) {
  $text = Read-Text $changelog
  if ($text -notmatch "(?m)^##\s+$([regex]::Escape($expected))\b") {
    Add-Failure "${changelog}: no '## $expected' section found"
  } else {
    Write-Host "OK   ${changelog} documents $expected"
  }
}

# --- Tauri version: Cargo.lock resolves it, the About dialog repeats it -----

$cargoLock = Read-Text "apps/desktop/src-tauri/Cargo.lock"
$resolvedTauri = Get-SingleMatch -Text $cargoLock -Label "Cargo.lock resolved tauri version" `
  -Pattern '(?m)^name = "tauri"\r?\nversion = "(\d+\.\d+\.\d+)"'
if ($resolvedTauri) {
  Write-Host "Resolved Tauri: $resolvedTauri (source of truth: Cargo.lock)"
  $html = Read-Text "apps/browser/offline-md-editor-viewer.html"
  $aboutVersions = @([regex]::Matches($html, 'Tauri (\d+\.\d+\.\d+)') |
    ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
  if ($aboutVersions.Count -eq 0) {
    Add-Failure "About dialog: no 'Tauri X.Y.Z' string found in the app HTML"
  } elseif ($aboutVersions.Count -gt 1) {
    Add-Failure "About dialog: conflicting Tauri strings: $($aboutVersions -join ', ')"
  } elseif ($aboutVersions[0] -ne $resolvedTauri) {
    Add-Failure "About dialog: shows Tauri $($aboutVersions[0]) but Cargo.lock resolves $resolvedTauri"
  } else {
    Write-Host "OK   About dialog shows Tauri $($aboutVersions[0])"
  }
}

# --- MSIX manifest must keep declaring the .md association -----------------

$manifestPath = Join-Path $RepoRoot "scripts/release/msix/AppxManifest.xml"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  Add-Failure "scripts/release/msix/AppxManifest.xml is missing"
} else {
  [xml]$manifest = Get-Content -Raw -LiteralPath $manifestPath -Encoding UTF8
  $foundation = "http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  $uap = "http://schemas.microsoft.com/appx/manifest/uap/windows10"
  $ns = [System.Xml.XmlNamespaceManager]::new($manifest.NameTable)
  $ns.AddNamespace("f", $foundation)
  $ns.AddNamespace("uap", $uap)

  $identity = $manifest.SelectSingleNode("/f:Package/f:Identity", $ns)
  if (-not $identity) {
    Add-Failure "MSIX manifest: Identity element is missing"
  } elseif ($identity.Version -ne "{{VERSION}}") {
    # build-msix.ps1 substitutes the placeholder; a literal version here means the
    # tracked template was edited by hand and will drift from Cargo.toml.
    Add-Failure "MSIX manifest: Identity Version must stay the {{VERSION}} placeholder but is '$($identity.Version)'"
  } else {
    Write-Host "OK   MSIX manifest keeps the {{VERSION}} placeholder"
  }

  $application = $manifest.SelectSingleNode("/f:Package/f:Applications/f:Application", $ns)
  if (-not $application) {
    Add-Failure "MSIX manifest: Application element is missing"
  } elseif ($application.Id -ne "App" -or
            $application.Executable -ne "offline-md-editor-viewer.exe" -or
            $application.EntryPoint -ne "Windows.FullTrustApplication") {
    Add-Failure "MSIX manifest: Application identity changed unexpectedly"
  } else {
    Write-Host "OK   MSIX manifest Application identity is unchanged"
  }

  $associationPath = "/f:Package/f:Applications/f:Application/f:Extensions/" +
    "uap:Extension[@Category='windows.fileTypeAssociation']/" +
    "uap:FileTypeAssociation/uap:SupportedFileTypes/uap:FileType[text()='.md']"
  if (-not $manifest.SelectSingleNode($associationPath, $ns)) {
    Add-Failure "MSIX manifest: the .md windows.fileTypeAssociation declaration is gone (this is the v0.3.1 Store regression)"
  } else {
    Write-Host "OK   MSIX manifest declares the .md file type association"
  }
}

# --- Bundled Rust license text must match the current Cargo.lock -----------

$desktopLicensePath = Join-Path $RepoRoot "LICENSES/desktop-third-party.txt"
$cargoLockPath = Join-Path $RepoRoot "apps/desktop/src-tauri/Cargo.lock"
if (-not (Test-Path -LiteralPath $desktopLicensePath)) {
  Add-Failure "LICENSES/desktop-third-party.txt is missing (run scripts/local/gen-desktop-licenses.ps1)"
} else {
  $header = Select-String -LiteralPath $desktopLicensePath -Pattern '^# Cargo\.lock SHA-256:\s*([0-9A-Fa-f]+)' |
    Select-Object -First 1
  if (-not $header) {
    Add-Failure "LICENSES/desktop-third-party.txt has no '# Cargo.lock SHA-256:' header, so its freshness cannot be checked"
  } else {
    $recorded = $header.Matches[0].Groups[1].Value.ToUpperInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $cargoLockPath).Hash.ToUpperInvariant()
    if ($recorded -ne $actual) {
      # Note that a version bump alone changes Cargo.lock, so the license file has
      # to be regenerated on every release even when no dependency moved.
      Add-Failure ("LICENSES/desktop-third-party.txt was generated from a different Cargo.lock " +
        "(recorded $recorded, actual $actual). Re-run scripts/local/gen-desktop-licenses.ps1")
    } else {
      Write-Host "OK   LICENSES/desktop-third-party.txt matches the current Cargo.lock"
    }
  }
}

Write-Host ""
if ($errors.Count -gt 0) {
  Write-Host "Consistency check failed with $($errors.Count) problem(s)."
  exit 1
}
Write-Host "Consistency check passed."

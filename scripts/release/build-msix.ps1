<#
.SYNOPSIS
  Builds the Microsoft Store MSIX package from the release executable.

.DESCRIPTION
  Stages the release executable and Store assets, replaces {{VERSION}} in the
  tracked manifest, validates the file association, packs with MakeAppx, then
  unpacks the generated MSIX and validates its manifest again.

  -Sign creates or reuses a local test certificate and signs the package.
  -Install sideloads the generated package for manual Explorer/E2E checks.
  Store submission packages do not need the local test signature.
#>
param(
  [switch]$Sign,
  [switch]$Install
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$ExePath = Join-Path $RepoRoot "apps\desktop\src-tauri\target\release\offline-md-editor-viewer.exe"
$IconsDir = Join-Path $RepoRoot "apps\desktop\src-tauri\icons"
$CargoToml = Join-Path $RepoRoot "apps\desktop\src-tauri\Cargo.toml"
$ManifestTemplate = Join-Path $ScriptDir "msix\AppxManifest.xml"
$StageDir = Join-Path $RepoRoot "dist\msix\package"
$VerifyDir = Join-Path $RepoRoot "dist\msix\verified-package"
$OutDir = Join-Path $RepoRoot "dist\msix"

function Find-WindowsSdkTool {
  param([Parameter(Mandatory = $true)][string]$Name)

  $sdkBin = "C:\Program Files (x86)\Windows Kits\10\bin"
  if (-not (Test-Path -LiteralPath $sdkBin)) { return $null }
  Get-ChildItem -LiteralPath $sdkBin -Recurse -Filter $Name -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\x64\\" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}

function Assert-MsixManifest {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion
  )

  [xml]$document = Get-Content -Raw -LiteralPath $Path -Encoding UTF8
  $foundationNamespace = "http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  $uapNamespace = "http://schemas.microsoft.com/appx/manifest/uap/windows10"
  if ($document.DocumentElement.GetNamespaceOfPrefix("uap") -ne $uapNamespace) {
    throw "Manifest is missing the required uap namespace: $Path"
  }

  $namespaces = [System.Xml.XmlNamespaceManager]::new($document.NameTable)
  $namespaces.AddNamespace("f", $foundationNamespace)
  $namespaces.AddNamespace("uap", $uapNamespace)

  $identity = $document.SelectSingleNode("/f:Package/f:Identity", $namespaces)
  if (-not $identity -or $identity.Version -ne $ExpectedVersion) {
    throw "Manifest Identity Version is not ${ExpectedVersion}: $Path"
  }

  $application = $document.SelectSingleNode("/f:Package/f:Applications/f:Application", $namespaces)
  if (-not $application) { throw "Manifest Application element is missing: $Path" }
  if ($application.Id -ne "App" -or
      $application.Executable -ne "offline-md-editor-viewer.exe" -or
      $application.EntryPoint -ne "Windows.FullTrustApplication") {
    throw "Manifest Application identity changed unexpectedly: $Path"
  }

  $associationPath = "/f:Package/f:Applications/f:Application/f:Extensions/" +
    "uap:Extension[@Category='windows.fileTypeAssociation']/" +
    "uap:FileTypeAssociation[@Name='markdown']/uap:SupportedFileTypes/" +
    "uap:FileType[text()='.md']"
  if (-not $document.SelectSingleNode($associationPath, $namespaces)) {
    throw "Manifest does not declare the .md file type association: $Path"
  }
}

$makeAppx = Find-WindowsSdkTool -Name "makeappx.exe"
$signTool = Find-WindowsSdkTool -Name "signtool.exe"
if (-not $makeAppx) { throw "makeappx.exe was not found. Install the Windows SDK." }
if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Release exe was not found. Run scripts/local/build-win.ps1 first: $ExePath"
}
if (-not (Test-Path -LiteralPath $ManifestTemplate)) {
  throw "Tracked MSIX manifest was not found: $ManifestTemplate"
}

$cargoText = Get-Content -Raw -LiteralPath $CargoToml
$versionMatch = [regex]::Match($cargoText, '(?m)^version\s*=\s*"(\d+\.\d+\.\d+)"')
if (-not $versionMatch.Success) { throw "Could not read a semantic version from $CargoToml" }
$cargoVersion = $versionMatch.Groups[1].Value
$packageVersion = "$cargoVersion.0"
Write-Host "Package version: $packageVersion (Cargo.toml: $cargoVersion)"

foreach ($path in @($StageDir, $VerifyDir)) {
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}
New-Item -ItemType Directory -Force -Path (Join-Path $StageDir "Assets") | Out-Null
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Copy-Item -LiteralPath $ExePath -Destination (Join-Path $StageDir "offline-md-editor-viewer.exe")

$logoNames = @(
  "Square30x30Logo.png", "Square44x44Logo.png", "Square71x71Logo.png",
  "Square89x89Logo.png", "Square107x107Logo.png", "Square142x142Logo.png",
  "Square150x150Logo.png", "Square284x284Logo.png", "Square310x310Logo.png",
  "StoreLogo.png"
)
foreach ($name in $logoNames) {
  $source = Join-Path $IconsDir $name
  if (-not (Test-Path -LiteralPath $source)) { throw "Store icon is missing: $source" }
  Copy-Item -LiteralPath $source -Destination (Join-Path $StageDir "Assets\$name")
}

$manifest = Get-Content -Raw -LiteralPath $ManifestTemplate -Encoding UTF8
$manifest = $manifest.Replace("{{VERSION}}", $packageVersion)
$stagedManifest = Join-Path $StageDir "AppxManifest.xml"
Set-Content -LiteralPath $stagedManifest -Value $manifest -Encoding UTF8 -NoNewline
Assert-MsixManifest -Path $stagedManifest -ExpectedVersion $packageVersion
Write-Host "Validated staged manifest: $stagedManifest"

$msixPath = Join-Path $OutDir "offline-md-editor-viewer-$packageVersion.msix"
if (Test-Path -LiteralPath $msixPath) { Remove-Item -LiteralPath $msixPath -Force }
& $makeAppx pack /d $StageDir /p $msixPath /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx pack failed with exit code $LASTEXITCODE" }

& $makeAppx unpack /p $msixPath /d $VerifyDir /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx unpack failed with exit code $LASTEXITCODE" }
$packedManifest = Join-Path $VerifyDir "AppxManifest.xml"
Assert-MsixManifest -Path $packedManifest -ExpectedVersion $packageVersion
Write-Host "Validated generated MSIX manifest: $packedManifest"

$certificateSubject = "CN=A454C7F3-0506-42C1-AB41-2BE056B76ABF"
if ($Sign) {
  if (-not $signTool) { throw "signtool.exe was not found. Install the Windows SDK." }
  $certificate = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $certificateSubject } |
    Select-Object -First 1
  if (-not $certificate) {
    $certificate = New-SelfSignedCertificate -Type Custom -Subject $certificateSubject `
      -KeyUsage DigitalSignature -FriendlyName "offline-md-editor-viewer MSIX (local test)" `
      -CertStoreLocation "Cert:\CurrentUser\My" `
      -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}Subject Type:End Entity")
  }
  & $signTool sign /fd SHA256 /sha1 $certificate.Thumbprint $msixPath
  if ($LASTEXITCODE -ne 0) { throw "SignTool failed with exit code $LASTEXITCODE" }

  $certificatePath = Join-Path $OutDir "offline-md-editor-viewer-local-test.cer"
  Export-Certificate -Cert $certificate -FilePath $certificatePath -Force | Out-Null
  Write-Host "Signed with local test certificate: $certificatePath"
}

if ($Install) {
  if ($Sign) {
    Add-AppxPackage -Path $msixPath
  } else {
    Add-AppxPackage -Path $msixPath -AllowUnsigned
  }
  Write-Host "Sideloaded: $msixPath"
}

Write-Host ""
Write-Host "MSIX package is ready:"
Write-Host "  $msixPath"
Write-Host "The packed manifest contains windows.fileTypeAssociation and .md."

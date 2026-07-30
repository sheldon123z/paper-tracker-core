#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$OutputDirectory,

    [ValidatePattern("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$")]
    [string]$ImageTag = "offline",

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$root = Get-OfflineDeploymentRoot
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path (Split-Path -Parent $root) "paper-tracker-offline-bundle"
}
$bundleRoot = Resolve-OfflinePath -Path $OutputDirectory
if ($bundleRoot -eq $root) {
    throw "The bundle output must not be the repository root."
}
if ($bundleRoot -eq [System.IO.Path]::GetPathRoot($bundleRoot)) {
    throw "The bundle output must not be a drive root."
}
$bundlePrefix = $bundleRoot.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
) + [System.IO.Path]::DirectorySeparatorChar
if ($root.StartsWith($bundlePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "The bundle output must not be an ancestor of the repository."
}
if ((Test-Path -LiteralPath $bundleRoot) -and -not $Force) {
    throw "Bundle target already exists: $bundleRoot. Re-run with -Force to preserve it as a timestamped backup."
}
if (Test-Path -LiteralPath $bundleRoot) {
    $existingManifest = Join-Path $bundleRoot "bundle-manifest.json"
    if (-not (Test-Path -LiteralPath $existingManifest -PathType Leaf)) {
        throw "-Force can replace only a directory containing bundle-manifest.json: $bundleRoot"
    }
    try {
        $existingBundle = Get-Content -LiteralPath $existingManifest -Raw | ConvertFrom-Json
    }
    catch {
        throw "Existing target is not a valid Paper Tracker offline bundle: $bundleRoot"
    }
    if ($existingBundle.schemaVersion -ne 1 -or -not $existingBundle.archive.file) {
        throw "Existing target does not have a recognized Paper Tracker bundle manifest: $bundleRoot"
    }
}

Assert-DockerLinux

$bundleParent = Split-Path -Parent $bundleRoot
[void](New-Item -ItemType Directory -Path $bundleParent -Force)
$stagingRoot = Join-Path $bundleParent (
    "$(Split-Path -Leaf $bundleRoot).staging-$([Guid]::NewGuid().ToString('N'))"
)
[void](New-Item -ItemType Directory -Path $stagingRoot)

$exampleEnv = Join-Path $root "offline.env.example"
$buildCompose = Join-Path $root "compose.build.yml"
$previousTag = [Environment]::GetEnvironmentVariable("PAPER_TRACKER_IMAGE_TAG", "Process")
[Environment]::SetEnvironmentVariable("PAPER_TRACKER_IMAGE_TAG", $ImageTag, "Process")
try {
    Invoke-Docker -DockerArgs @(
        "compose",
        "--env-file", $exampleEnv,
        "--project-directory", $root,
        "-f", $buildCompose,
        "config", "--quiet"
    )
    Invoke-Docker -DockerArgs @(
        "compose",
        "--env-file", $exampleEnv,
        "--project-directory", $root,
        "-f", $buildCompose,
        "build", "--pull"
    )
}
finally {
    [Environment]::SetEnvironmentVariable("PAPER_TRACKER_IMAGE_TAG", $previousTag, "Process")
}

$envValues = @{
    "PAPER_TRACKER_IMAGE_TAG" = $ImageTag
}
$imageNames = Get-OfflineImageNames -EnvValues $envValues
$imageEntries = @()
foreach ($imageName in $imageNames) {
    $imageId = (
        Invoke-Docker -DockerArgs @("image", "inspect", "--format", "{{.Id}}", $imageName) -Capture |
        Out-String
    ).Trim()
    if (-not $imageId) {
        throw "Built image has no image ID: $imageName"
    }
    $imageEntries += [pscustomobject]@{
        name = $imageName
        id = $imageId
    }
}

$archiveName = "paper-tracker-images-$ImageTag.tar"
$archivePath = Join-Path $stagingRoot $archiveName
$temporaryArchive = "$archivePath.tmp"
if (Test-Path -LiteralPath $temporaryArchive -PathType Leaf) {
    Remove-Item -LiteralPath $temporaryArchive -Force
}
Invoke-Docker -DockerArgs (@("image", "save", "--output", $temporaryArchive) + $imageNames)
Move-Item -LiteralPath $temporaryArchive -Destination $archivePath -Force

$bundleFiles = @(
    "compose.offline.yml",
    "offline.env.example",
    "docs/offline-windows-docker.md",
    "deploy/model-proxy/nginx.conf",
    "deploy/windows/Common.ps1",
    "deploy/windows/New-OfflineEnv.ps1",
    "deploy/windows/Import-OfflineBundle.ps1",
    "deploy/windows/Start-Offline.ps1",
    "deploy/windows/Backup-OfflineData.ps1",
    "deploy/windows/Restore-OfflineData.ps1",
    "deploy/windows/volume_archive.py",
    "deploy/windows/tests/test_volume_archive.py",
    "deploy/windows/tests/Test-DeploymentScripts.ps1"
)

$fileEntries = @()
foreach ($relativePath in $bundleFiles) {
    $source = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Bundle source file is missing: $source"
    }
    $destination = Join-Path $stagingRoot $relativePath
    $destinationParent = Split-Path -Parent $destination
    [void](New-Item -ItemType Directory -Path $destinationParent -Force)
    Copy-Item -LiteralPath $source -Destination $destination -Force

    $fileEntries += [pscustomobject]@{
        path = $relativePath.Replace("\", "/")
        sha256 = Get-Sha256 -Path $destination
        size = (Get-Item -LiteralPath $destination).Length
    }
}

$manifest = [ordered]@{
    schemaVersion = 1
    createdUtc = [DateTime]::UtcNow.ToString("o")
    imageTag = $ImageTag
    archive = [ordered]@{
        file = $archiveName
        sha256 = Get-Sha256 -Path $archivePath
        size = (Get-Item -LiteralPath $archivePath).Length
    }
    images = $imageEntries
    files = $fileEntries
}
$manifestPath = Join-Path $stagingRoot "bundle-manifest.json"
Write-Utf8NoBom -Path $manifestPath -Content ($manifest | ConvertTo-Json -Depth 8)

$backupRoot = $null
if (Test-Path -LiteralPath $bundleRoot) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupRoot = "$bundleRoot.bak-$timestamp-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
    Move-Item -LiteralPath $bundleRoot -Destination $backupRoot
}
try {
    Move-Item -LiteralPath $stagingRoot -Destination $bundleRoot
}
catch {
    if ($backupRoot -and -not (Test-Path -LiteralPath $bundleRoot) -and (Test-Path -LiteralPath $backupRoot)) {
        Move-Item -LiteralPath $backupRoot -Destination $bundleRoot
    }
    throw
}

Write-Host "Offline bundle created: $bundleRoot"
if ($backupRoot) {
    Write-Host "Previous bundle preserved at: $backupRoot"
}
Write-Host "Image archive SHA-256: $($manifest.archive.sha256)"
Write-Host "Transfer the entire directory; do not include a generated offline.env."

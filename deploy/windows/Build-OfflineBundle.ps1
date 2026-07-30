#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$OutputDirectory,

    [ValidatePattern("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$")]
    [string]$ImageTag = "offline",

    [string]$SeedExportDirectory,

    [string]$DataImportDirectory,

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

function Get-OfflineTreeSnapshot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $resolved = Resolve-OfflinePath -Path $Path
    $rootItem = Get-Item -LiteralPath $resolved -Force
    if (
        -not $rootItem.PSIsContainer -or
        ($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
        throw "Snapshot root must be a real directory: $resolved"
    }
    $rootPrefix = $resolved.TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar
    $records = @()
    foreach ($item in @(
        Get-ChildItem -LiteralPath $resolved -Force -Recurse |
        Sort-Object FullName
    )) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Snapshot tree contains an unsupported reparse point: $($item.FullName)"
        }
        if ($item.PSIsContainer) {
            continue
        }
        $records += [pscustomobject]@{
            path = $item.FullName.Substring($rootPrefix.Length).Replace("\", "/")
            size = [long]$item.Length
            sha256 = Get-Sha256 -Path $item.FullName
        }
    }
    return $records
}

function Assert-OfflineTreeSnapshotMatches {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Reference,

        [Parameter(Mandatory = $true)]
        [object[]]$Candidate,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if ($Reference.Count -ne $Candidate.Count) {
        throw "$Label file count changed while creating the bundle snapshot."
    }
    $candidateByPath = @{}
    foreach ($entry in $Candidate) {
        $key = ([string]$entry.path).ToLowerInvariant()
        if ($candidateByPath.ContainsKey($key)) {
            throw "$Label contains a case-insensitive duplicate path."
        }
        $candidateByPath[$key] = $entry
    }
    foreach ($expected in $Reference) {
        $key = ([string]$expected.path).ToLowerInvariant()
        if (-not $candidateByPath.ContainsKey($key)) {
            throw "$Label is missing a snapshotted file: $($expected.path)"
        }
        $actual = $candidateByPath[$key]
        if (
            [long]$actual.size -ne [long]$expected.size -or
            [string]$actual.sha256 -ne [string]$expected.sha256
        ) {
            throw "$Label changed while creating the bundle snapshot: $($expected.path)"
        }
    }
}

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
    try {
        Protect-OfflineSensitiveTree -Path $bundleRoot
    }
    catch {
        throw (
            "Existing bundle cannot be preserved safely with -Force: " +
            "$($_.Exception.Message)"
        )
    }
}

$resolvedSeedExport = $null
$resolvedDataImport = $null
$seedSecretSource = $null
if (-not [string]::IsNullOrWhiteSpace($DataImportDirectory) -and
    [string]::IsNullOrWhiteSpace($SeedExportDirectory)) {
    throw "-DataImportDirectory requires -SeedExportDirectory."
}
if (-not [string]::IsNullOrWhiteSpace($SeedExportDirectory)) {
    $resolvedSeedExport = Resolve-OfflinePath -Path $SeedExportDirectory
    if (-not (Test-Path -LiteralPath $resolvedSeedExport -PathType Container)) {
        throw "Seed export directory not found: $resolvedSeedExport"
    }

    if ([string]::IsNullOrWhiteSpace($DataImportDirectory)) {
        throw (
            "Seeded bundles require an explicit -DataImportDirectory so the " +
            "sensitive copy scope cannot expand silently."
        )
    }
    $resolvedDataImport = Resolve-OfflinePath -Path $DataImportDirectory
    if (-not (Test-Path -LiteralPath $resolvedDataImport -PathType Container)) {
        throw "Data import directory not found: $resolvedDataImport"
    }

    $dataImportPrefix = $resolvedDataImport.TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedSeedExport.StartsWith(
        $dataImportPrefix,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Seed export directory must be inside the data import directory."
    }
    if ($bundleRoot.StartsWith(
        $dataImportPrefix,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Bundle output must not be inside the data import directory."
    }

    $seedSecretSource = Join-Path $resolvedSeedExport "payload\.env"
    if (-not (Test-Path -LiteralPath $seedSecretSource -PathType Leaf)) {
        throw "Seed export secret source not found: $seedSecretSource"
    }
    # Validate the original export contract before copying sensitive data.
    [void](Read-OfflineExportSecrets -SecretsFile $seedSecretSource)
    $reparsePoint = Get-ChildItem -LiteralPath $resolvedDataImport -Force -Recurse |
        Where-Object {
            ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
        } |
        Select-Object -First 1
    if ($reparsePoint) {
        throw "Data import directory contains an unsupported reparse point: $($reparsePoint.FullName)"
    }
    $exportRelative = $resolvedSeedExport.Substring($dataImportPrefix.Length)
}

Assert-DockerLinux

$bundleParent = Split-Path -Parent $bundleRoot
[void](New-Item -ItemType Directory -Path $bundleParent -Force)
$stagingRoot = Join-Path $bundleParent (
    "$(Split-Path -Leaf $bundleRoot).staging-$([Guid]::NewGuid().ToString('N'))"
)
[void](New-Item -ItemType Directory -Path $stagingRoot)

try {
    Protect-OfflineSensitiveDirectory -Path $stagingRoot
    $sourceCopyRelative = $null
    $sourceCopyRoot = $null
    $snapshotSeedExport = $null
    $snapshotExportSecrets = $null
    if ($resolvedSeedExport) {
        # Freeze the complete data-import tree before any long image build.
        # The second source hash pass and the destination comparison ensure
        # the snapshot is one coherent, immutable input for both src and seed.
        $sourceBefore = @(Get-OfflineTreeSnapshot -Path $resolvedDataImport)
        $sourceCopyRelative = "src"
        $sourceCopyRoot = Join-Path $stagingRoot $sourceCopyRelative
        [void](New-Item -ItemType Directory -Path $sourceCopyRoot)
        Get-ChildItem -LiteralPath $resolvedDataImport -Force | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $sourceCopyRoot -Recurse -Force
        }
        $sourceAfter = @(Get-OfflineTreeSnapshot -Path $resolvedDataImport)
        $copiedSnapshot = @(Get-OfflineTreeSnapshot -Path $sourceCopyRoot)
        Assert-OfflineTreeSnapshotMatches `
            -Reference $sourceBefore `
            -Candidate $sourceAfter `
            -Label "Data import source"
        Assert-OfflineTreeSnapshotMatches `
            -Reference $sourceBefore `
            -Candidate $copiedSnapshot `
            -Label "Data import snapshot"
        Protect-OfflineSensitiveTree -Path $stagingRoot

        $snapshotSeedExport = Join-Path $sourceCopyRoot $exportRelative
        if (-not (Test-Path -LiteralPath $snapshotSeedExport -PathType Container)) {
            throw "Snapshotted seed export directory is missing."
        }
        $snapshotSecretSource = Join-Path $snapshotSeedExport "payload\.env"
        $snapshotExportSecrets = Read-OfflineExportSecrets `
            -SecretsFile $snapshotSecretSource
    }

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
    "docs/offline-install-operations-zh.md",
    "deploy/model-proxy/nginx.conf",
    "deploy/windows/Common.ps1",
    "deploy/windows/New-OfflineEnv.ps1",
    "deploy/windows/Import-OfflineBundle.ps1",
    "deploy/windows/Install-Offline.ps1",
    "deploy/windows/Start-Offline.ps1",
    "deploy/windows/Stop-Offline.ps1",
    "deploy/windows/Status-Offline.ps1",
    "deploy/windows/Backup-OfflineData.ps1",
    "deploy/windows/Restore-OfflineData.ps1",
    "deploy/windows/seed_archive.py",
    "deploy/windows/volume_archive.py",
    "deploy/windows/tests/test_seed_archive.py",
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

$seedSection = $null
if ($resolvedSeedExport) {
    $seedDataDirectory = Join-Path $stagingRoot "data"
    [void](New-Item -ItemType Directory -Path $seedDataDirectory -Force)
    $seedArchiveRelative = "data/seed-data.tar.gz"
    $seedMetadataRelative = "data/seed-metadata.json"
    $seedArchivePath = Join-Path $stagingRoot $seedArchiveRelative
    $seedMetadataPath = Join-Path $stagingRoot $seedMetadataRelative
    $seedTool = Join-Path $root "deploy\windows\seed_archive.py"
    if (-not (Test-Path -LiteralPath $seedTool -PathType Leaf)) {
        throw "Seed archive tool is missing: $seedTool"
    }

    $backendImage = @(
        $imageNames | Where-Object { $_ -match "^paper-tracker-backend:" }
    )
    if ($backendImage.Count -ne 1) {
        throw "Expected exactly one built backend image for seed preparation."
    }
    Invoke-Docker -DockerArgs @(
        "run",
        "--rm",
        "--network", "none",
        "--read-only",
        "--memory", "512m",
        "--pids-limit", "64",
        "--cpus", "2",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=128m",
        "--mount", "type=bind,source=$snapshotSeedExport,destination=/export,readonly",
        "--mount", "type=bind,source=$seedDataDirectory,destination=/output",
        "--mount", "type=bind,source=$seedTool,destination=/tool/seed_archive.py,readonly",
        $backendImage[0],
        "python", "/tool/seed_archive.py",
        "--export-root", "/export",
        "--archive", "/output/seed-data.tar.gz",
        "--metadata", "/output/seed-metadata.json"
    )
    foreach ($seedOutput in @($seedArchivePath, $seedMetadataPath)) {
        if (-not (Test-Path -LiteralPath $seedOutput -PathType Leaf)) {
            throw "Seed preparation did not create: $seedOutput"
        }
    }

    try {
        $seedMetadata = Get-Content -LiteralPath $seedMetadataPath -Raw |
            ConvertFrom-Json
    }
    catch {
        throw "Seed metadata is not valid JSON: $seedMetadataPath"
    }
    if ($seedMetadata.schemaVersion -ne 1 -or
        $seedMetadata.sourceFormat -ne "paper-tracker-backend-export-v1") {
        throw "Seed metadata has an unsupported schema or source format."
    }
    if (
        -not $seedMetadata.security -or
        $seedMetadata.security.jwtRotationRequired -ne $true -or
        [long]$seedMetadata.security.remainingSessions -ne 0 -or
        [long]$seedMetadata.security.revokedSessions -lt 0
    ) {
        throw "Seed metadata does not prove that portable sessions were revoked."
    }

    foreach ($relativePath in @($seedArchiveRelative, $seedMetadataRelative)) {
        $path = Join-Path $stagingRoot $relativePath
        $fileEntries += [pscustomobject]@{
            path = $relativePath
            sha256 = Get-Sha256 -Path $path
            size = (Get-Item -LiteralPath $path).Length
        }
    }

    # The source copy was frozen before image construction. Add every copied
    # file to the manifest without reading the live data-import tree again.
    $sourceFiles = @(
        Get-ChildItem -LiteralPath $sourceCopyRoot -Force -Recurse -File |
        Sort-Object FullName
    )
    foreach ($sourceFile in $sourceFiles) {
        $relativeWithinCopy = $sourceFile.FullName.Substring(
            $sourceCopyRoot.Length
        ).TrimStart(
            [System.IO.Path]::DirectorySeparatorChar,
            [System.IO.Path]::AltDirectorySeparatorChar
        )
        $relativePath = "$sourceCopyRelative/$($relativeWithinCopy.Replace('\', '/'))"
        $fileEntries += [pscustomobject]@{
            path = $relativePath
            sha256 = Get-Sha256 -Path $sourceFile.FullName
            size = $sourceFile.Length
        }
    }

    # The verbatim src copy retains the complete export by user request, but
    # the installer receives a purpose-specific file containing only the
    # encryption key. JWT signing material is deliberately never migrated.
    $secretRelative = "data/import-encryption.env"
    $installerSecretPath = Join-Path $stagingRoot $secretRelative
    Write-Utf8NoBom `
        -Path $installerSecretPath `
        -Content "ENCRYPTION_KEY=$($snapshotExportSecrets['ENCRYPTION_KEY'])`r`n"
    Protect-OfflineSecretFile -Path $installerSecretPath
    $fileEntries += [pscustomobject]@{
        path = $secretRelative
        sha256 = Get-Sha256 -Path $installerSecretPath
        size = (Get-Item -LiteralPath $installerSecretPath).Length
    }

    $seedSection = [ordered]@{
        schemaVersion = 1
        archive = [ordered]@{
            path = $seedArchiveRelative
            sha256 = Get-Sha256 -Path $seedArchivePath
            size = (Get-Item -LiteralPath $seedArchivePath).Length
        }
        metadata = [ordered]@{
            path = $seedMetadataRelative
            sha256 = Get-Sha256 -Path $seedMetadataPath
            size = (Get-Item -LiteralPath $seedMetadataPath).Length
        }
        secretSource = $secretRelative
        sourceCopy = $sourceCopyRelative
        expectedCounts = $seedMetadata.counts
        security = $seedMetadata.security
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
if ($seedSection) {
    $manifest["seed"] = $seedSection
}
$manifestPath = Join-Path $stagingRoot "bundle-manifest.json"
Write-Utf8NoBom -Path $manifestPath -Content ($manifest | ConvertTo-Json -Depth 8)
$manifestSidecarPath = Join-Path $stagingRoot "bundle-manifest.json.sha256"
Write-Utf8NoBom `
    -Path $manifestSidecarPath `
    -Content "$(Get-Sha256 -Path $manifestPath)  bundle-manifest.json`r`n"
Protect-OfflineSensitiveTree -Path $stagingRoot

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
if ($seedSection) {
    Write-Host "Seed data and its source export are included and integrity-protected."
    Write-Warning "This bundle contains accounts, audit data, password hashes, sessions, and encryption secrets. Store it securely."
}
else {
    Write-Host "Transfer the entire directory; do not include a generated offline.env."
}
}
catch {
    $buildError = $_
    if (Test-Path -LiteralPath $stagingRoot) {
        $resolvedStaging = [System.IO.Path]::GetFullPath($stagingRoot)
        $resolvedParent = [System.IO.Path]::GetFullPath($bundleParent)
        $stagingLeaf = Split-Path -Leaf $resolvedStaging
        $expectedPrefix = "$(Split-Path -Leaf $bundleRoot).staging-"
        if (
            [string]::Equals(
                (Split-Path -Parent $resolvedStaging),
                $resolvedParent,
                [System.StringComparison]::OrdinalIgnoreCase
            ) -and
            $stagingLeaf.StartsWith(
                $expectedPrefix,
                [System.StringComparison]::OrdinalIgnoreCase
            ) -and
            $stagingLeaf.Substring($expectedPrefix.Length) -match "^[0-9a-f]{32}$"
        ) {
            Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
        }
    }
    throw $buildError
}

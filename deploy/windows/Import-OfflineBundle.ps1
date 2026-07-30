#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$BundleDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

if ([string]::IsNullOrWhiteSpace($BundleDirectory)) {
    $BundleDirectory = Get-OfflineDeploymentRoot
}
$bundleRoot = Resolve-OfflinePath -Path $BundleDirectory
try {
    Protect-OfflineSensitiveTree -Path $bundleRoot
}
catch {
    throw (
        "The offline bundle ACL could not be restricted on this host. " +
        "Install from an NTFS directory owned by the current operator: " +
        "$($_.Exception.Message)"
    )
}
$manifestPath = Resolve-OfflineManifestPath `
    -RelativePath "bundle-manifest.json" `
    -Root $bundleRoot
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Bundle manifest not found: $manifestPath"
}
$manifestSidecar = Resolve-OfflineManifestPath `
    -RelativePath "bundle-manifest.json.sha256" `
    -Root $bundleRoot
$manifestSidecarVerified = $false
if (Test-Path -LiteralPath $manifestSidecar -PathType Leaf) {
    $sidecarHash = (
        (Get-Content -LiteralPath $manifestSidecar -Raw).Trim() -split "\s+"
    )[0].ToLowerInvariant()
    if ($sidecarHash -notmatch "^[0-9a-f]{64}$") {
        throw "Bundle manifest SHA-256 sidecar is invalid."
    }
    if ((Get-Sha256 -Path $manifestPath) -ne $sidecarHash) {
        throw "Bundle manifest SHA-256 mismatch."
    }
    $manifestSidecarVerified = $true
}

$manifest = Read-OfflineJsonFile -Path $manifestPath -Label "Bundle manifest"
if ($manifest.schemaVersion -ne 1) {
    throw "Unsupported bundle manifest schema: $($manifest.schemaVersion)"
}
$manifestTag = [string]$manifest.imageTag
if ($manifestTag -notmatch "^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$") {
    throw "Bundle manifest contains an invalid imageTag."
}
$expectedImages = Get-OfflineImageNames -EnvValues @{
    "PAPER_TRACKER_IMAGE_TAG" = $manifestTag
}
$manifestImageNames = @($manifest.images | ForEach-Object { [string]$_.name })
if (
    $manifestImageNames.Count -ne $expectedImages.Count -or
    (Compare-Object -ReferenceObject $expectedImages -DifferenceObject $manifestImageNames)
) {
    throw "Bundle manifest image list does not match imageTag '$manifestTag'."
}

$archiveLeaf = [System.IO.Path]::GetFileName([string]$manifest.archive.file)
if ($archiveLeaf -ne [string]$manifest.archive.file) {
    throw "Manifest archive path must be a filename only."
}
$archivePath = Resolve-OfflineManifestPath `
    -RelativePath $archiveLeaf `
    -Root $bundleRoot
if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw "Image archive not found: $archivePath"
}

$expectedArchiveHash = ([string]$manifest.archive.sha256).ToLowerInvariant()
if ($expectedArchiveHash -notmatch "^[0-9a-f]{64}$" -or
    [long]$manifest.archive.size -lt 0) {
    throw "Bundle manifest contains invalid image archive metadata."
}
$archiveHash = Get-Sha256 -Path $archivePath
if ($archiveHash -ne $expectedArchiveHash) {
    throw "Image archive SHA-256 mismatch. Expected $($manifest.archive.sha256), got $archiveHash."
}
if ((Get-Item -LiteralPath $archivePath).Length -ne [long]$manifest.archive.size) {
    throw "Image archive size mismatch: $archivePath"
}

$manifestFileEntries = @($manifest.files)
if ($manifestFileEntries.Count -eq 0) {
    throw "Bundle manifest does not contain any deployment files."
}
$manifestFilesByPath = @{}
foreach ($file in $manifest.files) {
    $relativePath = [string]$file.path
    $entryHash = ([string]$file.sha256).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($relativePath)) {
        throw "Bundle manifest contains an empty file path."
    }
    if ($entryHash -notmatch "^[0-9a-f]{64}$") {
        throw "Bundle manifest contains an invalid file SHA-256: $relativePath"
    }
    if ([long]$file.size -lt 0) {
        throw "Bundle manifest contains a negative file size: $relativePath"
    }
    $pathKey = $relativePath.Replace("\", "/").ToLowerInvariant()
    if ($manifestFilesByPath.ContainsKey($pathKey)) {
        throw "Bundle manifest contains a duplicate file path: $relativePath"
    }
    $manifestFilesByPath[$pathKey] = $file

    $candidate = Resolve-OfflineManifestPath `
        -RelativePath $relativePath `
        -Root $bundleRoot
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "Bundle file is missing: $relativePath"
    }
    $actualHash = Get-Sha256 -Path $candidate
    if ($actualHash -ne $entryHash) {
        throw "Bundle file SHA-256 mismatch: $relativePath"
    }
    if ((Get-Item -LiteralPath $candidate).Length -ne [long]$file.size) {
        throw "Bundle file size mismatch: $relativePath"
    }
}

if ($manifest.PSObject.Properties.Name -contains "seed") {
    if (-not $manifestSidecarVerified) {
        throw "Seeded bundles require bundle-manifest.json.sha256."
    }
    $seed = $manifest.seed
    if ($seed.schemaVersion -ne 1) {
        throw "Unsupported seed manifest schema: $($seed.schemaVersion)"
    }
    $seedPaths = @(
        [string]$seed.archive.path,
        [string]$seed.metadata.path,
        [string]$seed.secretSource
    )
    foreach ($seedPath in $seedPaths) {
        if ([string]::IsNullOrWhiteSpace($seedPath)) {
            throw "Seed manifest contains an empty required path."
        }
        $seedKey = $seedPath.Replace("\", "/").ToLowerInvariant()
        if (-not $manifestFilesByPath.ContainsKey($seedKey)) {
            throw "Seed file is not covered by the bundle file manifest: $seedPath"
        }
    }

    foreach ($seedArtifact in @($seed.archive, $seed.metadata)) {
        $artifactPath = [string]$seedArtifact.path
        $artifactEntry = $manifestFilesByPath[
            $artifactPath.Replace("\", "/").ToLowerInvariant()
        ]
        if (([string]$seedArtifact.sha256).ToLowerInvariant() -ne
            ([string]$artifactEntry.sha256).ToLowerInvariant() -or
            [long]$seedArtifact.size -ne [long]$artifactEntry.size) {
            throw "Seed artifact metadata disagrees with the bundle file manifest: $artifactPath"
        }
    }

    $sourceCopy = ([string]$seed.sourceCopy).Replace("\", "/").TrimEnd("/")
    $secretSource = ([string]$seed.secretSource).Replace("\", "/")
    if (
        $sourceCopy -cne "src" -or
        $secretSource -cne "data/import-encryption.env"
    ) {
        throw "Seed sourceCopy or secretSource does not use the supported safe layout."
    }
    $sourceCopyPath = Resolve-OfflineManifestPath `
        -RelativePath $sourceCopy `
        -Root $bundleRoot
    if (-not (Test-Path -LiteralPath $sourceCopyPath -PathType Container)) {
        throw "Seed sourceCopy directory is missing."
    }
    $secretSourcePath = Resolve-OfflineManifestPath `
        -RelativePath $secretSource `
        -Root $bundleRoot
    [void](Read-OfflineEncryptionKeyImport -SecretsFile $secretSourcePath)

    $metadataPath = Resolve-OfflineManifestPath `
        -RelativePath ([string]$seed.metadata.path) `
        -Root $bundleRoot
    try {
        $seedMetadata = Read-OfflineJsonFile -Path $metadataPath `
            -Label "Seed metadata"
    }
    catch {
        throw "Seed metadata is not valid JSON: $metadataPath"
    }
    if ($seedMetadata.schemaVersion -ne 1 -or
        $seedMetadata.sourceFormat -ne "paper-tracker-backend-export-v1") {
        throw "Seed metadata has an unsupported schema or source format."
    }
    if (
        -not $seed.security -or
        -not $seedMetadata.security -or
        $seed.security.jwtRotationRequired -ne $true -or
        $seedMetadata.security.jwtRotationRequired -ne $true -or
        [long]$seed.security.remainingSessions -ne 0 -or
        [long]$seedMetadata.security.remainingSessions -ne 0 -or
        [long]$seed.security.revokedSessions -ne
            [long]$seedMetadata.security.revokedSessions
    ) {
        throw "Seed security metadata does not prove session revocation."
    }
    foreach ($countName in @(
        "papers",
        "users",
        "auditEvents",
        "paperFiles",
        "checkpoints",
        "writes"
    )) {
        if (-not ($seed.expectedCounts.PSObject.Properties.Name -contains $countName) -or
            -not ($seedMetadata.counts.PSObject.Properties.Name -contains $countName)) {
            throw "Seed metadata is missing expected count: $countName"
        }
        $expectedCount = [long]$seed.expectedCounts.$countName
        $metadataCount = [long]$seedMetadata.counts.$countName
        if ($expectedCount -lt 0 -or $metadataCount -ne $expectedCount) {
            throw "Seed metadata count mismatch: $countName"
        }
    }
}

Assert-DockerLinux

$previousImageIds = @{}
foreach ($imageName in $expectedImages) {
    $existingIds = @(
        Invoke-Docker -DockerArgs @(
            "image", "ls", "--quiet", "--no-trunc", $imageName
        ) -Capture |
        ForEach-Object { "$_".Trim() } |
        Where-Object { $_ } |
        Select-Object -Unique
    )
    if ($existingIds.Count -gt 1) {
        throw "Docker returned multiple existing image IDs for exact tag '$imageName'."
    }
    if ($existingIds.Count -eq 1) {
        $previousImageIds[$imageName] = $existingIds[0]
    }
    else {
        $previousImageIds[$imageName] = $null
    }
}

try {
    Invoke-Docker -DockerArgs @("image", "load", "--input", $archivePath)

    foreach ($image in $manifest.images) {
        $imageName = [string]$image.name
        if ($imageName -notmatch "^paper-tracker-(backend|copilot-runtime|gateway):[A-Za-z0-9_.-]+$") {
            throw "Manifest contains an unexpected image name: $imageName"
        }
        $loadedId = (
            Invoke-Docker -DockerArgs @(
                "image", "inspect", "--format", "{{.Id}}", $imageName
            ) -Capture |
            Out-String
        ).Trim()
        if ($loadedId -ne [string]$image.id) {
            throw "Loaded image ID mismatch for $imageName. Expected $($image.id), got $loadedId."
        }
    }
}
catch {
    $importError = $_
    $rollbackErrors = @()
    foreach ($imageName in $expectedImages) {
        $previousId = $previousImageIds[$imageName]
        if ($previousId) {
            $rollbackOutput = (& docker image tag $previousId $imageName 2>&1 | Out-String).Trim()
            if ($LASTEXITCODE -ne 0) {
                $rollbackErrors += "restore $imageName`: $rollbackOutput"
            }
        }
        else {
            $currentIds = @(& docker image ls --quiet --no-trunc $imageName 2>$null)
            if ($LASTEXITCODE -ne 0) {
                $rollbackErrors += "inspect $imageName before removal"
                continue
            }
            if ($currentIds.Count -gt 0) {
                $rollbackOutput = (& docker image rm $imageName 2>&1 | Out-String).Trim()
                if ($LASTEXITCODE -ne 0) {
                    $rollbackErrors += "remove newly introduced tag $imageName`: $rollbackOutput"
                }
            }
        }
    }

    if ($rollbackErrors.Count -eq 0) {
        $rollbackSummary = "Previous image tags were restored."
    }
    else {
        $rollbackSummary = "Rollback errors: $($rollbackErrors -join '; ')"
    }
    throw [System.Exception]::new(
        "Offline image import failed. $rollbackSummary",
        $importError.Exception
    )
}

Write-Host "Verified and imported offline images from: $archivePath"
Write-Host "Image tag: $($manifest.imageTag)"

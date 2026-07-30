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
$manifestPath = Join-Path $bundleRoot "bundle-manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Bundle manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
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
$archivePath = Assert-PathWithin -Path (Join-Path $bundleRoot $archiveLeaf) -Root $bundleRoot
if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw "Image archive not found: $archivePath"
}

$archiveHash = Get-Sha256 -Path $archivePath
if ($archiveHash -ne ([string]$manifest.archive.sha256).ToLowerInvariant()) {
    throw "Image archive SHA-256 mismatch. Expected $($manifest.archive.sha256), got $archiveHash."
}

foreach ($file in $manifest.files) {
    $candidate = Assert-PathWithin -Path (Join-Path $bundleRoot ([string]$file.path)) -Root $bundleRoot
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "Bundle file is missing: $($file.path)"
    }
    $actualHash = Get-Sha256 -Path $candidate
    if ($actualHash -ne ([string]$file.sha256).ToLowerInvariant()) {
        throw "Bundle file SHA-256 mismatch: $($file.path)"
    }
    if ((Get-Item -LiteralPath $candidate).Length -ne [long]$file.size) {
        throw "Bundle file size mismatch: $($file.path)"
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

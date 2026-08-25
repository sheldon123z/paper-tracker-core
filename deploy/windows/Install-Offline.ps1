#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$BundleDirectory,

    [string]$EnvFile,

    [ValidateRange(30, 600)]
    [int]$TimeoutSeconds = 180
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

function Get-RequiredPropertyValue {
    param(
        [Parameter(Mandatory = $true)]
        [object]$InputObject,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string]$Context
    )

    $property = $InputObject.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        throw "$Context is missing required property '$Name'."
    }
    return $property.Value
}

function Get-VerifiedSeedArtifact {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Entry,

        [Parameter(Mandatory = $true)]
        [string]$Context,

        [Parameter(Mandatory = $true)]
        [string]$BundleRoot
    )

    $relativePath = [string](
        Get-RequiredPropertyValue -InputObject $Entry -Name "path" -Context $Context
    )
    $expectedHash = [string](
        Get-RequiredPropertyValue -InputObject $Entry -Name "sha256" -Context $Context
    )
    $sizeValue = Get-RequiredPropertyValue -InputObject $Entry -Name "size" -Context $Context

    if ([string]::IsNullOrWhiteSpace($relativePath)) {
        throw "$Context path must not be empty."
    }
    $expectedHash = $expectedHash.Trim().ToLowerInvariant()
    if ($expectedHash -notmatch "^[0-9a-f]{64}$") {
        throw "$Context contains an invalid SHA-256."
    }

    [long]$expectedSize = 0
    if (
        -not [long]::TryParse(
            [string]$sizeValue,
            [System.Globalization.NumberStyles]::None,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [ref]$expectedSize
        ) -or
        $expectedSize -lt 0
    ) {
        throw "$Context contains an invalid file size."
    }

    $resolvedPath = Resolve-OfflineManifestPath `
        -RelativePath $relativePath `
        -Root $BundleRoot
    if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        throw "$Context file not found: $resolvedPath"
    }
    if ((Get-Item -LiteralPath $resolvedPath).Length -ne $expectedSize) {
        throw "$Context size mismatch: $relativePath"
    }
    $actualHash = Get-Sha256 -Path $resolvedPath
    if ($actualHash -ne $expectedHash) {
        throw "$Context SHA-256 mismatch: $relativePath"
    }

    return [pscustomobject]@{
        Path = $resolvedPath
        Sha256 = $expectedHash
        Size = $expectedSize
    }
}

function Get-NonNegativeCount {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Counts,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string]$Context
    )

    $value = Get-RequiredPropertyValue `
        -InputObject $Counts `
        -Name $Name `
        -Context $Context
    [long]$count = 0
    if (
        -not [long]::TryParse(
            [string]$value,
            [System.Globalization.NumberStyles]::None,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [ref]$count
        ) -or
        $count -lt 0
    ) {
        throw "$Context property '$Name' must be a non-negative integer."
    }
    return $count
}

function Assert-FirstInstallTargetUnused {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectName,

        [Parameter(Mandatory = $true)]
        [string]$VolumeName
    )

    if ($ProjectName -notmatch "^[a-z0-9][a-z0-9_-]*$") {
        throw "Unsafe Compose project name: $ProjectName"
    }
    if ($VolumeName -notmatch "^[A-Za-z0-9][A-Za-z0-9_.-]*$") {
        throw "Unsafe Docker volume name: $VolumeName"
    }

    $volumeNames = @(
        Invoke-Docker -DockerArgs @("volume", "ls", "--quiet") -Capture |
        ForEach-Object { "$_".Trim() } |
        Where-Object { $_ }
    )
    if ($volumeNames -contains $VolumeName) {
        throw (
            "Docker volume '$VolumeName' already exists. This first-install " +
            "script refuses to overwrite or reuse an existing data volume."
        )
    }

    $containerIds = @(
        Invoke-Docker -DockerArgs @(
            "container",
            "ls",
            "--all",
            "--quiet",
            "--filter", "label=com.docker.compose.project=$ProjectName"
        ) -Capture |
        ForEach-Object { "$_".Trim() } |
        Where-Object { $_ }
    )
    if ($containerIds.Count -gt 0) {
        throw (
            "Compose project '$ProjectName' already has $($containerIds.Count) " +
            "container(s). This first-install script refuses to replace them."
        )
    }
}

$deploymentRoot = Get-OfflineDeploymentRoot
if ([string]::IsNullOrWhiteSpace($BundleDirectory)) {
    $BundleDirectory = $deploymentRoot
}
$bundleRoot = Resolve-OfflinePath -Path $BundleDirectory
if (
    -not [string]::Equals(
        $bundleRoot,
        $deploymentRoot,
        [System.StringComparison]::OrdinalIgnoreCase
    )
) {
    throw (
        "Install-Offline.ps1 must be run from the bundle being installed. " +
        "BundleDirectory must resolve to: $deploymentRoot"
    )
}
try {
    Protect-OfflineSensitiveTree -Path $bundleRoot
}
catch {
    throw (
        "The seeded bundle ACL could not be restricted on this host. " +
        "Copy it to an NTFS directory owned by the current operator before " +
        "installation: $($_.Exception.Message)"
    )
}
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path (Split-Path -Parent $bundleRoot) "runtime\offline.env"
}
$resolvedEnv = Resolve-OfflinePath -Path $EnvFile

$stage = "validating the seeded bundle"
$projectLock = $null
$volumeLock = $null
$safeToStopPartial = $false
try {
    $manifestPath = Resolve-OfflineManifestPath `
        -RelativePath "bundle-manifest.json" `
        -Root $bundleRoot
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Bundle manifest not found: $manifestPath"
    }
    $manifestSidecar = Resolve-OfflineManifestPath `
        -RelativePath "bundle-manifest.json.sha256" `
        -Root $bundleRoot
    if (-not (Test-Path -LiteralPath $manifestSidecar -PathType Leaf)) {
        throw "Seeded bundle manifest SHA-256 sidecar is missing."
    }
    else {
        $sidecarHash = (
            (Get-Content -LiteralPath $manifestSidecar -Raw).Trim() -split "\s+"
        )[0].ToLowerInvariant()
        if (
            $sidecarHash -notmatch "^[0-9a-f]{64}$" -or
            (Get-Sha256 -Path $manifestPath) -ne $sidecarHash
        ) {
            throw "Bundle manifest SHA-256 sidecar verification failed."
        }
    }
    try {
        $manifest = Read-OfflineJsonFile -Path $manifestPath `
            -Label "Bundle manifest"
    }
    catch {
        throw "Bundle manifest is not valid JSON: $manifestPath"
    }
    if (
        (Get-RequiredPropertyValue `
            -InputObject $manifest `
            -Name "schemaVersion" `
            -Context "Bundle manifest") -ne 1
    ) {
        throw "Unsupported bundle manifest schema."
    }

    $imageTag = [string](
        Get-RequiredPropertyValue `
            -InputObject $manifest `
            -Name "imageTag" `
            -Context "Bundle manifest"
    )
    if ($imageTag -notmatch "^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$") {
        throw "Bundle manifest contains an invalid imageTag."
    }

    $seed = Get-RequiredPropertyValue `
        -InputObject $manifest `
        -Name "seed" `
        -Context "Bundle manifest"
    if (
        (Get-RequiredPropertyValue `
            -InputObject $seed `
            -Name "schemaVersion" `
            -Context "Seed manifest") -ne 1
    ) {
        throw "Unsupported seed manifest schema."
    }

    $seedArchive = Get-VerifiedSeedArtifact `
        -Entry (Get-RequiredPropertyValue `
            -InputObject $seed `
            -Name "archive" `
            -Context "Seed manifest") `
        -Context "Seed archive" `
        -BundleRoot $bundleRoot
    $seedMetadataArtifact = Get-VerifiedSeedArtifact `
        -Entry (Get-RequiredPropertyValue `
            -InputObject $seed `
            -Name "metadata" `
            -Context "Seed manifest") `
        -Context "Seed metadata" `
        -BundleRoot $bundleRoot

    try {
        $seedMetadata = Read-OfflineJsonFile `
            -Path $seedMetadataArtifact.Path `
            -Label "Seed metadata"
    }
    catch {
        throw "Seed metadata is not valid JSON: $($seedMetadataArtifact.Path)"
    }
    if (
        (Get-RequiredPropertyValue `
            -InputObject $seedMetadata `
            -Name "schemaVersion" `
            -Context "Seed metadata") -ne 1 -or
        [string](
            Get-RequiredPropertyValue `
                -InputObject $seedMetadata `
                -Name "sourceFormat" `
                -Context "Seed metadata"
        ) -ne "paper-tracker-backend-export-v1"
    ) {
        throw "Seed metadata has an unsupported schema or source format."
    }

    $expectedCounts = Get-RequiredPropertyValue `
        -InputObject $seed `
        -Name "expectedCounts" `
        -Context "Seed manifest"
    $metadataCounts = Get-RequiredPropertyValue `
        -InputObject $seedMetadata `
        -Name "counts" `
        -Context "Seed metadata"
    $countSummary = @()
    foreach ($countName in @(
        "papers",
        "users",
        "auditEvents",
        "paperFiles",
        "checkpoints",
        "writes"
    )) {
        $expectedCount = Get-NonNegativeCount `
            -Counts $expectedCounts `
            -Name $countName `
            -Context "Seed expectedCounts"
        $metadataCount = Get-NonNegativeCount `
            -Counts $metadataCounts `
            -Name $countName `
            -Context "Seed metadata counts"
        if ($metadataCount -ne $expectedCount) {
            throw "Seed metadata count mismatch: $countName"
        }
        $countSummary += "$countName=$expectedCount"
    }
    $seedSecurity = Get-RequiredPropertyValue `
        -InputObject $seed `
        -Name "security" `
        -Context "Seed manifest"
    $metadataSecurity = Get-RequiredPropertyValue `
        -InputObject $seedMetadata `
        -Name "security" `
        -Context "Seed metadata"
    if (
        (Get-RequiredPropertyValue `
            -InputObject $seedSecurity `
            -Name "jwtRotationRequired" `
            -Context "Seed security") -ne $true -or
        (Get-RequiredPropertyValue `
            -InputObject $metadataSecurity `
            -Name "jwtRotationRequired" `
            -Context "Seed metadata security") -ne $true -or
        [long](Get-RequiredPropertyValue `
            -InputObject $seedSecurity `
            -Name "remainingSessions" `
            -Context "Seed security") -ne 0 -or
        [long](Get-RequiredPropertyValue `
            -InputObject $metadataSecurity `
            -Name "remainingSessions" `
            -Context "Seed metadata security") -ne 0 -or
        [long](Get-RequiredPropertyValue `
            -InputObject $seedSecurity `
            -Name "revokedSessions" `
            -Context "Seed security") -ne
        [long](Get-RequiredPropertyValue `
            -InputObject $metadataSecurity `
            -Name "revokedSessions" `
            -Context "Seed metadata security")
    ) {
        throw "Seed security metadata does not prove session revocation."
    }

    $sourceCopyRelative = [string](
        Get-RequiredPropertyValue `
            -InputObject $seed `
            -Name "sourceCopy" `
            -Context "Seed manifest"
    )
    $secretSourceRelative = [string](
        Get-RequiredPropertyValue `
            -InputObject $seed `
            -Name "secretSource" `
            -Context "Seed manifest"
    )
    $normalizedSourceCopy = $sourceCopyRelative.Replace("\", "/").TrimEnd("/")
    $normalizedSecretSource = $secretSourceRelative.Replace("\", "/")
    if (
        $normalizedSourceCopy -cne "src" -or
        $normalizedSecretSource -cne "data/import-encryption.env"
    ) {
        throw "Seed sourceCopy or secretSource does not use the supported safe layout."
    }
    $sourceCopyPath = Resolve-OfflineManifestPath `
        -RelativePath $sourceCopyRelative `
        -Root $bundleRoot
    if (-not (Test-Path -LiteralPath $sourceCopyPath -PathType Container)) {
        throw "Seed sourceCopy directory not found: $sourceCopyPath"
    }
    $secretSourcePath = Resolve-OfflineManifestPath `
        -RelativePath $secretSourceRelative `
        -Root $bundleRoot
    if (-not (Test-Path -LiteralPath $secretSourcePath -PathType Leaf)) {
        throw "Seed secretSource file not found: $secretSourcePath"
    }
    [void](Read-OfflineEncryptionKeyImport -SecretsFile $secretSourcePath)

    if (Test-Path -LiteralPath $resolvedEnv -PathType Leaf) {
        throw (
            "First installation requires a new runtime environment, but the " +
            "target already exists: $resolvedEnv. Preserve it for diagnosis; " +
            "do not overwrite or reuse unknown JWT signing material."
        )
    }
    $identitySource = Join-Path $bundleRoot "offline.env.example"
    $targetIdentity = Read-OfflineEnvFile -EnvFile $identitySource
    foreach ($identityName in @(
        "COMPOSE_PROJECT_NAME",
        "PAPER_TRACKER_DATA_VOLUME"
    )) {
        if (
            -not $targetIdentity.ContainsKey($identityName) -or
            [string]::IsNullOrWhiteSpace($targetIdentity[$identityName])
        ) {
            throw "Target environment is missing '$identityName': $identitySource"
        }
    }

    $stage = "checking the first-install target"
    Assert-DockerLinux
    $projectLock = Enter-OfflineProjectLock `
        -ProjectName $targetIdentity["COMPOSE_PROJECT_NAME"]
    $volumeLock = Enter-OfflineVolumeLock `
        -VolumeName $targetIdentity["PAPER_TRACKER_DATA_VOLUME"]
    Assert-FirstInstallTargetUnused `
        -ProjectName $targetIdentity["COMPOSE_PROJECT_NAME"] `
        -VolumeName $targetIdentity["PAPER_TRACKER_DATA_VOLUME"]
    $safeToStopPartial = $true

    $stage = "validating and importing offline images"
    & (Join-Path $PSScriptRoot "Import-OfflineBundle.ps1") `
        -BundleDirectory $bundleRoot

    $stage = "creating the external runtime environment"
    & (Join-Path $PSScriptRoot "New-OfflineEnv.ps1") `
        -EnvFile $resolvedEnv `
        -ImageTag $imageTag `
        -ImportSecretsFrom $secretSourcePath `
        -DisablePublicRegistration
    if (-not (Test-Path -LiteralPath $resolvedEnv -PathType Leaf)) {
        throw "Environment script returned without creating: $resolvedEnv"
    }
    $envValues = Assert-OfflineEnv -EnvFile $resolvedEnv
    if (
        $envValues["COMPOSE_PROJECT_NAME"] -ne
            $targetIdentity["COMPOSE_PROJECT_NAME"] -or
        $envValues["PAPER_TRACKER_DATA_VOLUME"] -ne
            $targetIdentity["PAPER_TRACKER_DATA_VOLUME"]
    ) {
        throw "Generated environment changed the preflight project or volume identity."
    }
    if (
        -not $envValues.ContainsKey("PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION") -or
        $envValues["PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION"] -ne "0"
    ) {
        throw "Public registration was not disabled in the runtime environment."
    }

    $stage = "creating stopped containers"
    Invoke-OfflineCompose -EnvFile $resolvedEnv -ComposeArgs @(
        "config", "--quiet"
    )
    Invoke-OfflineCompose -EnvFile $resolvedEnv -ComposeArgs @(
        "create",
        "--no-build",
        "--pull", "never"
    )

    $stage = "restoring seeded data"
    & (Join-Path $PSScriptRoot "Restore-OfflineData.ps1") `
        -ArchivePath $seedArchive.Path `
        -EnvFile $resolvedEnv `
        -ExpectedSha256 $seedArchive.Sha256 `
        -Force

    $stage = "starting services"
    & (Join-Path $PSScriptRoot "Start-Offline.ps1") `
        -EnvFile $resolvedEnv `
        -TimeoutSeconds $TimeoutSeconds
}
catch {
    $installError = $_
    if (
        $safeToStopPartial -and
        (Test-Path -LiteralPath $resolvedEnv -PathType Leaf)
    ) {
        try {
            Invoke-OfflineCompose `
                -EnvFile $resolvedEnv `
                -ComposeArgs @("stop") 2>$null
        }
        catch {
            Write-Warning "Could not stop partially started services after installation failure."
        }
    }
    throw (
        "Offline first installation failed while $stage. " +
        "$($installError.Exception.Message) Partially started services were stopped " +
        "when possible, but no data cleanup or deletion was attempted; any " +
        "created containers, volume, restored data, runtime environment, and " +
        "pre-restore backup were left in place for diagnosis and recovery."
    )
}
finally {
    if ($volumeLock) {
        Exit-OfflineVolumeLock -Mutex $volumeLock
    }
    if ($projectLock) {
        Exit-OfflineVolumeLock -Mutex $projectLock
    }
}

Write-Host "Seed metadata verified: $($countSummary -join ', ')"
Write-Host "Runtime environment: $resolvedEnv"
Write-Host "Offline first installation completed successfully."

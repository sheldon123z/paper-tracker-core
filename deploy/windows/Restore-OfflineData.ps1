#requires -Version 5.1

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,

    [string]$EnvFile,

    [string]$ExpectedSha256,

    [string]$SafetyBackupDirectory,

    [switch]$AllowMismatchedVolume,

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$root = Get-OfflineDeploymentRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $layout = Get-OfflineBundleLayout -Root $root
    $EnvFile = $layout.DefaultEnvFile
    if (
        $layout.IsSeeded -and
        -not (Test-Path -LiteralPath $EnvFile -PathType Leaf)
    ) {
        throw (
            "Seeded runtime environment not found: $EnvFile. " +
            "Run Install-Offline.ps1 before restoring this bundle."
        )
    }
}
if ([string]::IsNullOrWhiteSpace($SafetyBackupDirectory)) {
    $SafetyBackupDirectory = Join-Path (Split-Path -Parent $root) "paper-tracker-offline-backups\pre-restore"
}

$resolvedEnv = Resolve-OfflinePath -Path $EnvFile
$resolvedArchive = Resolve-OfflinePath -Path $ArchivePath
$resolvedSafetyDirectory = Assert-OfflineLocalPathNoReparse `
    -Path $SafetyBackupDirectory

if (-not (Test-Path -LiteralPath $resolvedArchive -PathType Leaf)) {
    throw "Restore archive not found: $resolvedArchive"
}
if ($resolvedSafetyDirectory -eq [System.IO.Path]::GetPathRoot($resolvedSafetyDirectory)) {
    throw "Safety backup directory must not be a drive root."
}

if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
    $sidecar = "$resolvedArchive.sha256"
    if (-not (Test-Path -LiteralPath $sidecar -PathType Leaf)) {
        throw "A SHA-256 sidecar is required: $sidecar. Alternatively pass -ExpectedSha256."
    }
    $sidecarText = (Get-Content -LiteralPath $sidecar -Raw).Trim()
    $ExpectedSha256 = ($sidecarText -split "\s+")[0]
}
$ExpectedSha256 = $ExpectedSha256.Trim().ToLowerInvariant()
if ($ExpectedSha256 -notmatch "^[0-9a-f]{64}$") {
    throw "Expected SHA-256 must contain exactly 64 hexadecimal characters."
}

$actualSha256 = Get-Sha256 -Path $resolvedArchive
if ($actualSha256 -ne $ExpectedSha256) {
    throw "Restore archive SHA-256 mismatch. Expected $ExpectedSha256, got $actualSha256."
}

$envValues = Assert-OfflineEnv -EnvFile $resolvedEnv
Assert-DockerLinux

$volumeName = $envValues["PAPER_TRACKER_DATA_VOLUME"]
$backendImage = "paper-tracker-backend:$($envValues["PAPER_TRACKER_IMAGE_TAG"])"
Assert-DockerImage -ImageName $backendImage
Assert-DataVolume `
    -VolumeName $volumeName `
    -ProjectName $envValues["COMPOSE_PROJECT_NAME"] `
    -AllowMismatchedLabels:$AllowMismatchedVolume

$previousConfirmPreference = $ConfirmPreference
if ($Force) {
    $ConfirmPreference = "None"
}
try {
    $approved = $PSCmdlet.ShouldProcess(
        "Docker volume '$volumeName'",
        "Create a verified safety backup, then replace its data from '$resolvedArchive'"
    )
}
finally {
    $ConfirmPreference = $previousConfirmPreference
}
if (-not $approved) {
    return
}

[void](Assert-OfflineLocalPathNoReparse -Path $resolvedSafetyDirectory)
[void](New-Item -ItemType Directory -Path $resolvedSafetyDirectory -Force)
[void](Assert-OfflineLocalPathNoReparse -Path $resolvedSafetyDirectory)
Protect-OfflineSensitiveDirectory -Path $resolvedSafetyDirectory
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$suffix = [Guid]::NewGuid().ToString("N").Substring(0, 8)
$safetyName = "pre-restore-$timestamp-$suffix.tar.gz"
$safetyArchive = Assert-OfflineLocalPathNoReparse -Path (
    Join-Path $resolvedSafetyDirectory $safetyName
)

$runningServices = @()
$projectLock = Enter-OfflineProjectLock `
    -ProjectName $envValues["COMPOSE_PROJECT_NAME"]
try {
    $volumeLock = Enter-OfflineVolumeLock -VolumeName $volumeName
    try {
        $runningServices = @(Get-RunningOfflineServices -EnvFile $resolvedEnv)
        # Stop all possible request paths and the sole writer unconditionally.
        # Compose stop is idempotent and also catches a backend in "restarting".
        Invoke-OfflineCompose -EnvFile $resolvedEnv -ComposeArgs @(
            "stop", "gateway", "copilot-runtime", "backend"
        )

        # This mandatory pre-restore archive is created while the writer is
        # stopped. The formal replacement does not begin unless its hash verifies.
        [void](Assert-OfflineLocalPathNoReparse -Path $resolvedSafetyDirectory)
        [void](Assert-OfflineLocalPathNoReparse -Path $safetyArchive)
        Invoke-VolumeArchiveTool `
            -Mode backup `
            -ImageName $backendImage `
            -VolumeName $volumeName `
            -ArchivePath $safetyArchive
        Protect-OfflineSecretFile -Path $safetyArchive
        $safetySha256 = Get-Sha256 -Path $safetyArchive
        $safetyShaPath = Assert-OfflineLocalPathNoReparse `
            -Path "$safetyArchive.sha256"
        Write-Utf8NoBom `
            -Path $safetyShaPath `
            -Content "$safetySha256  $safetyName`r`n"
        Protect-OfflineSecretFile -Path $safetyShaPath
        if ((Get-Sha256 -Path $safetyArchive) -ne $safetySha256) {
            throw "Mandatory pre-restore backup failed SHA-256 verification."
        }

        # Detect replacement or corruption after the initial source verification.
        if ((Get-Sha256 -Path $resolvedArchive) -ne $ExpectedSha256) {
            throw "Restore archive changed after the initial SHA-256 verification."
        }

        Invoke-VolumeArchiveTool `
            -Mode restore `
            -ImageName $backendImage `
            -VolumeName $volumeName `
            -ArchivePath $resolvedArchive
    }
    finally {
        try {
            if ($runningServices.Count -gt 0) {
                Start-PreviouslyRunningServices -EnvFile $resolvedEnv -Services $runningServices
            }
        }
        finally {
            Exit-OfflineVolumeLock -Mutex $volumeLock
        }
    }
}
finally {
    Exit-OfflineVolumeLock -Mutex $projectLock
}

Write-Host "Restore completed from: $resolvedArchive"
Write-Host "Verified pre-restore backup retained at: $safetyArchive"
Write-Host "Pre-restore backup SHA-256: $safetySha256"

#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$EnvFile,

    [string]$BackupDirectory,

    [switch]$AllowMismatchedVolume
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
            "Run Install-Offline.ps1 before backing up this bundle."
        )
    }
}
if ([string]::IsNullOrWhiteSpace($BackupDirectory)) {
    $BackupDirectory = Join-Path (Split-Path -Parent $root) "paper-tracker-offline-backups"
}

$resolvedEnv = Resolve-OfflinePath -Path $EnvFile
$resolvedBackupDirectory = Assert-OfflineLocalPathNoReparse -Path $BackupDirectory
if ($resolvedBackupDirectory -eq [System.IO.Path]::GetPathRoot($resolvedBackupDirectory)) {
    throw "Backup directory must not be a drive root."
}
[void](Assert-OfflineLocalPathNoReparse -Path $resolvedBackupDirectory)
[void](New-Item -ItemType Directory -Path $resolvedBackupDirectory -Force)
[void](Assert-OfflineLocalPathNoReparse -Path $resolvedBackupDirectory)
Protect-OfflineSensitiveDirectory -Path $resolvedBackupDirectory

$envValues = Assert-OfflineEnv -EnvFile $resolvedEnv
Assert-DockerLinux

$volumeName = $envValues["PAPER_TRACKER_DATA_VOLUME"]
$backendImage = "paper-tracker-backend:$($envValues["PAPER_TRACKER_IMAGE_TAG"])"
Assert-DockerImage -ImageName $backendImage
Assert-DataVolume `
    -VolumeName $volumeName `
    -ProjectName $envValues["COMPOSE_PROJECT_NAME"] `
    -AllowMismatchedLabels:$AllowMismatchedVolume

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$suffix = [Guid]::NewGuid().ToString("N").Substring(0, 8)
$archiveName = "paper-tracker-data-$timestamp-$suffix.tar.gz"
$archivePath = Assert-OfflineLocalPathNoReparse -Path (
    Join-Path $resolvedBackupDirectory $archiveName
)
$temporaryPath = Assert-OfflineLocalPathNoReparse -Path "$archivePath.partial"

$runningServices = @()
$volumeLock = $null
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

        [void](Assert-OfflineLocalPathNoReparse -Path $resolvedBackupDirectory)
        [void](Assert-OfflineLocalPathNoReparse -Path $temporaryPath)
        Invoke-VolumeArchiveTool `
            -Mode backup `
            -ImageName $backendImage `
            -VolumeName $volumeName `
            -ArchivePath $temporaryPath

        if (-not (Test-Path -LiteralPath $temporaryPath -PathType Leaf)) {
            throw "Backup helper returned without creating: $temporaryPath"
        }
        Protect-OfflineSecretFile -Path $temporaryPath
        [void](Assert-OfflineLocalPathNoReparse -Path $archivePath)
        Move-Item -LiteralPath $temporaryPath -Destination $archivePath
        Protect-OfflineSecretFile -Path $archivePath

        $sha256 = Get-Sha256 -Path $archivePath
        $shaPath = Assert-OfflineLocalPathNoReparse -Path "$archivePath.sha256"
        Write-Utf8NoBom -Path $shaPath -Content "$sha256  $archiveName`r`n"
        Protect-OfflineSecretFile -Path $shaPath

        if ((Get-Sha256 -Path $archivePath) -ne $sha256) {
            throw "Backup changed while its checksum was being written."
        }
    }
    finally {
        try {
            if ($runningServices.Count -gt 0) {
                Start-PreviouslyRunningServices -EnvFile $resolvedEnv -Services $runningServices
            }
        }
        finally {
            if ($null -ne $volumeLock) {
                Exit-OfflineVolumeLock -Mutex $volumeLock
            }
        }
    }
}
finally {
    Exit-OfflineVolumeLock -Mutex $projectLock
}

Write-Host "Offline data backup created: $archivePath"
Write-Host "SHA-256: $sha256"
Write-Output $archivePath

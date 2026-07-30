#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$EnvFile,

    [ValidateRange(30, 600)]
    [int]$TimeoutSeconds = 180
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$root = Get-OfflineDeploymentRoot
$manifestPath = Join-Path $root "bundle-manifest.json"
$isSeededBundle = $false
$seededImageTag = $null
if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw |
            ConvertFrom-Json
        $isSeededBundle = $manifest.PSObject.Properties.Name -contains "seed"
        if ($isSeededBundle) {
            $seededImageTag = [string]$manifest.imageTag
        }
    }
    catch {
        throw "Bundle manifest is not valid JSON: $manifestPath"
    }
}
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    if ($isSeededBundle) {
        $EnvFile = Join-Path (Split-Path -Parent $root) "runtime\offline.env"
    }
    else {
        $EnvFile = Join-Path $root "offline.env"
    }
}
$resolvedEnv = Resolve-OfflinePath -Path $EnvFile

if ($isSeededBundle) {
    if (-not (Test-Path -LiteralPath $resolvedEnv -PathType Leaf)) {
        throw (
            "Seeded runtime environment not found: $resolvedEnv. " +
            "Run Install-Offline.ps1 before starting this bundle; Start-Offline.ps1 " +
            "will never create replacement keys for seeded data."
        )
    }
}
else {
    & (Join-Path $PSScriptRoot "New-OfflineEnv.ps1") -EnvFile $resolvedEnv
    if (-not (Test-Path -LiteralPath $resolvedEnv -PathType Leaf)) {
        throw "Offline environment script returned without creating: $resolvedEnv"
    }
}

$envValues = Assert-OfflineEnv -EnvFile $resolvedEnv
if (
    $isSeededBundle -and
    (
        $envValues["PAPER_TRACKER_IMAGE_TAG"] -ne $seededImageTag -or
        $envValues["PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION"] -ne "0"
    )
) {
    throw "Seeded runtime environment does not match the bundle tag or registration policy."
}
Assert-DockerLinux
Assert-OfflineImages -EnvValues $envValues

$volumeLock = Enter-OfflineVolumeLock `
    -VolumeName $envValues["PAPER_TRACKER_DATA_VOLUME"]
try {
    Invoke-OfflineCompose -EnvFile $resolvedEnv -ComposeArgs @("config", "--quiet")
    Invoke-OfflineCompose -EnvFile $resolvedEnv -ComposeArgs @(
        "up",
        "--detach",
        "--no-build",
        "--pull", "never",
        "--wait",
        "--wait-timeout", "$TimeoutSeconds"
    )

    try {
        $response = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri "http://127.0.0.1:8080/" `
            -TimeoutSec 10
        if ($response.StatusCode -ne 200) {
            throw "Gateway returned HTTP $($response.StatusCode)."
        }
    }
    catch {
        throw "Containers started, but the loopback gateway check failed: $($_.Exception.Message)"
    }
}
finally {
    Exit-OfflineVolumeLock -Mutex $volumeLock
}

Write-Host "Paper Tracker is ready at http://127.0.0.1:8080/"
Write-Host "Only the loopback gateway is published; backend and CopilotRuntime remain internal."

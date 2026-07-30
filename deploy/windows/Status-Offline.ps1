#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$EnvFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$root = Get-OfflineDeploymentRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $manifestPath = Join-Path $root "bundle-manifest.json"
    $isSeededBundle = $false
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        try {
            $manifest = Get-Content -LiteralPath $manifestPath -Raw |
                ConvertFrom-Json
            $isSeededBundle = $manifest.PSObject.Properties.Name -contains "seed"
        }
        catch {
            throw "Bundle manifest is not valid JSON: $manifestPath"
        }
    }
    if ($isSeededBundle) {
        $EnvFile = Join-Path (Split-Path -Parent $root) "runtime\offline.env"
        if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
            throw (
                "Seeded runtime environment not found: $EnvFile. " +
                "Run Install-Offline.ps1 before checking this bundle."
            )
        }
    }
    else {
        $EnvFile = Join-Path $root "offline.env"
    }
}
$resolvedEnv = Resolve-OfflinePath -Path $EnvFile

$envValues = Assert-OfflineEnv -EnvFile $resolvedEnv
Assert-DockerLinux
Invoke-OfflineCompose -EnvFile $resolvedEnv -ComposeArgs @("config", "--quiet")

Write-Host "Compose project: $($envValues["COMPOSE_PROJECT_NAME"])"
Write-Host "Data volume: $($envValues["PAPER_TRACKER_DATA_VOLUME"])"
Write-Host ""
Invoke-OfflineCompose -EnvFile $resolvedEnv -ComposeArgs @("ps", "--all")

try {
    $response = Invoke-WebRequest `
        -UseBasicParsing `
        -Uri "http://127.0.0.1:8080/" `
        -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host ""
        Write-Host "Loopback gateway: reachable at http://127.0.0.1:8080/"
    }
    else {
        Write-Warning "Loopback gateway returned HTTP $($response.StatusCode)."
    }
}
catch {
    Write-Host ""
    Write-Host "Loopback gateway: not reachable (the deployment may be stopped or unhealthy)."
}

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
    $layout = Get-OfflineBundleLayout -Root $root
    $EnvFile = $layout.DefaultEnvFile
    if ($layout.IsSeeded) {
        if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
            throw (
                "Seeded runtime environment not found: $EnvFile. " +
                "Run Install-Offline.ps1 before checking this bundle."
            )
        }
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

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
                "Run Install-Offline.ps1 before stopping this bundle."
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
Invoke-OfflineCompose -EnvFile $resolvedEnv -ComposeArgs @("stop")

Write-Host "Paper Tracker services are stopped."
Write-Host "Compose project: $($envValues["COMPOSE_PROJECT_NAME"])"
Write-Host "The containers and data volume were preserved."

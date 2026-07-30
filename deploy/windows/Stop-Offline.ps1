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
                "Run Install-Offline.ps1 before stopping this bundle."
            )
        }
    }
}
$resolvedEnv = Resolve-OfflinePath -Path $EnvFile

$envValues = Assert-OfflineEnv -EnvFile $resolvedEnv
Assert-DockerLinux
Invoke-OfflineCompose -EnvFile $resolvedEnv -ComposeArgs @("stop")

Write-Host "Paper Tracker services are stopped."
Write-Host "Compose project: $($envValues["COMPOSE_PROJECT_NAME"])"
Write-Host "The containers and data volume were preserved."

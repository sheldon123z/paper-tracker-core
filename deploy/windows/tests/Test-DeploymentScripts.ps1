#requires -Version 5.1

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$sourceRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot "..\..\..")
)
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
    "paper-tracker-offline-script-test-$([Guid]::NewGuid().ToString('N'))"
)
$testScripts = Join-Path $testRoot "deploy\windows"

try {
    [void](New-Item -ItemType Directory -Path $testScripts -Force)
    Copy-Item -LiteralPath (Join-Path $sourceRoot "offline.env.example") -Destination $testRoot
    Copy-Item -LiteralPath (Join-Path $sourceRoot "deploy\windows\Common.ps1") -Destination $testScripts
    Copy-Item -LiteralPath (Join-Path $sourceRoot "deploy\windows\New-OfflineEnv.ps1") -Destination $testScripts

    $manifest = @{
        schemaVersion = 1
        imageTag = "custom-airgap-tag"
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText(
        (Join-Path $testRoot "bundle-manifest.json"),
        $manifest,
        (New-Object System.Text.UTF8Encoding($false))
    )

    & (Join-Path $testScripts "New-OfflineEnv.ps1")
    $generated = Get-Content -LiteralPath (Join-Path $testRoot "offline.env") -Raw
    if ($generated -notmatch "(?m)^PAPER_TRACKER_IMAGE_TAG=custom-airgap-tag$") {
        throw "New-OfflineEnv.ps1 did not adopt bundle-manifest.json imageTag."
    }
    if ($generated -match "REPLACE_WITH_GENERATED_") {
        throw "New-OfflineEnv.ps1 left a secret placeholder in the generated file."
    }
    $generatedValues = @{}
    foreach ($line in ($generated -split "\r?\n")) {
        if ($line -match "^([^#=][^=]*)=(.*)$") {
            $generatedValues[$Matches[1]] = $Matches[2]
        }
    }

    $allowedSids = @(
        [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
        "S-1-5-18",
        "S-1-5-32-544"
    )
    $generatedAcl = Get-Acl -LiteralPath (Join-Path $testRoot "offline.env")
    if (-not $generatedAcl.AreAccessRulesProtected) {
        throw "Generated offline.env still inherits ACL entries."
    }
    foreach ($rule in @($generatedAcl.Access)) {
        $sid = $rule.IdentityReference.Translate(
            [System.Security.Principal.SecurityIdentifier]
        ).Value
        if (
            $rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
            $sid -notin $allowedSids
        ) {
            throw "Generated offline.env grants access to unexpected SID: $sid"
        }
    }

    & (Join-Path $testScripts "New-OfflineEnv.ps1") -Force
    $forcedValues = & {
        . (Join-Path $testScripts "Common.ps1")
        Read-OfflineEnvFile -EnvFile (Join-Path $testRoot "offline.env")
    }
    foreach ($secretName in @(
        "ENCRYPTION_KEY",
        "JWT_SECRET_KEY",
        "PAPER_TRACKER_SERVICE_TOKEN",
        "LLM_CONFIG_ADMIN_TOKEN"
    )) {
        if ($forcedValues[$secretName] -ne $generatedValues[$secretName]) {
            throw "Forced environment refresh unexpectedly rotated $secretName."
        }
    }
    $backupFile = Get-ChildItem -LiteralPath $testRoot -File -Filter "offline.env.bak-*" |
        Select-Object -First 1
    if (-not $backupFile) {
        throw "Forced environment regeneration did not retain a backup."
    }
    $backupAcl = Get-Acl -LiteralPath $backupFile.FullName
    if (-not $backupAcl.AreAccessRulesProtected) {
        throw "offline.env backup still inherits ACL entries."
    }
    foreach ($rule in @($backupAcl.Access)) {
        $sid = $rule.IdentityReference.Translate(
            [System.Security.Principal.SecurityIdentifier]
        ).Value
        if (
            $rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
            $sid -notin $allowedSids
        ) {
            throw "offline.env backup grants access to unexpected SID: $sid"
        }
    }

    $manifest = @{
        schemaVersion = 1
        imageTag = "upgraded-airgap-tag"
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText(
        (Join-Path $testRoot "bundle-manifest.json"),
        $manifest,
        (New-Object System.Text.UTF8Encoding($false))
    )
    & (Join-Path $testScripts "New-OfflineEnv.ps1")
    $upgradedValues = & {
        . (Join-Path $testScripts "Common.ps1")
        Read-OfflineEnvFile -EnvFile (Join-Path $testRoot "offline.env")
    }
    if ($upgradedValues["PAPER_TRACKER_IMAGE_TAG"] -ne "upgraded-airgap-tag") {
        throw "Existing environment did not adopt the upgraded bundle image tag."
    }
    foreach ($secretName in @(
        "ENCRYPTION_KEY",
        "JWT_SECRET_KEY",
        "PAPER_TRACKER_SERVICE_TOKEN",
        "LLM_CONFIG_ADMIN_TOKEN"
    )) {
        if ($upgradedValues[$secretName] -ne $generatedValues[$secretName]) {
            throw "Bundle tag upgrade unexpectedly rotated $secretName."
        }
    }

    Write-Host "Deployment script tests passed."
}
finally {
    $resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if (
        $resolvedTestRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedTestRoot) -like "paper-tracker-offline-script-test-*"
    ) {
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

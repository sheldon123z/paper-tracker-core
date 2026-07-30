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

function Assert-RestrictedSecretAcl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string[]]$AllowedSids,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected) {
        throw "$Label still inherits ACL entries."
    }
    foreach ($rule in @($acl.Access)) {
        $sid = $rule.IdentityReference.Translate(
            [System.Security.Principal.SecurityIdentifier]
        ).Value
        if (
            $rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
            $sid -notin $AllowedSids
        ) {
            throw "$Label grants access to unexpected SID: $sid"
        }
    }
}

function Assert-NoSecretDisclosure {
    param(
        [AllowEmptyString()]
        [string]$Text,

        [Parameter(Mandatory = $true)]
        [hashtable]$Secrets,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    foreach ($secretName in @($Secrets.Keys)) {
        $secretValue = [string]$Secrets[$secretName]
        if (
            -not [string]::IsNullOrEmpty($secretValue) -and
            $Text.Contains($secretValue)
        ) {
            throw "$Label disclosed $secretName."
        }
    }
}

function Get-OfflineSecretValues {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Values
    )

    $secrets = @{}
    foreach ($secretName in @(
        "ENCRYPTION_KEY",
        "JWT_SECRET_KEY",
        "PAPER_TRACKER_SERVICE_TOKEN",
        "LLM_CONFIG_ADMIN_TOKEN"
    )) {
        if ($Values.ContainsKey($secretName)) {
            $secrets[$secretName] = $Values[$secretName]
        }
    }
    return $secrets
}

function Write-ProtectedTestFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Content
    )

    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        [void](New-Item -ItemType Directory -Path $parent -Force)
    }
    [System.IO.File]::WriteAllText(
        $Path,
        $Content,
        (New-Object System.Text.UTF8Encoding($false))
    )
    Protect-OfflineSecretFile -Path $Path
}

try {
    [void](New-Item -ItemType Directory -Path $testScripts -Force)
    Copy-Item -LiteralPath (Join-Path $sourceRoot "offline.env.example") -Destination $testRoot
    Copy-Item -LiteralPath (Join-Path $sourceRoot "deploy\windows\Common.ps1") -Destination $testScripts
    Copy-Item -LiteralPath (Join-Path $sourceRoot "deploy\windows\New-OfflineEnv.ps1") -Destination $testScripts
    $commonScript = Join-Path $testScripts "Common.ps1"
    $newOfflineEnvScript = Join-Path $testScripts "New-OfflineEnv.ps1"
    . $commonScript

    $originalDriveTypeHelper = (
        Get-Command Get-OfflineDriveType -CommandType Function
    ).ScriptBlock
    try {
        Set-Item -Path Function:Get-OfflineDriveType -Value {
            param(
                [Parameter(Mandatory = $true)]
                [string]$PathRoot
            )

            return [System.IO.DriveType]::Network
        }
        $mappedDriveFailure = $null
        try {
            [void](Assert-OfflineLocalPathNoReparse `
                -Path (Join-Path $testRoot "mapped-drive"))
        }
        catch {
            $mappedDriveFailure = $_
        }
        if (
            -not $mappedDriveFailure -or
            $mappedDriveFailure.Exception.Message -notmatch
                "mapped network drive"
        ) {
            throw "Sensitive-path validation did not reject a mapped network drive."
        }
    }
    finally {
        Set-Item -Path Function:Get-OfflineDriveType `
            -Value $originalDriveTypeHelper
    }

    $stagingTestBundle = Join-Path $testRoot (
        "deep\bundle\destination\package"
    )
    [void](New-Item -ItemType Directory `
        -Path (Split-Path -Parent $stagingTestBundle) -Force)
    $stagingSelection = New-OfflineStagingDirectory `
        -BundleRoot $stagingTestBundle
    $stagingVolume = [System.IO.Path]::GetPathRoot($stagingSelection.Path)
    if (
        -not (Test-Path -LiteralPath $stagingSelection.Path -PathType Container) -or
        $stagingSelection.Prefix -cne ".ptb-" -or
        -not [string]::Equals(
            $stagingVolume,
            [System.IO.Path]::GetPathRoot($stagingTestBundle),
            [System.StringComparison]::OrdinalIgnoreCase
        ) -or
        $stagingSelection.Path.Length -ge
            ((Split-Path -Parent $stagingTestBundle).Length + 38)
    ) {
        throw "Staging directory selection was not short, writable, and same-volume."
    }
    [System.IO.Directory]::Delete($stagingSelection.Path)

    $stagingOutside = Join-Path $testRoot "staging-outside"
    $stagingJunction = Join-Path $testRoot "staging-junction"
    [void](New-Item -ItemType Directory -Path $stagingOutside)
    [void](New-Item -ItemType Junction -Path $stagingJunction `
        -Target $stagingOutside)
    $stagingJunctionFailure = $null
    try {
        [void](New-OfflineStagingDirectory `
            -BundleRoot (Join-Path $stagingJunction "package"))
    }
    catch {
        $stagingJunctionFailure = $_
    }
    if (
        -not $stagingJunctionFailure -or
        $stagingJunctionFailure.Exception.Message -notmatch "reparse point"
    ) {
        throw "Staging selection did not reject a junction ancestor."
    }
    [System.IO.Directory]::Delete($stagingJunction)

    $nonSeededRoot = Join-Path $testRoot "layout-nonseeded\package"
    [void](New-Item -ItemType Directory -Path $nonSeededRoot -Force)
    [System.IO.File]::WriteAllText(
        (Join-Path $nonSeededRoot "bundle-manifest.json"),
        (@{
            schemaVersion = 1
            imageTag = "regular-layout"
        } | ConvertTo-Json),
        (New-Object System.Text.UTF8Encoding($false))
    )
    $nonSeededLayout = Get-OfflineBundleLayout -Root $nonSeededRoot
    if (
        $nonSeededLayout.IsSeeded -or
        $nonSeededLayout.ImageTag -cne "regular-layout" -or
        $nonSeededLayout.DefaultEnvFile -cne
            (Join-Path $nonSeededRoot "offline.env")
    ) {
        throw "Non-seeded bundle did not select its root offline.env."
    }

    $seededRoot = Join-Path $testRoot "layout-seeded\package"
    [void](New-Item -ItemType Directory -Path $seededRoot -Force)
    [System.IO.File]::WriteAllText(
        (Join-Path $seededRoot "bundle-manifest.json"),
        (@{
            schemaVersion = 1
            imageTag = "seeded-layout"
            files = @(
                @{
                    path = "论文/中文文件名.pdf"
                }
            )
            seed = @{
                schemaVersion = 1
            }
        } | ConvertTo-Json -Depth 4),
        (New-Object System.Text.UTF8Encoding($false))
    )
    $utf8Manifest = Read-OfflineJsonFile `
        -Path (Join-Path $seededRoot "bundle-manifest.json") `
        -Label "UTF-8 test manifest"
    if ($utf8Manifest.files[0].path -cne "论文/中文文件名.pdf") {
        throw "UTF-8 JSON reader corrupted a non-ASCII manifest path."
    }
    $seededLayout = Get-OfflineBundleLayout -Root $seededRoot
    $expectedSeededEnv = Join-Path (
        Split-Path -Parent $seededRoot
    ) "runtime\offline.env"
    if (
        -not $seededLayout.IsSeeded -or
        $seededLayout.ImageTag -cne "seeded-layout" -or
        $seededLayout.DefaultEnvFile -cne $expectedSeededEnv
    ) {
        throw "Seeded bundle did not select its sibling runtime offline.env."
    }
    foreach ($scriptName in @(
        "Start-Offline.ps1",
        "Stop-Offline.ps1",
        "Status-Offline.ps1",
        "Backup-OfflineData.ps1",
        "Restore-OfflineData.ps1"
    )) {
        $scriptText = Get-Content -LiteralPath (
            Join-Path $sourceRoot "deploy\windows\$scriptName"
        ) -Raw
        if ($scriptText -notmatch "\bGet-OfflineBundleLayout\b") {
            throw "$scriptName does not use the shared bundle layout resolver."
        }
    }

    $aclBundle = Join-Path $testRoot "acl-bundle"
    $aclOutside = Join-Path $testRoot "acl-outside"
    [void](New-Item -ItemType Directory -Path $aclBundle, $aclOutside)
    $outsideSentinel = Join-Path $aclOutside "sentinel.txt"
    [System.IO.File]::WriteAllText($outsideSentinel, "sentinel")
    $outsideAclBefore = (Get-Acl -LiteralPath $outsideSentinel).Sddl
    $junctionPath = Join-Path $aclBundle "escape"
    [void](New-Item -ItemType Junction -Path $junctionPath -Target $aclOutside)
    $reparseFailure = $null
    try {
        Protect-OfflineSensitiveTree -Path $aclBundle
    }
    catch {
        $reparseFailure = $_
    }
    if (
        -not $reparseFailure -or
        $reparseFailure.Exception.Message -notmatch "reparse point"
    ) {
        throw "Sensitive-tree ACL protection did not reject a junction."
    }
    if ((Get-Acl -LiteralPath $outsideSentinel).Sddl -ne $outsideAclBefore) {
        throw "Sensitive-tree ACL protection changed an outside target ACL."
    }
    [System.IO.Directory]::Delete($junctionPath)
    $runtimeJunction = Join-Path $testRoot "runtime-junction"
    [void](New-Item -ItemType Junction -Path $runtimeJunction -Target $aclOutside)
    $runtimeJunctionFailure = $null
    try {
        & $newOfflineEnvScript `
            -EnvFile (Join-Path $runtimeJunction "offline.env") 6>&1 |
            Out-Null
    }
    catch {
        $runtimeJunctionFailure = $_
    }
    if (
        -not $runtimeJunctionFailure -or
        $runtimeJunctionFailure.Exception.Message -notmatch "reparse point"
    ) {
        throw "New-OfflineEnv.ps1 did not reject a junction in the runtime path."
    }
    if (Test-Path -LiteralPath (Join-Path $aclOutside "offline.env")) {
        throw "New-OfflineEnv.ps1 wrote secrets through a runtime junction."
    }
    [System.IO.Directory]::Delete($runtimeJunction)

    $manifest = @{
        schemaVersion = 1
        imageTag = "custom-airgap-tag"
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText(
        (Join-Path $testRoot "bundle-manifest.json"),
        $manifest,
        (New-Object System.Text.UTF8Encoding($false))
    )

    $initialOutput = (& $newOfflineEnvScript 6>&1 | Out-String)
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
    Assert-NoSecretDisclosure -Text $initialOutput `
        -Secrets (Get-OfflineSecretValues -Values $generatedValues) `
        -Label "Initial environment generation"

    $allowedSids = @(
        [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
        "S-1-5-18",
        "S-1-5-32-544"
    )
    Assert-RestrictedSecretAcl -Path (Join-Path $testRoot "offline.env") `
        -AllowedSids $allowedSids -Label "Generated offline.env"

    $forceOutput = (& $newOfflineEnvScript -Force 6>&1 | Out-String)
    $forcedValues = Read-OfflineEnvFile -EnvFile (Join-Path $testRoot "offline.env")
    Assert-NoSecretDisclosure -Text $forceOutput `
        -Secrets (Get-OfflineSecretValues -Values $forcedValues) `
        -Label "Forced environment refresh"
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
    Assert-RestrictedSecretAcl -Path $backupFile.FullName `
        -AllowedSids $allowedSids -Label "offline.env backup"

    $manifest = @{
        schemaVersion = 1
        imageTag = "upgraded-airgap-tag"
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText(
        (Join-Path $testRoot "bundle-manifest.json"),
        $manifest,
        (New-Object System.Text.UTF8Encoding($false))
    )
    $upgradeOutput = (& $newOfflineEnvScript 6>&1 | Out-String)
    $upgradedValues = Read-OfflineEnvFile -EnvFile (Join-Path $testRoot "offline.env")
    Assert-NoSecretDisclosure -Text $upgradeOutput `
        -Secrets (Get-OfflineSecretValues -Values $upgradedValues) `
        -Label "Bundle tag upgrade"
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
    if ($upgradedValues["PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION"] -ne "1") {
        throw "Default environment generation unexpectedly disabled public registration."
    }

    $sourceEncryption = New-SecureBase64Url -ByteCount 32 -KeepPadding
    $sourceJwt = New-SecureBase64Url -ByteCount 64
    $validExportPath = Join-Path $testRoot "secret-input\valid-export.env"
    $validExportContent = @(
        "# The backend export contains exactly these two secrets.",
        "ENCRYPTION_KEY=$sourceEncryption",
        "JWT_SECRET_KEY=$sourceJwt"
    ) -join [Environment]::NewLine
    Write-ProtectedTestFile -Path $validExportPath -Content $validExportContent
    $exportValues = Read-OfflineExportSecrets -SecretsFile $validExportPath
    if (
        $exportValues["ENCRYPTION_KEY"] -cne $sourceEncryption -or
        $exportValues["JWT_SECRET_KEY"] -cne $sourceJwt
    ) {
        throw "Export secret validation did not preserve the validated values."
    }

    $extraSecret = New-SecureBase64Url -ByteCount 32
    $invalidExportCases = @(
        @{
            Name = "missing-jwt"
            Expected = "missing required setting 'JWT_SECRET_KEY'"
            Content = "ENCRYPTION_KEY=$sourceEncryption"
        },
        @{
            Name = "extra-key"
            Expected = "unsupported setting 'PAPER_TRACKER_SERVICE_TOKEN'"
            Content = @(
                "ENCRYPTION_KEY=$sourceEncryption",
                "JWT_SECRET_KEY=$sourceJwt",
                "PAPER_TRACKER_SERVICE_TOKEN=$extraSecret"
            ) -join [Environment]::NewLine
        },
        @{
            Name = "duplicate-key"
            Expected = "Duplicate environment key 'ENCRYPTION_KEY'"
            Content = @(
                "ENCRYPTION_KEY=$sourceEncryption",
                "ENCRYPTION_KEY=$sourceEncryption",
                "JWT_SECRET_KEY=$sourceJwt"
            ) -join [Environment]::NewLine
        },
        @{
            Name = "placeholder"
            Expected = "empty or contains a placeholder"
            Content = @(
                "ENCRYPTION_KEY=$sourceEncryption",
                "JWT_SECRET_KEY=REPLACE_WITH_EXPORTED_VALUE"
            ) -join [Environment]::NewLine
        },
        @{
            Name = "invalid-fernet"
            Expected = "Exported ENCRYPTION_KEY must be a 44-character Fernet key"
            Content = @(
                "ENCRYPTION_KEY=not-a-fernet-key",
                "JWT_SECRET_KEY=$sourceJwt"
            ) -join [Environment]::NewLine
        },
        @{
            Name = "invalid-jwt"
            Expected = "Exported JWT_SECRET_KEY must contain at least 64 URL-safe characters"
            Content = @(
                "ENCRYPTION_KEY=$sourceEncryption",
                "JWT_SECRET_KEY=too-short"
            ) -join [Environment]::NewLine
        }
    )
    $sourceSecrets = @{
        "ENCRYPTION_KEY" = $sourceEncryption
        "JWT_SECRET_KEY" = $sourceJwt
        "EXTRA_SECRET" = $extraSecret
    }
    foreach ($case in $invalidExportCases) {
        $caseSource = Join-Path $testRoot "secret-input\export-$($case.Name).env"
        Write-ProtectedTestFile -Path $caseSource -Content $case.Content
        $failure = $null
        try {
            [void](Read-OfflineExportSecrets -SecretsFile $caseSource)
        }
        catch {
            $failure = $_
        }
        if (-not $failure) {
            throw "Invalid export case '$($case.Name)' unexpectedly succeeded."
        }
        if ($failure.Exception.Message -notmatch [Regex]::Escape($case.Expected)) {
            throw "Invalid export case '$($case.Name)' failed for the wrong reason."
        }
        Assert-NoSecretDisclosure -Text $failure.Exception.Message `
            -Secrets $sourceSecrets -Label "Invalid export case '$($case.Name)'"
    }

    $validImportPath = Join-Path $testRoot "secret-input\encryption-key.env"
    Write-ProtectedTestFile -Path $validImportPath `
        -Content "ENCRYPTION_KEY=$sourceEncryption"

    $importedEnvPath = Join-Path $testRoot "runtime\imported.env"
    $importOutput = (
        & $newOfflineEnvScript -EnvFile $importedEnvPath `
            -ImportSecretsFrom $validImportPath 6>&1 |
            Out-String
    )
    $importedValues = Read-OfflineEnvFile -EnvFile $importedEnvPath
    if ($importedValues["ENCRYPTION_KEY"] -cne $sourceEncryption) {
        throw "New environment did not preserve the imported encryption key."
    }
    if (
        $importedValues["JWT_SECRET_KEY"] -ceq $sourceJwt -or
        $importedValues["JWT_SECRET_KEY"] -cnotmatch "^[A-Za-z0-9_-]{64,}$"
    ) {
        throw "New environment copied or generated an invalid JWT secret."
    }
    $distinctGeneratedSecrets = @(
        $importedValues["ENCRYPTION_KEY"],
        $importedValues["JWT_SECRET_KEY"],
        $importedValues["PAPER_TRACKER_SERVICE_TOKEN"],
        $importedValues["LLM_CONFIG_ADMIN_TOKEN"]
    ) | Select-Object -Unique
    if ($distinctGeneratedSecrets.Count -ne 4) {
        throw "New environment did not generate four distinct secrets."
    }
    if ($importedValues["PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION"] -ne "1") {
        throw "Encryption-key import changed the default registration behavior."
    }
    Assert-NoSecretDisclosure -Text $importOutput `
        -Secrets (Get-OfflineSecretValues -Values $importedValues) `
        -Label "Encryption-key import"
    Assert-RestrictedSecretAcl -Path $importedEnvPath `
        -AllowedSids $allowedSids -Label "Imported environment"

    $presetEnvPath = Join-Path $testRoot "runtime\preset-account.env"
    $presetOutput = (
        & $newOfflineEnvScript -EnvFile $presetEnvPath `
            -ImportSecretsFrom $validImportPath `
            -DisablePublicRegistration 6>&1 |
            Out-String
    )
    $presetValues = Read-OfflineEnvFile -EnvFile $presetEnvPath
    if ($presetValues["PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION"] -ne "0") {
        throw "Preconfigured-account environment left public registration enabled."
    }
    if ($presetValues["ENCRYPTION_KEY"] -cne $sourceEncryption) {
        throw "Preconfigured-account environment changed the imported encryption key."
    }
    if (
        $presetValues["JWT_SECRET_KEY"] -ceq $sourceJwt -or
        $presetValues["JWT_SECRET_KEY"] -ceq $importedValues["JWT_SECRET_KEY"] -or
        $presetValues["JWT_SECRET_KEY"] -cnotmatch "^[A-Za-z0-9_-]{64,}$"
    ) {
        throw "Separate installation did not generate an independent JWT secret."
    }
    foreach ($tokenName in @(
        "PAPER_TRACKER_SERVICE_TOKEN",
        "LLM_CONFIG_ADMIN_TOKEN"
    )) {
        if ($presetValues[$tokenName] -ceq $importedValues[$tokenName]) {
            throw "Separate installation reused $tokenName."
        }
    }
    Assert-NoSecretDisclosure -Text $presetOutput `
        -Secrets (Get-OfflineSecretValues -Values $presetValues) `
        -Label "Preconfigured-account environment generation"
    Assert-RestrictedSecretAcl -Path $presetEnvPath `
        -AllowedSids $allowedSids -Label "Preconfigured-account environment"

    $invalidImportCases = @(
        @{
            Name = "missing-key"
            Expected = "missing required setting 'ENCRYPTION_KEY'"
            Content = "# no imported key"
        },
        @{
            Name = "old-jwt"
            Expected = "unsupported setting 'JWT_SECRET_KEY'"
            Content = $validExportContent
        },
        @{
            Name = "noncanonical-key"
            Expected = "unsupported setting 'encryption_key'"
            Content = "encryption_key=$sourceEncryption"
        },
        @{
            Name = "duplicate-key"
            Expected = "Duplicate environment key 'ENCRYPTION_KEY'"
            Content = @(
                "ENCRYPTION_KEY=$sourceEncryption",
                "ENCRYPTION_KEY=$sourceEncryption"
            ) -join [Environment]::NewLine
        },
        @{
            Name = "placeholder"
            Expected = "empty or contains a placeholder"
            Content = "ENCRYPTION_KEY=REPLACE_WITH_IMPORTED_VALUE"
        },
        @{
            Name = "malformed-entry"
            Expected = "Invalid environment entry"
            Content = @(
                "ENCRYPTION_KEY=$sourceEncryption",
                "malformed-secret-material"
            ) -join [Environment]::NewLine
        },
        @{
            Name = "invalid-fernet"
            Expected = "Imported ENCRYPTION_KEY must be a 44-character Fernet key"
            Content = "ENCRYPTION_KEY=not-a-fernet-key"
        }
    )
    foreach ($case in $invalidImportCases) {
        $caseSource = Join-Path $testRoot "secret-input\import-$($case.Name).env"
        $caseTarget = Join-Path $testRoot "invalid-targets\$($case.Name).env"
        Write-ProtectedTestFile -Path $caseSource -Content $case.Content
        $failure = $null
        $failureOutput = ""
        try {
            $failureOutput = (
                & $newOfflineEnvScript -EnvFile $caseTarget `
                    -ImportSecretsFrom $caseSource 6>&1 |
                    Out-String
            )
        }
        catch {
            $failure = $_
        }
        if (-not $failure) {
            throw "Invalid import case '$($case.Name)' unexpectedly succeeded."
        }
        $failureText = $failureOutput + [Environment]::NewLine +
            $failure.Exception.Message
        if ($failureText -notmatch [Regex]::Escape($case.Expected)) {
            throw "Invalid import case '$($case.Name)' failed for the wrong reason."
        }
        Assert-NoSecretDisclosure -Text $failureText -Secrets $sourceSecrets `
            -Label "Invalid import case '$($case.Name)'"
        if (Test-Path -LiteralPath $caseTarget) {
            throw "Invalid import case '$($case.Name)' created a destination file."
        }
    }

    $retryOutput = (
        & $newOfflineEnvScript -EnvFile $importedEnvPath `
            -ImportSecretsFrom $validImportPath -Force 6>&1 |
            Out-String
    )
    $retryValues = Read-OfflineEnvFile -EnvFile $importedEnvPath
    foreach ($secretName in @(
        "ENCRYPTION_KEY",
        "JWT_SECRET_KEY",
        "PAPER_TRACKER_SERVICE_TOKEN",
        "LLM_CONFIG_ADMIN_TOKEN"
    )) {
        if ($retryValues[$secretName] -cne $importedValues[$secretName]) {
            throw "Matching installation retry unexpectedly rotated $secretName."
        }
    }
    Assert-NoSecretDisclosure -Text $retryOutput `
        -Secrets (Get-OfflineSecretValues -Values $retryValues) `
        -Label "Matching installation retry"
    $stableImportedContent = [System.IO.File]::ReadAllText($importedEnvPath)

    $alternateEncryption = New-SecureBase64Url -ByteCount 32 -KeepPadding
    foreach ($forceMismatch in @($false, $true)) {
        $mismatchSource = Join-Path $testRoot (
            "secret-input\mismatch-$forceMismatch.env"
        )
        Write-ProtectedTestFile -Path $mismatchSource `
            -Content "ENCRYPTION_KEY=$alternateEncryption"
        $failure = $null
        $failureOutput = ""
        try {
            if ($forceMismatch) {
                $failureOutput = (
                    & $newOfflineEnvScript -EnvFile $importedEnvPath `
                        -ImportSecretsFrom $mismatchSource -Force 6>&1 |
                        Out-String
                )
            }
            else {
                $failureOutput = (
                    & $newOfflineEnvScript -EnvFile $importedEnvPath `
                        -ImportSecretsFrom $mismatchSource 6>&1 |
                        Out-String
                )
            }
        }
        catch {
            $failure = $_
        }
        if (-not $failure) {
            throw "Existing environment accepted a mismatched encryption key."
        }
        $failureText = $failureOutput + [Environment]::NewLine +
            $failure.Exception.Message
        if ($failureText -notmatch "does not match the existing environment") {
            throw "Mismatched encryption-key import failed for the wrong reason."
        }
        $mismatchSecrets = Get-OfflineSecretValues -Values $retryValues
        $mismatchSecrets["IMPORTED_ENCRYPTION_KEY"] = $alternateEncryption
        Assert-NoSecretDisclosure -Text $failureText -Secrets $mismatchSecrets `
            -Label "Mismatched existing-environment import"
        if (
            [System.IO.File]::ReadAllText($importedEnvPath) -cne
            $stableImportedContent
        ) {
            throw "Rejected encryption-key import changed the existing environment."
        }
        Assert-RestrictedSecretAcl -Path $importedEnvPath `
            -AllowedSids $allowedSids -Label "Rejected-import environment"
    }

    $disableOutput = (
        & $newOfflineEnvScript -EnvFile $importedEnvPath `
            -ImportSecretsFrom $validImportPath `
            -DisablePublicRegistration 6>&1 |
            Out-String
    )
    $disabledValues = Read-OfflineEnvFile -EnvFile $importedEnvPath
    if ($disabledValues["PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION"] -ne "0") {
        throw "Existing environment did not disable public registration."
    }
    foreach ($secretName in @(
        "ENCRYPTION_KEY",
        "JWT_SECRET_KEY",
        "PAPER_TRACKER_SERVICE_TOKEN",
        "LLM_CONFIG_ADMIN_TOKEN"
    )) {
        if ($disabledValues[$secretName] -cne $retryValues[$secretName]) {
            throw "Registration update unexpectedly rotated $secretName."
        }
    }
    Assert-NoSecretDisclosure -Text $disableOutput `
        -Secrets (Get-OfflineSecretValues -Values $disabledValues) `
        -Label "Existing environment registration update"
    Assert-RestrictedSecretAcl -Path $importedEnvPath `
        -AllowedSids $allowedSids -Label "Registration-updated environment"
    $importBackup = Get-ChildItem -LiteralPath (Split-Path -Parent $importedEnvPath) `
        -File -Filter "imported.env.bak-*" |
        Select-Object -First 1
    if (-not $importBackup) {
        throw "Environment retry did not retain an environment backup."
    }
    Assert-RestrictedSecretAcl -Path $importBackup.FullName `
        -AllowedSids $allowedSids -Label "Environment retry backup"

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

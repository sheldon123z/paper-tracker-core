#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$EnvFile,

    [ValidatePattern("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$")]
    [string]$ImageTag,

    [switch]$Force,

    [string]$ImportSecretsFrom,

    [switch]$DisablePublicRegistration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$root = Get-OfflineDeploymentRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $root "offline.env"
}
$resolvedEnv = Resolve-OfflinePath -Path $EnvFile
$template = Join-Path $root "offline.env.example"

if (-not (Test-Path -LiteralPath $template -PathType Leaf)) {
    throw "Environment template not found: $template"
}
$resolvedEnv = Assert-OfflineLocalPathNoReparse -Path $resolvedEnv
$parent = Split-Path -Parent $resolvedEnv
if ($parent -eq [System.IO.Path]::GetPathRoot($parent)) {
    throw "Environment file must not be written directly to a drive root."
}
if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    [void](New-Item -ItemType Directory -Path $parent -Force)
}
[void](Assert-OfflineLocalPathNoReparse -Path $resolvedEnv)
Protect-OfflineSensitiveDirectory -Path $parent

$importedSecrets = $null
if ($PSBoundParameters.ContainsKey("ImportSecretsFrom")) {
    if ([string]::IsNullOrWhiteSpace($ImportSecretsFrom)) {
        throw "ImportSecretsFrom must name a secrets file."
    }

    $resolvedImport = Resolve-OfflinePath -Path $ImportSecretsFrom
    if (-not (Test-Path -LiteralPath $resolvedImport -PathType Leaf)) {
        throw "Imported secrets file not found: $resolvedImport"
    }
    if (
        [string]::Equals(
            $resolvedImport,
            $resolvedEnv,
            [System.StringComparison]::OrdinalIgnoreCase
        )
    ) {
        throw "ImportSecretsFrom must not be the destination environment file."
    }

    $importedSecrets = Read-OfflineEncryptionKeyImport -SecretsFile $resolvedImport
}

$manifestTag = $null
if (-not $PSBoundParameters.ContainsKey("ImageTag")) {
    $manifestPath = Join-Path $root "bundle-manifest.json"
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        $manifest = Read-OfflineJsonFile -Path $manifestPath `
            -Label "Bundle manifest"
        $manifestTag = [string]$manifest.imageTag
        if ($manifestTag -notmatch "^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$") {
            throw "Bundle manifest contains an invalid imageTag."
        }
    }
}

$envExists = Test-Path -LiteralPath $resolvedEnv -PathType Leaf
$existingValues = $null
$initializeSecrets = -not $envExists
$secretNames = @(
    "ENCRYPTION_KEY",
    "JWT_SECRET_KEY",
    "PAPER_TRACKER_SERVICE_TOKEN",
    "LLM_CONFIG_ADMIN_TOKEN"
)

if ($envExists) {
    # A manually copied file may initially inherit broad directory ACLs.
    # Tighten it before reading or retaining any secret material.
    Protect-OfflineSecretFile -Path $resolvedEnv
    $existingValues = Read-OfflineEnvFile -EnvFile $resolvedEnv
    $placeholderSecrets = @(
        $secretNames | Where-Object {
            $existingValues.ContainsKey($_) -and
            $existingValues[$_] -match "^REPLACE_WITH_"
        }
    )
    if ($placeholderSecrets.Count -eq $secretNames.Count) {
        $initializeSecrets = $true
    }
    elseif ($placeholderSecrets.Count -gt 0) {
        throw "Environment contains a partial mixture of real and placeholder secrets."
    }
    else {
        $existingValues = Assert-OfflineEnv -EnvFile $resolvedEnv
        if ($importedSecrets) {
            if (
                $existingValues["ENCRYPTION_KEY"] -cne
                $importedSecrets["ENCRYPTION_KEY"]
            ) {
                throw (
                    "Imported ENCRYPTION_KEY does not match the existing " +
                    "environment; refusing to rotate the encryption key."
                )
            }
        }
    }
}

if (-not $PSBoundParameters.ContainsKey("ImageTag")) {
    if ($manifestTag) {
        $ImageTag = $manifestTag
    }
    elseif ($existingValues -and $existingValues.ContainsKey("PAPER_TRACKER_IMAGE_TAG")) {
        $ImageTag = $existingValues["PAPER_TRACKER_IMAGE_TAG"]
    }
    else {
        $ImageTag = "offline"
    }
}

$registrationNeedsUpdate = (
    $DisablePublicRegistration -and
    (
        -not $existingValues -or
        -not $existingValues.ContainsKey("PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION") -or
        $existingValues["PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION"] -ne "0"
    )
)
if (
    $envExists -and
    -not $initializeSecrets -and
    -not $Force -and
    -not $registrationNeedsUpdate -and
    $existingValues["PAPER_TRACKER_IMAGE_TAG"] -eq $ImageTag
) {
    Write-Host "Existing environment is valid; no changes made: $resolvedEnv"
    return
}

if ($envExists) {
    $content = [System.IO.File]::ReadAllText($resolvedEnv)
}
else {
    $content = [System.IO.File]::ReadAllText($template)
}

$replacements = @{
    "PAPER_TRACKER_IMAGE_TAG" = $ImageTag
}
if ($initializeSecrets) {
    if ($importedSecrets) {
        $replacements["ENCRYPTION_KEY"] = $importedSecrets["ENCRYPTION_KEY"]
    }
    else {
        $replacements["ENCRYPTION_KEY"] = New-SecureBase64Url -ByteCount 32 -KeepPadding
    }
    $replacements["JWT_SECRET_KEY"] = New-SecureBase64Url -ByteCount 64
    $replacements["PAPER_TRACKER_SERVICE_TOKEN"] = New-SecureBase64Url -ByteCount 32
    $replacements["LLM_CONFIG_ADMIN_TOKEN"] = New-SecureBase64Url -ByteCount 32
}
if ($DisablePublicRegistration) {
    $replacements["PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION"] = "0"
}

foreach ($entry in $replacements.GetEnumerator()) {
    $escapedKey = [Regex]::Escape($entry.Key)
    $pattern = "(?m)^${escapedKey}=.*$"
    if ([Regex]::Matches($content, $pattern).Count -ne 1) {
        throw "Environment must contain exactly one '$($entry.Key)' entry."
    }
    $content = [Regex]::Replace(
        $content,
        $pattern,
        "$($entry.Key)=$($entry.Value)"
    )
}

$candidatePath = "$resolvedEnv.tmp-$([Guid]::NewGuid().ToString('N'))"
$backupPath = $null
try {
    Write-Utf8NoBom -Path $candidatePath -Content $content
    Protect-OfflineSecretFile -Path $candidatePath
    [void](Assert-OfflineEnv -EnvFile $candidatePath)

    if ($envExists) {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backupPath = (
            "$resolvedEnv.bak-$timestamp-" +
            [Guid]::NewGuid().ToString("N").Substring(0, 8)
        )

        # The candidate is already validated and lives beside the destination,
        # so File.Replace performs a same-volume atomic swap and backup.
        [System.IO.File]::Replace(
            $candidatePath,
            $resolvedEnv,
            $backupPath,
            $true
        )
        Protect-OfflineSecretFile -Path $backupPath
        Assert-OfflineSecretAcl -Path $backupPath
    }
    else {
        Move-Item -LiteralPath $candidatePath -Destination $resolvedEnv
    }

    [void](Assert-OfflineEnv -EnvFile $resolvedEnv)
    Assert-OfflineSecretAcl -Path $resolvedEnv
}
finally {
    if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
        Remove-Item -LiteralPath $candidatePath -Force
    }
}

if ($backupPath) {
    Write-Host "Backed up existing environment to: $backupPath"
}
if ($initializeSecrets) {
    Write-Host "Created validated offline secrets in: $resolvedEnv"
}
else {
    Write-Host "Updated validated offline environment without rotating secrets: $resolvedEnv"
}
Write-Host "Keep this file private; it protects encrypted local configuration."

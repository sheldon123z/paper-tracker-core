#requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:OfflineDeploymentRoot = [System.IO.Path]::GetFullPath(
    (Join-Path -Path $PSScriptRoot -ChildPath "..\..")
)

function Get-OfflineDeploymentRoot {
    return $script:OfflineDeploymentRoot
}

function Resolve-OfflinePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [string]$BasePath = $script:OfflineDeploymentRoot
    )

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }
    return [System.IO.Path]::GetFullPath((Join-Path -Path $BasePath -ChildPath $Path))
}

function Read-OfflineJsonFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [string]$Label = "JSON file"
    )

    $resolved = Resolve-OfflinePath -Path $Path
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw "$Label not found: $resolved"
    }
    try {
        $strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
        $text = [System.IO.File]::ReadAllText($resolved, $strictUtf8)
        if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {
            $text = $text.Substring(1)
        }
        return ($text | ConvertFrom-Json)
    }
    catch {
        throw "$Label is not valid UTF-8 JSON: $resolved"
    }
}

function Get-OfflineBundleLayout {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    $resolvedRoot = Resolve-OfflinePath -Path $Root
    $manifestPath = Join-Path $resolvedRoot "bundle-manifest.json"
    $isSeeded = $false
    $imageTag = $null
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        $manifest = Read-OfflineJsonFile -Path $manifestPath `
            -Label "Bundle manifest"
        $isSeeded = $manifest.PSObject.Properties.Name -contains "seed"
        if ($manifest.PSObject.Properties.Name -contains "imageTag") {
            $imageTag = [string]$manifest.imageTag
        }
    }

    if ($isSeeded) {
        $defaultEnvFile = Join-Path (
            Split-Path -Parent $resolvedRoot
        ) "runtime\offline.env"
    }
    else {
        $defaultEnvFile = Join-Path $resolvedRoot "offline.env"
    }

    return [pscustomobject]@{
        Root = $resolvedRoot
        ManifestPath = $manifestPath
        IsSeeded = $isSeeded
        ImageTag = $imageTag
        DefaultEnvFile = $defaultEnvFile
    }
}

function New-OfflineStagingDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BundleRoot
    )

    $resolvedBundle = Resolve-OfflinePath -Path $BundleRoot
    $bundleParent = Assert-OfflineLocalPathNoReparse -Path (
        Split-Path -Parent $resolvedBundle
    )
    $volumeRoot = [System.IO.Path]::GetPathRoot($resolvedBundle)
    $candidateParents = @()
    $current = $bundleParent
    while ($current) {
        if ($current -notin $candidateParents) {
            $candidateParents += $current
        }
        if ([string]::Equals(
            $current,
            $volumeRoot,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
            break
        }
        $parent = Split-Path -Parent $current
        if (-not $parent -or $parent -eq $current) {
            break
        }
        $current = $parent
    }

    $prefix = ".ptb-"
    foreach ($candidateParent in @(
        $candidateParents | Sort-Object { $_.Length }
    )) {
        try {
            $parentItem = Get-Item -LiteralPath $candidateParent -Force `
                -ErrorAction Stop
            if (
                -not $parentItem.PSIsContainer -or
                ($parentItem.Attributes -band
                    [System.IO.FileAttributes]::ReparsePoint) -ne 0
            ) {
                continue
            }
        }
        catch {
            continue
        }

        for ($attempt = 0; $attempt -lt 3; $attempt++) {
            $leaf = "$prefix$([Guid]::NewGuid().ToString('N'))"
            $path = Join-Path $candidateParent $leaf
            try {
                [void](New-Item -ItemType Directory -Path $path `
                    -ErrorAction Stop)
                return [pscustomobject]@{
                    Path = [System.IO.Path]::GetFullPath($path)
                    Parent = [System.IO.Path]::GetFullPath($candidateParent)
                    Prefix = $prefix
                }
            }
            catch {
                if (Test-Path -LiteralPath $path) {
                    continue
                }
                break
            }
        }
    }

    throw (
        "Could not create a writable same-volume staging directory for " +
        "'$resolvedBundle'. Choose an output path beneath a writable local " +
        "NTFS directory."
    )
}

function Assert-PathWithin {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    $resolvedPath = Resolve-OfflinePath -Path $Path
    $resolvedRoot = Resolve-OfflinePath -Path $Root
    $rootPrefix = $resolvedRoot.TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar

    if (
        $resolvedPath -ne $resolvedRoot -and
        -not $resolvedPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)
    ) {
        throw "Path '$resolvedPath' is outside the allowed root '$resolvedRoot'."
    }

    return $resolvedPath
}

function Resolve-OfflineManifestPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RelativePath,

        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    if (
        [string]::IsNullOrWhiteSpace($RelativePath) -or
        [System.IO.Path]::IsPathRooted($RelativePath) -or
        $RelativePath.StartsWith("\\") -or
        $RelativePath.Contains(":") -or
        $RelativePath.IndexOfAny([char[]]@("`0", "`r", "`n")) -ge 0
    ) {
        throw "Manifest path is not a safe relative path: $RelativePath"
    }
    $segments = @($RelativePath.Replace("\", "/").Split("/"))
    if (
        $segments.Count -eq 0 -or
        @($segments | Where-Object { -not $_ -or $_ -in @(".", "..") }).Count -gt 0
    ) {
        throw "Manifest path contains an unsafe segment: $RelativePath"
    }

    $resolvedRoot = Resolve-OfflinePath -Path $Root
    $resolvedPath = Assert-PathWithin `
        -Path (Join-Path $resolvedRoot ($segments -join [System.IO.Path]::DirectorySeparatorChar)) `
        -Root $resolvedRoot

    $current = $resolvedRoot
    foreach ($segment in $segments) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (
                ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
            ) {
                throw "Manifest path traverses a reparse point: $RelativePath"
            }
        }
        $current = Join-Path $current $segment
    }
    if (Test-Path -LiteralPath $current) {
        $item = Get-Item -LiteralPath $current -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Manifest path resolves to a reparse point: $RelativePath"
        }
    }

    return $resolvedPath
}

function Get-OfflineDriveType {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathRoot
    )

    $driveInfo = New-Object System.IO.DriveInfo($PathRoot)
    return $driveInfo.DriveType
}

function Assert-OfflineLocalPathNoReparse {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $resolved = Resolve-OfflinePath -Path $Path
    if ($resolved.StartsWith("\\", [System.StringComparison]::Ordinal)) {
        throw "Sensitive runtime paths must be on a local Windows volume: $resolved"
    }
    $pathRoot = [System.IO.Path]::GetPathRoot($resolved)
    if (
        (Get-OfflineDriveType -PathRoot $pathRoot) -eq
            [System.IO.DriveType]::Network
    ) {
        throw "Sensitive runtime paths must not use a mapped network drive: $resolved"
    }
    $relative = $resolved.Substring($pathRoot.Length).TrimStart(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    if ($relative.Contains(":")) {
        throw "Sensitive runtime paths must not use alternate data streams: $resolved"
    }

    $current = $pathRoot
    foreach ($segment in @(
        $relative.Replace("\", "/").Split("/") | Where-Object { $_ }
    )) {
        $current = Join-Path $current $segment
        if (-not (Test-Path -LiteralPath $current)) {
            continue
        }
        $item = Get-Item -LiteralPath $current -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Sensitive runtime path traverses a reparse point: $current"
        }
    }
    return $resolved
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Content
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Protect-OfflineSecretFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $resolved = Resolve-OfflinePath -Path $Path
    $item = Get-Item -LiteralPath $resolved -Force
    if (
        $item.PSIsContainer -or
        ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
        throw "Secret path must be a real file, not a directory or reparse point: $resolved"
    }
    try {
        Assert-OfflineSecretAcl -Path $resolved
        return
    }
    catch {
        # Rebuild the DACL below when it is inherited or grants other access.
    }

    try {
        $currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $acl = New-Object System.Security.AccessControl.FileSecurity
        $acl.SetAccessRuleProtection($true, $false)

        $fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl
        $allow = [System.Security.AccessControl.AccessControlType]::Allow
        foreach ($sidValue in @(
            $currentIdentity.User.Value,
            "S-1-5-18",
            "S-1-5-32-544"
        )) {
            $sid = New-Object System.Security.Principal.SecurityIdentifier($sidValue)
            $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                $sid,
                $fullControl,
                $allow
            )
            [void]$acl.AddAccessRule($rule)
        }
        [System.IO.File]::SetAccessControl($resolved, $acl)
    }
    catch {
        throw "Could not restrict ACLs on '$resolved': $($_.Exception.Message)"
    }
}

function Protect-OfflineSensitiveDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $resolved = Resolve-OfflinePath -Path $Path
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
        throw "Sensitive directory not found: $resolved"
    }
    $directoryItem = Get-Item -LiteralPath $resolved -Force
    if (
        -not $directoryItem.PSIsContainer -or
        ($directoryItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
        throw "Sensitive directory must not be a reparse point: $resolved"
    }

    $currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)

    $fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl
    $allow = [System.Security.AccessControl.AccessControlType]::Allow
    $inheritance = (
        [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
        [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    )
    $propagation = [System.Security.AccessControl.PropagationFlags]::None
    foreach ($sidValue in @(
        $currentIdentity.User.Value,
        "S-1-5-18",
        "S-1-5-32-544"
    )) {
        $sid = New-Object System.Security.Principal.SecurityIdentifier($sidValue)
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $sid,
            $fullControl,
            $inheritance,
            $propagation,
            $allow
        )
        [void]$acl.AddAccessRule($rule)
    }
    [System.IO.Directory]::SetAccessControl($resolved, $acl)
    Assert-OfflineSecretAcl -Path $resolved
}

function Get-OfflineNoReparseTreeItems {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $resolved = Resolve-OfflinePath -Path $Path
    $rootItem = Get-Item -LiteralPath $resolved -Force
    if (
        -not $rootItem.PSIsContainer -or
        ($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
        throw "Sensitive tree root must be a real directory: $resolved"
    }

    $items = New-Object System.Collections.ArrayList
    $pending = New-Object System.Collections.Stack
    $pending.Push($rootItem)
    while ($pending.Count -gt 0) {
        $directory = $pending.Pop()
        foreach ($child in @(
            Get-ChildItem -LiteralPath $directory.FullName -Force
        )) {
            if (
                ($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
            ) {
                throw "Sensitive tree contains a reparse point: $($child.FullName)"
            }
            [void]$items.Add($child)
            if ($child.PSIsContainer) {
                $pending.Push($child)
            }
        }
    }
    return @($items)
}

function Protect-OfflineSensitiveTree {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $resolved = Resolve-OfflinePath -Path $Path
    # Enumerate one directory level at a time, rejecting a child before it can
    # ever be traversed. Never use Get-ChildItem -Recurse on untrusted media.
    $treeItems = @(Get-OfflineNoReparseTreeItems -Path $resolved)
    Protect-OfflineSensitiveDirectory -Path $resolved
    $directories = @(
        $treeItems | Where-Object { $_.PSIsContainer } |
        Sort-Object { $_.FullName.Length }
    )
    foreach ($directory in $directories) {
        Protect-OfflineSensitiveDirectory -Path $directory.FullName
    }
    foreach ($file in @($treeItems | Where-Object { -not $_.PSIsContainer })) {
        Protect-OfflineSecretFile -Path $file.FullName
        Assert-OfflineSecretAcl -Path $file.FullName
    }
    # Re-walk after ACL application so a concurrent path replacement is
    # detected before any sensitive bundle content is consumed.
    [void](Get-OfflineNoReparseTreeItems -Path $resolved)
}

function Assert-OfflineSecretAcl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $resolved = Resolve-OfflinePath -Path $Path
    try {
        $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        $allowedSids = @(
            $currentSid,
            "S-1-5-18",
            "S-1-5-32-544"
        )
        $acl = Get-Acl -LiteralPath $resolved
        $ownerSid = (
            New-Object System.Security.Principal.NTAccount($acl.Owner)
        ).Translate(
            [System.Security.Principal.SecurityIdentifier]
        ).Value
        if ($ownerSid -notin $allowedSids) {
            throw "Unexpected owner identity: $ownerSid"
        }
        if (-not $acl.AreAccessRulesProtected) {
            throw "ACL inheritance is enabled."
        }

        $fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl
        $allow = [System.Security.AccessControl.AccessControlType]::Allow
        $fullControlSids = @{}
        foreach ($rule in @($acl.Access)) {
            $sid = $rule.IdentityReference.Translate(
                [System.Security.Principal.SecurityIdentifier]
            ).Value
            if ($rule.AccessControlType -eq $allow -and $sid -notin $allowedSids) {
                throw "Unexpected allowed identity: $sid"
            }
            if (
                $rule.AccessControlType -eq $allow -and
                (($rule.FileSystemRights -band $fullControl) -eq $fullControl)
            ) {
                $fullControlSids[$sid] = $true
            }
        }
        foreach ($sid in $allowedSids) {
            if (-not $fullControlSids.ContainsKey($sid)) {
                throw "Required FullControl rule is missing for $sid"
            }
        }
    }
    catch {
        throw "Secret file ACL is not sufficiently restrictive for '$resolved': $($_.Exception.Message)"
    }
}

function New-SecureBase64Url {
    param(
        [ValidateRange(16, 256)]
        [int]$ByteCount = 32,

        [switch]$KeepPadding
    )

    $bytes = New-Object byte[] $ByteCount
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }

    $value = [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_")
    if (-not $KeepPadding) {
        $value = $value.TrimEnd("=")
    }
    return $value
}

function Read-OfflineEnvFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EnvFile
    )

    $resolved = Resolve-OfflinePath -Path $EnvFile
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw "Environment file not found: $resolved"
    }

    $values = @{}
    $lineNumber = 0
    foreach ($line in [System.IO.File]::ReadAllLines($resolved)) {
        $lineNumber += 1
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            throw "Invalid environment entry at ${resolved}:$lineNumber."
        }

        $key = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()
        if ($key -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
            throw "Invalid environment key '$key' at ${resolved}:$lineNumber."
        }
        if ($values.ContainsKey($key)) {
            throw "Duplicate environment key '$key' at ${resolved}:$lineNumber."
        }

        if (
            $value.Length -ge 2 -and
            (($value.StartsWith('"') -and $value.EndsWith('"')) -or
             ($value.StartsWith("'") -and $value.EndsWith("'")))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }

    return $values
}

function Assert-OfflineFernetKeyFormat {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value,

        [Parameter(Mandatory = $true)]
        [string]$Context
    )

    if ($Value -cnotmatch "^[A-Za-z0-9_-]{43}=$") {
        throw "$Context must be a 44-character Fernet key."
    }
    try {
        $decoded = [Convert]::FromBase64String(
            $Value.Replace("-", "+").Replace("_", "/")
        )
    }
    catch {
        throw "$Context is not valid URL-safe base64."
    }
    if ($decoded.Length -ne 32) {
        throw "$Context must decode to exactly 32 bytes."
    }
}

function Assert-OfflineExactSecretNames {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Values,

        [Parameter(Mandatory = $true)]
        [string[]]$RequiredNames,

        [Parameter(Mandatory = $true)]
        [string]$Context
    )

    foreach ($key in @($Values.Keys)) {
        if ($key -cnotin $RequiredNames) {
            throw "$Context contains unsupported setting '$key'."
        }
    }
    foreach ($key in $RequiredNames) {
        if (-not $Values.ContainsKey($key)) {
            throw "$Context is missing required setting '$key'."
        }
        if (
            [string]::IsNullOrWhiteSpace($Values[$key]) -or
            $Values[$key] -match "^REPLACE_WITH_"
        ) {
            throw "$Context setting '$key' is empty or contains a placeholder."
        }
    }
}

function Read-OfflineExportSecrets {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SecretsFile
    )

    $resolved = Resolve-OfflinePath -Path $SecretsFile
    $values = Read-OfflineEnvFile -EnvFile $resolved
    $requiredNames = @(
        "ENCRYPTION_KEY",
        "JWT_SECRET_KEY"
    )

    Assert-OfflineExactSecretNames `
        -Values $values `
        -RequiredNames $requiredNames `
        -Context "Export secrets file"

    $fernet = $values["ENCRYPTION_KEY"]
    Assert-OfflineFernetKeyFormat `
        -Value $fernet `
        -Context "Exported ENCRYPTION_KEY"

    $jwtSecret = $values["JWT_SECRET_KEY"]
    if ($jwtSecret -cnotmatch "^[A-Za-z0-9_-]{64,}$") {
        throw "Exported JWT_SECRET_KEY must contain at least 64 URL-safe characters."
    }
    if ($jwtSecret -ceq $fernet) {
        throw "Exported JWT_SECRET_KEY and ENCRYPTION_KEY must be different."
    }

    return $values
}

function Read-OfflineEncryptionKeyImport {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SecretsFile
    )

    $resolved = Resolve-OfflinePath -Path $SecretsFile
    $values = Read-OfflineEnvFile -EnvFile $resolved
    Assert-OfflineExactSecretNames `
        -Values $values `
        -RequiredNames @("ENCRYPTION_KEY") `
        -Context "Encryption-key import file"
    Assert-OfflineFernetKeyFormat `
        -Value $values["ENCRYPTION_KEY"] `
        -Context "Imported ENCRYPTION_KEY"
    return $values
}

function Assert-OfflineEnv {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EnvFile
    )

    $resolved = Resolve-OfflinePath -Path $EnvFile
    $values = Read-OfflineEnvFile -EnvFile $resolved
    $required = @(
        "COMPOSE_PROJECT_NAME",
        "PAPER_TRACKER_IMAGE_TAG",
        "PAPER_TRACKER_DATA_VOLUME",
        "ENCRYPTION_KEY",
        "JWT_SECRET_KEY",
        "PAPER_TRACKER_SERVICE_TOKEN",
        "LLM_CONFIG_ADMIN_TOKEN"
    )

    foreach ($key in $required) {
        if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
            throw "Required setting '$key' is missing from $resolved."
        }
        if ($values[$key] -match "^REPLACE_WITH_") {
            throw "Setting '$key' still contains an example placeholder. Run New-OfflineEnv.ps1."
        }
    }

    if ($values["COMPOSE_PROJECT_NAME"] -notmatch "^[a-z0-9][a-z0-9_-]*$") {
        throw "COMPOSE_PROJECT_NAME contains unsupported characters."
    }
    if ($values["PAPER_TRACKER_IMAGE_TAG"] -notmatch "^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$") {
        throw "PAPER_TRACKER_IMAGE_TAG is not a valid local image tag."
    }
    if ($values["PAPER_TRACKER_DATA_VOLUME"] -notmatch "^[A-Za-z0-9][A-Za-z0-9_.-]*$") {
        throw "PAPER_TRACKER_DATA_VOLUME is not a valid Docker volume name."
    }

    $fernet = $values["ENCRYPTION_KEY"]
    if ($fernet.Length -ne 44) {
        throw "ENCRYPTION_KEY must be a 44-character Fernet key."
    }
    try {
        $decoded = [Convert]::FromBase64String($fernet.Replace("-", "+").Replace("_", "/"))
    }
    catch {
        throw "ENCRYPTION_KEY is not valid URL-safe base64."
    }
    if ($decoded.Length -ne 32) {
        throw "ENCRYPTION_KEY must decode to exactly 32 bytes."
    }

    $jwt = $values["JWT_SECRET_KEY"]
    if ($jwt.Length -lt 64) {
        throw "JWT_SECRET_KEY must contain at least 64 characters."
    }
    if ($jwt -eq $fernet) {
        throw "JWT_SECRET_KEY and ENCRYPTION_KEY must be different."
    }
    foreach ($tokenName in @("PAPER_TRACKER_SERVICE_TOKEN", "LLM_CONFIG_ADMIN_TOKEN")) {
        if ($values[$tokenName].Length -lt 43) {
            throw "$tokenName must contain at least 43 characters."
        }
    }
    $distinctSecrets = @(
        $fernet,
        $jwt,
        $values["PAPER_TRACKER_SERVICE_TOKEN"],
        $values["LLM_CONFIG_ADMIN_TOKEN"]
    ) | Select-Object -Unique
    if ($distinctSecrets.Count -ne 4) {
        throw "Offline secrets must all be different."
    }
    if (
        $values.ContainsKey("COPILOT_RUNTIME_SECRET") -and
        -not [string]::IsNullOrEmpty($values["COPILOT_RUNTIME_SECRET"])
    ) {
        throw "COPILOT_RUNTIME_SECRET must stay empty in the prebuilt offline bundle."
    }

    Assert-OfflineSecretAcl -Path $resolved
    return $values
}

function Assert-DockerLinux {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker CLI was not found. Install Docker Desktop and reopen PowerShell."
    }

    $output = (& docker info --format "{{.OSType}}" 2>&1 | Out-String).Trim()
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Docker Desktop is not reachable. Start Docker Desktop in Linux container mode. Details: $output"
    }
    if ($output -notmatch "(?m)^linux$") {
        throw "Docker Desktop must use Linux containers. Reported output: $output"
    }
}

function Invoke-Docker {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$DockerArgs,

        [switch]$Capture
    )

    if ($Capture) {
        $output = & docker @DockerArgs
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            throw "Docker command failed with exit code ${exitCode}: docker $($DockerArgs -join ' ')"
        }
        return $output
    }

    & docker @DockerArgs
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Docker command failed with exit code ${exitCode}: docker $($DockerArgs -join ' ')"
    }
}

function Invoke-OfflineCompose {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EnvFile,

        [Parameter(Mandatory = $true)]
        [string[]]$ComposeArgs,

        [string]$ComposeFile = (Join-Path $script:OfflineDeploymentRoot "compose.offline.yml"),

        [switch]$Capture
    )

    $resolvedEnv = Resolve-OfflinePath -Path $EnvFile
    $resolvedCompose = Resolve-OfflinePath -Path $ComposeFile
    $previousEnvFile = [Environment]::GetEnvironmentVariable("PAPER_TRACKER_ENV_FILE", "Process")
    [Environment]::SetEnvironmentVariable("PAPER_TRACKER_ENV_FILE", $resolvedEnv, "Process")
    try {
        $dockerArgs = @(
            "compose",
            "--env-file", $resolvedEnv,
            "--project-directory", $script:OfflineDeploymentRoot,
            "-f", $resolvedCompose
        ) + $ComposeArgs
        return Invoke-Docker -DockerArgs $dockerArgs -Capture:$Capture
    }
    finally {
        [Environment]::SetEnvironmentVariable(
            "PAPER_TRACKER_ENV_FILE",
            $previousEnvFile,
            "Process"
        )
    }
}

function Get-OfflineImageNames {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$EnvValues
    )

    $tag = $EnvValues["PAPER_TRACKER_IMAGE_TAG"]
    return @(
        "paper-tracker-backend:$tag",
        "paper-tracker-copilot-runtime:$tag",
        "paper-tracker-gateway:$tag"
    )
}

function Assert-OfflineImages {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$EnvValues
    )

    foreach ($imageName in (Get-OfflineImageNames -EnvValues $EnvValues)) {
        Assert-DockerImage -ImageName $imageName
    }
}

function Assert-DockerImage {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ImageName
    )

    if ($ImageName -notmatch "^paper-tracker-(backend|copilot-runtime|gateway):[A-Za-z0-9_.-]+$") {
        throw "Unexpected offline image name: $ImageName"
    }
    & docker image inspect $ImageName *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Required image is not loaded: $ImageName"
    }
}

function Assert-DataVolume {
    param(
        [Parameter(Mandatory = $true)]
        [string]$VolumeName,

        [Parameter(Mandatory = $true)]
        [string]$ProjectName,

        [switch]$AllowMismatchedLabels
    )

    if ($VolumeName -notmatch "^[A-Za-z0-9][A-Za-z0-9_.-]*$") {
        throw "Unsafe Docker volume name: $VolumeName"
    }
    if ($ProjectName -notmatch "^[a-z0-9][a-z0-9_-]*$") {
        throw "Unsafe Compose project name: $ProjectName"
    }

    $rawLabels = (& docker volume inspect --format "{{json .Labels}}" $VolumeName 2>&1 | Out-String).Trim()
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Docker volume does not exist: $VolumeName. Start the deployment first."
    }

    try {
        if ([string]::IsNullOrWhiteSpace($rawLabels) -or $rawLabels -eq "null") {
            $labels = $null
        }
        else {
            $labels = $rawLabels | ConvertFrom-Json
        }
    }
    catch {
        throw "Docker returned invalid labels for volume '$VolumeName': $rawLabels"
    }

    $role = $null
    $project = $null
    if ($labels) {
        $roleProperty = $labels.PSObject.Properties["io.paper-tracker.role"]
        $projectProperty = $labels.PSObject.Properties["io.paper-tracker.project"]
        if ($roleProperty) {
            $role = [string]$roleProperty.Value
        }
        if ($projectProperty) {
            $project = [string]$projectProperty.Value
        }
    }

    if ($role -ne "data" -or $project -ne $ProjectName) {
        $message = (
            "Docker volume '$VolumeName' is not labeled as data for project '$ProjectName' " +
            "(role='$role', project='$project')."
        )
        if (-not $AllowMismatchedLabels) {
            throw "$message Re-run only after verifying the volume, with -AllowMismatchedVolume."
        }
        Write-Warning "$message Proceeding because -AllowMismatchedVolume was explicitly supplied."
    }
}

function Get-RunningOfflineServices {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EnvFile
    )

    $restartable = @()
    foreach ($service in @("backend", "copilot-runtime", "gateway")) {
        $containerIds = @(
            Invoke-OfflineCompose -EnvFile $EnvFile -ComposeArgs @(
                "ps", "--all", "--quiet", $service
            ) -Capture |
            ForEach-Object { "$_".Trim() } |
            Where-Object { $_ }
        )
        foreach ($containerId in $containerIds) {
            $status = (
                & docker inspect --format "{{.State.Status}}" $containerId 2>&1 |
                Out-String
            ).Trim()
            if ($LASTEXITCODE -ne 0) {
                throw "Could not inspect container state for service '$service': $status"
            }
            if ($status -in @("running", "restarting")) {
                $restartable += $service
                break
            }
        }
    }
    return @($restartable)
}

function Enter-OfflineNamedLock {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("Project", "Volume")]
        [string]$Kind,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [ValidateRange(0, 3600)]
        [int]$TimeoutSeconds = 0
    )

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $lockMaterial = "$Kind`n$($Name.ToLowerInvariant())"
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($lockMaterial)
        $digest = $sha256.ComputeHash($bytes)
    }
    finally {
        $sha256.Dispose()
    }
    $lockId = [System.BitConverter]::ToString($digest).Replace("-", "")
    # Global prevents two Windows login sessions from racing the same Docker
    # Desktop engine. The caller must acquire project before volume locks.
    $mutexName = "Global\PaperTrackerOffline$Kind-$lockId"
    $createdNew = $false
    $mutex = New-Object System.Threading.Mutex($false, $mutexName, [ref]$createdNew)

    try {
        try {
            $acquired = $mutex.WaitOne([TimeSpan]::FromSeconds($TimeoutSeconds))
        }
        catch [System.Threading.AbandonedMutexException] {
            $acquired = $true
        }
        if (-not $acquired) {
            throw (
                "Another offline operation already holds the $Kind lock for '$Name'."
            )
        }
        return $mutex
    }
    catch {
        $mutex.Dispose()
        throw
    }
}

function Enter-OfflineProjectLock {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectName,

        [ValidateRange(0, 3600)]
        [int]$TimeoutSeconds = 0
    )

    if ($ProjectName -notmatch "^[a-z0-9][a-z0-9_-]*$") {
        throw "Unsafe Compose project name: $ProjectName"
    }
    return Enter-OfflineNamedLock `
        -Kind "Project" `
        -Name $ProjectName `
        -TimeoutSeconds $TimeoutSeconds
}

function Enter-OfflineVolumeLock {
    param(
        [Parameter(Mandatory = $true)]
        [string]$VolumeName,

        [ValidateRange(0, 3600)]
        [int]$TimeoutSeconds = 0
    )

    if ($VolumeName -notmatch "^[A-Za-z0-9][A-Za-z0-9_.-]*$") {
        throw "Unsafe Docker volume name: $VolumeName"
    }
    return Enter-OfflineNamedLock `
        -Kind "Volume" `
        -Name $VolumeName `
        -TimeoutSeconds $TimeoutSeconds
}

function Exit-OfflineVolumeLock {
    param(
        [Parameter(Mandatory = $true)]
        [System.Threading.Mutex]$Mutex
    )

    try {
        $Mutex.ReleaseMutex()
    }
    finally {
        $Mutex.Dispose()
    }
}

function Test-ServiceInList {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Services,

        [Parameter(Mandatory = $true)]
        [string]$Service
    )

    return [bool]($Services -contains $Service)
}

function Wait-OfflineServiceHealthy {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EnvFile,

        [Parameter(Mandatory = $true)]
        [string]$Service,

        [ValidateRange(5, 600)]
        [int]$TimeoutSeconds = 180
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $containerId = (
            Invoke-OfflineCompose -EnvFile $EnvFile -ComposeArgs @("ps", "-q", $Service) -Capture |
            Select-Object -First 1
        )
        if ($containerId) {
            $status = (
                & docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $containerId 2>$null |
                Out-String
            ).Trim()
            if ($LASTEXITCODE -eq 0 -and $status -in @("healthy", "running")) {
                return
            }
            if ($status -eq "unhealthy") {
                throw "Service '$Service' became unhealthy."
            }
        }
        Start-Sleep -Seconds 2
    }

    throw "Timed out waiting for service '$Service' to become healthy."
}

function Start-PreviouslyRunningServices {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EnvFile,

        [Parameter(Mandatory = $true)]
        [string[]]$Services
    )

    foreach ($service in @("backend", "copilot-runtime", "gateway")) {
        if (Test-ServiceInList -Services $Services -Service $service) {
            Invoke-OfflineCompose -EnvFile $EnvFile -ComposeArgs @("start", $service)
            Wait-OfflineServiceHealthy -EnvFile $EnvFile -Service $service
        }
    }
}

function Invoke-VolumeArchiveTool {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("backup", "restore")]
        [string]$Mode,

        [Parameter(Mandatory = $true)]
        [string]$ImageName,

        [Parameter(Mandatory = $true)]
        [string]$VolumeName,

        [Parameter(Mandatory = $true)]
        [string]$ArchivePath
    )

    if ($VolumeName -notmatch "^[A-Za-z0-9][A-Za-z0-9_.-]*$") {
        throw "Unsafe Docker volume name: $VolumeName"
    }

    $resolvedArchive = Resolve-OfflinePath -Path $ArchivePath
    $archiveDirectory = Split-Path -Parent $resolvedArchive
    $archiveName = Split-Path -Leaf $resolvedArchive
    if ($archiveName -notmatch "^[A-Za-z0-9_.-]+$") {
        throw "Archive filename contains unsupported characters: $archiveName"
    }

    $toolPath = Join-Path $PSScriptRoot "volume_archive.py"
    if (-not (Test-Path -LiteralPath $toolPath -PathType Leaf)) {
        throw "Volume archive helper is missing: $toolPath"
    }
    if (-not (Test-Path -LiteralPath $archiveDirectory -PathType Container)) {
        [void](New-Item -ItemType Directory -Path $archiveDirectory -Force)
    }
    if ($toolPath.Contains(",") -or $archiveDirectory.Contains(",")) {
        throw "Docker bind-mount paths must not contain commas."
    }

    $dockerArgs = @(
        "run",
        "--rm",
        "--network", "none",
        "--user", "10001:10001",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges:true",
        "--entrypoint", "python",
        "--mount", "type=bind,source=$toolPath,target=/tools/volume_archive.py,readonly"
    )

    if ($Mode -eq "backup") {
        $dockerArgs += @(
            "--mount", "type=bind,source=$archiveDirectory,target=/archive",
            "--mount", "type=volume,source=$VolumeName,target=/source,readonly",
            $ImageName,
            "/tools/volume_archive.py", "backup", "/source", "/archive/$archiveName"
        )
    }
    else {
        $dockerArgs += @(
            "--mount", "type=bind,source=$archiveDirectory,target=/archive,readonly",
            "--mount", "type=volume,source=$VolumeName,target=/target",
            $ImageName,
            "/tools/volume_archive.py",
            "restore",
            "/target",
            "/archive/$archiveName",
            "--owner-uid", "10001",
            "--owner-gid", "10001"
        )
    }

    Invoke-Docker -DockerArgs $dockerArgs
}

function Get-Sha256 {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

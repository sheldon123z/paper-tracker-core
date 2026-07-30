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
    try {
        Assert-OfflineSecretAcl -Path $resolved
        return
    }
    catch {
        # Rebuild the DACL below when it is inherited or grants other access.
    }

    try {
        $currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $acl = Get-Acl -LiteralPath $resolved
        $acl.SetAccessRuleProtection($true, $false)
        $acl.SetOwner($currentIdentity.User)

        foreach ($rule in @($acl.Access)) {
            $acl.PurgeAccessRules($rule.IdentityReference)
        }

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
        Set-Acl -LiteralPath $resolved -AclObject $acl
    }
    catch {
        Write-Warning "Could not restrict ACLs on '$resolved': $($_.Exception.Message)"
    }
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

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($VolumeName.ToLowerInvariant())
        $digest = $sha256.ComputeHash($bytes)
    }
    finally {
        $sha256.Dispose()
    }
    $lockId = [System.BitConverter]::ToString($digest).Replace("-", "")
    $mutexName = "Local\PaperTrackerOfflineVolume-$lockId"
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
                "Another backup or restore operation already holds the lock for " +
                "Docker volume '$VolumeName'."
            )
        }
        return $mutex
    }
    catch {
        $mutex.Dispose()
        throw
    }
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

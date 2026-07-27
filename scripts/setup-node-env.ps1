[CmdletBinding()]
param(
    [switch]$ForceSync
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$workspaceRoot = Split-Path -Parent $projectRoot
$versionFile = Join-Path $projectRoot ".node-version"
$npmCacheDir = Join-Path $workspaceRoot ".cache\npm"
$portableNodeDir = Join-Path $workspaceRoot ".runtime\node"

$requiredMajor = if (Test-Path -LiteralPath $versionFile -PathType Leaf) {
    $value = (Get-Content -Raw -LiteralPath $versionFile).Trim()
    if ($value -notmatch "^\d+$") {
        throw "Invalid Node.js major version in ${versionFile}: $value"
    }
    [int]$value
} else {
    22
}

function Get-NodeMajor {
    param(
        [Parameter(Mandatory)]
        [string]$Command
    )

    try {
        $version = (& $Command --version 2>$null | Select-Object -Last 1).Trim()
        if ($LASTEXITCODE -ne 0 -or $version -notmatch "^v(?<major>\d+)\.") {
            return $null
        }
        return [int]$Matches.major
    } catch {
        return $null
    }
}

function Test-LocalTcpPort {
    param(
        [Parameter(Mandatory)]
        [int]$Port
    )

    $client = [Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync("127.0.0.1", $Port)
        return $task.Wait(250) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

$nodeCandidates = @()
$portableNode = Join-Path $portableNodeDir "node.exe"
$portableNpm = Join-Path $portableNodeDir "npm.cmd"
if (
    (Test-Path -LiteralPath $portableNode -PathType Leaf) -and
    (Test-Path -LiteralPath $portableNpm -PathType Leaf)
) {
    $nodeCandidates += $portableNode
}
$pathNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($pathNode) {
    $nodeCandidates += $pathNode.Source
}

$nodeCommand = $null
$nodeMajor = $null
foreach ($candidate in $nodeCandidates | Select-Object -Unique) {
    $candidateMajor = Get-NodeMajor -Command $candidate
    if ($null -ne $candidateMajor -and $candidateMajor -ge $requiredMajor) {
        $nodeCommand = [IO.Path]::GetFullPath($candidate)
        $nodeMajor = $candidateMajor
        break
    }
}

if (-not $nodeCommand) {
    throw "Node.js $requiredMajor or newer was not found. Install it or place a portable runtime in `"$portableNodeDir`"."
}

$nodeDir = Split-Path -Parent $nodeCommand
$env:PATH = "$nodeDir;$env:PATH"
$npmCommand = Join-Path $nodeDir "npm.cmd"
if (-not (Test-Path -LiteralPath $npmCommand -PathType Leaf)) {
    $pathNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $pathNpm) {
        throw "npm.cmd was not found for Node.js at `"$nodeCommand`"."
    }
    $npmCommand = $pathNpm.Source
}

New-Item -ItemType Directory -Force -Path $npmCacheDir | Out-Null
$env:NPM_CONFIG_CACHE = $npmCacheDir

$projects = @(
    [pscustomobject]@{
        Name = "frontend"
        Root = Join-Path $projectRoot "frontend"
        Marker = "node_modules\.bin\vite.cmd"
        Port = 3457
    },
    [pscustomobject]@{
        Name = "copilot-runtime"
        Root = Join-Path $projectRoot "copilot-runtime"
        Marker = "node_modules\@copilotkit\runtime\package.json"
        Port = 4100
    }
)

foreach ($project in $projects) {
    $lockFile = Join-Path $project.Root "package-lock.json"
    if (-not (Test-Path -LiteralPath $lockFile -PathType Leaf)) {
        throw "Missing npm lockfile: $lockFile"
    }

    $nodeModules = Join-Path $project.Root "node_modules"
    if (Test-Path -LiteralPath $nodeModules) {
        $nodeModulesItem = Get-Item -LiteralPath $nodeModules -Force
        if (($nodeModulesItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Refusing to synchronize a linked node_modules directory: $nodeModules"
        }
    }

    $lockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $lockFile).Hash.ToLowerInvariant()
    $expectedStamp = "${lockHash}:node-${nodeMajor}"
    $stampFile = Join-Path $nodeModules ".paper-tracker-package-lock.sha256"
    $installedStamp = if (Test-Path -LiteralPath $stampFile -PathType Leaf) {
        (Get-Content -Raw -LiteralPath $stampFile).Trim()
    } else {
        ""
    }
    $marker = Join-Path $project.Root $project.Marker
    $needsSync = $ForceSync -or
        $installedStamp -ne $expectedStamp -or
        -not (Test-Path -LiteralPath $marker -PathType Leaf)

    if ($needsSync) {
        if (Test-LocalTcpPort -Port $project.Port) {
            throw "Port $($project.Port) is active. Stop $($project.Name) before running npm ci."
        }
        Write-Host "Synchronizing $($project.Name) dependencies (shared cache: $npmCacheDir)"
        & $npmCommand --prefix $project.Root ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw "$($project.Name) dependency installation failed."
        }
        Set-Content -LiteralPath $stampFile -Value $expectedStamp -Encoding ascii
    }
}

Write-Host "Node.js environment ready: $nodeCommand (major $nodeMajor)"

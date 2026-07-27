[CmdletBinding()]
param(
    [string]$Python = $env:PAPER_TRACKER_PYTHON,
    [switch]$ForceSync
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$workspaceRoot = Split-Path -Parent $projectRoot
$venvDir = Join-Path $projectRoot ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$requirementsFiles = @(
    (Join-Path $projectRoot "backend\requirements.txt"),
    (Join-Path $projectRoot "mcp_server\requirements.txt"),
    (Join-Path $projectRoot "backend\requirements-dev.txt")
)
$installRequirementsFile = $requirementsFiles[2]
$versionFile = Join-Path $projectRoot ".python-version"
$pythonConfigFile = Join-Path $workspaceRoot ".runtime\python-base.txt"
$pipCacheDir = Join-Path $workspaceRoot ".cache\pip"
$stampFile = Join-Path $venvDir ".paper-tracker-requirements.sha256"

$requiredVersion = if (Test-Path -LiteralPath $versionFile) {
    (Get-Content -Raw -LiteralPath $versionFile).Trim()
} else {
    "3.12"
}
$requiredMajorMinor = (($requiredVersion -split "\.")[0..1] -join ".")

function Test-PythonVersion {
    param(
        [Parameter(Mandatory)]
        [string]$Command,
        [string[]]$PrefixArgs = @()
    )

    try {
        $output = & $Command @PrefixArgs -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        return $LASTEXITCODE -eq 0 -and ([string]($output | Select-Object -Last 1)).Trim() -eq $requiredMajorMinor
    } catch {
        return $false
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

function Test-WorktreeVenv {
    if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
        return $false
    }

    try {
        $validationScript = @"
import os
import sys

expected = os.path.normcase(os.path.realpath(sys.argv[1]))
actual = os.path.normcase(os.path.realpath(sys.prefix))
required_version = sys.argv[2]
actual_version = str(sys.version_info.major) + chr(46) + str(sys.version_info.minor)
valid = (
    actual_version == required_version
    and sys.prefix != sys.base_prefix
    and actual == expected
)
raise SystemExit(0 if valid else 1)
"@
        & $venvPython -c $validationScript $venvDir $requiredMajorMinor 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Find-BasePython {
    $candidates = @()

    if ($Python) {
        $candidates += [pscustomobject]@{ Command = $Python; PrefixArgs = @(); Source = "PAPER_TRACKER_PYTHON" }
    }

    if (Test-Path -LiteralPath $pythonConfigFile -PathType Leaf) {
        $configuredPython = (Get-Content -Raw -LiteralPath $pythonConfigFile).Trim().Trim('"')
        if ($configuredPython) {
            $candidates += [pscustomobject]@{ Command = $configuredPython; PrefixArgs = @(); Source = $pythonConfigFile }
        }
    }

    $pyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        $candidates += [pscustomobject]@{
            Command = $pyLauncher.Source
            PrefixArgs = @("-$requiredMajorMinor")
            Source = "Python launcher"
        }
    }

    $pathPython = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pathPython) {
        $candidates += [pscustomobject]@{ Command = $pathPython.Source; PrefixArgs = @(); Source = "PATH" }
    }

    foreach ($candidate in $candidates) {
        if (Test-PythonVersion -Command $candidate.Command -PrefixArgs $candidate.PrefixArgs) {
            return $candidate
        }
    }

    throw "Python $requiredMajorMinor was not found. Set PAPER_TRACKER_PYTHON or write its executable path to `"$pythonConfigFile`"."
}

if (-not (Test-WorktreeVenv)) {
    $basePython = Find-BasePython

    if (Test-Path -LiteralPath $venvDir) {
        if (Test-LocalTcpPort -Port 5002) {
            throw "Port 5002 is active. Stop the backend before rebuilding `"$venvDir`"."
        }
        $expectedVenvPath = [IO.Path]::GetFullPath((Join-Path $projectRoot ".venv"))
        if (-not $expectedVenvPath.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove unexpected virtual environment path: $expectedVenvPath"
        }
        $venvItem = Get-Item -LiteralPath $venvDir -Force
        if (($venvItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Refusing to remove a linked virtual environment: $venvDir"
        }
        Write-Host "Removing unusable worktree environment: $venvDir"
        Remove-Item -LiteralPath $venvDir -Recurse -Force
    }

    Write-Host "Creating Python $requiredMajorMinor environment: $venvDir"
    $baseCommand = $basePython.Command
    [string[]]$basePrefixArgs = $basePython.PrefixArgs
    & $baseCommand @basePrefixArgs -m venv $venvDir
    if ($LASTEXITCODE -ne 0 -or -not (Test-WorktreeVenv)) {
        throw "Failed to create the worktree virtual environment with $($basePython.Source)."
    }
}

New-Item -ItemType Directory -Force -Path $pipCacheDir | Out-Null
$env:PIP_CACHE_DIR = $pipCacheDir
$env:PIP_DISABLE_PIP_VERSION_CHECK = "1"
$env:PIP_NO_INPUT = "1"

$requirementsHash = (($requirementsFiles | ForEach-Object {
    (Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash.ToLowerInvariant()
}) -join ":")
$installedHash = if (Test-Path -LiteralPath $stampFile -PathType Leaf) {
    (Get-Content -Raw -LiteralPath $stampFile).Trim()
} else {
    ""
}

$needsSync = $ForceSync -or $requirementsHash -ne $installedHash
if (-not $needsSync) {
    & $venvPython -c "import fastapi, uvicorn, slowapi, sqlalchemy, apscheduler" 2>$null
    $needsSync = $LASTEXITCODE -ne 0
}

if ($needsSync) {
    Write-Host "Synchronizing backend dependencies (shared cache: $pipCacheDir)"
    & $venvPython -m pip install --prefer-binary --index-url https://pypi.org/simple `
        --requirement $installRequirementsFile
    if ($LASTEXITCODE -ne 0) {
        throw "Backend dependency installation failed."
    }

    & $venvPython -m pip check
    if ($LASTEXITCODE -ne 0) {
        throw "The worktree virtual environment has incompatible dependencies."
    }

    Set-Content -LiteralPath $stampFile -Value $requirementsHash -Encoding ascii
}

Write-Host "Python environment ready: $venvPython"

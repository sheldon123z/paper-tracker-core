@echo off
setlocal
cd /d "%~dp0"

set "WORKSPACE_SHARED=%~dp0.."
set "PIP_CACHE_DIR=%WORKSPACE_SHARED%\.cache\pip"
set "NPM_CONFIG_CACHE=%WORKSPACE_SHARED%\.cache\npm"
set "PORTABLE_NODE_HOME=%WORKSPACE_SHARED%\.runtime\node"

if exist "%PORTABLE_NODE_HOME%\node.exe" if exist "%PORTABLE_NODE_HOME%\npm.cmd" (
    set "PATH=%PORTABLE_NODE_HOME%;%PATH%"
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-python-env.ps1"
if errorlevel 1 exit /b 1

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-node-env.ps1"
if errorlevel 1 exit /b 1

if /i "%~1"=="--setup-only" (
    echo Worktree Python and Node.js environments are ready.
    exit /b 0
)

set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"

where node.exe >nul 2>&1
if errorlevel 1 (
    echo Node.js is unavailable. Install Node.js or place its portable runtime in:
    echo "%PORTABLE_NODE_HOME%"
    exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo npm is unavailable. Install Node.js and try again.
    exit /b 1
)

start "Paper Tracker Backend" /min /d "%~dp0backend" "%PYTHON_EXE%" -m uvicorn app.main:app --host 0.0.0.0 --port 5002
start "Paper Tracker Copilot" /min /d "%~dp0copilot-runtime" node.exe server.js
start "Paper Tracker Frontend" /min /d "%~dp0frontend" cmd.exe /c npm.cmd run dev

start "" http://localhost:3457

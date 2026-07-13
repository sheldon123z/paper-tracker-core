@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_EXE=%~dp0..\.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python.exe"

"%PYTHON_EXE%" -c "import fastapi, uvicorn, slowapi, sqlalchemy, apscheduler" >nul 2>&1
if errorlevel 1 (
    echo Installing missing backend dependencies...
    "%PYTHON_EXE%" -m pip install --prefer-binary --index-url https://pypi.org/simple -r "%~dp0backend\requirements.txt"
    if errorlevel 1 exit /b 1
)

where node.exe >nul 2>&1
if errorlevel 1 (
    echo Node.js is unavailable. Install Node.js and try again.
    exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo npm is unavailable. Install Node.js and try again.
    exit /b 1
)

if not exist "%~dp0frontend\node_modules\.bin\vite.cmd" (
    echo Installing missing frontend dependencies...
    call npm.cmd --prefix "%~dp0frontend" install --no-package-lock
    if errorlevel 1 exit /b 1
)

if not exist "%~dp0copilot-runtime\node_modules\@copilotkit\runtime\package.json" (
    echo Installing missing Copilot dependencies...
    call npm.cmd --prefix "%~dp0copilot-runtime" install --no-package-lock
    if errorlevel 1 exit /b 1
)

start "Paper Tracker Backend" /min /d "%~dp0backend" "%PYTHON_EXE%" -m uvicorn app.main:app --host 0.0.0.0 --port 5002
start "Paper Tracker Copilot" /min /d "%~dp0copilot-runtime" node.exe server.js
start "Paper Tracker Frontend" /min /d "%~dp0frontend" cmd.exe /c npm.cmd run dev

start "" http://localhost:3457

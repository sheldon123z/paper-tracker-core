@echo off
cd /d "%~dp0"

start "Paper Tracker Backend" /min /d "%~dp0backend" "%~dp0.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 5002
start "Paper Tracker Copilot" /min /d "%~dp0copilot-runtime" node.exe server.js
start "Paper Tracker Frontend" /min /d "%~dp0frontend" cmd.exe /c npm.cmd run dev

start "" http://localhost:3457

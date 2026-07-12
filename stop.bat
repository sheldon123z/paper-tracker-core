@echo off

powershell -NoProfile -Command "$ports = 5002,3457,4100; foreach ($port in $ports) { $items = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue; foreach ($item in $items) { taskkill.exe /PID $item.OwningProcess /T /F | Out-Null } }"

echo Paper Tracker stopped.

#!/bin/bash
# Paper Tracker Core - 一键启动
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. 后端 (launchd)
if ! launchctl print gui/501/com.paper-tracker.backend &>/dev/null; then
  launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.paper-tracker.backend.plist
  echo "[backend]  started via launchd (port 5002)"
else
  echo "[backend]  already running (port 5002)"
fi

# 2. CopilotRuntime 代理
if lsof -iTCP:4100 -sTCP:LISTEN &>/dev/null; then
  echo "[copilot]  already running (port 4100)"
else
  mkdir -p "$PROJECT_DIR/logs"
  cd "$PROJECT_DIR/copilot-runtime" && node server.js >> "$PROJECT_DIR/logs/copilot-runtime.log" 2>&1 &
  echo "[copilot]  started (port 4100, logs/copilot-runtime.log)"
fi

# 3. 前端
if lsof -iTCP:3457 -sTCP:LISTEN &>/dev/null; then
  echo "[frontend] already running (port 3457)"
else
  cd "$PROJECT_DIR/frontend" && npm run dev &>/dev/null &
  echo "[frontend] started (port 3457)"
fi

echo ""
echo "-- Paper Tracker Core --"
echo "Frontend:  http://localhost:3457"
echo "Backend:   http://localhost:5002"
echo "Copilot:   http://localhost:4100"
echo "API Docs:  http://localhost:5002/docs"

# 等前端就绪后打开浏览器
sleep 2 && open http://localhost:3457

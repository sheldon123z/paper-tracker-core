#!/usr/bin/env bash
# Paper Tracker Core - start the services from the current Git worktree.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_SHARED="$(cd "$PROJECT_DIR/.." && pwd)"
PYTHON_EXE="$PROJECT_DIR/.venv/bin/python"
LOG_DIR="$PROJECT_DIR/logs"
PID_DIR="$LOG_DIR/pids"

export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$WORKSPACE_SHARED/.cache/npm}"

if [[ ! -x "$PYTHON_EXE" ]]; then
  echo "The current worktree has no usable .venv/bin/python." >&2
  echo "Create it from this worktree and install backend/requirements-dev.txt." >&2
  exit 1
fi

"$PYTHON_EXE" - "$PROJECT_DIR/.venv" <<'PY'
import os
import sys

expected = os.path.normcase(os.path.realpath(sys.argv[1]))
actual = os.path.normcase(os.path.realpath(sys.prefix))
if sys.prefix == sys.base_prefix or actual != expected:
    raise SystemExit(
        f"Refusing to use a Python interpreter outside this worktree: {sys.executable}"
    )
PY

if ! "$PYTHON_EXE" -c \
  "import apscheduler, fastapi, slowapi, sqlalchemy, uvicorn" >/dev/null 2>&1; then
  echo "The current worktree virtual environment is missing backend dependencies." >&2
  echo "Run: $PYTHON_EXE -m pip install -r backend/requirements-dev.txt" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 22 or newer and npm are required." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ ! "$NODE_MAJOR" =~ ^[0-9]+$ ]] || ((NODE_MAJOR < 22)); then
  echo "Node.js 22 or newer is required; found $(node --version)." >&2
  exit 1
fi

mkdir -p "$NPM_CONFIG_CACHE" "$LOG_DIR" "$PID_DIR"

lock_hash() {
  node -e \
    "const fs=require('node:fs');const crypto=require('node:crypto');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" \
    "$1"
}

sync_node_project() {
  local relative_dir="$1"
  local marker="$2"
  local package_dir="$PROJECT_DIR/$relative_dir"
  local lock_file="$package_dir/package-lock.json"
  local stamp_file="$package_dir/node_modules/.paper-tracker-package-lock.sha256"
  local expected_stamp

  if [[ ! -f "$lock_file" ]]; then
    echo "Missing npm lockfile: $lock_file" >&2
    exit 1
  fi
  if [[ -L "$package_dir/node_modules" ]]; then
    echo "Refusing to synchronize a linked node_modules directory: $package_dir/node_modules" >&2
    exit 1
  fi

  expected_stamp="$(lock_hash "$lock_file"):node-$NODE_MAJOR"
  if [[ ! -f "$marker" ]] ||
    [[ ! -f "$stamp_file" ]] ||
    [[ "$(<"$stamp_file")" != "$expected_stamp" ]]; then
    echo "Synchronizing $relative_dir dependencies..."
    npm --prefix "$package_dir" ci --no-audit --no-fund
    printf '%s\n' "$expected_stamp" >"$stamp_file"
  fi
}

pid_is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(<"$pid_file")" 2>/dev/null
}

port_is_busy() {
  "$PYTHON_EXE" - "$1" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket() as sock:
    sock.settimeout(0.2)
    raise SystemExit(0 if sock.connect_ex(("127.0.0.1", port)) == 0 else 1)
PY
}

ensure_service_available() {
  local name="$1"
  local port="$2"
  local pid_file="$PID_DIR/$name.pid"

  if port_is_busy "$port"; then
    if pid_is_running "$pid_file"; then
      echo "[$name] already running from this worktree (port $port)"
      return 1
    fi
    echo "[$name] port $port is occupied by another process or worktree." >&2
    exit 1
  fi
  return 0
}

start_service() {
  local name="$1"
  local working_dir="$2"
  shift 2

  (
    cd "$working_dir"
    nohup "$@" >"$LOG_DIR/$name.log" 2>&1 &
    printf '%s\n' "$!" >"$PID_DIR/$name.pid"
  )
  sleep 1
  if ! pid_is_running "$PID_DIR/$name.pid"; then
    echo "[$name] failed to start; inspect $LOG_DIR/$name.log" >&2
    exit 1
  fi
  echo "[$name] started"
}

start_backend=1
start_copilot=1
start_frontend=1
if ! ensure_service_available "backend" 5002; then
  start_backend=0
fi
if ! ensure_service_available "copilot" 4100; then
  start_copilot=0
fi
if ! ensure_service_available "frontend" 3457; then
  start_frontend=0
fi

if ((start_copilot)); then
  sync_node_project \
    "copilot-runtime" \
    "$PROJECT_DIR/copilot-runtime/node_modules/@copilotkit/runtime/package.json"
fi

if ((start_frontend)); then
  sync_node_project \
    "frontend" \
    "$PROJECT_DIR/frontend/node_modules/.bin/vite"
fi

if ((start_backend)); then
  start_service \
    "backend" \
    "$PROJECT_DIR/backend" \
    "$PYTHON_EXE" -m uvicorn app.main:app --host 0.0.0.0 --port 5002
fi

if ((start_copilot)); then
  start_service "copilot" "$PROJECT_DIR/copilot-runtime" node server.js
fi

if ((start_frontend)); then
  start_service "frontend" "$PROJECT_DIR/frontend" npm run dev
fi

echo ""
echo "-- Paper Tracker Core --"
echo "Frontend:  http://localhost:3457"
echo "Backend:   http://localhost:5002"
echo "Copilot:   http://localhost:4100"
echo "API Docs:  http://localhost:5002/docs"
echo "Logs:      $LOG_DIR"

if command -v open >/dev/null 2>&1; then
  open http://localhost:3457 >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1 && [[ -n "${DISPLAY:-}" ]]; then
  xdg-open http://localhost:3457 >/dev/null 2>&1 || true
fi

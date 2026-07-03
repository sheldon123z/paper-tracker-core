"""
PaperTrackerPro Desktop Launcher

Entry point for the packaged desktop application:
1. Initialize data directory (first run)
2. Start CopilotRuntime subprocess (if binary exists)
3. Start FastAPI backend via uvicorn (serves frontend static files)
4. Open default browser after short delay
5. Clean up all subprocesses on exit
"""

import atexit
import os
import platform
import shutil
import signal
import subprocess
import sys
import threading
import time
import webbrowser

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

def _get_data_dir():
    system = platform.system()
    if system == "Darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    elif system == "Windows":
        base = os.environ.get("APPDATA", os.path.join(os.path.expanduser("~"), "AppData", "Roaming"))
    else:
        base = os.environ.get("XDG_DATA_HOME", os.path.join(os.path.expanduser("~"), ".local", "share"))
    return os.path.join(base, "PaperTrackerPro")


def _get_bundle_dir():
    """Return the directory where the executable lives (onedir mode)."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

def _init_data_dir(data_dir):
    """Create data directory and copy .env.example on first run."""
    os.makedirs(data_dir, exist_ok=True)
    env_file = os.path.join(data_dir, ".env")
    if not os.path.exists(env_file):
        # Copy .env.example from bundle
        bundle_dir = _get_bundle_dir()
        example = os.path.join(bundle_dir, ".env.example")
        if os.path.exists(example):
            shutil.copy2(example, env_file)
            print(f"[Launcher] Created {env_file} from template — please edit API keys.")
        else:
            # Create a minimal .env
            with open(env_file, "w") as f:
                f.write("# PaperTrackerPro Configuration\n")
                f.write("# Add your API keys below:\n")
                f.write("# DEEPSEEK_API_KEY=\n")
                f.write("# OPENAI_API_KEY=\n")
            print(f"[Launcher] Created minimal {env_file} — please add API keys.")


# ---------------------------------------------------------------------------
# Subprocess management
# ---------------------------------------------------------------------------

_children = []


def _cleanup():
    """Terminate all child processes."""
    for proc in _children:
        if proc.poll() is None:
            print(f"[Launcher] Stopping PID {proc.pid}...")
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                proc.kill()


atexit.register(_cleanup)


def _start_copilot_runtime(bundle_dir):
    """Start CopilotRuntime binary if it exists alongside the main executable."""
    binary_name = "copilot-runtime.exe" if platform.system() == "Windows" else "copilot-runtime"

    binary_path = os.path.join(bundle_dir, binary_name)
    if not os.path.exists(binary_path):
        print(f"[Launcher] CopilotRuntime not found at {binary_path}, AI assistant will be unavailable.")
        return None

    env = os.environ.copy()
    env["BACKEND_URL"] = "http://localhost:5002"
    env["PORT"] = "4100"

    proc = subprocess.Popen(
        [binary_path],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    _children.append(proc)
    print(f"[Launcher] CopilotRuntime started (PID {proc.pid}) on port 4100")
    return proc


def _open_browser_delayed(url, delay=2.0):
    """Open browser after a delay to let the server start."""
    def _open():
        time.sleep(delay)
        print(f"[Launcher] Opening {url}")
        webbrowser.open(url)
    t = threading.Thread(target=_open, daemon=True)
    t.start()


# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------

def _signal_handler(signum, frame):
    print(f"\n[Launcher] Received signal {signum}, shutting down...")
    _cleanup()
    sys.exit(0)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    data_dir = _get_data_dir()
    bundle_dir = _get_bundle_dir()

    print(f"[Launcher] Data directory: {data_dir}")
    print(f"[Launcher] Bundle directory: {bundle_dir}")

    # 1. Initialize data directory
    _init_data_dir(data_dir)

    # 2. Start CopilotRuntime
    _start_copilot_runtime(bundle_dir)

    # 3. Open browser after delay
    _open_browser_delayed("http://localhost:5002")

    # 4. Start FastAPI (blocking)
    import uvicorn
    print("[Launcher] Starting PaperTrackerPro backend on port 5002...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=5002, log_level="info")


if __name__ == "__main__":
    main()

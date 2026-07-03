#!/bin/bash
set -euo pipefail

# ============================================================
# PaperTrackerPro — Local build script
# Produces dist/PaperTrackerPro/ ready for distribution.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== PaperTrackerPro Build ==="
echo "Project root: $PROJECT_ROOT"

# ---------- 1. Build frontend ----------
echo ""
echo "[1/5] Building frontend..."
cd "$PROJECT_ROOT/frontend"
npm ci
# Use packaging env file for same-origin API
cp .env.packaging .env.production.local
npm run build
rm -f .env.production.local
echo "Frontend build complete."

# ---------- 2. Build CopilotRuntime ----------
echo ""
echo "[2/5] Building CopilotRuntime..."
cd "$PROJECT_ROOT/copilot-runtime"
npm ci
npm run build:bundle

# Detect platform for pkg target
PLATFORM="$(uname -s)"
ARCH="$(uname -m)"
case "$PLATFORM-$ARCH" in
    Darwin-arm64)  PKG_TARGET="node18-macos-arm64" ;;
    Darwin-x86_64) PKG_TARGET="node18-macos-x64"   ;;
    Linux-x86_64)  PKG_TARGET="node18-linux-x64"   ;;
    MINGW*|MSYS*)  PKG_TARGET="node18-win-x64"     ;;
    *)             echo "Unsupported platform: $PLATFORM-$ARCH"; exit 1 ;;
esac

npx @yao-pkg/pkg dist/server.cjs --target "$PKG_TARGET" --output dist/bin/copilot-runtime
echo "CopilotRuntime binary built: dist/bin/"

# ---------- 3. Prepare .env.example ----------
echo ""
echo "[3/5] Preparing .env.example..."
cd "$PROJECT_ROOT"
if [ ! -f .env.example ]; then
    cat > .env.example << 'ENVEOF'
# PaperTrackerPro Configuration
# Copy this file to .env and fill in your API keys.

# DATABASE_URL=sqlite:///./paper_tracker.db
# ENCRYPTION_KEY=          # Run: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# LLM API Keys (add the ones you use)
# DEEPSEEK_API_KEY=
# OPENAI_API_KEY=
# ARK_API_KEY=

ENVEOF
    echo ".env.example created."
else
    echo ".env.example already exists."
fi

# ---------- 4. PyInstaller build ----------
echo ""
echo "[4/5] Running PyInstaller..."
cd "$PROJECT_ROOT"

# Ensure PyInstaller is installed
pip install pyinstaller 2>/dev/null || true

# Copy CopilotRuntime binary next to where PyInstaller output goes
mkdir -p dist/PaperTrackerPro
pyinstaller paper_tracker.spec --noconfirm

# Copy CopilotRuntime binary into the distribution folder
if [ -f "copilot-runtime/dist/bin/copilot-runtime" ]; then
    cp "copilot-runtime/dist/bin/copilot-runtime" "dist/PaperTrackerPro/"
elif [ -f "copilot-runtime/dist/bin/copilot-runtime.exe" ]; then
    cp "copilot-runtime/dist/bin/copilot-runtime.exe" "dist/PaperTrackerPro/"
fi

# Copy .env.example
cp .env.example dist/PaperTrackerPro/

# Create README
cat > dist/PaperTrackerPro/README.txt << 'READMEEOF'
PaperTrackerPro - Academic Paper Tracking System

Quick Start:
1. Edit .env file and add your API keys
2. Double-click PaperTrackerPro to start
3. Browser will open automatically at http://localhost:5002

Data is stored in:
  macOS:   ~/Library/Application Support/PaperTrackerPro/
  Windows: %APPDATA%/PaperTrackerPro/

To stop: press Ctrl+C in the terminal or close the window.
READMEEOF

echo "PyInstaller build complete."

# ---------- 5. Package ----------
echo ""
echo "[5/5] Packaging..."
cd "$PROJECT_ROOT/dist"

RELEASE_NAME="PaperTrackerPro-${PLATFORM,,}-${ARCH}"
if [ "$PLATFORM" = "Darwin" ]; then
    RELEASE_NAME="PaperTrackerPro-macos-${ARCH}"
fi

zip -r "${RELEASE_NAME}.zip" PaperTrackerPro/
echo ""
echo "=== Build complete! ==="
echo "Output: dist/${RELEASE_NAME}.zip"

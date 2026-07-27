from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
VENV_LIB = ROOT / ".venv" / "lib"

for path in (ROOT, BACKEND_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

if VENV_LIB.exists():
    for site_packages in VENV_LIB.glob("python*/site-packages"):
        if str(site_packages) not in sys.path:
            sys.path.insert(0, str(site_packages))

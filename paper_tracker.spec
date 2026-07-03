# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for PaperTrackerPro desktop application.

Build: pyinstaller paper_tracker.spec
Output: dist/PaperTrackerPro/
"""

import os
import sys

block_cipher = None

# Paths
SPEC_DIR = os.path.dirname(os.path.abspath(SPECPATH))
BACKEND_DIR = os.path.join(SPEC_DIR, 'backend')
FRONTEND_DIST = os.path.join(SPEC_DIR, 'frontend', 'dist')

a = Analysis(
    [os.path.join(BACKEND_DIR, 'launcher.py')],
    pathex=[BACKEND_DIR],
    binaries=[],
    datas=[
        # Frontend static files
        (FRONTEND_DIST, os.path.join('frontend', 'dist')),
        # .env.example for first-run setup
        (os.path.join(SPEC_DIR, '.env.example'), '.'),
    ],
    hiddenimports=[
        # FastAPI / Uvicorn
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # SQLAlchemy
        'sqlalchemy',
        'sqlalchemy.dialects.sqlite',
        # Pydantic
        'pydantic',
        'pydantic_settings',
        # LLM & AI
        'litellm',
        'litellm.llms',
        'litellm.llms.openai',
        'langchain_core',
        'langchain_litellm',
        'langgraph',
        # Networking
        'httpx',
        'httpx._transports',
        'httpx._transports.default',
        # Feed parsing
        'feedparser',
        # Scheduling
        'apscheduler',
        'apscheduler.schedulers.background',
        'apscheduler.triggers.interval',
        'apscheduler.triggers.cron',
        'apscheduler.jobstores.memory',
        'apscheduler.executors.pool',
        # Crypto & Auth
        'cryptography',
        'cryptography.fernet',
        'passlib',
        'passlib.handlers',
        'passlib.handlers.bcrypt',
        'bcrypt',
        'jose',
        'jose.jwt',
        # Multipart
        'multipart',
        'python_multipart',
        # AG-UI
        'ag_ui_protocol',
        # dotenv
        'dotenv',
        # App modules
        'app',
        'app.main',
        'app.database',
        'app.models',
        'app.schemas',
        'app.settings',
        'app.security',
        'app.control_plane',
        'app.control_plane.database',
        'app.control_plane.models',
        'app.auth',
        'app.auth.jwt_handler',
        'app.auth.password',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'PIL',
        'scipy',
        'numpy.testing',
        'test',
        'tests',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='PaperTrackerPro',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='PaperTrackerPro',
)

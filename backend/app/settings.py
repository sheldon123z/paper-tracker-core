from __future__ import annotations

import os
import platform
import sys
from pathlib import Path

from cryptography.fernet import Fernet
from dotenv import load_dotenv

_LOADED = False

# ---------- Frozen / packaged mode detection ----------

def is_frozen() -> bool:
    """Return True when running inside a PyInstaller bundle."""
    return getattr(sys, "frozen", False)


def get_data_dir() -> Path:
    """Return the platform-specific data directory for packaged mode.

    macOS:   ~/Library/Application Support/PaperTrackerPro
    Windows: %APPDATA%/PaperTrackerPro
    Linux:   ~/.local/share/PaperTrackerPro
    """
    system = platform.system()
    if system == "Darwin":
        base = Path.home() / "Library" / "Application Support"
    elif system == "Windows":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    data_dir = base / "PaperTrackerPro"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


# ---------- Path roots ----------

if is_frozen():
    # PyInstaller sets sys._MEIPASS to the temp extraction directory
    _MEIPASS = Path(sys._MEIPASS)
    PROJECT_ROOT = _MEIPASS
    BACKEND_ROOT = _MEIPASS
else:
    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
    BACKEND_ROOT = PROJECT_ROOT / "backend"


def load_environment() -> None:
    global _LOADED
    if _LOADED:
        return
    if is_frozen():
        # In packaged mode, load .env from data directory
        data_dir = get_data_dir()
        env_file = data_dir / ".env"
        if env_file.exists():
            load_dotenv(env_file)
    else:
        load_dotenv(PROJECT_ROOT / ".env")
    _configure_no_proxy()
    _LOADED = True


def _configure_no_proxy() -> None:
    """Add LLM/academic API domains to NO_PROXY to bypass local VPN/proxy.

    Clash and similar tools may listen on random ports after restart,
    causing LLM API calls to fail when HTTP_PROXY is set in .env.
    By adding API domains to NO_PROXY, requests go direct regardless.
    """
    _API_DOMAINS = (
        "api.deepseek.com",
        "api.openai.com",
        "api.anthropic.com",
        "api.crossref.org",
        "api.openalex.org",
        "api.semanticscholar.org",
        "dashscope.aliyuncs.com",
        "open.bigmodel.cn",
        "ark.cn-beijing.volces.com",
        "api.moonshot.cn",
        "mineru.net",
        "v2.doc2x.noedgeai.com",
    )
    existing = os.environ.get("NO_PROXY", "")
    domains_to_add = [d for d in _API_DOMAINS if d not in existing]
    if domains_to_add:
        new_value = ",".join(filter(None, [existing] + domains_to_add))
        os.environ["NO_PROXY"] = new_value
        os.environ["no_proxy"] = new_value


def _normalize_sqlite_url(raw_url: str) -> str:
    prefix = "sqlite:///"
    if not raw_url.startswith(prefix):
        return raw_url

    path_part = raw_url[len(prefix) :]
    if not path_part or path_part.startswith("/"):
        return raw_url

    normalized_path = (BACKEND_ROOT / path_part).resolve()
    return f"sqlite:///{normalized_path}"


def get_database_url() -> str:
    load_environment()
    if is_frozen():
        # In packaged mode, always use data directory for the database
        data_dir = get_data_dir()
        db_path = data_dir / "paper_tracker.db"
        return f"sqlite:///{db_path}"
    raw_url = os.getenv("DATABASE_URL", "sqlite:///./paper_tracker.db")
    return _normalize_sqlite_url(raw_url)


# ---------- Secret Validation ----------

def validate_secrets() -> list[str]:
    """Validate critical secrets are properly configured.

    Returns a list of validation errors (empty if all valid).
    Call this during application startup to fail fast on misconfiguration.

    Security best practices:
    - ENCRYPTION_KEY and JWT_SECRET_KEY must be different (CWE-321)
    - Keys should be sufficiently long (>= 32 bytes for Fernet, >= 43 chars for JWT)
    - Production deployments should never use default/example values
    """
    load_environment()
    errors = []

    # Check encryption key
    encryption_key = os.getenv("ENCRYPTION_KEY", "")
    if not encryption_key:
        errors.append("ENCRYPTION_KEY is required - generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"")
    elif len(encryption_key) < 44:  # Fernet keys are 44 bytes when base64-encoded
        errors.append(f"ENCRYPTION_KEY too short (got {len(encryption_key)} chars, expected 44)")
    else:
        # Verify the key is a valid Fernet key (not just any 44-char string)
        try:
            Fernet(encryption_key.encode())
        except Exception:
            errors.append("ENCRYPTION_KEY is not a valid Fernet key - generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"")

    # Check encryption key fallbacks
    fallback_keys = os.getenv("ENCRYPTION_KEY_FALLBACKS", "").strip()
    if fallback_keys:
        for i, fb_key in enumerate(part.strip() for part in fallback_keys.split(",") if part.strip()):
            try:
                Fernet(fb_key.encode())
            except Exception:
                errors.append(f"ENCRYPTION_KEY_FALLBACKS[{i}] is not a valid Fernet key")

    # Check JWT secret
    jwt_secret = os.getenv("JWT_SECRET_KEY", "")
    if not jwt_secret:
        errors.append("JWT_SECRET_KEY is required - generate with: python -c \"import secrets; print(secrets.token_urlsafe(64))\"")
    elif len(jwt_secret) < 32:
        errors.append(f"JWT_SECRET_KEY too short (got {len(jwt_secret)} chars, recommended 86+)")

    # Critical security check: keys must be different
    if encryption_key and jwt_secret and encryption_key == jwt_secret:
        errors.append("CRITICAL: ENCRYPTION_KEY and JWT_SECRET_KEY must be different (CWE-321: key reuse)")

    # Check for default/example values (common security mistake)
    default_values = {
        "ENCRYPTION_KEY": ["your-secret-key", "change-me", "example-key"],
        "JWT_SECRET_KEY": ["your-jwt-secret", "change-me", "example-secret"],
    }
    for env_var, bad_values in default_values.items():
        value = os.getenv(env_var, "")
        if value and any(bad in value.lower() for bad in bad_values):
            errors.append(f"{env_var} appears to be a default/example value - generate a secure random key")

    return errors


def validate_runtime_secrets() -> dict[str, bool]:
    """Validate optional runtime secrets for production hardening.

    Returns a dict mapping secret names to whether they are set.
    These are optional for development but recommended for production.
    """
    load_environment()
    return {
        "COPILOT_RUNTIME_SECRET": bool(os.getenv("COPILOT_RUNTIME_SECRET")),
        "LLM_CONFIG_ADMIN_TOKEN": bool(os.getenv("LLM_CONFIG_ADMIN_TOKEN")),
    }

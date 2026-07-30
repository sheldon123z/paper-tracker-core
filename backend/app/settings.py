from __future__ import annotations

import os
import platform
import sys
from pathlib import Path

from cryptography.fernet import Fernet
from dotenv import load_dotenv

from .offline import configure_offline_environment, is_offline_mode

_LOADED = False

# ---------- Frozen / packaged mode detection ----------

def is_frozen() -> bool:
    """Return True when running inside a PyInstaller bundle."""
    return getattr(sys, "frozen", False)


def get_data_dir() -> Path:
    """Return the persistent application data directory.

    ``PAPER_TRACKER_DATA_DIR`` takes precedence in every runtime mode.  When
    it is unset, the existing packaged-mode platform location is preserved.

    macOS:   ~/Library/Application Support/PaperTrackerPro
    Windows: %APPDATA%/PaperTrackerPro
    Linux:   ~/.local/share/PaperTrackerPro
    """
    configured = os.getenv("PAPER_TRACKER_DATA_DIR", "").strip()
    if configured:
        data_dir = Path(configured).expanduser().resolve()
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir

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


def has_configured_data_dir() -> bool:
    """Return whether an explicit persistent data root is configured."""

    return bool(os.getenv("PAPER_TRACKER_DATA_DIR", "").strip())


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
    if is_offline_mode():
        configure_offline_environment()
    else:
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
    configured_url = os.getenv("DATABASE_URL", "").strip()
    if configured_url:
        return _normalize_sqlite_url(configured_url)
    if is_frozen() or has_configured_data_dir():
        # Packaged and explicitly persistent deployments keep the primary DB
        # under the same durable root as attachments and checkpoints.
        data_dir = get_data_dir()
        db_path = data_dir / "paper_tracker.db"
        return f"sqlite:///{db_path}"
    return _normalize_sqlite_url("sqlite:///./paper_tracker.db")


def get_control_db_dir() -> Path:
    """Return the directory containing the control-plane database."""

    load_environment()
    if is_frozen() or has_configured_data_dir():
        return get_data_dir() / "control"
    return BACKEND_ROOT / "data" / "control"


def get_checkpoint_db_path() -> Path:
    """Return the configured/default LangGraph checkpoint database path."""

    load_environment()
    configured = os.getenv("CHECKPOINT_DB_PATH", "").strip()
    if configured:
        return Path(configured).expanduser()
    if is_frozen() or has_configured_data_dir():
        return get_data_dir() / "graph_checkpoints.db"
    # Preserve the existing development default, which is relative to cwd.
    return Path("graph_checkpoints.db")


def get_file_storage_dir() -> Path:
    """Return the root used for uploaded paper attachments."""

    load_environment()
    if is_frozen() or has_configured_data_dir():
        return get_data_dir() / "paper_files"
    return BACKEND_ROOT / "data" / "paper_files"


def get_backup_dir() -> Path:
    """Return the durable database-backup directory."""

    load_environment()
    base = get_data_dir() if is_frozen() or has_configured_data_dir() else BACKEND_ROOT / "data"
    return base / "backups"


class SecretFileError(RuntimeError):
    """Raised for an unreadable or empty ``*_FILE`` secret source."""


def get_secret_value(name: str, default: str | None = None) -> str | None:
    """Read a secret from ``NAME`` or, if absent, ``NAME_FILE``.

    Direct environment values win.  Secret-file contents are never logged or
    included in errors; only trailing newline characters added by Docker
    secret mounts are removed.
    """

    direct = os.getenv(name)
    if direct:
        return direct

    file_var = f"{name}_FILE"
    secret_path = os.getenv(file_var, "").strip()
    if not secret_path:
        return default

    path = Path(secret_path).expanduser()
    try:
        value = path.read_text(encoding="utf-8").rstrip("\r\n")
    except OSError:
        # Do not retain the underlying OSError: its traceback/repr includes the
        # mounted secret path, which may expose deployment layout in logs.
        raise SecretFileError(
            f"Unable to read secret configured by {file_var}."
        ) from None
    if not value:
        raise SecretFileError(f"Secret configured by {file_var} is empty.")
    return value


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
    encryption_key = get_secret_value("ENCRYPTION_KEY", "") or ""
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
    fallback_keys = (get_secret_value("ENCRYPTION_KEY_FALLBACKS", "") or "").strip()
    if fallback_keys:
        for i, fb_key in enumerate(part.strip() for part in fallback_keys.split(",") if part.strip()):
            try:
                Fernet(fb_key.encode())
            except Exception:
                errors.append(f"ENCRYPTION_KEY_FALLBACKS[{i}] is not a valid Fernet key")

    # Check JWT secret
    jwt_secret = get_secret_value("JWT_SECRET_KEY", "") or ""
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
        value = get_secret_value(env_var, "") or ""
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
        "COPILOT_RUNTIME_SECRET": bool(get_secret_value("COPILOT_RUNTIME_SECRET")),
        "LLM_CONFIG_ADMIN_TOKEN": bool(get_secret_value("LLM_CONFIG_ADMIN_TOKEN")),
    }

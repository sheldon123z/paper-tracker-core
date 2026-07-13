import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from ..settings import BACKEND_ROOT, get_data_dir, is_frozen


def _resolve_control_db_dir() -> Path:
    if is_frozen():
        return get_data_dir() / "control"
    return BACKEND_ROOT / "data" / "control"


CONTROL_DB_DIR = _resolve_control_db_dir()
CONTROL_DB_PATH = CONTROL_DB_DIR / "control_plane.db"


def _get_control_db_url() -> str:
    configured = os.getenv("CONTROL_DATABASE_URL", "").strip()
    if configured:
        if configured.startswith("sqlite:///"):
            configured_path = Path(configured.removeprefix("sqlite:///")).expanduser()
            configured_path.parent.mkdir(parents=True, exist_ok=True)
        return configured
    os.makedirs(CONTROL_DB_DIR, exist_ok=True)
    return f"sqlite:///{CONTROL_DB_PATH}"


control_engine = create_engine(
    _get_control_db_url(),
    connect_args={"check_same_thread": False},
)
ControlSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=control_engine)
ControlBase = declarative_base()


def get_control_db():
    db = ControlSessionLocal()
    try:
        yield db
    finally:
        db.close()

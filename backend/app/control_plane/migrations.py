from __future__ import annotations

import logging
import secrets

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from ..services.migration_backup import backup_sqlite_engine

logger = logging.getLogger("paper-tracker.control-migrations")

_USER_COLUMNS = {
    "department_id": "INTEGER REFERENCES departments(id)",
    "must_change_password": "BOOLEAN DEFAULT 0 NOT NULL",
}

_SESSION_COLUMNS = {
    "session_key": "VARCHAR(64)",
}


def migrate_control_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    missing = False
    if "users" in tables:
        cols = {c["name"] for c in inspector.get_columns("users")}
        missing = missing or any(name not in cols for name in _USER_COLUMNS)
        missing = missing or "usage_level" in cols
    if "user_sessions" in tables:
        cols = {c["name"] for c in inspector.get_columns("user_sessions")}
        missing = missing or any(name not in cols for name in _SESSION_COLUMNS)
    if missing:
        backup = backup_sqlite_engine(engine, "control")
        logger.info("Created pre-migration control backup: %s", backup)

    with engine.begin() as conn:
        if "users" in tables:
            cols = {c["name"] for c in inspect(engine).get_columns("users")}
            for name, ddl in _USER_COLUMNS.items():
                if name not in cols:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))
            conn.execute(text("UPDATE users SET role='manager' WHERE role IN ('super_admin','admin')"))
            if "usage_level" in cols:
                conn.execute(text("ALTER TABLE users DROP COLUMN usage_level"))

        if "user_sessions" in tables:
            cols = {c["name"] for c in inspect(engine).get_columns("user_sessions")}
            if "session_key" not in cols:
                conn.execute(text("ALTER TABLE user_sessions ADD COLUMN session_key VARCHAR(64)"))
            rows = conn.execute(text("SELECT id FROM user_sessions WHERE session_key IS NULL OR session_key=''"))
            for row in rows:
                conn.execute(
                    text("UPDATE user_sessions SET session_key=:key WHERE id=:id"),
                    {"key": secrets.token_urlsafe(32), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_user_sessions_session_key ON user_sessions(session_key)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_department_id ON users(department_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_events_actor_created ON audit_events(actor_user_id, created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_events_department_created ON audit_events(department_id, created_at)"))

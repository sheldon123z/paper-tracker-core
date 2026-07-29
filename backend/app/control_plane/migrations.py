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


def _ensure_manager_exists(conn) -> None:
    """保证库中至少有一个 manager，避免出现无人可解锁的死锁。

    公开注册默认关闭，账号由 manager 开设，而新账号的 role 默认是 user。
    一旦库中一个 manager 都不存在，/api/admin/* 会被 require_manager 全部拒绝，
    于是无法创建部门、无法分派角色；同时 visible_scope 对未分配部门的账号一律
    抛 403，论文库对所有人恒为空。这种状态无法从产品内部恢复。

    这里把最早创建的账号（自增主键最小者）提升为 manager 作为兜底引导。
    仅在完全没有 manager 时触发，已有 manager 或表为空时不做任何改动。
    """
    if conn.execute(text("SELECT 1 FROM users WHERE role='manager' LIMIT 1")).first():
        return
    first_user = conn.execute(text("SELECT id FROM users ORDER BY id LIMIT 1")).first()
    if first_user is None:
        return
    conn.execute(text("UPDATE users SET role='manager' WHERE id=:id"), {"id": first_user[0]})
    logger.warning(
        "No manager account exists; promoted user id=%s to manager to keep the instance administrable",
        first_user[0],
    )


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
            # 必须在 legacy 角色映射之后判断，否则会把已是管理员的账号当成缺失。
            _ensure_manager_exists(conn)
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
            conn.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS ix_user_sessions_session_key ON user_sessions(session_key)")
            )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_department_id ON users(department_id)"))
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_audit_events_actor_created ON audit_events(actor_user_id, created_at)")
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_audit_events_department_created ON audit_events(department_id, created_at)"
            )
        )

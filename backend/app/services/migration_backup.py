"""One-shot SQLite backups taken immediately before access-control migrations."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.engine import Engine


def backup_sqlite_engine(engine: Engine, label: str) -> Path | None:
    database = engine.url.database
    if not database or database == ":memory:":
        return None
    source = Path(database).resolve()
    if not source.exists():
        return None
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    target = source.with_name(f"{source.name}.bak-before-access-control-{label}-{stamp}")
    source_conn = sqlite3.connect(str(source))
    target_conn = sqlite3.connect(str(target))
    try:
        source_conn.backup(target_conn)
    finally:
        target_conn.close()
        source_conn.close()
    return target

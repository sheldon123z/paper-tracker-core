"""Automated SQLite database backup service.

Backs up three databases to ``backend/data/backups/`` on a configurable
interval using WAL checkpoint + shutil.copy2 for safe, consistent copies.

Environment variables:
    BACKUP_RETENTION_DAYS  – how many days of backups to keep (default: 7)
    BACKUP_INTERVAL_HOURS  – hours between scheduled backups (default: 1)
"""

import logging
import os
import shutil
import sqlite3
import time
from datetime import UTC, datetime
from pathlib import Path

from ..settings import BACKEND_ROOT, get_data_dir, is_frozen

logger = logging.getLogger("paper-tracker.db-backup")

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def _backup_dir() -> Path:
    """Return the backup directory, creating it if necessary."""
    base = get_data_dir() if is_frozen() else BACKEND_ROOT / "data"
    backup_dir = base / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _resolve_db_paths() -> list[tuple[str, Path]]:
    """Return ``(name, path)`` pairs for every database that should be backed up.

    Each name is the stem used in the backup filename (e.g.
    ``paper_tracker``).
    """
    from ..control_plane.database import CONTROL_DB_PATH
    from ..database import DATABASE_URL

    pairs: list[tuple[str, Path]] = []

    # 1. Main business database
    if DATABASE_URL.startswith("sqlite:///"):
        db_path = Path(DATABASE_URL[len("sqlite:///"):])
        pairs.append(("paper_tracker", db_path))

    # 2. LangGraph checkpoint database – resolves same way as checkpointer.py
    checkpoint_rel = os.getenv("CHECKPOINT_DB_PATH", "graph_checkpoints.db")
    checkpoint_path = Path(checkpoint_rel)
    if not checkpoint_path.is_absolute():
        # When running via ``python main.py`` the cwd is backend/, so a
        # relative path resolves relative to BACKEND_ROOT.
        checkpoint_path = BACKEND_ROOT / checkpoint_rel
    pairs.append(("graph_checkpoints", checkpoint_path))

    # 3. Control-plane (auth) database
    pairs.append(("control_plane", CONTROL_DB_PATH))

    return pairs


# ---------------------------------------------------------------------------
# Core backup logic
# ---------------------------------------------------------------------------


def _checkpoint_wal(db_path: Path) -> None:
    """Flush the WAL file into the main database file.

    This ensures the copy is fully consistent even when SQLite is in WAL
    mode.  Errors are logged but **not** raised so that the backup can still
    proceed (the copy may be slightly stale but is better than nothing).
    """
    if not db_path.exists():
        return
    try:
        conn = sqlite3.connect(f"file:{db_path}", uri=True)
        try:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("WAL checkpoint failed for %s: %s", db_path, exc)


def _cleanup_old_backups(backup_dir: Path, retention_days: int) -> int:
    """Remove backup files older than *retention_days*.  Returns count deleted."""
    if retention_days <= 0:
        return 0

    now = datetime.now(tz=UTC).timestamp()
    cutoff = now - retention_days * 86400
    deleted = 0

    for f in backup_dir.iterdir():
        if not f.is_file() or not f.name.endswith(".db"):
            continue
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
                deleted += 1
                logger.debug("Deleted old backup: %s", f.name)
        except OSError as exc:
            logger.warning("Failed to delete old backup %s: %s", f, exc)

    return deleted


def perform_backup() -> dict:
    """Run a single backup cycle for all configured databases.

    Returns a dict with summary information useful for logging/testing.
    """
    backup_dir = _backup_dir()
    retention_days = int(os.getenv("BACKUP_RETENTION_DAYS", "7"))
    timestamp = datetime.now(tz=UTC).strftime("%Y%m%d_%H%M%S")

    results: dict = {
        "timestamp": timestamp,
        "backups": [],
        "errors": [],
    }

    for name, db_path in _resolve_db_paths():
        if not db_path.exists():
            logger.warning("Database not found, skipping: %s", db_path)
            results["errors"].append({"db": name, "error": "file not found"})
            continue

        backup_name = f"{name}_{timestamp}.db"
        backup_path = backup_dir / backup_name

        # Flush WAL so the file copy is consistent
        _checkpoint_wal(db_path)

        try:
            shutil.copy2(db_path, backup_path)
            # Overwrite mtime/atime with current time so the retention cleanup
            # judges age by when the backup was *created*, not the source file's
            # original modification time (which can be days/weeks in the past).
            os.utime(backup_path, (time.time(), time.time()))
            size_mb = backup_path.stat().st_size / (1024 * 1024)
            logger.info(
                "Backed up %s -> %s (%.2f MB)", db_path.name, backup_name, size_mb
            )
            results["backups"].append(
                {"db": name, "file": backup_name, "size_mb": round(size_mb, 2)}
            )
        except Exception as exc:
            logger.error("Failed to back up %s: %s", name, exc)
            results["errors"].append({"db": name, "error": str(exc)})

    # Clean up old backups
    deleted = _cleanup_old_backups(backup_dir, retention_days)
    if deleted:
        logger.info("Cleaned up %d old backup(s) (retention: %d days)", deleted, retention_days)
    results["cleaned"] = deleted

    return results


# ---------------------------------------------------------------------------
# Scheduler integration
# ---------------------------------------------------------------------------


def schedule_backups(scheduler) -> None:
    """Register the periodic backup job with the given APScheduler instance."""
    interval_hours = int(os.getenv("BACKUP_INTERVAL_HOURS", "1"))
    interval_hours = max(interval_hours, 1)  # floor at 1 hour

    scheduler.add_job(
        perform_backup,
        trigger="interval",
        hours=interval_hours,
        id="db_backup",
        replace_existing=True,
    )
    logger.info(
        "Database backup scheduled every %d hour(s) (retention: %s days).",
        interval_hours,
        os.getenv("BACKUP_RETENTION_DAYS", "7"),
    )

"""
D1 Sync Service
================
Pushes local SQLite database changes to the CF Worker D1 database via HTTP.
Performs incremental sync by tracking last sync timestamps per table in a
local JSON state file.
"""

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Feed, LLMConfig, Paper, PaperTag, PromptTemplate, Tag

logger = logging.getLogger(__name__)

# Sync state file lives next to the backend package
_STATE_FILE = Path(__file__).resolve().parent.parent.parent / "sync_state.json"

# Tables to sync, mapped to their SQLAlchemy model classes
_BASE_SYNC_TABLES: dict[str, type] = {
    "papers": Paper,
    "feeds": Feed,
    "tags": Tag,
    "paper_tags": PaperTag,
    "prompt_templates": PromptTemplate,
}

# Columns to strip from llm_configs before sending (sensitive data)
_STRIP_COLUMNS = {
    "llm_configs": {"api_key_encrypted", "extra_headers", "extra_body", "last_error", "base_url"},
}


def _get_sync_tables() -> dict[str, type]:
    tables = dict(_BASE_SYNC_TABLES)
    if os.getenv("SYNC_LLM_CONFIGS", "").strip().lower() in {"1", "true", "yes", "on"}:
        tables["llm_configs"] = LLMConfig
    return tables


def _get_sync_config() -> tuple[str, str] | None:
    """Return (api_url, secret) or None if sync is not configured."""
    secret = os.getenv("SYNC_SECRET")
    if not secret:
        return None
    api_url = os.getenv("SYNC_API_URL", "https://api.sheldon123z.win")
    return api_url.rstrip("/"), secret


def _load_sync_state() -> dict[str, str]:
    """Load per-table last sync timestamps from the state file."""
    if _STATE_FILE.exists():
        try:
            return json.loads(_STATE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to read sync state file, starting fresh: %s", exc)
    return {}


def _save_sync_state(state: dict[str, str]) -> None:
    """Persist per-table last sync timestamps to the state file."""
    try:
        _STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.error("Failed to write sync state file: %s", exc)


def _model_to_dict(instance: Any, strip_columns: set[str] | None = None) -> dict[str, Any]:
    """Convert a SQLAlchemy model instance to a plain dict, handling datetime serialization."""
    mapper = inspect(type(instance))
    result = {}
    for col in mapper.columns:
        key = col.key
        if strip_columns and key in strip_columns:
            continue
        value = getattr(instance, key)
        if isinstance(value, datetime):
            value = value.isoformat()
        result[key] = value
    return result


async def sync_table(
    table_name: str,
    db: Session,
    last_sync_at: datetime | None,
) -> int:
    """
    Query records changed since last_sync_at and push them to the sync endpoint.
    Returns the number of records synced.
    """
    config = _get_sync_config()
    if config is None:
        return 0

    api_url, secret = config
    model_cls = _get_sync_tables().get(table_name)
    if model_cls is None:
        logger.warning("Unknown sync table: %s", table_name)
        return 0

    # Build query for changed records
    query = db.query(model_cls)
    if last_sync_at and hasattr(model_cls, "updated_at"):
        query = query.filter(model_cls.updated_at > last_sync_at)

    records = query.all()
    if not records:
        return 0

    strip_cols = _STRIP_COLUMNS.get(table_name)
    rows = [_model_to_dict(r, strip_columns=strip_cols) for r in records]

    # Push to CF Worker sync endpoint
    payload = {
        "table": table_name,
        "rows": rows,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{api_url}/api/sync/push",
            json=payload,
            headers={
                "Authorization": f"Bearer {secret}",
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()

    logger.info("Synced %d rows for table '%s'.", len(rows), table_name)
    return len(rows)


async def run_full_sync(db: Session) -> dict[str, int]:
    """Sync all tables from the beginning (ignoring last sync timestamps)."""
    results: dict[str, int] = {}
    for table_name in _get_sync_tables():
        try:
            count = await sync_table(table_name, db, last_sync_at=None)
            results[table_name] = count
        except Exception as exc:
            logger.error("Full sync failed for table '%s': %s", table_name, exc)
            results[table_name] = -1
    return results


async def run_incremental_sync(db: Session) -> dict[str, int]:
    """Sync only changes since the last successful sync for each table."""
    state = _load_sync_state()
    results: dict[str, int] = {}
    new_state = dict(state)

    sync_started_at = datetime.now(UTC).isoformat()

    for table_name in _get_sync_tables():
        last_sync_str = state.get(table_name)
        last_sync_at = datetime.fromisoformat(last_sync_str) if last_sync_str else None
        try:
            count = await sync_table(table_name, db, last_sync_at=last_sync_at)
            results[table_name] = count
            # Only update timestamp if sync succeeded
            new_state[table_name] = sync_started_at
        except Exception as exc:
            logger.error("Incremental sync failed for table '%s': %s", table_name, exc)
            results[table_name] = -1

    _save_sync_state(new_state)
    return results


def _run_sync_job() -> None:
    """
    Synchronous wrapper for the incremental sync, intended as an APScheduler job target.
    Creates its own DB session and runs the async sync in a new event loop.
    """
    import asyncio

    config = _get_sync_config()
    if config is None:
        return

    db = SessionLocal()
    try:
        loop = asyncio.new_event_loop()
        try:
            results = loop.run_until_complete(run_incremental_sync(db))
        finally:
            loop.close()
        total = sum(v for v in results.values() if v > 0)
        if total > 0:
            logger.info("D1 sync completed: %s (total %d rows)", results, total)
        else:
            logger.debug("D1 sync completed: no changes to push.")
    except Exception as exc:
        logger.error("D1 sync job failed: %s", exc)
    finally:
        db.close()


def register_sync_job(scheduler: Any) -> None:
    """Register the D1 incremental sync as a 60-second interval job with APScheduler."""
    config = _get_sync_config()
    if config is None:
        logger.info("SYNC_SECRET not configured — D1 sync disabled.")
        return

    job_id = "d1_sync"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    scheduler.add_job(
        _run_sync_job,
        trigger="interval",
        seconds=60,
        id=job_id,
        replace_existing=True,
    )
    logger.info("D1 sync job registered (every 60 seconds).")

"""LangGraph checkpoint persistence via SQLite.

The AsyncSqliteSaver requires an open aiosqlite.Connection for its lifetime.
We manage one long-lived connection opened at application startup and closed
at shutdown, exposing it as a module-level singleton.

Usage:
    # In app startup (lifespan):
    await open_checkpointer()

    # In app shutdown (lifespan):
    await close_checkpointer()

    # In route handlers:
    checkpointer = get_checkpointer()
"""
import logging

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from ..settings import get_checkpoint_db_path

logger = logging.getLogger("paper-tracker.checkpointer")

_conn: aiosqlite.Connection | None = None
_checkpointer: AsyncSqliteSaver | None = None


async def open_checkpointer() -> None:
    """Open the SQLite connection and initialise the checkpointer tables.

    Call once during application startup (FastAPI lifespan context).
    """
    global _conn, _checkpointer
    if _checkpointer is not None:
        return
    db_path = get_checkpoint_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _conn = await aiosqlite.connect(str(db_path))
    _checkpointer = AsyncSqliteSaver(_conn)
    await _checkpointer.setup()
    logger.info("LangGraph checkpointer ready at %s", db_path)


async def close_checkpointer() -> None:
    """Close the SQLite connection.

    Call once during application shutdown (FastAPI lifespan context).
    """
    global _conn, _checkpointer
    if _conn is not None:
        await _conn.close()
        _conn = None
        _checkpointer = None
        logger.info("LangGraph checkpointer connection closed")


def get_checkpointer() -> AsyncSqliteSaver:
    """Return the shared checkpointer instance.

    Raises RuntimeError if open_checkpointer() has not been called yet.
    """
    if _checkpointer is None:
        raise RuntimeError(
            "Checkpointer not initialised. "
            "Call open_checkpointer() during application startup."
        )
    return _checkpointer

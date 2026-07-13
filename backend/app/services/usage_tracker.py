"""LLM usage tracking: collection, persistence, and aggregation."""

from __future__ import annotations

import contextlib
import logging
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import LLMUsageLog

logger = logging.getLogger("paper-tracker.usage")


def create_usage_collector(
    *,
    config_id: int | None = None,
    provider: str = "",
    model_name: str = "",
    agent_type: str | None = None,
    session_id: str | None = None,
) -> dict:
    """Create a mutable dict that accumulates usage data during streaming."""
    return {
        "config_id": config_id,
        "provider": provider,
        "model_name": model_name,
        "agent_type": agent_type,
        "session_id": session_id,
        "start_time": time.time(),
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "ttft_ms": None,
        "tool_calls_count": 0,
        "status": "success",
        "error_code": None,
        "_first_token_received": False,
    }


def save_usage_log(db: Session, collector: dict) -> None:
    """Persist the collected usage data. Silently ignores errors."""
    try:
        elapsed = time.time() - collector["start_time"]
        duration_ms = int(elapsed * 1000)
        completion_tokens = collector["completion_tokens"]
        tps = round(completion_tokens / elapsed, 2) if elapsed > 0 and completion_tokens > 0 else None

        log = LLMUsageLog(
            config_id=collector.get("config_id"),
            provider=collector.get("provider", "unknown"),
            model_name=collector.get("model_name", "unknown"),
            agent_type=collector.get("agent_type"),
            session_id=collector.get("session_id"),
            prompt_tokens=collector["prompt_tokens"],
            completion_tokens=completion_tokens,
            total_tokens=collector["total_tokens"],
            duration_ms=duration_ms,
            ttft_ms=collector.get("ttft_ms"),
            tokens_per_second=tps,
            tool_calls_count=collector.get("tool_calls_count", 0),
            status=collector.get("status", "success"),
            error_code=collector.get("error_code"),
        )
        db.add(log)
        db.commit()
    except Exception:
        logger.debug("Failed to save usage log", exc_info=True)
        with contextlib.suppress(Exception):
            db.rollback()


# ---------------------------------------------------------------------------
# Aggregation helpers
# ---------------------------------------------------------------------------

def get_usage_summary(db: Session, *, days: int = 30, config_id: int | None = None) -> dict:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    q = db.query(
        func.count(LLMUsageLog.id),
        func.coalesce(func.sum(LLMUsageLog.prompt_tokens), 0),
        func.coalesce(func.sum(LLMUsageLog.completion_tokens), 0),
        func.coalesce(func.sum(LLMUsageLog.total_tokens), 0),
        func.coalesce(func.avg(LLMUsageLog.duration_ms), 0),
        func.avg(LLMUsageLog.ttft_ms),
        func.avg(LLMUsageLog.tokens_per_second),
        func.sum(func.IIF(LLMUsageLog.status != "success", 1, 0)),
    ).filter(LLMUsageLog.created_at >= cutoff)
    if config_id is not None:
        q = q.filter(LLMUsageLog.config_id == config_id)
    row = q.one()
    return {
        "total_calls": row[0],
        "total_prompt_tokens": row[1],
        "total_completion_tokens": row[2],
        "total_tokens": row[3],
        "avg_duration_ms": round(float(row[4]), 1),
        "avg_ttft_ms": round(float(row[5]), 1) if row[5] is not None else None,
        "avg_tokens_per_second": round(float(row[6]), 2) if row[6] is not None else None,
        "error_count": row[7] or 0,
        "period_days": days,
    }


def get_usage_by_model(db: Session, *, days: int = 30) -> list[dict]:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    rows = (
        db.query(
            LLMUsageLog.config_id,
            LLMUsageLog.provider,
            LLMUsageLog.model_name,
            func.count(LLMUsageLog.id),
            func.coalesce(func.sum(LLMUsageLog.total_tokens), 0),
            func.coalesce(func.avg(LLMUsageLog.duration_ms), 0),
        )
        .filter(LLMUsageLog.created_at >= cutoff)
        .group_by(LLMUsageLog.config_id, LLMUsageLog.provider, LLMUsageLog.model_name)
        .all()
    )
    return [
        {
            "config_id": r[0],
            "provider": r[1],
            "model_name": r[2],
            "call_count": r[3],
            "total_tokens": r[4],
            "avg_duration_ms": round(float(r[5]), 1),
        }
        for r in rows
    ]


def get_usage_by_agent(db: Session, *, days: int = 30) -> list[dict]:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    rows = (
        db.query(
            LLMUsageLog.agent_type,
            func.count(LLMUsageLog.id),
            func.coalesce(func.sum(LLMUsageLog.total_tokens), 0),
            func.coalesce(func.avg(LLMUsageLog.duration_ms), 0),
        )
        .filter(LLMUsageLog.created_at >= cutoff)
        .group_by(LLMUsageLog.agent_type)
        .all()
    )
    return [
        {
            "agent_type": r[0] or "unknown",
            "call_count": r[1],
            "total_tokens": r[2],
            "avg_duration_ms": round(float(r[3]), 1),
        }
        for r in rows
    ]


def get_usage_timeline(db: Session, *, days: int = 30, interval: str = "day") -> list[dict]:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    fmt = "%Y-%m-%d" if interval == "day" else "%Y-%m-%d %H:00"
    rows = (
        db.query(
            func.strftime(fmt, LLMUsageLog.created_at),
            func.count(LLMUsageLog.id),
            func.coalesce(func.sum(LLMUsageLog.total_tokens), 0),
        )
        .filter(LLMUsageLog.created_at >= cutoff)
        .group_by(func.strftime(fmt, LLMUsageLog.created_at))
        .order_by(func.strftime(fmt, LLMUsageLog.created_at))
        .all()
    )
    return [{"date": r[0], "calls": r[1], "tokens": r[2]} for r in rows]


def get_recent_usage(db: Session, *, limit: int = 50) -> list[LLMUsageLog]:
    return (
        db.query(LLMUsageLog)
        .order_by(LLMUsageLog.created_at.desc())
        .limit(limit)
        .all()
    )

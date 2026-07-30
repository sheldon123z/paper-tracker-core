"""LLM usage tracking: collection, persistence, and aggregation."""

from __future__ import annotations

import contextlib
import json
import logging
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from ..models import LLMConfig, LLMUsageLog
from ..offline import is_offline_mode

logger = logging.getLogger("paper-tracker.usage")
_LOCAL_LLM_PROVIDERS = ("ollama", "vllm", "lmstudio", "llamacpp")


def create_usage_collector(
    *,
    config_id: int | None = None,
    provider: str = "",
    model_name: str = "",
    agent_type: str | None = None,
    session_id: str | None = None,
    user_id: int | None = None,
    department_id: int | None = None,
    request_type: str | None = None,
) -> dict:
    """Create a mutable dict that accumulates usage data during streaming."""
    return {
        "config_id": config_id,
        "provider": provider,
        "model_name": model_name,
        "agent_type": agent_type,
        "session_id": session_id,
        "user_id": user_id,
        "department_id": department_id,
        "request_type": request_type,
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
            user_id=collector.get("user_id"),
            department_id=collector.get("department_id"),
            request_type=collector.get("request_type"),
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
        try:
            from ..control_plane.database import ControlSessionLocal
            from ..control_plane.models import AuditEvent

            audit_db = ControlSessionLocal()
            try:
                request_type = collector.get("request_type") or collector.get("agent_type")
                audit_db.add(AuditEvent(
                    actor_user_id=collector.get("user_id"),
                    department_id=collector.get("department_id"),
                    event_type="ai.call",
                    outcome="success" if collector.get("status", "success") == "success" else "failure",
                    method="POST",
                    path=f"/api/agui/{request_type}" if request_type else "/api/agui",
                    resource_type="llm",
                    resource_id=str(collector.get("config_id")) if collector.get("config_id") else None,
                    metadata_json=json.dumps({
                        "request_type": request_type,
                        "provider": collector.get("provider"),
                        "model_name": collector.get("model_name"),
                        "total_tokens": collector.get("total_tokens", 0),
                        "duration_ms": duration_ms,
                        "error_code": collector.get("error_code"),
                    }, ensure_ascii=False),
                ))
                audit_db.commit()
            finally:
                audit_db.close()
        except Exception:
            logger.debug("Failed to save AI audit event", exc_info=True)
    except Exception:
        logger.debug("Failed to save usage log", exc_info=True)
        with contextlib.suppress(Exception):
            db.rollback()


# ---------------------------------------------------------------------------
# Aggregation helpers
# ---------------------------------------------------------------------------

def filter_local_usage(query, *, local_only: bool = False):
    if not local_only and not is_offline_mode():
        return query
    matching_config_exists = (
        select(LLMConfig.id)
        .where(LLMConfig.id == LLMUsageLog.config_id)
        .exists()
    )
    local_config_exists = (
        select(LLMConfig.id)
        .where(
            LLMConfig.id == LLMUsageLog.config_id,
            LLMConfig.is_local.is_(True),
        )
        .exists()
    )
    return query.filter(
        or_(
            local_config_exists,
            and_(
                ~matching_config_exists,
                LLMUsageLog.provider.in_(_LOCAL_LLM_PROVIDERS),
            ),
        )
    )


def get_usage_summary(
    db: Session,
    *,
    days: int = 30,
    config_id: int | None = None,
    local_only: bool = False,
    user_id: int | None = None,
) -> dict:
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
    q = filter_local_usage(q, local_only=local_only)
    if user_id is not None:
        q = q.filter(LLMUsageLog.user_id == user_id)
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


def get_usage_by_model(
    db: Session,
    *,
    days: int = 30,
    local_only: bool = False,
    user_id: int | None = None,
) -> list[dict]:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    query = (
        db.query(
            LLMUsageLog.config_id,
            LLMUsageLog.provider,
            LLMUsageLog.model_name,
            func.count(LLMUsageLog.id),
            func.coalesce(func.sum(LLMUsageLog.total_tokens), 0),
            func.coalesce(func.avg(LLMUsageLog.duration_ms), 0),
        )
        .filter(LLMUsageLog.created_at >= cutoff)
    )
    query = filter_local_usage(query, local_only=local_only)
    if user_id is not None:
        query = query.filter(LLMUsageLog.user_id == user_id)
    rows = (
        query
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


def get_usage_by_agent(
    db: Session,
    *,
    days: int = 30,
    local_only: bool = False,
    user_id: int | None = None,
) -> list[dict]:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    query = (
        db.query(
            LLMUsageLog.agent_type,
            func.count(LLMUsageLog.id),
            func.coalesce(func.sum(LLMUsageLog.total_tokens), 0),
            func.coalesce(func.avg(LLMUsageLog.duration_ms), 0),
        )
        .filter(LLMUsageLog.created_at >= cutoff)
    )
    query = filter_local_usage(query, local_only=local_only)
    if user_id is not None:
        query = query.filter(LLMUsageLog.user_id == user_id)
    rows = (
        query
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


def get_usage_timeline(
    db: Session,
    *,
    days: int = 30,
    interval: str = "day",
    local_only: bool = False,
    user_id: int | None = None,
) -> list[dict]:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    fmt = "%Y-%m-%d" if interval == "day" else "%Y-%m-%d %H:00"
    query = (
        db.query(
            func.strftime(fmt, LLMUsageLog.created_at),
            func.count(LLMUsageLog.id),
            func.coalesce(func.sum(LLMUsageLog.total_tokens), 0),
        )
        .filter(LLMUsageLog.created_at >= cutoff)
    )
    query = filter_local_usage(query, local_only=local_only)
    if user_id is not None:
        query = query.filter(LLMUsageLog.user_id == user_id)
    rows = (
        query
        .group_by(func.strftime(fmt, LLMUsageLog.created_at))
        .order_by(func.strftime(fmt, LLMUsageLog.created_at))
        .all()
    )
    return [{"date": r[0], "calls": r[1], "tokens": r[2]} for r in rows]


def get_recent_usage(
    db: Session,
    *,
    limit: int = 50,
    local_only: bool = False,
    user_id: int | None = None,
) -> list[LLMUsageLog]:
    query = db.query(LLMUsageLog)
    query = filter_local_usage(query, local_only=local_only)
    if user_id is not None:
        query = query.filter(LLMUsageLog.user_id == user_id)
    return (
        query
        .order_by(LLMUsageLog.created_at.desc())
        .limit(limit)
        .all()
    )

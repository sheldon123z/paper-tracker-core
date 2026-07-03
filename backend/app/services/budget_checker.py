"""LLM budget checking service."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import LLMBudgetConfig, LLMUsageLog
from .pricing import estimate_cost

logger = logging.getLogger("paper-tracker.budget")


def check_budget(db: Session, config_id: int | None = None) -> dict | None:
    """Check current month usage against budget limits.

    Returns dict with budget status or None if no budget is configured.
    """
    q = db.query(LLMBudgetConfig).filter(LLMBudgetConfig.is_enabled.is_(True))
    if config_id is not None:
        q = q.filter(
            (LLMBudgetConfig.config_id == config_id) | (LLMBudgetConfig.config_id.is_(None))
        )
    else:
        q = q.filter(LLMBudgetConfig.config_id.is_(None))

    budgets = q.all()
    if not budgets:
        return None

    # Get current month usage
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    usage_q = db.query(
        func.coalesce(func.sum(LLMUsageLog.total_tokens), 0),
        func.coalesce(func.sum(LLMUsageLog.prompt_tokens), 0),
        func.coalesce(func.sum(LLMUsageLog.completion_tokens), 0),
    ).filter(LLMUsageLog.created_at >= month_start)
    if config_id is not None:
        usage_q = usage_q.filter(LLMUsageLog.config_id == config_id)
    total_tokens, prompt_tokens, completion_tokens = usage_q.one()

    results = []
    for budget in budgets:
        if budget.budget_type == "tokens":
            current = total_tokens
            limit_val = budget.monthly_limit
        else:
            # Cost estimation — aggregate by model
            rows = (
                db.query(
                    LLMUsageLog.provider,
                    LLMUsageLog.model_name,
                    func.sum(LLMUsageLog.prompt_tokens),
                    func.sum(LLMUsageLog.completion_tokens),
                )
                .filter(LLMUsageLog.created_at >= month_start)
                .group_by(LLMUsageLog.provider, LLMUsageLog.model_name)
                .all()
            )
            current = sum(
                estimate_cost(p, m, pt or 0, ct or 0) or 0
                for p, m, pt, ct in rows
            )
            limit_val = budget.monthly_limit

        usage_pct = (current / limit_val) if limit_val > 0 else 0
        results.append({
            "budget_id": budget.id,
            "budget_type": budget.budget_type,
            "config_id": budget.config_id,
            "monthly_limit": limit_val,
            "current_usage": round(current, 4) if budget.budget_type == "cost" else current,
            "usage_percent": round(usage_pct, 4),
            "alert_threshold": budget.alert_threshold,
            "alert": usage_pct >= budget.alert_threshold,
            "exceeded": usage_pct >= 1.0,
        })

    return results

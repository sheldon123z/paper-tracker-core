"""LLM pricing table and cost estimation.

Prices are per 1M tokens in USD. Override via LLM_PRICING_OVERRIDES env var
as JSON: {"openai/gpt-4o": {"input": 2.5, "output": 10.0}}
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import LLMUsageLog

logger = logging.getLogger("paper-tracker.pricing")

# Default pricing per 1M tokens (USD)
PRICING_TABLE: dict[str, dict[str, float]] = {
    # OpenAI
    "openai/gpt-4o": {"input": 2.50, "output": 10.00},
    "openai/gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "openai/gpt-4.1": {"input": 2.00, "output": 8.00},
    "openai/gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "openai/gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    "openai/o3-mini": {"input": 1.10, "output": 4.40},
    # Anthropic
    "claude/claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude/claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
    "claude/claude-haiku-4-20250514": {"input": 0.80, "output": 4.00},
    # DeepSeek
    "deepseek/deepseek-chat": {"input": 0.14, "output": 0.28},
    "deepseek/deepseek-reasoner": {"input": 0.55, "output": 2.19},
    # xAI
    "xai/grok-3-mini-fast": {"input": 0.30, "output": 0.50},
    # Local
    "ollama/*": {"input": 0.0, "output": 0.0},
    "vllm/*": {"input": 0.0, "output": 0.0},
    "llamacpp/*": {"input": 0.0, "output": 0.0},
}

# Load overrides
_overrides_raw = os.getenv("LLM_PRICING_OVERRIDES", "")
if _overrides_raw:
    try:
        _overrides = json.loads(_overrides_raw)
        PRICING_TABLE.update(_overrides)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Invalid LLM_PRICING_OVERRIDES env var, ignoring.")


def _lookup_price(provider: str, model: str) -> dict[str, float] | None:
    key = f"{provider}/{model}"
    if key in PRICING_TABLE:
        return PRICING_TABLE[key]
    wildcard = f"{provider}/*"
    if wildcard in PRICING_TABLE:
        return PRICING_TABLE[wildcard]
    return None


def estimate_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> float | None:
    price = _lookup_price(provider, model)
    if price is None:
        return None
    return round(
        (prompt_tokens * price["input"] + completion_tokens * price["output"]) / 1_000_000,
        6,
    )


def get_cost_summary(db: Session, *, days: int = 30, config_id: int | None = None) -> dict:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    q = db.query(
        LLMUsageLog.provider,
        LLMUsageLog.model_name,
        func.sum(LLMUsageLog.prompt_tokens),
        func.sum(LLMUsageLog.completion_tokens),
        func.sum(LLMUsageLog.total_tokens),
        func.count(LLMUsageLog.id),
    ).filter(LLMUsageLog.created_at >= cutoff)
    if config_id is not None:
        q = q.filter(LLMUsageLog.config_id == config_id)
    rows = q.group_by(LLMUsageLog.provider, LLMUsageLog.model_name).all()

    total_cost = 0.0
    breakdown = []
    for provider, model, pt, ct, tt, calls in rows:
        cost = estimate_cost(provider, model, pt or 0, ct or 0)
        entry = {
            "provider": provider,
            "model_name": model,
            "prompt_tokens": pt or 0,
            "completion_tokens": ct or 0,
            "total_tokens": tt or 0,
            "call_count": calls,
            "estimated_cost_usd": cost,
        }
        breakdown.append(entry)
        if cost is not None:
            total_cost += cost

    return {
        "period_days": days,
        "total_estimated_cost_usd": round(total_cost, 6),
        "breakdown": breakdown,
    }

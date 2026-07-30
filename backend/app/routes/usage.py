"""LLM usage statistics API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..control_plane.models import User
from ..database import get_db
from ..models import LLMUsageLog
from ..schemas import LLMUsageLogOut, PaginationMeta, UsageByModelItem, UsageSummaryOut, UsageTimelinePoint
from ..services.access_control import is_manager
from ..services.pricing import get_cost_summary
from ..services.usage_tracker import (
    get_recent_usage,
    get_usage_by_agent,
    get_usage_by_model,
    get_usage_summary,
    get_usage_timeline,
)

router = APIRouter(prefix="/api/usage", tags=["usage"], dependencies=[Depends(get_current_user)])


@router.get("/summary", response_model=UsageSummaryOut)
def usage_summary(
    days: int = Query(default=30, ge=1, le=365),
    config_id: int | None = Query(default=None),
    local_only: bool = Query(default=False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_usage_summary(
        db,
        days=days,
        config_id=config_id,
        local_only=local_only,
        user_id=None if is_manager(user) else user.id,
    )


@router.get("/by-model", response_model=list[UsageByModelItem])
def usage_by_model(
    days: int = Query(default=30, ge=1, le=365),
    local_only: bool = Query(default=False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_usage_by_model(
        db,
        days=days,
        local_only=local_only,
        user_id=None if is_manager(user) else user.id,
    )


@router.get("/by-agent")
def usage_by_agent(
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_usage_by_agent(db, days=days, user_id=None if is_manager(user) else user.id)


@router.get("/timeline", response_model=list[UsageTimelinePoint])
def usage_timeline(
    days: int = Query(default=30, ge=1, le=365),
    interval: str = Query(default="day", pattern="^(day|hour)$"),
    local_only: bool = Query(default=False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_usage_timeline(
        db,
        days=days,
        interval=interval,
        local_only=local_only,
        user_id=None if is_manager(user) else user.id,
    )


@router.get("/recent", response_model=list[LLMUsageLogOut])
def recent_usage(
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_recent_usage(db, limit=limit, user_id=None if is_manager(user) else user.id)


@router.get("/audit")
def usage_audit(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    config_id: int | None = Query(default=None),
    agent_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(LLMUsageLog)
    if not is_manager(user):
        q = q.filter(LLMUsageLog.user_id == user.id)
    if config_id is not None:
        q = q.filter(LLMUsageLog.config_id == config_id)
    if agent_type:
        q = q.filter(LLMUsageLog.agent_type == agent_type)
    if status:
        q = q.filter(LLMUsageLog.status == status)
    total = q.count()
    items = q.order_by(LLMUsageLog.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return {
        "items": [LLMUsageLogOut.model_validate(i) for i in items],
        "meta": PaginationMeta(total=total, page=page, size=size),
    }


@router.get("/cost")
def usage_cost(
    days: int = Query(default=30, ge=1, le=365),
    config_id: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not is_manager(user):
        raise HTTPException(status_code=403, detail="Manager access required")
    return get_cost_summary(db, days=days, config_id=config_id)

"""LLM budget management API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..database import get_db
from ..models import LLMBudgetConfig
from ..services.budget_checker import check_budget

router = APIRouter(prefix="/api/budget", tags=["budget"], dependencies=[Depends(get_current_user)])


class BudgetCreate(BaseModel):
    config_id: int | None = None
    budget_type: str = "tokens"  # "tokens" | "cost"
    monthly_limit: float
    alert_threshold: float = Field(default=0.8, ge=0, le=1)
    is_enabled: bool = True


class BudgetUpdate(BaseModel):
    monthly_limit: float | None = None
    alert_threshold: float | None = None
    is_enabled: bool | None = None


class BudgetOut(BaseModel):
    id: int
    config_id: int | None
    budget_type: str
    monthly_limit: float
    alert_threshold: float
    is_enabled: bool

    class Config:
        from_attributes = True


@router.get("", response_model=list[BudgetOut])
def list_budgets(db: Session = Depends(get_db)):
    return db.query(LLMBudgetConfig).all()


@router.post("", response_model=BudgetOut)
def create_budget(payload: BudgetCreate, db: Session = Depends(get_db)):
    budget = LLMBudgetConfig(
        config_id=payload.config_id,
        budget_type=payload.budget_type,
        monthly_limit=payload.monthly_limit,
        alert_threshold=payload.alert_threshold,
        is_enabled=payload.is_enabled,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.patch("/{budget_id}", response_model=BudgetOut)
def update_budget(budget_id: int, payload: BudgetUpdate, db: Session = Depends(get_db)):
    budget = db.query(LLMBudgetConfig).filter(LLMBudgetConfig.id == budget_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(budget, field, value)
    db.commit()
    db.refresh(budget)
    return budget


@router.delete("/{budget_id}")
def delete_budget(budget_id: int, db: Session = Depends(get_db)):
    budget = db.query(LLMBudgetConfig).filter(LLMBudgetConfig.id == budget_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(budget)
    db.commit()
    return {"message": "Budget deleted"}


@router.get("/status")
def budget_status(db: Session = Depends(get_db)):
    result = check_budget(db)
    return {"budgets": result or []}

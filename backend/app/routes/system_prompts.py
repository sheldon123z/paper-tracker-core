import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..database import get_db
from ..models import SystemPromptConfig
from ..schemas import SystemPromptConfigOut, SystemPromptConfigUpdate
from ..services.llm_service import clear_prompt_cache
from ..services.seed import seed_system_prompt_by_type

logger = logging.getLogger("paper-tracker.system-prompts")

router = APIRouter(prefix="/api/system-prompts", tags=["system-prompts"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[SystemPromptConfigOut])
def list_system_prompts(db: Session = Depends(get_db)):
    """List all system prompt configurations."""
    return db.query(SystemPromptConfig).order_by(SystemPromptConfig.prompt_type).all()


@router.patch("/{prompt_type}", response_model=SystemPromptConfigOut)
def update_system_prompt(prompt_type: str, payload: SystemPromptConfigUpdate, db: Session = Depends(get_db)):
    """Update a system prompt configuration by prompt_type."""
    config = db.query(SystemPromptConfig).filter(SystemPromptConfig.prompt_type == prompt_type).first()
    if not config:
        raise HTTPException(status_code=404, detail=f"System prompt config '{prompt_type}' not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(config, field, value)

    db.commit()
    db.refresh(config)
    clear_prompt_cache(prompt_type)
    return config


@router.post("/{prompt_type}/reset", response_model=SystemPromptConfigOut)
def reset_system_prompt(prompt_type: str, db: Session = Depends(get_db)):
    """Reset a system prompt to its default text."""
    config = seed_system_prompt_by_type(db, prompt_type)
    if not config:
        raise HTTPException(status_code=404, detail=f"Unknown prompt type '{prompt_type}'")
    clear_prompt_cache(prompt_type)
    return config

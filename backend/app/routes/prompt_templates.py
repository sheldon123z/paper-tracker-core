import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..database import get_db
from ..models import PromptTemplate
from ..schemas import PromptTemplateCreate, PromptTemplateOut, PromptTemplateUpdate

logger = logging.getLogger("paper-tracker.prompt_templates")

router = APIRouter(prefix="/api/prompt-templates", tags=["prompt-templates"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[PromptTemplateOut])
def list_prompt_templates(db: Session = Depends(get_db)):
    return db.query(PromptTemplate).order_by(PromptTemplate.sort_order.asc(), PromptTemplate.id.asc()).all()


@router.post("", response_model=PromptTemplateOut)
def create_prompt_template(payload: PromptTemplateCreate, db: Session = Depends(get_db)):
    template = PromptTemplate(**payload.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    logger.info("Prompt template created: %s", template.name)
    return template


@router.patch("/{template_id}", response_model=PromptTemplateOut)
def update_prompt_template(template_id: int, payload: PromptTemplateUpdate, db: Session = Depends(get_db)):
    template = db.query(PromptTemplate).filter(PromptTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Prompt template not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(template, field, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}")
def delete_prompt_template(template_id: int, db: Session = Depends(get_db)):
    template = db.query(PromptTemplate).filter(PromptTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Prompt template not found")

    if template.is_builtin:
        raise HTTPException(status_code=403, detail="Cannot delete builtin prompt templates")

    db.delete(template)
    db.commit()
    return {"message": "Prompt template deleted", "template_id": template_id}

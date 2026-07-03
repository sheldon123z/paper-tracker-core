import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..database import get_db
from ..models import Paper, PaperTag, Tag
from ..schemas import TagCreate, TagUpdate, TagWithCount

logger = logging.getLogger("paper-tracker.tags")

router = APIRouter(prefix="/api/tags", tags=["tags"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[TagWithCount])
def list_tags(db: Session = Depends(get_db)):
    tags = db.query(Tag).order_by(Tag.name.asc()).all()
    counts = {
        tag_id: count
        for tag_id, count in db.query(PaperTag.tag_id, func.count(PaperTag.id))
        .group_by(PaperTag.tag_id)
        .all()
    }
    return [
        TagWithCount(id=tag.id, name=tag.name, color=tag.color, paper_count=counts.get(tag.id, 0))
        for tag in tags
    ]


@router.post("", response_model=TagWithCount)
def create_tag(payload: TagCreate, db: Session = Depends(get_db)):
    existing = db.query(Tag).filter(Tag.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")

    tag = Tag(name=payload.name, color=payload.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return TagWithCount(id=tag.id, name=tag.name, color=tag.color, paper_count=0)


@router.patch("/{tag_id}", response_model=TagWithCount)
def update_tag(tag_id: int, payload: TagUpdate, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(tag, field, value)

    db.commit()
    db.refresh(tag)

    count = db.query(func.count(PaperTag.id)).filter(PaperTag.tag_id == tag_id).scalar() or 0
    return TagWithCount(id=tag.id, name=tag.name, color=tag.color, paper_count=count)


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    paper_tags = db.query(PaperTag).filter(PaperTag.tag_id == tag_id).all()
    affected_paper_ids = {pt.paper_id for pt in paper_tags}

    db.query(PaperTag).filter(PaperTag.tag_id == tag_id).delete()

    for paper_id in affected_paper_ids:
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if paper:
            remaining = (
                db.query(Tag)
                .join(PaperTag, Tag.id == PaperTag.tag_id)
                .filter(PaperTag.paper_id == paper_id)
                .all()
            )
            paper.tags = ", ".join(t.name for t in remaining)

    db.delete(tag)
    db.commit()
    return {"message": "Tag deleted", "tag_id": tag_id}

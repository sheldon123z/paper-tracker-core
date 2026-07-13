import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..control_plane.models import User
from ..database import get_db
from ..models import Paper, PaperTag, Tag
from ..schemas import TagCreate, TagUpdate, TagWithCount
from ..services.access_control import filter_visible, get_visible_or_404, normalize_new_scope, require_writable

logger = logging.getLogger("paper-tracker.tags")

router = APIRouter(prefix="/api/tags", tags=["tags"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[TagWithCount])
def list_tags(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tags = filter_visible(db.query(Tag), Tag, user).order_by(Tag.name.asc()).all()
    visible_paper_ids = filter_visible(db.query(Paper.id), Paper, user).subquery()
    counts = {
        tag_id: count
        for tag_id, count in db.query(PaperTag.tag_id, func.count(PaperTag.id))
        .filter(PaperTag.paper_id.in_(visible_paper_ids))
        .group_by(PaperTag.tag_id)
        .all()
    }
    return [
        TagWithCount(id=tag.id, name=tag.name, color=tag.color, paper_count=counts.get(tag.id, 0),
                     visibility=tag.visibility, department_id=tag.department_id)
        for tag in tags
    ]


@router.post("", response_model=TagWithCount)
def create_tag(payload: TagCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    visibility, department_id = normalize_new_scope(user, payload.visibility, payload.department_id)
    existing = db.query(Tag).filter(Tag.name == payload.name, Tag.visibility == visibility,
                                    Tag.department_id == department_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Tag already exists")

    tag = Tag(name=payload.name, color=payload.color, visibility=visibility,
              department_id=department_id, created_by_user_id=user.id)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return TagWithCount(id=tag.id, name=tag.name, color=tag.color, paper_count=0,
                        visibility=tag.visibility, department_id=tag.department_id)


@router.patch("/{tag_id}", response_model=TagWithCount)
def update_tag(tag_id: int, payload: TagUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tag = get_visible_or_404(db, Tag, tag_id, user)
    require_writable(tag, user)

    if payload.name and db.query(Tag).filter(
        Tag.id != tag.id,
        func.lower(Tag.name) == payload.name.lower(),
        Tag.visibility == tag.visibility,
        Tag.department_id == tag.department_id,
    ).first():
        raise HTTPException(status_code=409, detail="Tag already exists in this library")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(tag, field, value)

    db.commit()
    db.refresh(tag)

    count = db.query(func.count(PaperTag.id)).filter(PaperTag.tag_id == tag_id).scalar() or 0
    return TagWithCount(id=tag.id, name=tag.name, color=tag.color, paper_count=count,
                        visibility=tag.visibility, department_id=tag.department_id)


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tag = get_visible_or_404(db, Tag, tag_id, user)
    require_writable(tag, user)

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

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..database import get_db
from ..models import MessageFeedback

router = APIRouter(prefix="/api/feedback", tags=["feedback"], dependencies=[Depends(get_current_user)])


class FeedbackIn(BaseModel):
    message_id: str
    session_id: str
    session_type: str  # paper|global|assistant|workflow
    feedback_type: str  # thumbsUp|thumbsDown


@router.post("")
def upsert_feedback(body: FeedbackIn, db: Session = Depends(get_db)):
    existing = (
        db.query(MessageFeedback)
        .filter(
            MessageFeedback.message_id == body.message_id,
            MessageFeedback.session_id == body.session_id,
        )
        .first()
    )
    if existing:
        existing.feedback_type = body.feedback_type
        existing.session_type = body.session_type
    else:
        existing = MessageFeedback(
            message_id=body.message_id,
            session_id=body.session_id,
            session_type=body.session_type,
            feedback_type=body.feedback_type,
        )
        db.add(existing)
    db.commit()
    return {"ok": True}


@router.get("/{session_id}")
def get_session_feedback(session_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(MessageFeedback)
        .filter(MessageFeedback.session_id == session_id)
        .all()
    )
    return [
        {
            "message_id": r.message_id,
            "feedback_type": r.feedback_type,
        }
        for r in rows
    ]


@router.delete("/{message_id}")
def delete_feedback(message_id: str, db: Session = Depends(get_db)):
    db.query(MessageFeedback).filter(
        MessageFeedback.message_id == message_id
    ).delete()
    db.commit()
    return {"ok": True}

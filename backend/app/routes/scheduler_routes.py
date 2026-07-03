import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user_or_service
from ..database import get_db
from ..models import Feed, Paper
from ..schemas import PaperOut
from ..services.rss_parser import ingest_feeds
from ..services.scheduler import get_scheduler_status

logger = logging.getLogger("paper-tracker.scheduler")

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"], dependencies=[Depends(get_current_user_or_service)])


@router.get("/status")
def scheduler_status():
    jobs = get_scheduler_status()
    return {"jobs": jobs, "total_jobs": len(jobs)}


@router.post("/trigger/{feed_id}")
def trigger_feed(feed_id: int, db: Session = Depends(get_db)):
    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    if not feed.is_active:
        raise HTTPException(status_code=400, detail="Feed is not active")

    started_at = datetime.now(UTC)
    stats = ingest_feeds(db, [feed])
    logger.info("Manual trigger for feed %d: %s", feed_id, stats)

    new_papers = (
        db.query(Paper)
        .filter(Paper.source_feed_id == feed_id, Paper.created_at >= started_at)
        .order_by(Paper.created_at.desc())
        .all()
    )
    new_items = [PaperOut.model_validate(p).model_dump(mode="json") for p in new_papers]

    return {
        "message": "Feed triggered",
        "feed_id": feed_id,
        "stats": stats,
        "new_items": new_items,
    }

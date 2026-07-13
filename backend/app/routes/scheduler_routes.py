import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user, get_current_user_or_ingestion_service
from ..control_plane.models import User
from ..database import get_db
from ..models import Feed, Paper
from ..schemas import PaperOut
from ..services.rss_parser import ingest_feeds
from ..services.scheduler import get_scheduler_status
from ..services.access_control import get_visible_or_404, paper_response, require_writable
from ..services.access_control import filter_visible

logger = logging.getLogger("paper-tracker.scheduler")

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


@router.get("/status")
def scheduler_status(_user: User = Depends(get_current_user)):
    jobs = get_scheduler_status()
    return {"jobs": jobs, "total_jobs": len(jobs)}


@router.post("/trigger-all")
def trigger_all_feeds(
    principal: User | None = Depends(get_current_user_or_ingestion_service),
    db: Session = Depends(get_db),
):
    query = db.query(Feed).filter(Feed.is_active.is_(True))
    feeds = query.all() if principal is None else filter_visible(query, Feed, principal).all()
    if principal is not None:
        feeds = [feed for feed in feeds if feed.visibility == "department" and feed.department_id == principal.department_id
                 or principal.role in {"manager", "admin", "super_admin"}]
    stats = ingest_feeds(db, feeds) if feeds else {}
    return {"message": "RSS fetch completed", "feed_count": len(feeds), "stats": stats}


@router.post("/trigger/{feed_id}")
def trigger_feed(
    feed_id: int,
    principal: User | None = Depends(get_current_user_or_ingestion_service),
    db: Session = Depends(get_db),
):
    if principal is None:
        feed = db.query(Feed).filter(Feed.id == feed_id).first()
        if feed is None:
            raise HTTPException(status_code=404, detail="Feed not found")
    else:
        feed = get_visible_or_404(db, Feed, feed_id, principal)
        require_writable(feed, principal)

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
    new_items = (
        [PaperOut.model_validate(p).model_dump(mode="json") for p in new_papers]
        if principal is None else [paper_response(db, p, principal) for p in new_papers]
    )

    return {
        "message": "Feed triggered",
        "feed_id": feed_id,
        "stats": stats,
        "new_items": new_items,
    }

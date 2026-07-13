import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user_or_service
from ..database import get_db
from ..models import Feed, Paper
from ..schemas import FeedCreate, FeedOut, FeedUpdate, PaginationMeta, PaperListResponse
from ..services.scheduler import schedule_feed, unschedule_feed

logger = logging.getLogger("paper-tracker.feeds")

router = APIRouter(prefix="/api/feeds", tags=["feeds"], dependencies=[Depends(get_current_user_or_service)])


@router.get("", response_model=list[FeedOut])
def list_feeds(db: Session = Depends(get_db)):
    return db.query(Feed).order_by(Feed.id.desc()).all()


@router.post("", response_model=FeedOut)
def create_feed(payload: FeedCreate, db: Session = Depends(get_db)):
    existing = db.query(Feed).filter(Feed.url == payload.url).first()
    if existing:
        raise HTTPException(status_code=400, detail="Feed URL already exists")

    feed = Feed(**payload.model_dump())
    db.add(feed)
    db.commit()
    db.refresh(feed)

    if feed.is_active:
        schedule_feed(feed)

    logger.info("Feed created: %s", feed.url)
    return feed


@router.put("/{feed_id}", response_model=FeedOut)
def update_feed(feed_id: int, payload: FeedUpdate, db: Session = Depends(get_db)):
    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(feed, field, value)

    db.commit()
    db.refresh(feed)

    if feed.is_active:
        schedule_feed(feed)
    else:
        unschedule_feed(feed.id)

    logger.info("Feed updated: %d", feed_id)
    return feed


@router.delete("/{feed_id}")
def delete_feed(feed_id: int, db: Session = Depends(get_db)):
    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    unschedule_feed(feed_id)
    db.delete(feed)
    db.commit()
    return {"message": "Feed deleted", "feed_id": feed_id}


@router.post("/refresh-abstracts")
def refresh_all_abstracts(db: Session = Depends(get_db)):
    """Re-fetch all RSS feeds and update papers that have missing or stub abstracts."""
    from ..services.rss_parser import refresh_abstracts

    feeds = db.query(Feed).filter(Feed.is_active == True).all()  # noqa: E712
    stats = refresh_abstracts(db, feeds)
    logger.info("Refresh abstracts: %s", stats)
    return stats


@router.get("/{feed_id}/papers", response_model=PaperListResponse)
def list_feed_papers(
    feed_id: int,
    since_days: int | None = Query(default=7),
    limit: int = Query(default=50, ge=1, le=200),
    min_relevance: float | None = Query(default=None),
    include_read: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    """List papers ingested from a specific feed, newest first."""
    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    if not feed:
        raise HTTPException(status_code=404, detail=f"Feed {feed_id} not found")

    query = db.query(Paper).filter(Paper.source_feed_id == feed_id)
    if since_days is not None:
        cutoff = datetime.now(UTC) - timedelta(days=since_days)
        query = query.filter(Paper.published_date >= cutoff)
    if min_relevance is not None:
        query = query.filter(Paper.relevance >= min_relevance)
    if not include_read:
        query = query.filter(Paper.is_read == False)  # noqa: E712

    items = (
        query.order_by(Paper.published_date.desc().nullslast(), Paper.created_at.desc())
        .limit(limit)
        .all()
    )
    return PaperListResponse(items=items, meta=PaginationMeta(total=len(items), page=1, size=limit))

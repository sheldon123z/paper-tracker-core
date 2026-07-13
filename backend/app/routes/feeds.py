import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..control_plane.models import User
from ..database import get_db
from ..models import Feed, Paper, PaperUserState
from ..schemas import FeedCreate, FeedOut, FeedUpdate, PaginationMeta, PaperListResponse
from ..services.scheduler import schedule_feed, unschedule_feed
from ..services.access_control import (
    filter_visible, get_visible_or_404, normalize_new_scope, paper_response, require_writable,
)

logger = logging.getLogger("paper-tracker.feeds")

router = APIRouter(prefix="/api/feeds", tags=["feeds"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[FeedOut])
def list_feeds(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return filter_visible(db.query(Feed), Feed, user).order_by(Feed.id.desc()).all()


@router.post("", response_model=FeedOut)
def create_feed(payload: FeedCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    visibility, department_id = normalize_new_scope(user, payload.visibility, payload.department_id)
    existing = db.query(Feed).filter(
        Feed.url == payload.url,
        Feed.visibility == visibility,
        Feed.department_id.is_(None) if department_id is None else Feed.department_id == department_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Feed URL already exists in this library")

    values = payload.model_dump(exclude={"visibility", "department_id"})
    feed = Feed(**values, visibility=visibility, department_id=department_id, created_by_user_id=user.id)
    db.add(feed)
    db.commit()
    db.refresh(feed)

    if feed.is_active:
        schedule_feed(feed)

    logger.info("Feed created: %s", feed.url)
    return feed


@router.put("/{feed_id}", response_model=FeedOut)
def update_feed(feed_id: int, payload: FeedUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    feed = get_visible_or_404(db, Feed, feed_id, user)
    require_writable(feed, user)

    values = payload.model_dump(exclude_unset=True)
    target_visibility = values.get("visibility", feed.visibility)
    target_department = values.get("department_id", feed.department_id)
    if "visibility" in values or "department_id" in values:
        visibility, department_id = normalize_new_scope(
            user, values.pop("visibility", feed.visibility), values.pop("department_id", feed.department_id))
        feed.visibility, feed.department_id = visibility, department_id
        target_visibility, target_department = visibility, department_id
    target_url = values.get("url", feed.url)
    duplicate = db.query(Feed).filter(
        Feed.id != feed.id,
        Feed.url == target_url,
        Feed.visibility == target_visibility,
        Feed.department_id.is_(None) if target_department is None else Feed.department_id == target_department,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Feed URL already exists in this library")
    for field, value in values.items():
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
def delete_feed(feed_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    feed = get_visible_or_404(db, Feed, feed_id, user)
    require_writable(feed, user)

    unschedule_feed(feed_id)
    db.delete(feed)
    db.commit()
    return {"message": "Feed deleted", "feed_id": feed_id}


@router.post("/refresh-abstracts")
def refresh_all_abstracts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Re-fetch all RSS feeds and update papers that have missing or stub abstracts."""
    from ..services.rss_parser import refresh_abstracts

    feeds = filter_visible(db.query(Feed).filter(Feed.is_active == True), Feed, user).all()  # noqa: E712
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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List papers ingested from a specific feed, newest first."""
    feed = get_visible_or_404(db, Feed, feed_id, user)

    query = db.query(Paper).outerjoin(
        PaperUserState,
        (PaperUserState.paper_id == Paper.id) & (PaperUserState.user_id == user.id),
    ).filter(Paper.source_feed_id == feed_id)
    query = filter_visible(query, Paper, user)
    if since_days is not None:
        cutoff = datetime.now(UTC) - timedelta(days=since_days)
        query = query.filter(Paper.published_date >= cutoff)
    if min_relevance is not None:
        query = query.filter(Paper.relevance >= min_relevance)
    if not include_read:
        query = query.filter(func.coalesce(PaperUserState.is_read, False) == False)  # noqa: E712

    items = (
        query.order_by(Paper.published_date.desc().nullslast(), Paper.created_at.desc())
        .limit(limit)
        .all()
    )
    return PaperListResponse(
        items=[paper_response(db, paper, user) for paper in items],
        meta=PaginationMeta(total=len(items), page=1, size=limit),
    )

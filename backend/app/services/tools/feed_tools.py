"""Feed and activity tool executors."""

import json
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from ...models import Feed, Paper
from .helpers import _paper_to_dict


def _execute_get_feed_status(db: Session, arguments: dict) -> str:
    feeds = db.query(Feed).order_by(Feed.name).all()

    if not feeds:
        return "No RSS feeds configured."

    lines = [f"RSS Feed Status ({len(feeds)} feeds):\n"]
    for feed in feeds:
        last_fetch = feed.last_fetched.strftime("%Y-%m-%d %H:%M") if feed.last_fetched else "Never"
        status = "Active" if feed.is_active else "Inactive"
        interval_hours = feed.fetch_interval / 3600
        lines.append(f"  [{feed.id}] {feed.name}")
        lines.append(f"    URL: {feed.url}")
        lines.append(f"    Status: {status} | Interval: {interval_hours:g}h")
        lines.append(f"    Last fetched: {last_fetch}")
        if feed.last_error:
            lines.append(f"    Last error: {feed.last_error}")
        lines.append("")
    text = "\n".join(lines)
    return json.dumps({
        "type": "get_feed_status",
        "summary": text,
        "data": [{
            "id": f.id, "name": f.name, "url": f.url, "is_active": f.is_active,
            "interval": f.fetch_interval,
            "last_fetched": f.last_fetched.strftime("%Y-%m-%d %H:%M") if f.last_fetched else None,
            "last_error": f.last_error,
        } for f in feeds],
    }, ensure_ascii=False)


def _execute_get_recent_activity(db: Session, arguments: dict) -> str:
    days = min(arguments.get("days", 7), 90)
    limit_per_type = min(arguments.get("limit_per_type", 5), 20)
    since = datetime.now(UTC) - timedelta(days=days)

    # Recently added papers
    recently_added = (
        db.query(Paper)
        .filter(Paper.created_at >= since)
        .order_by(Paper.created_at.desc())
        .limit(limit_per_type)
        .all()
    )

    # Recently read papers
    recently_read = (
        db.query(Paper)
        .filter(Paper.is_read.is_(True), Paper.updated_at >= since)
        .order_by(Paper.updated_at.desc())
        .limit(limit_per_type)
        .all()
    )

    # Recently favorited papers
    recently_favorited = (
        db.query(Paper)
        .filter(Paper.is_favorited.is_(True), Paper.updated_at >= since)
        .order_by(Paper.updated_at.desc())
        .limit(limit_per_type)
        .all()
    )

    # Feed activity
    active_feeds = (
        db.query(Feed)
        .filter(Feed.last_fetched >= since)
        .order_by(Feed.last_fetched.desc())
        .limit(limit_per_type)
        .all()
    )

    lines = [f"Recent Activity (last {days} days):\n"]

    lines.append(f"Recently Added ({len(recently_added)}):")
    for p in recently_added:
        created = p.created_at.strftime("%m-%d %H:%M") if p.created_at else "N/A"
        lines.append(f"  [ID:{p.id}] {p.title} ({created})")

    lines.append(f"\nRecently Read ({len(recently_read)}):")
    for p in recently_read:
        updated = p.updated_at.strftime("%m-%d %H:%M") if p.updated_at else "N/A"
        lines.append(f"  [ID:{p.id}] {p.title} ({updated})")

    lines.append(f"\nRecently Favorited ({len(recently_favorited)}):")
    for p in recently_favorited:
        updated = p.updated_at.strftime("%m-%d %H:%M") if p.updated_at else "N/A"
        lines.append(f"  [ID:{p.id}] {p.title} ({updated})")

    lines.append(f"\nFeed Activity ({len(active_feeds)}):")
    for f in active_feeds:
        fetched = f.last_fetched.strftime("%m-%d %H:%M") if f.last_fetched else "Never"
        lines.append(f"  {f.name}: last fetched {fetched}")

    text = "\n".join(lines)
    return json.dumps({
        "type": "get_recent_activity",
        "summary": text,
        "data": {
            "days": days,
            "recently_added": [_paper_to_dict(p) for p in recently_added],
            "recently_read": [_paper_to_dict(p) for p in recently_read],
            "recently_favorited": [_paper_to_dict(p) for p in recently_favorited],
            "feed_activity": [{
                "id": f.id, "name": f.name,
                "last_fetched": f.last_fetched.strftime("%Y-%m-%d %H:%M") if f.last_fetched else None,
            } for f in active_feeds],
        },
    }, ensure_ascii=False)

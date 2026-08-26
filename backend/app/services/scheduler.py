import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.background import BackgroundScheduler

from ..database import SessionLocal
from ..models import Feed
from ..offline import is_offline_mode, require_online
from .rss_parser import ingest_feeds

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler(
    jobstores={"default": MemoryJobStore()},
    job_defaults={"coalesce": True, "max_instances": 1},
)


def _next_feed_run_time(feed: Feed, interval_seconds: int) -> datetime:
    """Return the next due time without resetting the interval on restart."""
    now = datetime.now(UTC)
    last_fetched = getattr(feed, "last_fetched", None)
    if last_fetched is None:
        return now
    last_fetched = (
        last_fetched.replace(tzinfo=UTC)
        if last_fetched.tzinfo is None
        else last_fetched.astimezone(UTC)
    )
    return max(last_fetched + timedelta(seconds=interval_seconds), now)


def _run_feed_job(feed_id: int) -> None:
    """Job target: fetch a single feed by ID in a fresh DB session."""
    require_online("RSS scheduling")
    db = SessionLocal()
    try:
        feed = db.query(Feed).filter(Feed.id == feed_id).first()
        if feed and feed.is_active:
            stats = ingest_feeds(db, [feed])
            logger.info("Scheduled fetch for feed %d completed: %s", feed_id, stats)
        else:
            logger.warning("Feed %d not found or inactive — skipping scheduled run.", feed_id)
    except Exception as exc:
        logger.error("Scheduled fetch for feed %d failed: %s", feed_id, exc)
    finally:
        db.close()


def schedule_feed(feed: Feed) -> None:
    """Add or replace the interval job for a feed."""
    job_id = f"feed_{feed.id}"
    if is_offline_mode():
        if _scheduler.get_job(job_id):
            _scheduler.remove_job(job_id)
        logger.info(
            "OFFLINE_MODE enabled; feed %d was saved without a scheduled fetch job.",
            feed.id,
        )
        return

    interval_seconds = max(feed.fetch_interval or 18000, 60)
    next_run_time = _next_feed_run_time(feed, interval_seconds)

    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)

    _scheduler.add_job(
        _run_feed_job,
        trigger="interval",
        seconds=interval_seconds,
        id=job_id,
        args=[feed.id],
        replace_existing=True,
        next_run_time=next_run_time,
    )
    logger.info(
        "Scheduled feed %d every %d seconds; next run at %s.",
        feed.id,
        interval_seconds,
        next_run_time.isoformat(),
    )


def unschedule_feed(feed_id: int) -> None:
    """Remove the scheduled job for a feed if it exists."""
    job_id = f"feed_{feed_id}"
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
        logger.info("Unscheduled feed %d.", feed_id)


def _remove_feed_jobs() -> None:
    for job in list(_scheduler.get_jobs()):
        if job.id.startswith("feed_"):
            _scheduler.remove_job(job.id)


def start_scheduler() -> None:
    """Start the shared scheduler without registering any RSS jobs."""

    if is_offline_mode():
        _remove_feed_jobs()
    if not _scheduler.running:
        _scheduler.start()
        logger.info("APScheduler started.")


def init_scheduler() -> None:
    """Start the scheduler and schedule all currently active feeds."""
    if is_offline_mode():
        _remove_feed_jobs()
        logger.info("OFFLINE_MODE enabled; RSS scheduler was not started.")
        return

    start_scheduler()
    db = SessionLocal()
    try:
        feeds = db.query(Feed).filter(Feed.is_active.is_(True)).all()
        for feed in feeds:
            schedule_feed(feed)
        logger.info("Scheduled %d active feeds.", len(feeds))
    except Exception as exc:
        logger.error("Scheduler initialisation failed: %s", exc)
    finally:
        db.close()


def shutdown_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")


def get_scheduler() -> BackgroundScheduler:
    """Return the singleton scheduler instance."""
    return _scheduler


def get_scheduler_status() -> list[dict[str, Any]]:
    """Return a list of current scheduled jobs with basic info."""
    jobs = []
    for job in _scheduler.get_jobs():
        jobs.append(
            {
                "id": job.id,
                "name": job.name,
                "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
            }
        )
    return jobs

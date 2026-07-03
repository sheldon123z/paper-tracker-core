import logging
from typing import Any

from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.background import BackgroundScheduler

from ..database import SessionLocal
from ..models import Feed
from .rss_parser import ingest_feeds

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler(
    jobstores={"default": MemoryJobStore()},
    job_defaults={"coalesce": True, "max_instances": 1},
)


def _run_feed_job(feed_id: int) -> None:
    """Job target: fetch a single feed by ID in a fresh DB session."""
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
    interval_minutes = max(feed.fetch_interval or 120, 5)  # floor at 5 minutes

    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)

    _scheduler.add_job(
        _run_feed_job,
        trigger="interval",
        minutes=interval_minutes,
        id=job_id,
        args=[feed.id],
        replace_existing=True,
    )
    logger.info("Scheduled feed %d every %d minutes.", feed.id, interval_minutes)


def unschedule_feed(feed_id: int) -> None:
    """Remove the scheduled job for a feed if it exists."""
    job_id = f"feed_{feed_id}"
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
        logger.info("Unscheduled feed %d.", feed_id)


def init_scheduler() -> None:
    """Start the scheduler and schedule all currently active feeds."""
    db = SessionLocal()
    try:
        if not _scheduler.running:
            _scheduler.start()
            logger.info("APScheduler started.")

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

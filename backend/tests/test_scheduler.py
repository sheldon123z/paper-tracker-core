"""Comprehensive tests for scheduler API routes.

Tests cover: interval scheduling, scheduler status, and manual feed trigger functionality.
"""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from apscheduler.schedulers.background import BackgroundScheduler
from backend.app.auth.dependencies import (
    get_current_user,
    get_current_user_or_ingestion_service,
)
from backend.app.models import Feed
from backend.app.offline import OFFLINE_ERROR_CODE
from backend.app.routes import scheduler_routes as scheduler_module
from backend.app.services import scheduler as scheduler_service
from backend.tests.support import make_fake_user, make_test_session_factory, patched_env
from fastapi import FastAPI
from fastapi.testclient import TestClient


class ScheduleFeedTests(unittest.TestCase):
    """Verify the persisted feed interval uses the API's seconds contract."""

    def test_schedule_feed_uses_seconds(self):
        test_scheduler = BackgroundScheduler()
        feed = SimpleNamespace(id=7, fetch_interval=3600)

        with patch.object(scheduler_service, "_scheduler", test_scheduler):
            scheduler_service.schedule_feed(feed)

        job = test_scheduler.get_job("feed_7")
        self.assertIsNotNone(job)
        self.assertEqual(job.trigger.interval.total_seconds(), 3600)

    def test_overdue_feed_is_scheduled_immediately(self):
        test_scheduler = BackgroundScheduler(timezone=UTC)
        test_scheduler.start(paused=True)
        now = datetime.now(UTC)
        feed = SimpleNamespace(id=8, fetch_interval=3600, last_fetched=now - timedelta(hours=5))

        try:
            with patch.object(scheduler_service, "_scheduler", test_scheduler):
                scheduler_service.schedule_feed(feed)

            job = test_scheduler.get_job("feed_8")
            self.assertLessEqual(abs((job.next_run_time - now).total_seconds()), 1)
        finally:
            test_scheduler.shutdown(wait=False)

    def test_recent_feed_waits_only_for_remaining_interval(self):
        test_scheduler = BackgroundScheduler(timezone=UTC)
        test_scheduler.start(paused=True)
        now = datetime.now(UTC)
        feed = SimpleNamespace(id=9, fetch_interval=3600, last_fetched=now - timedelta(minutes=45))

        try:
            with patch.object(scheduler_service, "_scheduler", test_scheduler):
                scheduler_service.schedule_feed(feed)

            job = test_scheduler.get_job("feed_9")
            remaining = (job.next_run_time - now).total_seconds()
            self.assertAlmostEqual(remaining, 15 * 60, delta=1)
        finally:
            test_scheduler.shutdown(wait=False)

    def test_offline_feed_definition_is_not_scheduled(self):
        test_scheduler = BackgroundScheduler()
        test_scheduler.add_job(lambda: None, "interval", hours=1, id="feed_10")
        feed = SimpleNamespace(id=10, fetch_interval=3600)

        with (
            patched_env(OFFLINE_MODE="true"),
            patch.object(scheduler_service, "_scheduler", test_scheduler),
        ):
            scheduler_service.schedule_feed(feed)

        self.assertIsNone(test_scheduler.get_job("feed_10"))


class SchedulerTestBase(unittest.TestCase):
    """Base class with a test FastAPI app and in-memory DB."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(scheduler_module.router)

        self.db = self.session_factory()

        # Clean all tables for test isolation
        from backend.app.database import Base
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()

        def override_get_db():
            try:
                yield self.db
            finally:
                self.db.close()

        self.app.dependency_overrides[scheduler_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.app.dependency_overrides[get_current_user_or_ingestion_service] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        # Clean tables
        self.db.query(Feed).delete()
        self.db.commit()
        self.db.close()

    def _create_feed(
        self,
        name="Test Feed",
        url="http://example.com/feed.xml",
        is_active=True,
        fetch_interval=60,
    ):
        """Helper to create a Feed for testing."""
        feed = Feed(
            name=name,
            url=url,
            is_active=is_active,
            fetch_interval=fetch_interval,
        )
        self.db.add(feed)
        self.db.commit()
        self.db.refresh(feed)
        return feed


class SchedulerStatusTests(SchedulerTestBase):
    """Tests for GET /api/scheduler/status endpoint."""

    @patch("backend.app.routes.scheduler_routes.get_scheduler_status")
    def test_scheduler_status_no_jobs(self, mock_get_status):
        """Test status when no jobs are scheduled."""
        mock_get_status.return_value = []

        response = self.client.get("/api/scheduler/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["jobs"], [])
        self.assertEqual(data["total_jobs"], 0)

    @patch("backend.app.routes.scheduler_routes.get_scheduler_status")
    def test_scheduler_status_with_jobs(self, mock_get_status):
        """Test status when jobs are scheduled."""
        now_iso = datetime.now(UTC).isoformat()
        mock_get_status.return_value = [
            {"id": "feed_1", "name": "feed_job", "next_run_time": now_iso},
            {"id": "feed_2", "name": "feed_job", "next_run_time": None},
        ]

        response = self.client.get("/api/scheduler/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["jobs"]), 2)
        self.assertEqual(data["total_jobs"], 2)

        job_ids = [j["id"] for j in data["jobs"]]
        self.assertIn("feed_1", job_ids)
        self.assertIn("feed_2", job_ids)

    @patch("backend.app.routes.scheduler_routes.get_scheduler_status")
    def test_scheduler_status_empty(self, mock_get_status):
        """Test status when scheduler has no jobs."""
        mock_get_status.return_value = []

        response = self.client.get("/api/scheduler/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["jobs"], [])
        self.assertEqual(data["total_jobs"], 0)

    @patch("backend.app.routes.scheduler_routes.get_scheduler_status")
    def test_scheduler_status_remains_available_offline(self, mock_get_status):
        mock_get_status.return_value = []

        with patched_env(OFFLINE_MODE="true"):
            response = self.client.get("/api/scheduler/status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"jobs": [], "total_jobs": 0})


class TriggerFeedTests(SchedulerTestBase):
    """Tests for POST /api/scheduler/trigger/{feed_id} endpoint."""

    @patch("backend.app.routes.scheduler_routes.ingest_feeds")
    def test_trigger_feed_success(self, mock_ingest):
        """Test triggering a feed successfully."""
        feed = self._create_feed(is_active=True)
        feed_id = feed.id  # capture before session closes
        mock_ingest.return_value = {"fetched": 5, "new": 2}

        response = self.client.post(f"/api/scheduler/trigger/{feed_id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["feed_id"], feed_id)
        self.assertIn("stats", data)
        self.assertEqual(data["stats"]["fetched"], 5)
        self.assertEqual(data["stats"]["new"], 2)

    def test_trigger_feed_not_found(self):
        """Test triggering a non-existent feed."""
        response = self.client.post("/api/scheduler/trigger/99999")
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.json()["detail"].lower())

    def test_trigger_feed_inactive(self):
        """Test triggering an inactive feed."""
        feed = self._create_feed(is_active=False)
        feed_id = feed.id  # capture before session closes

        response = self.client.post(f"/api/scheduler/trigger/{feed_id}")
        self.assertEqual(response.status_code, 400)
        self.assertIn("not active", response.json()["detail"].lower())

    @patch("backend.app.routes.scheduler_routes.ingest_feeds")
    def test_trigger_feed_calls_ingest(self, mock_ingest):
        """Test that triggering a feed calls ingest_feeds with correct parameters."""
        feed = self._create_feed(is_active=True)
        feed_id = feed.id  # capture before session closes
        mock_ingest.return_value = {"fetched": 0, "new": 0}

        response = self.client.post(f"/api/scheduler/trigger/{feed_id}")
        self.assertEqual(response.status_code, 200)

        # Verify ingest_feeds was called with the feed
        mock_ingest.assert_called_once()
        call_args = mock_ingest.call_args
        feeds_arg = call_args[0][1]  # second positional arg is the feeds list
        self.assertEqual(len(feeds_arg), 1)
        self.assertEqual(feeds_arg[0].id, feed_id)

    @patch("backend.app.routes.scheduler_routes.ingest_feeds")
    def test_trigger_feed_ingest_error(self, mock_ingest):
        """Test triggering a feed when ingest raises an exception."""
        mock_ingest.side_effect = Exception("Ingest error")
        feed = self._create_feed(is_active=True)
        feed_id = feed.id  # capture before session closes

        # Use raise_server_exceptions=False so TestClient returns the
        # actual HTTP 500 response instead of re-raising the exception.
        client = TestClient(self.app, raise_server_exceptions=False)
        response = client.post(f"/api/scheduler/trigger/{feed_id}")
        # The endpoint calls ingest_feeds directly without try/except,
        # so the exception propagates and FastAPI returns 500.
        self.assertEqual(response.status_code, 500)

    @patch("backend.app.routes.scheduler_routes.ingest_feeds")
    def test_trigger_feed_is_blocked_offline_before_ingestion(self, mock_ingest):
        feed = self._create_feed(is_active=True)

        with patched_env(OFFLINE_MODE="true"):
            response = self.client.post(f"/api/scheduler/trigger/{feed.id}")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], OFFLINE_ERROR_CODE)
        mock_ingest.assert_not_called()


if __name__ == "__main__":
    unittest.main()

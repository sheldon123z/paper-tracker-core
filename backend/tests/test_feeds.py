"""
Comprehensive tests for Feeds CRUD routes.
Tests cover listing, creating, updating, and deleting RSS feeds.
"""
import unittest
from datetime import UTC, datetime
from unittest.mock import patch
from uuid import uuid4

from backend.app.auth.dependencies import get_current_user, get_current_user_or_service
from backend.app.database import Base
from backend.app.models import Feed
from backend.tests.support import make_fake_user, make_test_session_factory, patched_env
from starlette.testclient import TestClient


class TestFeeds(unittest.TestCase):
    """Tests for /api/feeds endpoints."""

    @classmethod
    def setUpClass(cls):
        cls.SessionLocal = make_test_session_factory()

    def setUp(self):
        self.db = self.SessionLocal()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()

    def tearDown(self):
        from backend.app.database import get_db
        from backend.app.main import app
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_current_user_or_service, None)
        self.db.close()

    def _create_app(self):
        """Create a FastAPI app with test DB dependency override."""
        from backend.app.database import get_db
        from backend.app.main import app

        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = make_fake_user
        app.dependency_overrides[get_current_user_or_service] = make_fake_user
        return TestClient(app)

    def _create_feed(self, **kwargs):
        """Helper to create a feed in the test database."""
        defaults = {
            "name": "Test Feed",
            "url": f"https://example.com/feed-{uuid4().hex}.xml",
            "source": "rss",
            "is_active": True,
            "fetch_interval": 120,
        }
        defaults.update(kwargs)
        feed = Feed(**defaults)
        self.db.add(feed)
        self.db.commit()
        self.db.refresh(feed)
        return feed

    # ==================== LIST FEEDS TESTS ====================

    def test_list_feeds_empty(self):
        """Test listing feeds when database is empty."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()
            response = client.get("/api/feeds")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data, [])

    def test_list_feeds_with_data(self):
        """Test listing feeds with data in database."""
        self._create_feed(name="Feed 1", url="https://example1.com/feed.xml")
        self._create_feed(name="Feed 2", url="https://example2.com/feed.xml")
        self._create_feed(name="Feed 3", url="https://example3.com/feed.xml")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()
            response = client.get("/api/feeds")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data), 3)

            # Verify ordering (desc by id)
            ids = [f["id"] for f in data]
            self.assertEqual(ids, sorted(ids, reverse=True))

    def test_list_feeds_includes_all_fields(self):
        """Test that list feeds response includes all expected fields."""
        now = datetime.now(UTC)
        feed = self._create_feed(
            name="Complete Feed",
            url="https://complete.com/feed.xml",
            source="arxiv",
            is_active=True,
            fetch_interval=60,
        )
        feed.last_fetched = now
        feed.last_error = "Test error"
        self.db.commit()

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()
            response = client.get("/api/feeds")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data), 1)

            feed_data = data[0]
            self.assertEqual(feed_data["name"], "Complete Feed")
            self.assertEqual(feed_data["url"], "https://complete.com/feed.xml")
            self.assertEqual(feed_data["source"], "arxiv")
            self.assertTrue(feed_data["is_active"])
            self.assertEqual(feed_data["fetch_interval"], 60)
            self.assertIsNotNone(feed_data["last_fetched"])
            self.assertTrue(feed_data["last_fetched"].endswith("Z"))
            self.assertEqual(feed_data["last_error"], "Test error")

    # ==================== CREATE FEED TESTS ====================

    def test_create_feed_success(self):
        """Test successfully creating a new feed."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Mock scheduler to avoid APScheduler calls
            with patch("backend.app.routes.feeds.schedule_feed") as mock_schedule:
                response = client.post(
                    "/api/feeds",
                    json={
                        "name": "New Feed",
                        "url": "https://newfeed.com/rss.xml",
                        "source": "rss",
                        "is_active": True,
                        "fetch_interval": 120,
                    },
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["name"], "New Feed")
                self.assertEqual(data["url"], "https://newfeed.com/rss.xml")
                self.assertEqual(data["source"], "rss")
                self.assertTrue(data["is_active"])
                self.assertEqual(data["fetch_interval"], 120)
                self.assertIsNotNone(data["id"])

                # Verify scheduler was called for active feed
                mock_schedule.assert_called_once()

    def test_create_feed_with_custom_source(self):
        """Test creating a feed with custom source type."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed"):
                response = client.post(
                    "/api/feeds",
                    json={
                        "name": "ArXiv Feed",
                        "url": "https://arxiv.org/rss/cs.AI",
                        "source": "arxiv",
                        "is_active": True,
                        "fetch_interval": 240,
                    },
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["source"], "arxiv")
                self.assertEqual(data["fetch_interval"], 240)

    def test_create_feed_inactive(self):
        """Test creating an inactive feed."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed") as mock_schedule:
                response = client.post(
                    "/api/feeds",
                    json={
                        "name": "Inactive Feed",
                        "url": "https://inactive.com/feed.xml",
                        "source": "rss",
                        "is_active": False,
                        "fetch_interval": 120,
                    },
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertFalse(data["is_active"])

                # Scheduler should NOT be called for inactive feed
                mock_schedule.assert_not_called()

    def test_create_feed_duplicate_url(self):
        """Test that creating a feed with duplicate URL fails."""
        self._create_feed(name="Existing Feed", url="https://duplicate.com/feed.xml")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/feeds",
                json={
                    "name": "New Feed",
                    "url": "https://duplicate.com/feed.xml",
                    "source": "rss",
                    "is_active": True,
                    "fetch_interval": 120,
                },
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("already exists", response.json()["detail"])

    def test_create_feed_validation_missing_name(self):
        """Test validation error when name is missing."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/feeds",
                json={
                    "url": "https://test.com/feed.xml",
                    "source": "rss",
                },
            )
            self.assertEqual(response.status_code, 422)  # Validation error

    def test_create_feed_validation_missing_url(self):
        """Test validation error when URL is missing."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/feeds",
                json={
                    "name": "Test Feed",
                    "source": "rss",
                },
            )
            self.assertEqual(response.status_code, 422)  # Validation error

    def test_create_feed_default_values(self):
        """Test that default values are applied correctly."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed"):
                # Only provide required fields
                response = client.post(
                    "/api/feeds",
                    json={
                        "name": "Minimal Feed",
                        "url": "https://minimal.com/feed.xml",
                    },
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                # Check defaults
                self.assertEqual(data["source"], "rss")  # Default source
                self.assertTrue(data["is_active"])  # Default is_active
                self.assertEqual(data["fetch_interval"], 18000)  # Default: five hours in seconds

    # ==================== UPDATE FEED TESTS ====================

    def test_update_feed_success(self):
        """Test successfully updating a feed."""
        feed = self._create_feed(name="Original Name", fetch_interval=120)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed"):
                response = client.put(
                    f"/api/feeds/{feed.id}",
                    json={
                        "name": "Updated Name",
                        "fetch_interval": 240,
                    },
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["name"], "Updated Name")
                self.assertEqual(data["fetch_interval"], 240)

    def test_update_feed_url(self):
        """Test updating feed URL."""
        feed = self._create_feed(url="https://original.com/feed.xml")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed"):
                response = client.put(
                    f"/api/feeds/{feed.id}",
                    json={"url": "https://newurl.com/feed.xml"},
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["url"], "https://newurl.com/feed.xml")

    def test_update_feed_toggle_active(self):
        """Test toggling feed active status."""
        feed = self._create_feed(is_active=True)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed"):
                with patch("backend.app.routes.feeds.unschedule_feed") as mock_unschedule:
                    response = client.put(
                        f"/api/feeds/{feed.id}",
                        json={"is_active": False},
                    )
                    self.assertEqual(response.status_code, 200)
                    data = response.json()
                    self.assertFalse(data["is_active"])

                    # Should unschedule when becoming inactive
                    mock_unschedule.assert_called_once_with(feed.id)

    def test_update_feed_activate(self):
        """Test activating an inactive feed."""
        feed = self._create_feed(is_active=False)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed") as mock_schedule:
                response = client.put(
                    f"/api/feeds/{feed.id}",
                    json={"is_active": True},
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertTrue(data["is_active"])

                # Should schedule when becoming active
                mock_schedule.assert_called_once()

    def test_update_feed_not_found(self):
        """Test updating a non-existent feed."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.put(
                "/api/feeds/9999",
                json={"name": "New Name"},
            )
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["detail"], "Feed not found")

    def test_update_feed_partial_update(self):
        """Test partial update only modifies specified fields."""
        feed = self._create_feed(
            name="Original",
            source="rss",
            fetch_interval=120,
        )

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed"):
                # Only update fetch_interval
                response = client.put(
                    f"/api/feeds/{feed.id}",
                    json={"fetch_interval": 300},
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["name"], "Original")  # Unchanged
                self.assertEqual(data["source"], "rss")  # Unchanged
                self.assertEqual(data["fetch_interval"], 300)  # Changed

    # ==================== DELETE FEED TESTS ====================

    def test_delete_feed_success(self):
        """Test successfully deleting a feed."""
        feed = self._create_feed(name="To Delete")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.unschedule_feed") as mock_unschedule:
                response = client.delete(f"/api/feeds/{feed.id}")
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["message"], "Feed deleted")
                self.assertEqual(data["feed_id"], feed.id)

                # Verify unschedule was called
                mock_unschedule.assert_called_once_with(feed.id)

                # Verify feed is deleted from database
                deleted = self.db.query(Feed).filter(Feed.id == feed.id).first()
                self.assertIsNone(deleted)

    def test_delete_feed_not_found(self):
        """Test deleting a non-existent feed."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.delete("/api/feeds/9999")
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["detail"], "Feed not found")

    def test_delete_feed_multiple(self):
        """Test deleting multiple feeds sequentially."""
        feed1 = self._create_feed(name="Feed 1")
        feed2 = self._create_feed(name="Feed 2")
        feed3 = self._create_feed(name="Feed 3")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.unschedule_feed"):
                # Delete first feed
                response = client.delete(f"/api/feeds/{feed1.id}")
                self.assertEqual(response.status_code, 200)

                # Delete second feed
                response = client.delete(f"/api/feeds/{feed2.id}")
                self.assertEqual(response.status_code, 200)

                # Verify only third feed remains
                remaining = self.db.query(Feed).all()
                self.assertEqual(len(remaining), 1)
                self.assertEqual(remaining[0].id, feed3.id)

    # ==================== REFRESH ABSTRACTS TESTS ====================

    def test_refresh_abstracts_no_active_feeds(self):
        """Test refresh abstracts with no active feeds."""
        # Create inactive feed only
        self._create_feed(is_active=False)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # refresh_abstracts is imported inside the route function,
            # so mock at the source module
            with patch("backend.app.services.rss_parser.refresh_abstracts") as mock_refresh:
                mock_refresh.return_value = {"updated": 0, "skipped": 0}
                response = client.post("/api/feeds/refresh-abstracts")
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertIn("updated", data)

    def test_refresh_abstracts_with_active_feeds(self):
        """Test refresh abstracts with active feeds."""
        self._create_feed(is_active=True)
        self._create_feed(is_active=True)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.services.rss_parser.refresh_abstracts") as mock_refresh:
                mock_refresh.return_value = {"updated": 5, "skipped": 10}

                response = client.post("/api/feeds/refresh-abstracts")
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["updated"], 5)
                self.assertEqual(data["skipped"], 10)

                # Verify refresh was called with feeds
                mock_refresh.assert_called_once()

    # ==================== EDGE CASES ====================

    def test_create_feed_with_unicode_name(self):
        """Test creating a feed with unicode characters in name."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed"):
                response = client.post(
                    "/api/feeds",
                    json={
                        "name": "中文订阅源",
                        "url": "https://chinese.com/feed.xml",
                    },
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["name"], "中文订阅源")

    def test_create_feed_with_special_characters_in_url(self):
        """Test creating a feed with special characters in URL."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed"):
                response = client.post(
                    "/api/feeds",
                    json={
                        "name": "ArXiv AI Feed",
                        "url": "https://arxiv.org/rss/cs.AI?param=value&other=test",
                    },
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertIn("param=value", data["url"])

    def test_list_feeds_ordering(self):
        """Test that feeds are ordered by ID descending."""
        # Create feeds in specific order
        feed1 = self._create_feed(name="First Feed")
        feed2 = self._create_feed(name="Second Feed")
        feed3 = self._create_feed(name="Third Feed")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/feeds")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data), 3)

            # Should be in descending order by ID
            ids = [f["id"] for f in data]
            self.assertEqual(ids, [feed3.id, feed2.id, feed1.id])

    def test_update_feed_all_fields(self):
        """Test updating all feed fields at once."""
        feed = self._create_feed(
            name="Original",
            url="https://original.com/feed.xml",
            source="rss",
            is_active=True,
            fetch_interval=120,
        )

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed"):
                response = client.put(
                    f"/api/feeds/{feed.id}",
                    json={
                        "name": "Updated",
                        "url": "https://updated.com/feed.xml",
                        "source": "arxiv",
                        "is_active": False,
                        "fetch_interval": 300,
                    },
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["name"], "Updated")
                self.assertEqual(data["url"], "https://updated.com/feed.xml")
                self.assertEqual(data["source"], "arxiv")
                self.assertFalse(data["is_active"])
                self.assertEqual(data["fetch_interval"], 300)

    def test_feed_model_last_fetched_none(self):
        """Test that last_fetched is None initially."""
        self._create_feed()

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/feeds")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertIsNone(data[0]["last_fetched"])

    def test_create_feed_various_fetch_intervals(self):
        """Test creating feeds with various fetch intervals."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            with patch("backend.app.routes.feeds.schedule_feed"):
                # Short interval: one minute
                response = client.post(
                    "/api/feeds",
                    json={
                        "name": "Frequent Feed",
                        "url": "https://frequent.com/feed.xml",
                        "fetch_interval": 60,
                    },
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["fetch_interval"], 60)

                # Long interval
                response = client.post(
                    "/api/feeds",
                    json={
                        "name": "Rare Feed",
                        "url": "https://rare.com/feed.xml",
                        "fetch_interval": 86400,  # 24 hours in seconds
                    },
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["fetch_interval"], 86400)


if __name__ == "__main__":
    unittest.main()

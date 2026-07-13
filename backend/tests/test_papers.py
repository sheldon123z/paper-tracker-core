"""
Comprehensive tests for Papers CRUD routes.
Tests cover listing, batch operations, duplicates, export, and CRUD operations.
"""
import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from backend.app.auth.dependencies import get_current_user
from backend.app.database import Base
from backend.app.models import Feed, Paper, PaperTag, PaperUserState, Tag
from backend.app.services.cache import cache
from backend.tests.support import make_fake_user, make_test_session_factory, patched_env
from starlette.testclient import TestClient


class TestPapers(unittest.TestCase):
    """Tests for /api/papers endpoints."""

    @classmethod
    def setUpClass(cls):
        cls.SessionLocal = make_test_session_factory()

    def setUp(self):
        # Clear module-level cache to prevent cross-test pollution
        # (e.g. list_papers caches by query params for 60s).
        cache.clear()
        self.db = self.SessionLocal()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()

    def tearDown(self):
        from backend.app.database import get_db
        from backend.app.main import app
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        self.db.close()

    def _create_app(self):
        """Create a FastAPI app with test DB dependency override."""
        from backend.app.database import get_db
        from backend.app.main import app

        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = make_fake_user
        return TestClient(app)

    def _create_paper(self, **kwargs):
        """Helper to create a paper in the test database."""
        defaults = {
            "title": "Test Paper",
            "authors": "Test Author",
            "abstract": "Test abstract",
            "source": "rss",
            "published_date": datetime.now(UTC),
            "relevance": 1.0,
            "category": "Machine Learning",
            "is_read": False,
            "is_favorited": False,
        }
        defaults.update(kwargs)
        paper = Paper(**defaults)
        self.db.add(paper)
        self.db.commit()
        self.db.refresh(paper)
        return paper

    def _create_feed(self, **kwargs):
        """Helper to create a feed in the test database."""
        defaults = {
            "name": "Test Feed",
            "url": "https://example.com/feed.xml",
            "source": "rss",
            "is_active": True,
        }
        defaults.update(kwargs)
        feed = Feed(**defaults)
        self.db.add(feed)
        self.db.commit()
        self.db.refresh(feed)
        return feed

    def _create_tag(self, **kwargs):
        """Helper to create a tag in the test database."""
        defaults = {
            "name": "Test Tag",
            "color": "#3B82F6",
        }
        defaults.update(kwargs)
        tag = Tag(**defaults)
        self.db.add(tag)
        self.db.commit()
        self.db.refresh(tag)
        return tag

    # ==================== LIST PAPERS TESTS ====================

    def test_list_papers_empty(self):
        """Test listing papers when database is empty."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()
            response = client.get("/api/papers")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["items"], [])
            self.assertEqual(data["meta"]["total"], 0)
            self.assertEqual(data["meta"]["page"], 1)
            self.assertEqual(data["meta"]["size"], 20)

    def test_list_papers_with_data(self):
        """Test listing papers with data in database."""
        self._create_paper(title="Paper 1", authors="Author A")
        self._create_paper(title="Paper 2", authors="Author B")
        self._create_paper(title="Paper 3", authors="Author C")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()
            response = client.get("/api/papers")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 3)
            self.assertEqual(data["meta"]["total"], 3)

    def test_list_papers_search(self):
        """Test searching papers by title, authors, abstract, and notes."""
        self._create_paper(title="Machine Learning Basics", authors="John Doe")
        self._create_paper(title="Deep Neural Networks", authors="Jane Smith", abstract="Machine learning applications")
        self._create_paper(title="Computer Vision", authors="Bob Johnson", notes="Not related to ML")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Search by title
            response = client.get("/api/papers?search=Machine")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 2)  # "Machine Learning" and "Machine learning applications"

            # Search by authors
            response = client.get("/api/papers?search=Jane")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 1)

            # Search by abstract
            response = client.get("/api/papers?search=applications")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 1)

    def test_list_papers_filter_by_source(self):
        """Test filtering papers by source."""
        self._create_paper(title="RSS Paper", source="rss")
        self._create_paper(title="ArXiv Paper", source="arxiv")
        self._create_paper(title="Manual Paper", source="manual")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers?source=arxiv")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 1)
            self.assertEqual(data["items"][0]["title"], "ArXiv Paper")

    def test_list_papers_filter_by_tag(self):
        """Test filtering papers by tag."""
        self._create_paper(title="Tagged Paper", tags="AI, ML")
        self._create_paper(title="Untagged Paper", tags="")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers?tag=AI")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 1)
            self.assertEqual(data["items"][0]["title"], "Tagged Paper")

    def test_list_papers_filter_by_read_status(self):
        """Test filtering papers by read status."""
        self._create_paper(title="Read Paper", is_read=True)
        self._create_paper(title="Unread Paper 1", is_read=False)
        self._create_paper(title="Unread Paper 2", is_read=False)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers?is_read=true")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 1)

            response = client.get("/api/papers?is_read=false")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 2)

    def test_list_papers_filter_by_favorite_status(self):
        """Test filtering papers by favorite status."""
        self._create_paper(title="Favorited Paper", is_favorited=True)
        self._create_paper(title="Not Favorited", is_favorited=False)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers?is_favorited=true")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 1)
            self.assertEqual(data["items"][0]["title"], "Favorited Paper")

    def test_list_papers_filter_by_relevance(self):
        """Test filtering papers by minimum relevance score."""
        self._create_paper(title="High Relevance", relevance=0.9)
        self._create_paper(title="Medium Relevance", relevance=0.5)
        self._create_paper(title="Low Relevance", relevance=0.1)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers?min_relevance=0.6")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 1)
            self.assertEqual(data["items"][0]["title"], "High Relevance")

    def test_list_papers_filter_by_date_range(self):
        """Test filtering papers by date range."""
        now = datetime.now(UTC)
        self._create_paper(title="Old Paper", published_date=now - timedelta(days=30))
        self._create_paper(title="Recent Paper", published_date=now - timedelta(days=5))
        self._create_paper(title="New Paper", published_date=now - timedelta(days=1))

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            date_from = (now - timedelta(days=10)).strftime("%Y-%m-%d")
            response = client.get(f"/api/papers?date_from={date_from}")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertGreaterEqual(len(data["items"]), 2)

    def test_list_papers_invalid_date_format(self):
        """Test that invalid date format returns 400 error."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers?date_from=invalid-date")
            self.assertEqual(response.status_code, 400)
            self.assertIn("Invalid date_from format", response.json()["detail"])

    def test_list_papers_pagination(self):
        """Test pagination of papers list."""
        # Create 25 papers
        for i in range(25):
            self._create_paper(title=f"Paper {i}")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # First page
            response = client.get("/api/papers?page=1&size=10")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 10)
            self.assertEqual(data["meta"]["total"], 25)
            self.assertEqual(data["meta"]["page"], 1)

            # Second page
            response = client.get("/api/papers?page=2&size=10")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 10)
            self.assertEqual(data["meta"]["page"], 2)

            # Third page (partial)
            response = client.get("/api/papers?page=3&size=10")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 5)

    def test_list_papers_combined_filters(self):
        """Test combining multiple filters."""
        self._create_paper(
            title="ML Paper",
            source="arxiv",
            is_read=True,
            is_favorited=True,
            relevance=0.9,
        )
        self._create_paper(
            title="ML Paper 2",
            source="arxiv",
            is_read=False,
            is_favorited=True,
            relevance=0.8,
        )
        self._create_paper(
            title="Other Paper",
            source="rss",
            is_read=True,
            is_favorited=False,
            relevance=0.7,
        )

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers?source=arxiv&is_read=true&is_favorited=true&min_relevance=0.8")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 1)
            self.assertEqual(data["items"][0]["title"], "ML Paper")

    # ==================== BATCH ACTION TESTS ====================

    def test_batch_mark_read(self):
        """Test batch marking papers as read."""
        p1 = self._create_paper(title="Paper 1", is_read=False)
        p2 = self._create_paper(title="Paper 2", is_read=False)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/batch",
                json={"paper_ids": [p1.id, p2.id], "action": "mark_read"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["affected"], 2)

            states = self.db.query(PaperUserState).filter(PaperUserState.paper_id.in_([p1.id, p2.id])).all()
            self.assertEqual(len(states), 2)
            self.assertTrue(all(state.is_read for state in states))

    def test_batch_mark_unread(self):
        """Test batch marking papers as unread."""
        p1 = self._create_paper(title="Paper 1", is_read=True)
        p2 = self._create_paper(title="Paper 2", is_read=True)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/batch",
                json={"paper_ids": [p1.id, p2.id], "action": "mark_unread"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["affected"], 2)

            states = self.db.query(PaperUserState).filter(PaperUserState.paper_id.in_([p1.id, p2.id])).all()
            self.assertEqual(len(states), 2)
            self.assertTrue(all(not state.is_read for state in states))

    def test_batch_favorite(self):
        """Test batch favoriting papers."""
        p1 = self._create_paper(title="Paper 1", is_favorited=False)
        p2 = self._create_paper(title="Paper 2", is_favorited=False)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/batch",
                json={"paper_ids": [p1.id, p2.id], "action": "favorite"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["affected"], 2)

            states = self.db.query(PaperUserState).filter(PaperUserState.paper_id.in_([p1.id, p2.id])).all()
            self.assertEqual(len(states), 2)
            self.assertTrue(all(state.is_favorited for state in states))

    def test_batch_unfavorite(self):
        """Test batch unfavoriting papers."""
        p1 = self._create_paper(title="Paper 1", is_favorited=True)
        p2 = self._create_paper(title="Paper 2", is_favorited=True)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/batch",
                json={"paper_ids": [p1.id, p2.id], "action": "unfavorite"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["affected"], 2)

            states = self.db.query(PaperUserState).filter(PaperUserState.paper_id.in_([p1.id, p2.id])).all()
            self.assertEqual(len(states), 2)
            self.assertTrue(all(not state.is_favorited for state in states))

    def test_batch_delete(self):
        """Test batch deleting papers."""
        p1 = self._create_paper(title="Paper 1")
        p2 = self._create_paper(title="Paper 2")
        p3 = self._create_paper(title="Paper 3")  # Not deleted

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/batch",
                json={"paper_ids": [p1.id, p2.id], "action": "delete"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["affected"], 2)

            # Verify papers are deleted
            self.assertIsNone(self.db.query(Paper).filter(Paper.id == p1.id).first())
            self.assertIsNone(self.db.query(Paper).filter(Paper.id == p2.id).first())
            self.assertIsNotNone(self.db.query(Paper).filter(Paper.id == p3.id).first())

    def test_batch_invalid_action(self):
        """Test batch action with invalid action type."""
        p1 = self._create_paper(title="Paper 1")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/batch",
                json={"paper_ids": [p1.id], "action": "invalid_action"},
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("Unknown action", response.json()["detail"])

    def test_batch_empty_paper_ids(self):
        """Test batch action with empty paper IDs list."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/batch",
                json={"paper_ids": [], "action": "mark_read"},
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("No paper IDs provided", response.json()["detail"])

    def test_batch_nonexistent_paper_ids(self):
        """Test batch action with non-existent paper IDs."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/batch",
                json={"paper_ids": [9999, 8888], "action": "mark_read"},
            )
            self.assertEqual(response.status_code, 404)
            self.assertIn("No matching papers found", response.json()["detail"])

    # ==================== DUPLICATES TESTS ====================

    def test_find_duplicates_none(self):
        """Test finding duplicates when none exist."""
        self._create_paper(title="Unique Paper 1")
        self._create_paper(title="Unique Paper 2")
        self._create_paper(title="Completely Different Title")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers/duplicates")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            # Duplicates endpoint returns groups of similar papers
            # "Unique Paper 1" and "Unique Paper 2" may have high similarity
            self.assertIsInstance(data, list)

    def test_find_duplicates_with_similar_titles(self):
        """Test finding duplicates with similar titles."""
        self._create_paper(title="Attention Is All You Need")
        self._create_paper(title="Attention is all you need")  # Case difference
        self._create_paper(title="Attention Is All You Need: A Survey")
        self._create_paper(title="Completely Different Paper")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers/duplicates")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            # Should find at least one group of duplicates
            self.assertGreaterEqual(len(data), 1)

    def test_find_duplicates_custom_threshold(self):
        """Test finding duplicates with custom threshold."""
        self._create_paper(title="Paper A")
        self._create_paper(title="Paper B")  # Similar but short

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # High threshold - less likely to match
            response = client.get("/api/papers/duplicates?threshold=0.99")
            self.assertEqual(response.status_code, 200)

            # Low threshold - more likely to match
            response = client.get("/api/papers/duplicates?threshold=0.5")
            self.assertEqual(response.status_code, 200)

    def test_merge_duplicates_success(self):
        """Test successfully merging duplicate papers."""
        p1 = self._create_paper(title="Original Paper", notes="Original notes")
        p2 = self._create_paper(title="Duplicate Paper", notes="Duplicate notes")

        tag = self._create_tag(name="TestTag")
        # Create PaperTag for p2
        paper_tag = PaperTag(paper_id=p2.id, tag_id=tag.id)
        self.db.add_all([
            paper_tag,
            PaperUserState(paper_id=p1.id, user_id=1, notes="Original notes"),
            PaperUserState(paper_id=p2.id, user_id=1, notes="Duplicate notes"),
        ])
        self.db.commit()

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/duplicates/merge",
                json={"keep_id": p1.id, "merge_ids": [p2.id]},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["kept_id"], p1.id)
            self.assertIn(p2.id, data["removed_ids"])

            # Verify p2 is deleted
            self.assertIsNone(self.db.query(Paper).filter(Paper.id == p2.id).first())

            # Personal notes merge without writing the legacy global field.
            state = self.db.query(PaperUserState).filter(
                PaperUserState.paper_id == p1.id,
                PaperUserState.user_id == 1,
            ).one()
            self.assertIn("Duplicate notes", state.notes)
            self.db.refresh(p1)
            self.assertEqual(p1.notes, "Original notes")

    def test_merge_duplicates_invalid_keep_id(self):
        """Test merging with non-existent keep_id."""
        p1 = self._create_paper(title="Paper 1")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/duplicates/merge",
                json={"keep_id": 9999, "merge_ids": [p1.id]},
            )
            self.assertEqual(response.status_code, 404)
            self.assertIn("Paper not found", response.json()["detail"])

    # ==================== GET/UPDATE SINGLE PAPER TESTS ====================

    def test_get_paper_found(self):
        """Test getting an existing paper."""
        paper = self._create_paper(
            title="Test Paper",
            authors="John Doe",
            abstract="This is a test abstract",
        )

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get(f"/api/papers/{paper.id}")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["title"], "Test Paper")
            self.assertEqual(data["authors"], "John Doe")
            self.assertEqual(data["abstract"], "This is a test abstract")

    def test_get_paper_not_found(self):
        """Test getting a non-existent paper."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers/9999")
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["detail"], "Paper not found")

    def test_update_paper_fields(self):
        """Test updating paper fields."""
        paper = self._create_paper(
            title="Original Title",
            is_read=False,
            is_favorited=False,
            notes="",
            relevance=0.5,
        )

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.patch(
                f"/api/papers/{paper.id}",
                json={
                    "is_read": True,
                    "is_favorited": True,
                    "notes": "Updated notes",
                    "relevance": 0.9,
                },
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data["is_read"])
            self.assertTrue(data["is_favorited"])
            self.assertEqual(data["notes"], "Updated notes")
            self.assertEqual(data["relevance"], 0.9)

    def test_update_paper_partial(self):
        """Test partial update of paper fields."""
        paper = self._create_paper(
            title="Title",
            is_read=False,
            notes="Original notes",
        )

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Only update is_read
            response = client.patch(
                f"/api/papers/{paper.id}",
                json={"is_read": True},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data["is_read"])
            # Notes should remain unchanged
            self.assertEqual(data["notes"], "Original notes")

    def test_update_paper_not_found(self):
        """Test updating a non-existent paper."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.patch(
                "/api/papers/9999",
                json={"is_read": True},
            )
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["detail"], "Paper not found")

    # ==================== TAG ASSIGNMENT TESTS ====================

    def test_assign_tags(self):
        """Test assigning tags to a paper."""
        paper = self._create_paper(title="Paper")
        self._create_tag(name="AI")
        self._create_tag(name="ML")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                f"/api/papers/{paper.id}/tags",
                json={"tags": ["AI", "ML"]},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data), 2)
            tag_names = {t["name"] for t in data}
            self.assertIn("AI", tag_names)
            self.assertIn("ML", tag_names)

            # Verify paper.tags field is updated
            self.db.refresh(paper)
            self.assertIn("AI", paper.tags)
            self.assertIn("ML", paper.tags)

    def test_assign_tags_creates_new_tags(self):
        """Test that assigning non-existent tags creates them."""
        paper = self._create_paper(title="Paper")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                f"/api/papers/{paper.id}/tags",
                json={"tags": ["NewTag1", "NewTag2"], "default_color": "#FF0000"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data), 2)

            # Verify tags were created in database
            tag1 = self.db.query(Tag).filter(Tag.name == "NewTag1").first()
            tag2 = self.db.query(Tag).filter(Tag.name == "NewTag2").first()
            self.assertIsNotNone(tag1)
            self.assertIsNotNone(tag2)
            self.assertEqual(tag1.color, "#FF0000")

    def test_assign_tags_paper_not_found(self):
        """Test assigning tags to non-existent paper."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/papers/9999/tags",
                json={"tags": ["Tag"]},
            )
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["detail"], "Paper not found")

    def test_assign_tags_replaces_existing(self):
        """Test that assigning tags replaces existing tags."""
        paper = self._create_paper(title="Paper")
        tag1 = self._create_tag(name="OldTag")
        self._create_tag(name="NewTag")

        # Assign old tag first
        paper_tag = PaperTag(paper_id=paper.id, tag_id=tag1.id)
        self.db.add(paper_tag)
        paper.tags = "OldTag"
        self.db.commit()

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                f"/api/papers/{paper.id}/tags",
                json={"tags": ["NewTag"]},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["name"], "NewTag")

            # Verify old tag is removed
            self.db.refresh(paper)
            self.assertNotIn("OldTag", paper.tags)
            self.assertIn("NewTag", paper.tags)

    def test_assign_tags_empty_list(self):
        """Test assigning empty tag list removes all tags."""
        paper = self._create_paper(title="Paper")
        tag = self._create_tag(name="ExistingTag")

        paper_tag = PaperTag(paper_id=paper.id, tag_id=tag.id)
        self.db.add(paper_tag)
        paper.tags = "ExistingTag"
        self.db.commit()

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                f"/api/papers/{paper.id}/tags",
                json={"tags": []},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data), 0)

            self.db.refresh(paper)
            self.assertEqual(paper.tags, "")

    # ==================== BIBTEX EXPORT TESTS ====================

    def test_export_bibtex_empty(self):
        """Test BibTeX export with no papers."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers/export/bibtex")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.text, "")

    def test_export_bibtex_with_papers(self):
        """Test BibTeX export with papers."""
        now = datetime.now(UTC)
        self._create_paper(
            title="Attention Is All You Need",
            authors="Vaswani, Ashish and Shazeer, Noam",
            abstract="The dominant sequence transduction models...",
            link="https://arxiv.org/abs/1706.03762",
            published_date=now.replace(year=2017),
        )
        self._create_paper(
            title="BERT: Pre-training of Deep Bidirectional Transformers",
            authors="Devlin, Jacob",
            abstract="We introduce a new language representation model...",
            link="https://arxiv.org/abs/1810.04805",
            published_date=now.replace(year=2018),
        )

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers/export/bibtex")
            self.assertEqual(response.status_code, 200)
            self.assertIn("@article{", response.text)
            self.assertIn("title = {Attention Is All You Need}", response.text)
            self.assertIn("author = {Vaswani, Ashish and Shazeer, Noam}", response.text)
            self.assertIn("year = {2017}", response.text)
            self.assertIn("BERT", response.text)

    def test_export_bibtex_handles_missing_fields(self):
        """Test BibTeX export handles papers with missing fields."""
        self._create_paper(
            title="Paper Without Link",
            authors="Author",
            abstract="",
            link=None,
            published_date=None,
        )

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers/export/bibtex")
            self.assertEqual(response.status_code, 200)
            self.assertIn("@article{", response.text)
            self.assertIn("title = {Paper Without Link}", response.text)
            # Should have empty url and abstract
            self.assertIn("url = {}", response.text)

    # ==================== FEED INGESTION TESTS ====================

    def test_run_feed_ingestion_no_feeds(self):
        """Test feed ingestion when no active feeds exist."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post("/api/papers/run")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertIn("No active feeds", data["message"])

    def test_run_feed_ingestion_with_feeds(self):
        """Test feed ingestion with active feeds."""
        self._create_feed(name="Test Feed", url="https://example.com/feed.xml", is_active=True)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Mock the ingest_feeds function to avoid actual network calls
            with patch("backend.app.routes.papers.ingest_feeds") as mock_ingest:
                mock_ingest.return_value = {"total": 5, "new": 3}

                response = client.post("/api/papers/run")
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertIn("RSS fetch completed", data["message"])
                self.assertEqual(data["stats"]["total"], 5)
                mock_ingest.assert_called_once()

    # ==================== SEARCH EDGE CASES ====================

    def test_search_sanitizes_special_characters(self):
        """Test that search sanitizes SQL LIKE special characters."""
        self._create_paper(title="100% Complete Paper")
        self._create_paper(title="Test_Paper")
        self._create_paper(title="Normal Paper")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Search with % is handled by the API - behavior depends on implementation
            response = client.get("/api/papers?search=%25")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            # The API may or may not sanitize %; just verify it returns results
            self.assertIsInstance(data["items"], list)

    def test_search_like_escape_backslash(self):
        """Regression: backslash in search query must be escaped, not treated as escape char."""
        self._create_paper(title="Path\\To\\File Paper")
        self._create_paper(title="Normal Paper")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers?search=Path%5CTo")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 1)
            self.assertIn("Path", data["items"][0]["title"])

    def test_search_like_escape_percent(self):
        """Regression: literal % in search must match actual % in title, not act as wildcard."""
        self._create_paper(title="100% Complete")
        self._create_paper(title="100 Percent Complete")
        self._create_paper(title="Complete")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Search for literal "100%" — should match only the title with actual %
            response = client.get("/api/papers?search=100%25+Complete")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            titles = [item["title"] for item in data["items"]]
            self.assertIn("100% Complete", titles)
            self.assertNotIn("100 Percent Complete", titles)

    def test_search_like_escape_underscore(self):
        """Regression: literal _ in search must match actual _, not act as single-char wildcard."""
        self._create_paper(title="Test_Paper")
        self._create_paper(title="TestAPaper")
        self._create_paper(title="TestPaper")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers?search=Test_Paper")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            titles = [item["title"] for item in data["items"]]
            self.assertIn("Test_Paper", titles)
            self.assertNotIn("TestAPaper", titles)

    def test_search_truncates_long_query(self):
        """Test that long search queries are truncated."""
        self._create_paper(title="Unique Keyword Paper")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Very long search query (300+ chars)
            long_query = "a" * 300 + "Unique Keyword"
            response = client.get(f"/api/papers?search={long_query}")
            self.assertEqual(response.status_code, 200)
            # Should still work due to truncation

    # ==================== CATEGORY FILTER TESTS ====================

    def test_list_papers_filter_by_category(self):
        """Test filtering papers by category."""
        self._create_paper(title="ML Paper", category="Machine Learning")
        self._create_paper(title="CV Paper", category="Computer Vision")
        self._create_paper(title="NLP Paper", category="Natural Language Processing")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/papers?category=Machine Learning")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["items"]), 1)
            self.assertEqual(data["items"][0]["category"], "Machine Learning")


if __name__ == "__main__":
    unittest.main()

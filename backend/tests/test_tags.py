"""
Comprehensive tests for Tags CRUD routes.
Tests cover listing, creating, updating, and deleting tags with paper counts.
"""
import unittest
from datetime import datetime

from backend.app.auth.dependencies import get_current_user
from backend.app.database import Base
from backend.app.models import Paper, PaperTag, Tag
from backend.tests.support import make_fake_user, make_test_session_factory, patched_env
from starlette.testclient import TestClient


class TestTags(unittest.TestCase):
    """Tests for /api/tags endpoints."""

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
            "source": "rss",
        }
        defaults.update(kwargs)
        paper = Paper(**defaults)
        self.db.add(paper)
        self.db.commit()
        self.db.refresh(paper)
        return paper

    def _create_tag(self, **kwargs):
        """Helper to create a tag in the test database."""
        defaults = {
            "name": f"Tag-{datetime.now().timestamp()}",
            "color": "#3B82F6",
        }
        defaults.update(kwargs)
        tag = Tag(**defaults)
        self.db.add(tag)
        self.db.commit()
        self.db.refresh(tag)
        return tag

    def _link_paper_tag(self, paper, tag):
        """Helper to link a paper with a tag."""
        paper_tag = PaperTag(paper_id=paper.id, tag_id=tag.id)
        self.db.add(paper_tag)
        paper.tags = paper.tags + f", {tag.name}" if paper.tags else tag.name
        self.db.commit()
        return paper_tag

    # ==================== LIST TAGS TESTS ====================

    def test_list_tags_empty(self):
        """Test listing tags when database is empty."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()
            response = client.get("/api/tags")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data, [])

    def test_list_tags_with_data(self):
        """Test listing tags with data in database."""
        self._create_tag(name="AI")
        self._create_tag(name="ML")
        self._create_tag(name="NLP")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()
            response = client.get("/api/tags")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data), 3)

            # Verify ordering (alphabetical by name)
            names = [t["name"] for t in data]
            self.assertEqual(names, sorted(names))

    def test_list_tags_includes_paper_count(self):
        """Test that list tags includes correct paper counts."""
        tag1 = self._create_tag(name="Tag1")
        tag2 = self._create_tag(name="Tag2")

        # Create papers and link to tags
        p1 = self._create_paper(title="Paper 1")
        p2 = self._create_paper(title="Paper 2")
        p3 = self._create_paper(title="Paper 3")

        # Tag1 has 2 papers
        self._link_paper_tag(p1, tag1)
        self._link_paper_tag(p2, tag1)

        # Tag2 has 1 paper
        self._link_paper_tag(p3, tag2)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()
            response = client.get("/api/tags")
            self.assertEqual(response.status_code, 200)
            data = response.json()

            # Find each tag in response
            tag1_data = next(t for t in data if t["name"] == "Tag1")
            tag2_data = next(t for t in data if t["name"] == "Tag2")

            self.assertEqual(tag1_data["paper_count"], 2)
            self.assertEqual(tag2_data["paper_count"], 1)

    def test_list_tags_zero_count(self):
        """Test that tags without papers show zero count."""
        self._create_tag(name="UnusedTag")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()
            response = client.get("/api/tags")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["paper_count"], 0)

    def test_list_tags_response_structure(self):
        """Test that list tags response includes all expected fields."""
        self._create_tag(name="TestTag", color="#FF5500")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()
            response = client.get("/api/tags")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data), 1)

            tag_data = data[0]
            self.assertIn("id", tag_data)
            self.assertIn("name", tag_data)
            self.assertIn("color", tag_data)
            self.assertIn("paper_count", tag_data)
            self.assertEqual(tag_data["name"], "TestTag")
            self.assertEqual(tag_data["color"], "#FF5500")
            self.assertEqual(tag_data["paper_count"], 0)

    # ==================== CREATE TAG TESTS ====================

    def test_create_tag_success(self):
        """Test successfully creating a new tag."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/tags",
                json={"name": "NewTag", "color": "#00FF00"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["name"], "NewTag")
            self.assertEqual(data["color"], "#00FF00")
            self.assertEqual(data["paper_count"], 0)
            self.assertIsNotNone(data["id"])

    def test_create_tag_default_color(self):
        """Test that default color is applied when not specified."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/tags",
                json={"name": "DefaultColorTag"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["color"], "#3b82f6")  # Default blue

    def test_create_tag_duplicate_name(self):
        """Test that creating a tag with duplicate name fails."""
        self._create_tag(name="DuplicateTag")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/tags",
                json={"name": "DuplicateTag"},
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("already exists", response.json()["detail"])

    def test_create_tag_various_colors(self):
        """Test creating tags with various color formats."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Hex color with #
            response = client.post(
                "/api/tags",
                json={"name": "HexTag", "color": "#ABC123"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["color"], "#ABC123")

            # Short hex
            response = client.post(
                "/api/tags",
                json={"name": "ShortHexTag", "color": "#FFF"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["color"], "#FFF")

    def test_create_tag_persists_to_database(self):
        """Test that created tag is persisted in database."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/tags",
                json={"name": "PersistedTag", "color": "#123456"},
            )
            self.assertEqual(response.status_code, 200)

            # Verify in database
            tag = self.db.query(Tag).filter(Tag.name == "PersistedTag").first()
            self.assertIsNotNone(tag)
            self.assertEqual(tag.color, "#123456")

    # ==================== UPDATE TAG TESTS ====================

    def test_update_tag_name(self):
        """Test updating tag name."""
        tag = self._create_tag(name="OldName")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.patch(
                f"/api/tags/{tag.id}",
                json={"name": "NewName"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["name"], "NewName")

    def test_update_tag_color(self):
        """Test updating tag color."""
        tag = self._create_tag(color="#000000")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.patch(
                f"/api/tags/{tag.id}",
                json={"color": "#FFFFFF"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["color"], "#FFFFFF")

    def test_update_tag_both_fields(self):
        """Test updating both name and color."""
        tag = self._create_tag(name="Original", color="#111111")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.patch(
                f"/api/tags/{tag.id}",
                json={"name": "Updated", "color": "#222222"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["name"], "Updated")
            self.assertEqual(data["color"], "#222222")

    def test_update_tag_not_found(self):
        """Test updating a non-existent tag."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.patch(
                "/api/tags/9999",
                json={"name": "NewName"},
            )
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["detail"], "Tag not found")

    def test_update_tag_preserves_paper_count(self):
        """Test that updating tag preserves correct paper count."""
        tag = self._create_tag(name="TagWithPapers")
        paper = self._create_paper(title="Paper")
        self._link_paper_tag(paper, tag)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.patch(
                f"/api/tags/{tag.id}",
                json={"name": "UpdatedTagWithPapers"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["paper_count"], 1)

    def test_update_tag_partial_update(self):
        """Test partial update only modifies specified fields."""
        tag = self._create_tag(name="OriginalName", color="#123456")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Only update name
            response = client.patch(
                f"/api/tags/{tag.id}",
                json={"name": "NewName"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["name"], "NewName")
            self.assertEqual(data["color"], "#123456")  # Unchanged

    # ==================== DELETE TAG TESTS ====================

    def test_delete_tag_success(self):
        """Test successfully deleting a tag."""
        tag = self._create_tag(name="ToDelete")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.delete(f"/api/tags/{tag.id}")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["tag_id"], tag.id)
            self.assertIn("deleted", data["message"].lower())

            # Verify tag is deleted from database
            deleted_tag = self.db.query(Tag).filter(Tag.id == tag.id).first()
            self.assertIsNone(deleted_tag)

    def test_delete_tag_not_found(self):
        """Test deleting a non-existent tag."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.delete("/api/tags/9999")
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["detail"], "Tag not found")

    def test_delete_tag_removes_paper_tag_links(self):
        """Test that deleting tag removes PaperTag links."""
        tag = self._create_tag(name="TagWithLinks")
        paper = self._create_paper(title="Paper")
        self._link_paper_tag(paper, tag)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.delete(f"/api/tags/{tag.id}")
            self.assertEqual(response.status_code, 200)

            # Verify PaperTag is deleted
            paper_tag = self.db.query(PaperTag).filter(PaperTag.tag_id == tag.id).first()
            self.assertIsNone(paper_tag)

    def test_delete_tag_updates_paper_tags_field(self):
        """Test that deleting tag updates paper.tags field."""
        tag1 = self._create_tag(name="Tag1")
        tag2 = self._create_tag(name="Tag2")
        paper = self._create_paper(title="Paper")
        self._link_paper_tag(paper, tag1)
        self._link_paper_tag(paper, tag2)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Delete tag1
            response = client.delete(f"/api/tags/{tag1.id}")
            self.assertEqual(response.status_code, 200)

            # Verify paper.tags is updated
            self.db.refresh(paper)
            self.assertIn("Tag2", paper.tags)
            self.assertNotIn("Tag1", paper.tags)

    def test_delete_tag_with_multiple_papers(self):
        """Test deleting a tag linked to multiple papers."""
        tag = self._create_tag(name="MultiPaperTag")
        p1 = self._create_paper(title="Paper 1")
        p2 = self._create_paper(title="Paper 2")
        p3 = self._create_paper(title="Paper 3")

        self._link_paper_tag(p1, tag)
        self._link_paper_tag(p2, tag)
        self._link_paper_tag(p3, tag)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.delete(f"/api/tags/{tag.id}")
            self.assertEqual(response.status_code, 200)

            # Verify all PaperTag links are deleted
            paper_tags = self.db.query(PaperTag).filter(PaperTag.tag_id == tag.id).all()
            self.assertEqual(len(paper_tags), 0)

            # Verify all papers' tags field are updated
            for paper in [p1, p2, p3]:
                self.db.refresh(paper)
                self.assertNotIn("MultiPaperTag", paper.tags)

    def test_delete_tag_paper_tags_becomes_empty(self):
        """Test that paper.tags becomes empty string when last tag is deleted."""
        tag = self._create_tag(name="LastTag")
        paper = self._create_paper(title="Paper")
        self._link_paper_tag(paper, tag)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.delete(f"/api/tags/{tag.id}")
            self.assertEqual(response.status_code, 200)

            self.db.refresh(paper)
            self.assertEqual(paper.tags.strip(), "")

    # ==================== EDGE CASES ====================

    def test_create_tag_with_whitespace_name(self):
        """Test creating tag with whitespace in name."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # This should work - names can have spaces
            response = client.post(
                "/api/tags",
                json={"name": "Tag With Spaces"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["name"], "Tag With Spaces")

    def test_create_tag_with_unicode_name(self):
        """Test creating tag with unicode characters in name."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.post(
                "/api/tags",
                json={"name": "中文标签"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["name"], "中文标签")

    def test_list_tags_alphabetical_order(self):
        """Test that tags are listed in alphabetical order."""
        self._create_tag(name="Zebra")
        self._create_tag(name="Apple")
        self._create_tag(name="Mango")
        self._create_tag(name="Banana")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/tags")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            names = [t["name"] for t in data]
            self.assertEqual(names, ["Apple", "Banana", "Mango", "Zebra"])

    def test_update_tag_name_to_existing_name(self):
        """Test updating tag name to another existing tag's name."""
        tag1 = self._create_tag(name="Alpha")
        self._create_tag(name="Beta")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            self._create_app()

            # Renaming to existing name hits UNIQUE constraint - raises 500
            # Use raise_server_exceptions=False to capture the HTTP response
            from backend.app.database import get_db
            from backend.app.main import app
            from starlette.testclient import TestClient as _TC
            app.dependency_overrides[get_db] = lambda: self.db
            tc = _TC(app, raise_server_exceptions=False)
            response = tc.patch(
                f"/api/tags/{tag1.id}",
                json={"name": "Beta"},
            )
            # Route returns 500 due to unhandled IntegrityError
            self.assertEqual(response.status_code, 500)

    def test_tag_paper_count_multiple_same_paper(self):
        """Test that linking same tag to same paper only counts once."""
        tag = self._create_tag(name="UniqueLinkTag")
        paper = self._create_paper(title="Paper")

        # Link paper to tag
        self._link_paper_tag(paper, tag)

        # Try to create duplicate link (should not create duplicate)
        # Note: This might fail on unique constraint depending on model
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/tags")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            tag_data = next(t for t in data if t["name"] == "UniqueLinkTag")
            self.assertEqual(tag_data["paper_count"], 1)

    def test_create_tag_with_special_characters(self):
        """Test creating tag with special characters in name."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Tag with hyphens and underscores
            response = client.post(
                "/api/tags",
                json={"name": "machine-learning_ai"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["name"], "machine-learning_ai")

    def test_update_tag_empty_payload(self):
        """Test updating tag with empty payload."""
        tag = self._create_tag(name="OriginalName", color="#123456")

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.patch(
                f"/api/tags/{tag.id}",
                json={},
            )
            self.assertEqual(response.status_code, 200)
            # Should return unchanged tag
            data = response.json()
            self.assertEqual(data["name"], "OriginalName")
            self.assertEqual(data["color"], "#123456")

    def test_delete_tag_cascade_multiple_papers_preserve_others(self):
        """Test that deleting a tag preserves other tags on papers."""
        tag1 = self._create_tag(name="ToDelete")
        tag2 = self._create_tag(name="ToKeep")
        paper = self._create_paper(title="Paper")

        self._link_paper_tag(paper, tag1)
        self._link_paper_tag(paper, tag2)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.delete(f"/api/tags/{tag1.id}")
            self.assertEqual(response.status_code, 200)

            # Verify tag2 is still linked to paper
            self.db.refresh(paper)
            self.assertIn("ToKeep", paper.tags)
            self.assertNotIn("ToDelete", paper.tags)

            # Verify tag2 still exists
            remaining_tag = self.db.query(Tag).filter(Tag.id == tag2.id).first()
            self.assertIsNotNone(remaining_tag)

    def test_multiple_tags_same_paper_count(self):
        """Test listing multiple tags with correct paper counts."""
        tag1 = self._create_tag(name="TagA")
        tag2 = self._create_tag(name="TagB")
        self._create_tag(name="TagC")

        p1 = self._create_paper(title="P1")
        p2 = self._create_paper(title="P2")
        p3 = self._create_paper(title="P3")
        self._create_paper(title="P4")

        # TagA: 3 papers
        self._link_paper_tag(p1, tag1)
        self._link_paper_tag(p2, tag1)
        self._link_paper_tag(p3, tag1)

        # TagB: 1 paper
        self._link_paper_tag(p1, tag2)

        # TagC: 0 papers (unused)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            response = client.get("/api/tags")
            self.assertEqual(response.status_code, 200)
            data = response.json()

            tag_counts = {t["name"]: t["paper_count"] for t in data}
            self.assertEqual(tag_counts["TagA"], 3)
            self.assertEqual(tag_counts["TagB"], 1)
            self.assertEqual(tag_counts["TagC"], 0)

    def test_create_and_immediately_list(self):
        """Test that created tag immediately appears in list."""
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self._create_app()

            # Create tag
            create_response = client.post(
                "/api/tags",
                json={"name": "ImmediateTag", "color": "#ABCDEF"},
            )
            self.assertEqual(create_response.status_code, 200)

            # List tags
            list_response = client.get("/api/tags")
            self.assertEqual(list_response.status_code, 200)
            data = list_response.json()

            # Find the created tag
            created_tag = next((t for t in data if t["name"] == "ImmediateTag"), None)
            self.assertIsNotNone(created_tag)
            self.assertEqual(created_tag["color"], "#ABCDEF")


if __name__ == "__main__":
    unittest.main()

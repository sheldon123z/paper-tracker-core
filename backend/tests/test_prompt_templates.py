"""Comprehensive tests for prompt templates API."""

from __future__ import annotations

import unittest

import backend.tests  # noqa: F401
from backend.app.auth.dependencies import get_current_user
from backend.app.models import PromptTemplate
from backend.app.routes import prompt_templates as templates_module
from backend.tests.support import make_fake_user, make_test_session_factory
from fastapi import FastAPI
from fastapi.testclient import TestClient


class PromptTemplatesRouteTests(unittest.TestCase):
    """Tests for /api/prompt-templates endpoints."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(templates_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[templates_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(PromptTemplate.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    # -------------------------------------------------------------------------
    # GET /api/prompt-templates - List templates
    # -------------------------------------------------------------------------

    def test_list_templates_empty(self):
        """Test listing templates when database is empty."""
        response = self.client.get("/api/prompt-templates")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_list_templates_with_data(self):
        """Test listing templates with multiple entries."""
        with self.session_factory() as db:
            db.add(PromptTemplate(
                name="Template A",
                prompt_text="Text A",
                icon="chat",
                sort_order=2,
                is_builtin=False,
            ))
            db.add(PromptTemplate(
                name="Template B",
                prompt_text="Text B",
                icon="article",
                sort_order=1,
                is_builtin=True,
            ))
            db.commit()

        response = self.client.get("/api/prompt-templates")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)

        # Verify ordering by sort_order
        self.assertEqual(data[0]["name"], "Template B")  # sort_order=1
        self.assertEqual(data[1]["name"], "Template A")  # sort_order=2

    def test_list_templates_ordering_by_sort_order(self):
        """Test that templates are ordered by sort_order then id."""
        with self.session_factory() as db:
            db.add(PromptTemplate(
                name="Alpha",
                prompt_text="A text",
                icon="chat",
                sort_order=10,
                is_builtin=False,
            ))
            db.add(PromptTemplate(
                name="Beta",
                prompt_text="B text",
                icon="chat",
                sort_order=5,
                is_builtin=False,
            ))
            db.add(PromptTemplate(
                name="Gamma",
                prompt_text="C text",
                icon="chat",
                sort_order=1,
                is_builtin=False,
            ))
            db.commit()

        response = self.client.get("/api/prompt-templates")
        data = response.json()
        names = [t["name"] for t in data]
        self.assertEqual(names, ["Gamma", "Beta", "Alpha"])

    def test_list_templates_includes_all_fields(self):
        """Test that list response includes all expected fields."""
        with self.session_factory() as db:
            db.add(PromptTemplate(
                name="Test Template",
                prompt_text="Test prompt text",
                icon="star",
                sort_order=0,
                is_builtin=True,
            ))
            db.commit()

        response = self.client.get("/api/prompt-templates")
        data = response.json()[0]
        self.assertEqual(data["name"], "Test Template")
        self.assertEqual(data["prompt_text"], "Test prompt text")
        self.assertEqual(data["icon"], "star")
        self.assertEqual(data["sort_order"], 0)
        self.assertTrue(data["is_builtin"])
        self.assertIn("id", data)
        self.assertIn("created_at", data)

    # -------------------------------------------------------------------------
    # POST /api/prompt-templates - Create template
    # -------------------------------------------------------------------------

    def test_create_template_success(self):
        """Test creating a new template."""
        response = self.client.post(
            "/api/prompt-templates",
            json={
                "name": "My Template",
                "prompt_text": "Summarize: {title}",
                "icon": "article",
                "sort_order": 5,
                "is_builtin": False,
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "My Template")
        self.assertEqual(data["prompt_text"], "Summarize: {title}")
        self.assertEqual(data["icon"], "article")
        self.assertEqual(data["sort_order"], 5)
        self.assertFalse(data["is_builtin"])
        self.assertIn("id", data)

    def test_create_template_with_defaults(self):
        """Test creating template with default values."""
        response = self.client.post(
            "/api/prompt-templates",
            json={
                "name": "Minimal Template",
                "prompt_text": "Hello",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["icon"], "chat")  # default
        self.assertEqual(data["sort_order"], 0)  # default
        self.assertFalse(data["is_builtin"])  # default

    def test_create_multiple_templates(self):
        """Test creating multiple templates."""
        for i in range(3):
            response = self.client.post(
                "/api/prompt-templates",
                json={
                    "name": f"Template {i}",
                    "prompt_text": f"Text {i}",
                    "sort_order": i,
                },
            )
            self.assertEqual(response.status_code, 200)

        response = self.client.get("/api/prompt-templates")
        self.assertEqual(len(response.json()), 3)

    def test_create_template_with_various_icons(self):
        """Test creating templates with different icons."""
        icons = ["chat", "article", "lightbulb", "science", "link", "star"]
        for icon in icons:
            response = self.client.post(
                "/api/prompt-templates",
                json={
                    "name": f"Template with {icon}",
                    "prompt_text": "Test",
                    "icon": icon,
                },
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["icon"], icon)

    # -------------------------------------------------------------------------
    # PATCH /api/prompt-templates/{id} - Update template
    # -------------------------------------------------------------------------

    def test_update_template_name(self):
        """Test updating template name."""
        with self.session_factory() as db:
            template = PromptTemplate(
                name="Old Name",
                prompt_text="Text",
                icon="chat",
                sort_order=0,
                is_builtin=False,
            )
            db.add(template)
            db.commit()
            template_id = template.id

        response = self.client.patch(
            f"/api/prompt-templates/{template_id}",
            json={"name": "New Name"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "New Name")

    def test_update_template_prompt_text(self):
        """Test updating template prompt text."""
        with self.session_factory() as db:
            template = PromptTemplate(
                name="Test",
                prompt_text="Old text",
                icon="chat",
                sort_order=0,
                is_builtin=False,
            )
            db.add(template)
            db.commit()
            template_id = template.id

        response = self.client.patch(
            f"/api/prompt-templates/{template_id}",
            json={"prompt_text": "New prompt text with {title}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["prompt_text"], "New prompt text with {title}")

    def test_update_template_icon(self):
        """Test updating template icon."""
        with self.session_factory() as db:
            template = PromptTemplate(
                name="Test",
                prompt_text="Text",
                icon="chat",
                sort_order=0,
                is_builtin=False,
            )
            db.add(template)
            db.commit()
            template_id = template.id

        response = self.client.patch(
            f"/api/prompt-templates/{template_id}",
            json={"icon": "star"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["icon"], "star")

    def test_update_template_sort_order(self):
        """Test updating template sort order."""
        with self.session_factory() as db:
            template = PromptTemplate(
                name="Test",
                prompt_text="Text",
                icon="chat",
                sort_order=0,
                is_builtin=False,
            )
            db.add(template)
            db.commit()
            template_id = template.id

        response = self.client.patch(
            f"/api/prompt-templates/{template_id}",
            json={"sort_order": 100},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["sort_order"], 100)

    def test_update_template_multiple_fields(self):
        """Test updating multiple fields at once."""
        with self.session_factory() as db:
            template = PromptTemplate(
                name="Old",
                prompt_text="Old text",
                icon="chat",
                sort_order=0,
                is_builtin=False,
            )
            db.add(template)
            db.commit()
            template_id = template.id

        response = self.client.patch(
            f"/api/prompt-templates/{template_id}",
            json={
                "name": "New",
                "prompt_text": "New text",
                "icon": "article",
                "sort_order": 50,
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "New")
        self.assertEqual(data["prompt_text"], "New text")
        self.assertEqual(data["icon"], "article")
        self.assertEqual(data["sort_order"], 50)

    def test_update_template_not_found(self):
        """Test updating a non-existent template."""
        response = self.client.patch(
            "/api/prompt-templates/99999",
            json={"name": "New Name"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.json()["detail"])

    def test_update_template_partial_update(self):
        """Test that partial updates only modify specified fields."""
        with self.session_factory() as db:
            template = PromptTemplate(
                name="Original",
                prompt_text="Original text",
                icon="chat",
                sort_order=10,
                is_builtin=False,
            )
            db.add(template)
            db.commit()
            template_id = template.id

        # Only update name, other fields should remain
        response = self.client.patch(
            f"/api/prompt-templates/{template_id}",
            json={"name": "Updated"},
        )
        data = response.json()
        self.assertEqual(data["name"], "Updated")
        self.assertEqual(data["prompt_text"], "Original text")
        self.assertEqual(data["icon"], "chat")
        self.assertEqual(data["sort_order"], 10)

    # -------------------------------------------------------------------------
    # DELETE /api/prompt-templates/{id} - Delete template
    # -------------------------------------------------------------------------

    def test_delete_template_success(self):
        """Test deleting a custom template."""
        with self.session_factory() as db:
            template = PromptTemplate(
                name="To Delete",
                prompt_text="Text",
                icon="chat",
                sort_order=0,
                is_builtin=False,
            )
            db.add(template)
            db.commit()
            template_id = template.id

        response = self.client.delete(f"/api/prompt-templates/{template_id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("deleted", data["message"])
        self.assertEqual(data["template_id"], template_id)

        # Verify it's gone
        list_response = self.client.get("/api/prompt-templates")
        self.assertEqual(len(list_response.json()), 0)

    def test_delete_template_not_found(self):
        """Test deleting a non-existent template."""
        response = self.client.delete("/api/prompt-templates/99999")
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.json()["detail"])

    def test_delete_builtin_protected(self):
        """Test that builtin templates cannot be deleted."""
        with self.session_factory() as db:
            template = PromptTemplate(
                name="Builtin Template",
                prompt_text="Cannot delete",
                icon="chat",
                sort_order=0,
                is_builtin=True,
            )
            db.add(template)
            db.commit()
            template_id = template.id

        response = self.client.delete(f"/api/prompt-templates/{template_id}")
        self.assertEqual(response.status_code, 403)
        self.assertIn("builtin", response.json()["detail"].lower())

        # Verify it still exists
        list_response = self.client.get("/api/prompt-templates")
        self.assertEqual(len(list_response.json()), 1)

    def test_delete_one_of_many(self):
        """Test deleting one template among many."""
        with self.session_factory() as db:
            for i in range(3):
                db.add(PromptTemplate(
                    name=f"Template {i}",
                    prompt_text=f"Text {i}",
                    icon="chat",
                    sort_order=i,
                    is_builtin=False,
                ))
            db.commit()

        templates = self.client.get("/api/prompt-templates").json()
        middle_id = templates[1]["id"]

        response = self.client.delete(f"/api/prompt-templates/{middle_id}")
        self.assertEqual(response.status_code, 200)

        remaining = self.client.get("/api/prompt-templates").json()
        self.assertEqual(len(remaining), 2)
        remaining_names = [t["name"] for t in remaining]
        self.assertNotIn("Template 1", remaining_names)


class PromptTemplatesIntegrationTests(unittest.TestCase):
    """Integration tests for prompt templates workflow."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(templates_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[templates_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(PromptTemplate.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def test_full_template_lifecycle(self):
        """Test complete lifecycle: create -> read -> update -> delete."""
        # Create
        create_response = self.client.post(
            "/api/prompt-templates",
            json={
                "name": "Lifecycle Template",
                "prompt_text": "Original text",
                "icon": "chat",
                "sort_order": 0,
            },
        )
        self.assertEqual(create_response.status_code, 200)
        template_id = create_response.json()["id"]

        # Read
        list_response = self.client.get("/api/prompt-templates")
        self.assertEqual(len(list_response.json()), 1)
        self.assertEqual(list_response.json()[0]["id"], template_id)

        # Update
        update_response = self.client.patch(
            f"/api/prompt-templates/{template_id}",
            json={
                "name": "Updated Name",
                "prompt_text": "Updated text",
            },
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["name"], "Updated Name")

        # Delete
        delete_response = self.client.delete(f"/api/prompt-templates/{template_id}")
        self.assertEqual(delete_response.status_code, 200)

        # Verify empty
        final_list = self.client.get("/api/prompt-templates")
        self.assertEqual(len(final_list.json()), 0)

    def test_builtin_can_be_updated_but_not_deleted(self):
        """Test that builtin templates can be updated but not deleted."""
        with self.session_factory() as db:
            template = PromptTemplate(
                name="Builtin",
                prompt_text="Original",
                icon="chat",
                sort_order=0,
                is_builtin=True,
            )
            db.add(template)
            db.commit()
            template_id = template.id

        # Should be able to update
        update_response = self.client.patch(
            f"/api/prompt-templates/{template_id}",
            json={"prompt_text": "Modified"},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["prompt_text"], "Modified")

        # Should NOT be able to delete
        delete_response = self.client.delete(f"/api/prompt-templates/{template_id}")
        self.assertEqual(delete_response.status_code, 403)

    def test_sort_order_changes_reflect_in_list(self):
        """Test that changing sort_order affects list ordering."""
        # Create templates with initial order
        ids = []
        for i, name in enumerate(["First", "Second", "Third"]):
            response = self.client.post(
                "/api/prompt-templates",
                json={"name": name, "prompt_text": "Text", "sort_order": i},
            )
            ids.append(response.json()["id"])

        # Verify initial order
        templates = self.client.get("/api/prompt-templates").json()
        self.assertEqual([t["name"] for t in templates], ["First", "Second", "Third"])

        # Change Third to have lowest sort_order
        self.client.patch(f"/api/prompt-templates/{ids[2]}", json={"sort_order": -1})

        # Verify new order
        templates = self.client.get("/api/prompt-templates").json()
        self.assertEqual([t["name"] for t in templates], ["Third", "First", "Second"])

    def test_complex_prompt_text_with_placeholders(self):
        """Test templates with complex placeholder syntax."""
        complex_text = """
        Please analyze the following paper:
        Title: {title}
        Abstract: {abstract}

        Focus on:
        1. Main contributions
        2. Methodology
        3. Key findings
        """

        response = self.client.post(
            "/api/prompt-templates",
            json={
                "name": "Complex Template",
                "prompt_text": complex_text,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("{title}", response.json()["prompt_text"])
        self.assertIn("{abstract}", response.json()["prompt_text"])


if __name__ == "__main__":
    unittest.main()

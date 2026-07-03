"""Comprehensive tests for system prompts API."""

from __future__ import annotations

import unittest
from unittest.mock import patch

import backend.tests  # noqa: F401
from backend.app.auth.dependencies import get_current_user
from backend.app.models import SystemPromptConfig
from backend.app.routes import system_prompts as system_prompts_module
from backend.tests.support import make_fake_user, make_test_session_factory
from fastapi import FastAPI
from fastapi.testclient import TestClient


class SystemPromptsRouteTests(unittest.TestCase):
    """Tests for /api/system-prompts endpoints."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(system_prompts_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[system_prompts_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(SystemPromptConfig.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def _seed_prompt_configs(self):
        """Seed standard prompt configs for testing."""
        with self.session_factory() as db:
            db.add(SystemPromptConfig(
                prompt_type="paper",
                name="Paper Agent",
                prompt_text="You are a paper analysis agent.",
                is_active=True,
            ))
            db.add(SystemPromptConfig(
                prompt_type="global",
                name="Global Agent",
                prompt_text="You are a global research agent.",
                is_active=True,
            ))
            db.add(SystemPromptConfig(
                prompt_type="assistant",
                name="Assistant Agent",
                prompt_text="You are a helpful assistant.",
                is_active=True,
            ))
            db.commit()

    # -------------------------------------------------------------------------
    # GET /api/system-prompts - List configs
    # -------------------------------------------------------------------------

    def test_list_configs_empty(self):
        """Test listing configs when database is empty."""
        response = self.client.get("/api/system-prompts")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_list_configs_with_data(self):
        """Test listing all system prompt configs."""
        self._seed_prompt_configs()

        response = self.client.get("/api/system-prompts")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 3)

        # Verify ordering by prompt_type
        types = [c["prompt_type"] for c in data]
        self.assertEqual(sorted(types), types)

    def test_list_configs_includes_all_fields(self):
        """Test that list response includes all expected fields."""
        with self.session_factory() as db:
            db.add(SystemPromptConfig(
                prompt_type="paper",
                name="Test Agent",
                prompt_text="Test prompt",
                is_active=True,
            ))
            db.commit()

        response = self.client.get("/api/system-prompts")
        data = response.json()[0]
        self.assertEqual(data["prompt_type"], "paper")
        self.assertEqual(data["name"], "Test Agent")
        self.assertEqual(data["prompt_text"], "Test prompt")
        self.assertTrue(data["is_active"])
        self.assertIn("id", data)

    # -------------------------------------------------------------------------
    # PATCH /api/system-prompts/{prompt_type} - Update prompt
    # -------------------------------------------------------------------------

    def test_update_paper_prompt_text(self):
        """Test updating paper agent prompt text."""
        self._seed_prompt_configs()

        with patch.object(system_prompts_module, 'clear_prompt_cache') as mock_clear:
            response = self.client.patch(
                "/api/system-prompts/paper",
                json={"prompt_text": "New paper prompt text"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["prompt_text"], "New paper prompt text")
        mock_clear.assert_called_once_with("paper")

    def test_update_global_prompt_text(self):
        """Test updating global agent prompt text."""
        self._seed_prompt_configs()

        with patch.object(system_prompts_module, 'clear_prompt_cache') as mock_clear:
            response = self.client.patch(
                "/api/system-prompts/global",
                json={"prompt_text": "New global prompt text"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["prompt_text"], "New global prompt text")
        mock_clear.assert_called_once_with("global")

    def test_update_assistant_prompt_text(self):
        """Test updating assistant agent prompt text."""
        self._seed_prompt_configs()

        with patch.object(system_prompts_module, 'clear_prompt_cache') as mock_clear:
            response = self.client.patch(
                "/api/system-prompts/assistant",
                json={"prompt_text": "New assistant prompt text"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["prompt_text"], "New assistant prompt text")
        mock_clear.assert_called_once_with("assistant")

    def test_update_prompt_name(self):
        """Test updating prompt name."""
        self._seed_prompt_configs()

        response = self.client.patch(
            "/api/system-prompts/paper",
            json={"name": "Renamed Paper Agent"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Renamed Paper Agent")

    def test_update_prompt_is_active(self):
        """Test updating is_active flag."""
        self._seed_prompt_configs()

        response = self.client.patch(
            "/api/system-prompts/paper",
            json={"is_active": False},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

    def test_update_prompt_multiple_fields(self):
        """Test updating multiple fields at once."""
        self._seed_prompt_configs()

        response = self.client.patch(
            "/api/system-prompts/global",
            json={
                "name": "Updated Global",
                "prompt_text": "Updated text",
                "is_active": False,
            },
        )
        data = response.json()
        self.assertEqual(data["name"], "Updated Global")
        self.assertEqual(data["prompt_text"], "Updated text")
        self.assertFalse(data["is_active"])

    def test_update_prompt_not_found(self):
        """Test updating a non-existent prompt type."""
        response = self.client.patch(
            "/api/system-prompts/nonexistent",
            json={"prompt_text": "Test"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.json()["detail"])

    def test_update_prompt_partial_update(self):
        """Test that partial updates only modify specified fields."""
        self._seed_prompt_configs()

        original_name = "Paper Agent"
        original_active = True

        response = self.client.patch(
            "/api/system-prompts/paper",
            json={"prompt_text": "Only this changes"},
        )
        data = response.json()
        self.assertEqual(data["prompt_text"], "Only this changes")
        self.assertEqual(data["name"], original_name)
        self.assertEqual(data["is_active"], original_active)

    def test_update_clears_cache(self):
        """Test that updating a prompt clears the cache."""
        self._seed_prompt_configs()

        with patch.object(system_prompts_module, 'clear_prompt_cache') as mock_clear:
            self.client.patch(
                "/api/system-prompts/paper",
                json={"prompt_text": "New text"},
            )
            mock_clear.assert_called_once_with("paper")

    # -------------------------------------------------------------------------
    # POST /api/system-prompts/{prompt_type}/reset - Reset to default
    # -------------------------------------------------------------------------

    def test_reset_paper_prompt(self):
        """Test resetting paper prompt to default."""
        self._seed_prompt_configs()

        with patch.object(system_prompts_module, 'clear_prompt_cache') as mock_clear:
            with patch.object(system_prompts_module, 'seed_system_prompt_by_type') as mock_seed:
                mock_seed.return_value = SystemPromptConfig(
                    id=1,
                    prompt_type="paper",
                    name="Paper Analysis Agent",
                    prompt_text="Default paper prompt",
                    is_active=True,
                )
                response = self.client.post("/api/system-prompts/paper/reset")

        self.assertEqual(response.status_code, 200)
        mock_seed.assert_called_once()
        mock_clear.assert_called_once_with("paper")

    def test_reset_global_prompt(self):
        """Test resetting global prompt to default."""
        self._seed_prompt_configs()

        with patch.object(system_prompts_module, 'clear_prompt_cache') as mock_clear:
            with patch.object(system_prompts_module, 'seed_system_prompt_by_type') as mock_seed:
                mock_seed.return_value = SystemPromptConfig(
                    id=2,
                    prompt_type="global",
                    name="Global Research Agent",
                    prompt_text="Default global prompt",
                    is_active=True,
                )
                response = self.client.post("/api/system-prompts/global/reset")

        self.assertEqual(response.status_code, 200)
        mock_seed.assert_called_once()
        mock_clear.assert_called_once_with("global")

    def test_reset_assistant_prompt(self):
        """Test resetting assistant prompt to default."""
        self._seed_prompt_configs()

        with patch.object(system_prompts_module, 'clear_prompt_cache') as mock_clear:
            with patch.object(system_prompts_module, 'seed_system_prompt_by_type') as mock_seed:
                mock_seed.return_value = SystemPromptConfig(
                    id=3,
                    prompt_type="assistant",
                    name="Assistant Agent",
                    prompt_text="Default assistant prompt",
                    is_active=True,
                )
                response = self.client.post("/api/system-prompts/assistant/reset")

        self.assertEqual(response.status_code, 200)
        mock_seed.assert_called_once()
        mock_clear.assert_called_once_with("assistant")

    def test_reset_unknown_prompt_type(self):
        """Test resetting an unknown prompt type returns 404."""
        with patch.object(system_prompts_module, 'seed_system_prompt_by_type') as mock_seed:
            mock_seed.return_value = None
            response = self.client.post("/api/system-prompts/unknown/reset")

        self.assertEqual(response.status_code, 404)
        self.assertIn("Unknown prompt type", response.json()["detail"])

    def test_reset_clears_cache(self):
        """Test that resetting a prompt clears the cache."""
        self._seed_prompt_configs()

        with patch.object(system_prompts_module, 'clear_prompt_cache') as mock_clear:
            with patch.object(system_prompts_module, 'seed_system_prompt_by_type') as mock_seed:
                mock_seed.return_value = SystemPromptConfig(
                    id=1,
                    prompt_type="paper",
                    name="Test",
                    prompt_text="Test",
                    is_active=True,
                )
                self.client.post("/api/system-prompts/paper/reset")
                mock_clear.assert_called_once_with("paper")


class SystemPromptsIntegrationTests(unittest.TestCase):
    """Integration tests for system prompts workflow."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(system_prompts_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[system_prompts_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(SystemPromptConfig.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def test_full_update_workflow(self):
        """Test complete workflow: list -> update -> verify."""
        # Seed initial data
        with self.session_factory() as db:
            db.add(SystemPromptConfig(
                prompt_type="paper",
                name="Original Name",
                prompt_text="Original text",
                is_active=True,
            ))
            db.commit()

        # List and verify
        response = self.client.get("/api/system-prompts")
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["name"], "Original Name")

        # Update
        with patch.object(system_prompts_module, 'clear_prompt_cache'):
            update_response = self.client.patch(
                "/api/system-prompts/paper",
                json={
                    "name": "Updated Name",
                    "prompt_text": "Updated text",
                },
            )
        self.assertEqual(update_response.status_code, 200)

        # Verify changes persisted
        final_response = self.client.get("/api/system-prompts")
        data = final_response.json()[0]
        self.assertEqual(data["name"], "Updated Name")
        self.assertEqual(data["prompt_text"], "Updated text")

    def test_multiple_prompt_types_independent(self):
        """Test that updating one prompt type doesn't affect others."""
        # Seed all three types
        with self.session_factory() as db:
            for ptype in ["paper", "global", "assistant"]:
                db.add(SystemPromptConfig(
                    prompt_type=ptype,
                    name=f"{ptype} name",
                    prompt_text=f"{ptype} text",
                    is_active=True,
                ))
            db.commit()

        # Update only paper
        with patch.object(system_prompts_module, 'clear_prompt_cache'):
            self.client.patch(
                "/api/system-prompts/paper",
                json={"prompt_text": "Modified paper text"},
            )

        # Verify others unchanged
        response = self.client.get("/api/system-prompts")
        configs = {c["prompt_type"]: c for c in response.json()}

        self.assertEqual(configs["paper"]["prompt_text"], "Modified paper text")
        self.assertEqual(configs["global"]["prompt_text"], "global text")
        self.assertEqual(configs["assistant"]["prompt_text"], "assistant text")

    def test_deactivate_and_reactivate(self):
        """Test toggling is_active status."""
        with self.session_factory() as db:
            db.add(SystemPromptConfig(
                prompt_type="paper",
                name="Test",
                prompt_text="Test",
                is_active=True,
            ))
            db.commit()

        # Deactivate
        response = self.client.patch(
            "/api/system-prompts/paper",
            json={"is_active": False},
        )
        self.assertFalse(response.json()["is_active"])

        # Reactivate
        response = self.client.patch(
            "/api/system-prompts/paper",
            json={"is_active": True},
        )
        self.assertTrue(response.json()["is_active"])

    def test_complex_prompt_text_preserved(self):
        """Test that complex multi-line prompt text is preserved."""
        complex_text = """
        You are an academic research assistant.

        Your capabilities include:
        1. Analyzing papers
        2. Comparing methodologies
        3. Identifying trends

        Rules:
        - Always cite sources
        - Use markdown formatting
        - Be concise but thorough
        """

        with self.session_factory() as db:
            db.add(SystemPromptConfig(
                prompt_type="paper",
                name="Complex",
                prompt_text=complex_text,
                is_active=True,
            ))
            db.commit()

        # Retrieve and verify
        response = self.client.get("/api/system-prompts")
        self.assertEqual(response.json()[0]["prompt_text"], complex_text)

        # Update with new complex text
        new_complex_text = complex_text + "\n\nNew section added."
        with patch.object(system_prompts_module, 'clear_prompt_cache'):
            update_response = self.client.patch(
                "/api/system-prompts/paper",
                json={"prompt_text": new_complex_text},
            )
        self.assertEqual(update_response.json()["prompt_text"], new_complex_text)

    def test_unicode_and_special_chars_in_prompt(self):
        """Test that unicode and special characters are handled correctly."""
        unicode_text = "中文提示词：分析论文。Special chars: @#$%^&*()_+-=[]{}|;':\",./<>?"

        with self.session_factory() as db:
            db.add(SystemPromptConfig(
                prompt_type="paper",
                name="Unicode Test",
                prompt_text=unicode_text,
                is_active=True,
            ))
            db.commit()

        response = self.client.get("/api/system-prompts")
        self.assertEqual(response.json()[0]["prompt_text"], unicode_text)


class SystemPromptsEdgeCasesTests(unittest.TestCase):
    """Edge case tests for system prompts API."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(system_prompts_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[system_prompts_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(SystemPromptConfig.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def test_update_with_empty_prompt_text(self):
        """Test updating with empty prompt text (edge case)."""
        with self.session_factory() as db:
            db.add(SystemPromptConfig(
                prompt_type="paper",
                name="Test",
                prompt_text="Original",
                is_active=True,
            ))
            db.commit()

        response = self.client.patch(
            "/api/system-prompts/paper",
            json={"prompt_text": ""},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["prompt_text"], "")

    def test_update_with_very_long_prompt_text(self):
        """Test handling very long prompt text."""
        long_text = "x" * 10000  # 10k characters

        with self.session_factory() as db:
            db.add(SystemPromptConfig(
                prompt_type="paper",
                name="Test",
                prompt_text="Original",
                is_active=True,
            ))
            db.commit()

        response = self.client.patch(
            "/api/system-prompts/paper",
            json={"prompt_text": long_text},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["prompt_text"]), 10000)

    def test_update_case_sensitive_prompt_type(self):
        """Test that prompt_type is case sensitive."""
        with self.session_factory() as db:
            db.add(SystemPromptConfig(
                prompt_type="paper",
                name="Test",
                prompt_text="Test",
                is_active=True,
            ))
            db.commit()

        # Uppercase should not match
        response = self.client.patch(
            "/api/system-prompts/PAPER",
            json={"prompt_text": "New"},
        )
        self.assertEqual(response.status_code, 404)

    def test_concurrent_updates(self):
        """Test that concurrent updates to different types work."""
        with self.session_factory() as db:
            for ptype in ["paper", "global"]:
                db.add(SystemPromptConfig(
                    prompt_type=ptype,
                    name=ptype,
                    prompt_text=f"{ptype} text",
                    is_active=True,
                ))
            db.commit()

        # Update both in sequence
        with patch.object(system_prompts_module, 'clear_prompt_cache'):
            r1 = self.client.patch("/api/system-prompts/paper", json={"name": "P1"})
            r2 = self.client.patch("/api/system-prompts/global", json={"name": "P2"})

        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

import backend.tests  # noqa: F401
from backend.app.routes import llm_config as llm_config_module
from backend.tests.support import TEST_ENCRYPTION_KEY, make_test_session_factory, patched_env
from fastapi import FastAPI
from fastapi.testclient import TestClient


class LLMConfigRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(llm_config_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[llm_config_module.get_db] = override_get_db
        self.app.dependency_overrides[llm_config_module.require_llm_config_access] = lambda: None
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for model in reversed(llm_config_module.LLMConfig.metadata.sorted_tables):
                db.execute(model.delete())
            db.commit()

    def test_list_providers_returns_registry_metadata(self):
        response = self.client.get("/api/llm-configs/providers")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(any(item["key"] == "openrouter" for item in payload))
        openai_compatible = next(item for item in payload if item["key"] == "openai_compatible")
        self.assertTrue(openai_compatible["allows_custom_headers"])

    def test_create_config_and_brief_metadata(self):
        with patched_env(ENCRYPTION_KEY=TEST_ENCRYPTION_KEY):
            create_response = self.client.post(
                "/api/llm-configs",
                json={
                    "provider": "openrouter",
                    "display_name": "OR",
                    "api_key": "sk-test",
                    "model_name": "google/gemini-2.5-flash",
                    "is_default": True,
                    "is_enabled": True,
                    "extra_headers": {},
                    "extra_body": {},
                },
            )
        self.assertEqual(create_response.status_code, 200, create_response.text)
        created = create_response.json()
        self.assertEqual(created["provider"], "openrouter")
        self.assertEqual(created["extra_headers"], {})

        brief_response = self.client.get("/api/llm-configs/brief")
        self.assertEqual(brief_response.status_code, 200)
        brief = brief_response.json()
        self.assertEqual(len(brief), 1)
        self.assertEqual(brief[0]["provider"], "openrouter")
        self.assertTrue(brief[0]["supports_streaming"])

    def test_create_config_rejects_insecure_remote_base_url(self):
        with patched_env(ENCRYPTION_KEY=TEST_ENCRYPTION_KEY):
            response = self.client.post(
                "/api/llm-configs",
                json={
                    "provider": "openai",
                    "display_name": "Bad",
                    "api_key": "sk-test",
                    "model_name": "gpt-4o-mini",
                    "base_url": "http://api.openai.com/v1",
                    "is_default": False,
                    "is_enabled": True,
                    "extra_headers": {},
                    "extra_body": {},
                },
            )
        self.assertEqual(response.status_code, 400)
        self.assertIn("https", response.text.lower())

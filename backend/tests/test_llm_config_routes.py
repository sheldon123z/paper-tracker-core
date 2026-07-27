from __future__ import annotations

import unittest

import backend.tests  # noqa: F401
from backend.app.routes import llm_config as llm_config_module
from backend.tests.support import TEST_ENCRYPTION_KEY, make_test_session_factory, patched_env
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text


class LLMConfigRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        with self.session_factory() as db:
            db.execute(text("PRAGMA foreign_keys=ON"))

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

    def test_delete_config_preserves_usage_history_and_removes_bound_budget(self):
        with self.session_factory() as db:
            config = llm_config_module.LLMConfig(
                provider="openai",
                display_name="Disposable",
                api_key_encrypted="placeholder",
                model_name="gpt-test",
                is_enabled=True,
            )
            db.add(config)
            db.flush()
            config_id = config.id
            db.add(llm_config_module.LLMUsageLog(
                config_id=config_id,
                provider="openai",
                model_name="gpt-test",
                total_tokens=42,
            ))
            db.add(llm_config_module.LLMBudgetConfig(
                config_id=config_id,
                budget_type="tokens",
                monthly_limit=1000,
            ))
            db.commit()

        response = self.client.delete(f"/api/llm-configs/{config_id}")
        self.assertEqual(response.status_code, 200, response.text)

        with self.session_factory() as db:
            self.assertIsNone(db.get(llm_config_module.LLMConfig, config_id))
            self.assertEqual(
                db.query(llm_config_module.LLMBudgetConfig).filter_by(config_id=config_id).count(),
                0,
            )
            usage = db.query(llm_config_module.LLMUsageLog).one()
            self.assertIsNone(usage.config_id)
            self.assertEqual(usage.model_name, "gpt-test")

    def test_batch_delete_handles_config_references(self):
        with self.session_factory() as db:
            configs = [
                llm_config_module.LLMConfig(
                    provider="openai",
                    api_key_encrypted="placeholder",
                    model_name=f"batch-{index}",
                    is_enabled=True,
                )
                for index in range(2)
            ]
            db.add_all(configs)
            db.flush()
            config_ids = [config.id for config in configs]
            db.add(llm_config_module.LLMUsageLog(
                config_id=config_ids[0],
                provider="openai",
                model_name="batch-0",
            ))
            db.add(llm_config_module.LLMBudgetConfig(
                config_id=config_ids[1],
                budget_type="tokens",
                monthly_limit=500,
            ))
            db.commit()

        response = self.client.post(
            "/api/llm-configs/batch-action",
            json={"config_ids": config_ids, "action": "delete"},
        )
        self.assertEqual(response.status_code, 200, response.text)

        with self.session_factory() as db:
            self.assertEqual(db.query(llm_config_module.LLMConfig).count(), 0)
            self.assertEqual(db.query(llm_config_module.LLMBudgetConfig).count(), 0)
            self.assertIsNone(db.query(llm_config_module.LLMUsageLog).one().config_id)

    def test_replace_import_handles_config_references(self):
        with self.session_factory() as db:
            config = llm_config_module.LLMConfig(
                provider="openai",
                display_name="Old config",
                api_key_encrypted="placeholder",
                model_name="old-model",
                is_enabled=True,
            )
            db.add(config)
            db.flush()
            config_id = config.id
            db.add(llm_config_module.LLMUsageLog(
                config_id=config_id,
                provider="openai",
                model_name="old-model",
                total_tokens=42,
            ))
            db.add(llm_config_module.LLMBudgetConfig(
                config_id=config_id,
                budget_type="tokens",
                monthly_limit=1000,
            ))
            db.commit()

        with patched_env(ENCRYPTION_KEY=TEST_ENCRYPTION_KEY):
            response = self.client.post(
                "/api/llm-configs/import",
                json={
                    "mode": "replace",
                    "configs": [
                        {
                            "provider": "ollama",
                            "display_name": "Replacement",
                            "model_name": "qwen3:8b",
                            "is_enabled": True,
                        }
                    ],
                },
            )
        self.assertEqual(response.status_code, 200, response.text)

        with self.session_factory() as db:
            configs = db.query(llm_config_module.LLMConfig).all()
            self.assertEqual(len(configs), 1)
            self.assertEqual(configs[0].model_name, "qwen3:8b")
            self.assertEqual(db.query(llm_config_module.LLMBudgetConfig).count(), 0)
            usage = db.query(llm_config_module.LLMUsageLog).one()
            self.assertIsNone(usage.config_id)
            self.assertEqual(usage.model_name, "old-model")

from __future__ import annotations

import json
import unittest
from unittest.mock import patch

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
        with patched_env(
            ENCRYPTION_KEY=TEST_ENCRYPTION_KEY,
            ALLOW_LOCAL_LLM_BASE_URLS="true",
        ):
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

        with patched_env(
            ENCRYPTION_KEY=TEST_ENCRYPTION_KEY,
            ALLOW_LOCAL_LLM_BASE_URLS="true",
        ):
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

    def test_import_normalizes_metadata_and_rejects_hidden_credentials(self):
        with patched_env(ENCRYPTION_KEY=TEST_ENCRYPTION_KEY, OFFLINE_MODE="true"):
            response = self.client.post(
                "/api/llm-configs/import",
                json={
                    "mode": "merge",
                    "configs": [
                        {
                            "provider": "ollama",
                            "model_name": "qwen3:8b",
                            "base_url": "http://127.0.0.1:11434/v1",
                            "is_local": True,
                            "extra_body": {"max_tokens": 256},
                        }
                    ],
                },
            )
        self.assertEqual(response.status_code, 200, response.text)
        with self.session_factory() as db:
            config = db.query(llm_config_module.LLMConfig).one()
            self.assertEqual(config.base_url, "http://127.0.0.1:11434")
            self.assertEqual(config.extra_body, '{"max_tokens": 256}')

        with self.session_factory() as db:
            db.query(llm_config_module.LLMConfig).delete()
            db.commit()
        with patched_env(ENCRYPTION_KEY=TEST_ENCRYPTION_KEY, OFFLINE_MODE="true"):
            response = self.client.post(
                "/api/llm-configs/import",
                json={
                    "mode": "merge",
                    "configs": [
                        {
                            "provider": "ollama",
                            "model_name": "qwen3:8b",
                            "base_url": "http://127.0.0.1:11434",
                            "is_local": True,
                            "extra_body": {
                                "request": {"client_secret": "must-not-be-stored"}
                            },
                        }
                    ],
                },
            )
        self.assertEqual(response.status_code, 400, response.text)
        with self.session_factory() as db:
            self.assertEqual(db.query(llm_config_module.LLMConfig).count(), 0)

    def test_list_and_export_remove_legacy_metadata_credentials(self):
        with self.session_factory() as db:
            db.add(
                llm_config_module.LLMConfig(
                    provider="ollama",
                    display_name="Legacy",
                    api_key_encrypted="placeholder",
                    model_name="qwen3:8b",
                    base_url=(
                        "http://legacy-user:legacy-password@127.0.0.1:11434/v1"
                        "?api_key=legacy-query-secret#legacy-fragment"
                    ),
                    extra_headers=json.dumps(
                        {
                            "X-Trace-Id": "trace",
                            "X-Auth-Token": "header-secret",
                            "X-Token": "generic-header-secret",
                            "XApiKey": "camel-header-secret",
                        }
                    ),
                    extra_body=json.dumps(
                        {
                            "max_tokens": 256,
                            "nested": {
                                "password": "body-secret",
                                "access_token": "body-token",
                                "clientSecret": "camel-body-secret",
                                "safe": "visible",
                            },
                        }
                    ),
                    is_local=True,
                    is_default=False,
                    is_enabled=True,
                    health_status="unknown",
                )
            )
            db.commit()

        listed = self.client.get("/api/llm-configs")
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(
            listed.json()[0]["base_url"],
            "http://127.0.0.1:11434/v1",
        )
        self.assertEqual(listed.json()[0]["extra_headers"], {"X-Trace-Id": "trace"})
        self.assertEqual(
            listed.json()[0]["extra_body"],
            {"max_tokens": 256, "nested": {"safe": "visible"}},
        )

        exported = self.client.get("/api/llm-configs/export")
        self.assertEqual(exported.status_code, 200, exported.text)
        item = exported.json()["configs"][0]
        self.assertEqual(item["base_url"], "http://127.0.0.1:11434/v1")
        self.assertEqual(item["extra_headers"], {"X-Trace-Id": "trace"})
        self.assertEqual(
            item["extra_body"],
            {"max_tokens": 256, "nested": {"safe": "visible"}},
        )
        self.assertNotIn("legacy-", listed.text + exported.text)

    def test_batch_test_sanitizes_unexpected_provider_errors(self):
        with self.session_factory() as db:
            config = llm_config_module.LLMConfig(
                provider="ollama",
                display_name="Local",
                api_key_encrypted="placeholder",
                model_name="qwen3:8b",
                base_url="http://127.0.0.1:11434",
                is_local=True,
                is_default=False,
                is_enabled=True,
                health_status="unknown",
            )
            db.add(config)
            db.commit()
            config_id = config.id

        raw_error = "upstream echoed Bearer must-not-appear"
        with (
            patch.object(
                llm_config_module,
                "resolve_llm_config",
                side_effect=RuntimeError(raw_error),
            ),
            self.assertLogs("paper-tracker.llm_config", level="WARNING") as logs,
        ):
            response = self.client.post("/api/llm-configs/batch-test")

        self.assertEqual(response.status_code, 200, response.text)
        serialized = response.text + "\n".join(logs.output)
        self.assertNotIn("must-not-appear", serialized)
        result = response.json()["results"][0]
        self.assertEqual(result["error_code"], "RUNTIME_ERROR")
        self.assertEqual(result["message"], "Provider request failed.")

        with self.session_factory() as db:
            stored = db.get(llm_config_module.LLMConfig, config_id)
            self.assertEqual(stored.health_status, "runtime_error")
            self.assertEqual(stored.last_error, "Provider request failed.")

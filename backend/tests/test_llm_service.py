from __future__ import annotations

import unittest

import backend.tests  # noqa: F401
from backend.app.models import LLMConfig
from backend.app.services.llm_service import enrich_llm_config, normalize_config_payload
from backend.tests.support import patched_env


class LLMServiceTests(unittest.TestCase):
    def test_openrouter_defaults_are_runtime_only(self):
        payload = normalize_config_payload(
            "openrouter",
            None,
            "sk-test",
            model_name="google/gemini-2.5-flash",
            display_name="OpenRouter Test",
        )
        self.assertEqual(payload["provider"], "openrouter")
        self.assertEqual(payload["extra_headers"], {})
        self.assertEqual(payload["base_url"], "https://openrouter.ai/api/v1")

    def test_local_provider_marks_is_local(self):
        with patched_env(ALLOW_LOCAL_LLM_BASE_URLS="true"):
            payload = normalize_config_payload(
                "ollama",
                "http://127.0.0.1:11434/v1",
                None,
                model_name="qwen3:8b",
            )
        self.assertTrue(payload["is_local"])
        self.assertEqual(payload["base_url"], "http://127.0.0.1:11434")

    def test_enrich_llm_config_tolerates_invalid_json_metadata(self):
        config = LLMConfig(
            provider="openai",
            display_name="Broken Metadata",
            api_key_encrypted="encrypted",
            model_name="gpt-4o-mini",
            base_url="https://api.openai.com/v1",
            extra_headers='{"broken"',
            extra_body='["not-an-object"]',
            is_default=False,
            is_enabled=True,
            health_status="unknown",
        )
        enriched = enrich_llm_config(config)
        self.assertEqual(enriched["extra_headers"], {})
        self.assertEqual(enriched["extra_body"], {})

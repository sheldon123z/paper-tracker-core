from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import backend.tests  # noqa: F401
from backend.app.models import LLMConfig
from backend.app.services.llm_runtime import build_chat_llm
from backend.app.services.llm_service import (
    _resolve_config_values,
    enrich_llm_config,
    normalize_config_payload,
)
from backend.app.services.llm_service import (
    test_llm_connection as run_llm_connection_test,
)
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

    def test_enrich_legacy_invalid_url_does_not_log_or_return_raw_value(self):
        config = LLMConfig(
            provider="legacy-provider",
            display_name="Legacy",
            api_key_encrypted="encrypted",
            model_name="legacy-model",
            base_url="http://local-model:must-not-appear",
            is_default=False,
            is_enabled=True,
            health_status="unknown",
        )
        with self.assertLogs("paper-tracker.llm", level="WARNING") as logs:
            enriched = enrich_llm_config(config)

        self.assertIsNone(enriched["base_url"])
        self.assertIsNone(enriched["effective_base_url"])
        self.assertNotIn("must-not-appear", "\n".join(logs.output))

    def test_extra_body_cannot_override_validated_runtime_endpoint(self):
        with patched_env(OFFLINE_MODE="true"):
            resolved = _resolve_config_values(
                "ollama",
                "qwen3:8b",
                "http://127.0.0.1:11434",
                None,
                extra_body={
                    "base_url": "https://api.openai.com/v1",
                    "temperature": 0.25,
                },
                is_local=True,
            )
            self.assertEqual(resolved.api_base, "http://127.0.0.1:11434")
            self.assertEqual(
                resolved.model_kwargs,
                {
                    "extra_body": {
                        "base_url": "https://api.openai.com/v1",
                        "temperature": 0.25,
                    }
                },
            )

            with patch("backend.app.services.llm_runtime.ChatLiteLLM") as constructor:
                constructor.return_value = object()
                build_chat_llm(resolved, streaming=False)

        call = constructor.call_args
        self.assertEqual(call.kwargs["api_base"], "http://127.0.0.1:11434")
        self.assertNotIn("base_url", call.kwargs["model_kwargs"])
        self.assertEqual(
            call.kwargs["model_kwargs"]["extra_body"]["base_url"],
            "https://api.openai.com/v1",
        )

    def test_extra_body_rejects_nested_credentials_but_allows_token_limits(self):
        with patched_env(OFFLINE_MODE="true"):
            payload = normalize_config_payload(
                "ollama",
                "http://127.0.0.1:11434",
                None,
                model_name="qwen3:8b",
                extra_body={"max_tokens": 512},
                is_local=True,
            )
            self.assertEqual(payload["extra_body"], {"max_tokens": 512})

            for sensitive_body in (
                {"nested": {"x-auth-token": "secret"}},
                {"token": "secret"},
                {"access_token": "secret"},
                {"accessToken": "secret"},
                {"nested": {"clientSecret": "secret"}},
            ):
                with self.subTest(sensitive_body=sensitive_body):
                    with self.assertRaisesRegex(ValueError, "dedicated API key"):
                        normalize_config_payload(
                            "ollama",
                            "http://127.0.0.1:11434",
                            None,
                            model_name="qwen3:8b",
                            extra_body=sensitive_body,
                            is_local=True,
                        )

    def test_connection_failure_does_not_log_or_return_raw_provider_error(self):
        raw_error = "upstream rejected Authorization: Bearer must-not-appear"
        config = SimpleNamespace(provider_key="ollama", model_name="qwen3:8b")
        with (
            patch(
                "backend.app.services.llm_service.probe_llm",
                side_effect=RuntimeError(raw_error),
            ),
            self.assertLogs("paper-tracker.llm", level="WARNING") as logs,
        ):
            result = asyncio.run(run_llm_connection_test(config))

        self.assertFalse(result["success"])
        self.assertNotIn("must-not-appear", result["message"])
        self.assertNotIn("must-not-appear", "\n".join(logs.output))

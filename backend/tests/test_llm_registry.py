from __future__ import annotations

import socket
import unittest
from unittest.mock import patch

import backend.tests  # noqa: F401
from backend.app.services.llm_registry import (
    ProviderConfigError,
    ResolvedLLMConfig,
    normalize_base_url,
    validate_base_url,
    validate_extra_headers,
)
from backend.tests.support import patched_env


class LLMRegistryTests(unittest.TestCase):
    def test_resolved_config_state_excludes_cleartext_api_key(self):
        resolved = ResolvedLLMConfig(
            provider_key="ollama",
            display_name="Local",
            model_name="qwen3:8b",
            litellm_model="ollama/qwen3:8b",
            api_key="must-not-be-checkpointed",
            api_base="http://127.0.0.1:11434",
            extra_headers={},
            model_kwargs={},
            api_format="ollama",
            is_local=True,
            supports_streaming=True,
            supports_tool_calling=False,
            supports_reasoning=False,
            supports_vision=False,
        )

        self.assertNotIn("api_key", resolved.to_state())

    def test_normalize_known_provider_base_urls(self):
        self.assertEqual(
            normalize_base_url("moonshot", "https://api.moonshot.cn/v1/chat/completions"),
            "https://api.moonshot.cn/v1",
        )
        self.assertEqual(
            normalize_base_url("zhipu", "https://open.bigmodel.cn/api/paas/v4/chat/completions"),
            "https://open.bigmodel.cn/api/paas/v4",
        )
        self.assertEqual(
            normalize_base_url("openrouter", "https://openrouter.ai"),
            "https://openrouter.ai/api/v1",
        )

    def test_remote_provider_requires_https(self):
        with patch("backend.app.services.llm_registry.socket.getaddrinfo", side_effect=socket.gaierror()):
            self.assertEqual(
                validate_base_url("openai", "https://api.openai.com/v1", is_local=False),
                "https://api.openai.com/v1",
            )
            with self.assertRaises(ProviderConfigError) as ctx:
                validate_base_url("openai", "http://api.openai.com/v1", is_local=False)
        self.assertEqual(ctx.exception.code, "INVALID_BASE_URL")

    def test_local_provider_requires_explicit_opt_in(self):
        with patched_env(ALLOW_LOCAL_LLM_BASE_URLS="false"), self.assertRaises(ProviderConfigError) as ctx:
            validate_base_url("ollama", "http://127.0.0.1:11434/v1", is_local=True)
        self.assertEqual(ctx.exception.code, "SSRF_BLOCKED")

        with patched_env(ALLOW_LOCAL_LLM_BASE_URLS="true"):
            self.assertEqual(
                validate_base_url("ollama", "http://127.0.0.1:11434/v1", is_local=True),
                "http://127.0.0.1:11434",
            )

    def test_generic_openai_compatible_can_use_explicit_remote_allowlist(self):
        with patched_env(LLM_ALLOWED_REMOTE_HOSTS="proxy.example"):
            with patch("backend.app.services.llm_registry._has_private_or_link_local_ip", return_value=True):
                self.assertEqual(
                    validate_base_url("openai_compatible", "https://api.proxy.example/v1", is_local=False),
                    "https://api.proxy.example/v1",
                )

    def test_custom_headers_only_allowed_for_generic_provider(self):
        self.assertEqual(validate_extra_headers("openai_compatible", {"X-Test": "1"}), {"X-Test": "1"})
        with self.assertRaises(ProviderConfigError) as ctx:
            validate_extra_headers("openai", {"Authorization": "Bearer x"})
        self.assertEqual(ctx.exception.code, "FORBIDDEN_HEADER")

        for header in (
            "X-Token",
            "Access-Token",
            "Cookie",
            "XApiKey",
            "proxyAuthorization",
        ):
            with self.subTest(header=header), self.assertRaises(ProviderConfigError):
                validate_extra_headers(
                    "openai_compatible",
                    {header: "must-not-be-stored"},
                )

    def test_invalid_base_url_is_not_written_to_logs(self):
        secret_url = "not-a-url?access_token=must-not-appear"
        with self.assertLogs("paper-tracker.llm_registry", level="WARNING") as logs:
            with self.assertRaises(ProviderConfigError):
                validate_base_url("openai", secret_url, is_local=False)
        self.assertNotIn("must-not-appear", "\n".join(logs.output))

from __future__ import annotations

import socket
import unittest
from unittest.mock import patch

import backend.tests  # noqa: F401
from backend.app.services.llm_registry import (
    ProviderConfigError,
    normalize_base_url,
    validate_base_url,
    validate_extra_headers,
)
from backend.tests.support import patched_env


class LLMRegistryTests(unittest.TestCase):
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

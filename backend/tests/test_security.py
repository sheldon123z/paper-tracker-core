from __future__ import annotations

import types
import unittest

import backend.tests  # noqa: F401
from backend.app.security import require_llm_config_access
from backend.tests.support import patched_env
from fastapi import HTTPException


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.loopback_request = types.SimpleNamespace(client=types.SimpleNamespace(host="127.0.0.1"), cookies={})
        self.remote_request = types.SimpleNamespace(client=types.SimpleNamespace(host="203.0.113.10"), cookies={})

    def test_loopback_allowed_without_admin_token(self):
        with patched_env(LLM_CONFIG_ADMIN_TOKEN=None, LLM_CONFIG_TRUST_LOOPBACK_ONLY="true"):
            require_llm_config_access(self.loopback_request, authorization=None, x_llm_admin_token=None)

    def test_remote_rejected_without_token(self):
        with patched_env(LLM_CONFIG_ADMIN_TOKEN=None, LLM_CONFIG_TRUST_LAN="false"):
            with self.assertRaises(HTTPException) as ctx:
                require_llm_config_access(self.remote_request, authorization=None, x_llm_admin_token=None)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_bearer_or_header_token_grants_access(self):
        with patched_env(LLM_CONFIG_ADMIN_TOKEN="secret-token"):
            with self.assertRaises(HTTPException) as ctx:
                require_llm_config_access(self.remote_request, authorization=None, x_llm_admin_token=None)
            self.assertEqual(ctx.exception.status_code, 401)

            require_llm_config_access(
                self.remote_request,
                authorization="Bearer secret-token",
                x_llm_admin_token=None,
            )
            require_llm_config_access(
                self.remote_request,
                authorization=None,
                x_llm_admin_token="secret-token",
            )

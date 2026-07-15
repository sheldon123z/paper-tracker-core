from __future__ import annotations

import types
import unittest

import backend.tests  # noqa: F401
from backend.app.main import AGUI_MAX_BODY_SIZE, GENERAL_MAX_BODY_SIZE, is_upload_endpoint
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

    def test_pdf_import_routes_bypass_general_body_limit(self):
        self.assertTrue(is_upload_endpoint("/api/papers/import/pdf/analyze", "POST"))
        self.assertTrue(is_upload_endpoint("/api/papers/import/pdf/commit", "POST"))
        self.assertFalse(is_upload_endpoint("/api/papers/import/pdf/analyze", "GET"))
        self.assertFalse(is_upload_endpoint("/api/papers/import/pdf/other", "POST"))

    def test_agui_limit_does_not_override_general_body_limit(self):
        self.assertEqual(AGUI_MAX_BODY_SIZE, 1024 * 1024)
        self.assertEqual(GENERAL_MAX_BODY_SIZE, 10 * 1024 * 1024)

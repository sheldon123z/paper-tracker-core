from __future__ import annotations

import re
import types
import unittest

import backend.tests  # noqa: F401
from backend.app.main import (
    AGUI_MAX_BODY_SIZE,
    GENERAL_MAX_BODY_SIZE,
    LOOPBACK_CORS_ORIGIN_REGEX,
    PDF_IMPORT_MAX_BODY_SIZE,
    PDF_IMPORT_MULTIPART_OVERHEAD,
    is_pdf_import_endpoint,
    is_upload_endpoint,
    resolve_cors_policy,
)
from backend.app.security import (
    require_llm_config_access,
    require_llm_config_manager_access,
)
from backend.app.services.file_storage import MAX_FILE_SIZE
from backend.tests.support import patched_env
from fastapi import HTTPException


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.loopback_request = types.SimpleNamespace(client=types.SimpleNamespace(host="127.0.0.1"), cookies={})
        self.proxy_request = types.SimpleNamespace(client=types.SimpleNamespace(host="172.18.0.2"), cookies={})
        self.remote_request = types.SimpleNamespace(client=types.SimpleNamespace(host="203.0.113.10"), cookies={})

    def test_loopback_is_rejected_without_explicit_development_mode(self):
        with patched_env(
            LLM_CONFIG_ADMIN_TOKEN=None,
            LLM_CONFIG_TRUST_LAN="true",
            PAPER_TRACKER_DEV_MODE=None,
        ):
            with self.assertRaises(HTTPException) as ctx:
                require_llm_config_access(
                    self.loopback_request,
                    authorization=None,
                    x_llm_admin_token=None,
                    authenticated_user=None,
                )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_loopback_and_lan_fallback_require_explicit_non_offline_development_mode(self):
        with patched_env(
            LLM_CONFIG_ADMIN_TOKEN=None,
            PAPER_TRACKER_DEV_MODE="true",
            OFFLINE_MODE=None,
        ):
            require_llm_config_access(
                self.loopback_request,
                authorization=None,
                x_llm_admin_token=None,
                authenticated_user=None,
            )
            require_llm_config_access(
                self.proxy_request,
                authorization=None,
                x_llm_admin_token=None,
                authenticated_user=None,
            )

        with patched_env(
            LLM_CONFIG_ADMIN_TOKEN=None,
            PAPER_TRACKER_DEV_MODE="true",
            OFFLINE_MODE="true",
        ):
            with self.assertRaises(HTTPException):
                require_llm_config_access(
                    self.loopback_request,
                    authorization=None,
                    x_llm_admin_token=None,
                    authenticated_user=None,
                )

    def test_private_reverse_proxy_address_does_not_bypass_authentication(self):
        with patched_env(
            LLM_CONFIG_ADMIN_TOKEN=None,
            LLM_CONFIG_TRUST_LAN="true",
            PAPER_TRACKER_DEV_MODE=None,
        ):
            with self.assertRaises(HTTPException) as ctx:
                require_llm_config_access(
                    self.proxy_request,
                    authorization=None,
                    x_llm_admin_token=None,
                    authenticated_user=None,
                )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_remote_rejected_without_token(self):
        with patched_env(LLM_CONFIG_ADMIN_TOKEN=None, LLM_CONFIG_TRUST_LAN="false"):
            with self.assertRaises(HTTPException) as ctx:
                require_llm_config_access(
                    self.remote_request,
                    authorization=None,
                    x_llm_admin_token=None,
                    authenticated_user=None,
                )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_bearer_or_header_token_grants_access(self):
        with patched_env(LLM_CONFIG_ADMIN_TOKEN="secret-token"):
            with self.assertRaises(HTTPException) as ctx:
                require_llm_config_access(
                    self.remote_request,
                    authorization=None,
                    x_llm_admin_token=None,
                    authenticated_user=None,
                )
            self.assertEqual(ctx.exception.status_code, 401)

            require_llm_config_access(
                self.remote_request,
                authorization="Bearer secret-token",
                x_llm_admin_token=None,
                authenticated_user=None,
            )
            require_llm_config_access(
                self.remote_request,
                authorization=None,
                x_llm_admin_token="secret-token",
                authenticated_user=None,
            )

    def test_session_aware_authenticated_user_grants_access(self):
        require_llm_config_access(
            self.remote_request,
            authorization=None,
            x_llm_admin_token=None,
            authenticated_user=types.SimpleNamespace(id=7),
        )

    def test_management_requires_manager_role_or_static_admin_token(self):
        manager = types.SimpleNamespace(
            id=1,
            role="manager",
            must_change_password=False,
        )
        regular_user = types.SimpleNamespace(
            id=2,
            role="user",
            must_change_password=False,
        )
        with patched_env(LLM_CONFIG_ADMIN_TOKEN=None, PAPER_TRACKER_DEV_MODE=None):
            require_llm_config_manager_access(
                self.remote_request,
                authorization=None,
                x_llm_admin_token=None,
                authenticated_user=manager,
            )
            with self.assertRaises(HTTPException) as ctx:
                require_llm_config_manager_access(
                    self.remote_request,
                    authorization=None,
                    x_llm_admin_token=None,
                    authenticated_user=regular_user,
                )
        self.assertEqual(ctx.exception.status_code, 403)

        with patched_env(LLM_CONFIG_ADMIN_TOKEN="management-secret"):
            require_llm_config_manager_access(
                self.remote_request,
                authorization=None,
                x_llm_admin_token="management-secret",
                authenticated_user=None,
            )

    def test_password_change_requirement_is_preserved(self):
        pending_manager = types.SimpleNamespace(
            id=1,
            role="manager",
            must_change_password=True,
        )
        with patched_env(LLM_CONFIG_ADMIN_TOKEN=None, PAPER_TRACKER_DEV_MODE=None):
            with self.assertRaises(HTTPException) as ctx:
                require_llm_config_manager_access(
                    self.remote_request,
                    authorization=None,
                    x_llm_admin_token=None,
                    authenticated_user=pending_manager,
                )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Password change required")

    def test_wildcard_cors_is_rejected_by_default(self):
        with patched_env(
            CORS_ORIGINS="*",
            OFFLINE_MODE=None,
            PAPER_TRACKER_DEV_MODE=None,
        ):
            with self.assertRaisesRegex(RuntimeError, "CORS_ORIGINS must not contain"):
                resolve_cors_policy()

    def test_development_wildcard_cors_is_narrowed_to_loopback(self):
        with patched_env(
            CORS_ORIGINS="*",
            OFFLINE_MODE=None,
            PAPER_TRACKER_DEV_MODE="true",
        ):
            origins, origin_regex = resolve_cors_policy()

        self.assertEqual(origins, [])
        self.assertEqual(origin_regex, LOOPBACK_CORS_ORIGIN_REGEX)
        self.assertIsNotNone(re.fullmatch(origin_regex, "http://localhost:3457"))
        self.assertIsNotNone(re.fullmatch(origin_regex, "https://127.0.0.1:8080"))
        self.assertIsNone(re.fullmatch(origin_regex, "http://192.168.1.20:3457"))

    def test_offline_mode_rejects_wildcard_cors_even_with_development_flag(self):
        with patched_env(
            CORS_ORIGINS="*",
            OFFLINE_MODE="true",
            PAPER_TRACKER_DEV_MODE="true",
        ):
            with self.assertRaisesRegex(RuntimeError, "CORS_ORIGINS must not contain"):
                resolve_cors_policy()

    def test_pdf_import_routes_use_bounded_upload_limit(self):
        self.assertTrue(is_pdf_import_endpoint("/api/papers/import/pdf/analyze", "POST"))
        self.assertTrue(is_pdf_import_endpoint("/api/papers/import/pdf/commit", "POST"))
        self.assertFalse(is_pdf_import_endpoint("/api/papers/import/pdf/analyze", "GET"))
        self.assertFalse(is_pdf_import_endpoint("/api/papers/import/pdf/other", "POST"))
        self.assertFalse(is_upload_endpoint("/api/papers/import/pdf/analyze", "POST"))
        self.assertEqual(
            PDF_IMPORT_MAX_BODY_SIZE,
            MAX_FILE_SIZE + PDF_IMPORT_MULTIPART_OVERHEAD,
        )

    def test_agui_limit_does_not_override_general_body_limit(self):
        self.assertEqual(AGUI_MAX_BODY_SIZE, 1024 * 1024)
        self.assertEqual(GENERAL_MAX_BODY_SIZE, 10 * 1024 * 1024)

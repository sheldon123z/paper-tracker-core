from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from apscheduler.schedulers.background import BackgroundScheduler
from backend.app.offline import (
    OFFLINE_ERROR_CODE,
    OfflineModeError,
    configure_offline_environment,
    is_offline_llm_host_allowed,
    require_offline_llm_endpoint,
)
from backend.app.routes import files as files_routes
from backend.app.services import doc2x_service, mineru_service, rss_parser
from backend.app.services import scheduler as scheduler_service
from backend.app.services.llm_registry import ResolvedLLMConfig
from backend.app.services.llm_runtime import build_chat_llm
from backend.app.services.llm_service import normalize_config_payload
from backend.tests.support import ROOT, TEST_ENCRYPTION_KEY, patched_env
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _resolved_config(base_url: str, *, is_local: bool) -> ResolvedLLMConfig:
    return ResolvedLLMConfig(
        provider_key="ollama" if is_local else "openai",
        display_name="test",
        model_name="test-model",
        litellm_model="ollama/test-model" if is_local else "openai/test-model",
        api_key="test",
        api_base=base_url,
        extra_headers={},
        model_kwargs={},
        api_format="native",
        is_local=is_local,
        supports_streaming=True,
        supports_tool_calling=True,
        supports_reasoning=False,
        supports_vision=False,
    )


class OfflineLLMPolicyTests(unittest.TestCase):
    def test_only_explicit_model_proxy_hostname_is_allowed_and_builds(self):
        private_dns = [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("192.168.65.254", 0),
            )
        ]
        with (
            patched_env(
                OFFLINE_MODE="true",
                OFFLINE_LLM_ALLOWED_HOSTS="model-proxy",
                ALLOW_LOCAL_LLM_BASE_URLS=None,
            ),
            patch("backend.app.offline.socket.getaddrinfo", return_value=private_dns),
        ):
            self.assertFalse(is_offline_llm_host_allowed("host.docker.internal"))
            self.assertTrue(is_offline_llm_host_allowed("model-proxy"))
            payload = normalize_config_payload(
                "ollama",
                "http://model-proxy:11434",
                None,
                model_name="qwen3:8b",
            )
            self.assertEqual(payload["base_url"], "http://model-proxy:11434")

            with patch("backend.app.services.llm_runtime.ChatLiteLLM") as constructor:
                constructor.return_value = object()
                build_chat_llm(_resolved_config(payload["base_url"], is_local=True))
                constructor.assert_called_once()

    def test_host_aliases_are_rejected_without_explicit_allowlist(self):
        public_dns = [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("8.8.8.8", 0),
            )
        ]
        with (
            patched_env(OFFLINE_MODE="true"),
            patch("backend.app.offline.socket.getaddrinfo", return_value=public_dns),
        ):
            self.assertFalse(is_offline_llm_host_allowed("host.docker.internal"))
            self.assertFalse(is_offline_llm_host_allowed("localhost"))

    def test_public_host_cannot_be_enabled_by_offline_allowlist(self):
        public_dns = [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("8.8.8.8", 0),
            )
        ]
        with (
            patched_env(
                OFFLINE_MODE="true",
                OFFLINE_LLM_ALLOWED_HOSTS="api.openai.com",
            ),
            patch("backend.app.offline.socket.getaddrinfo", return_value=public_dns),
        ):
            self.assertFalse(is_offline_llm_host_allowed("api.openai.com"))
            with self.assertRaises(OfflineModeError) as ctx:
                require_offline_llm_endpoint("https://api.openai.com/v1")
        self.assertEqual(ctx.exception.code, OFFLINE_ERROR_CODE)

    def test_allowlisted_private_hostname_is_allowed_only_after_private_resolution(self):
        private_dns = [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("10.20.30.40", 0),
            )
        ]
        with (
            patched_env(
                OFFLINE_MODE="true",
                OFFLINE_LLM_ALLOWED_HOSTS="llm.internal",
            ),
            patch("backend.app.offline.socket.getaddrinfo", return_value=private_dns),
        ):
            self.assertTrue(is_offline_llm_host_allowed("llm.internal"))
            require_offline_llm_endpoint("http://llm.internal:8000/v1")

    def test_final_llm_builder_rejects_remote_config(self):
        with (
            patched_env(OFFLINE_MODE="true", OFFLINE_LLM_ALLOWED_HOSTS=None),
            patch("backend.app.services.llm_runtime.ChatLiteLLM") as constructor,
        ):
            with self.assertRaises(OfflineModeError):
                build_chat_llm(
                    _resolved_config("https://api.openai.com/v1", is_local=False)
                )
            constructor.assert_not_called()

    def test_offline_mode_disables_langsmith_tracing_and_drops_process_keys(self):
        with patched_env(
            OFFLINE_MODE="true",
            LANGCHAIN_TRACING="true",
            LANGCHAIN_TRACING_V2="true",
            LANGSMITH_TRACING="true",
            LANGSMITH_TRACING_V2="true",
            LANGCHAIN_API_KEY="langchain-secret",
            LANGSMITH_API_KEY="langsmith-secret",
            LITELLM_LOCAL_MODEL_COST_MAP=None,
        ):
            configure_offline_environment()
            self.assertEqual(os.environ["LANGCHAIN_TRACING_V2"], "false")
            self.assertEqual(os.environ["LANGSMITH_TRACING"], "false")
            self.assertNotIn("LANGCHAIN_API_KEY", os.environ)
            self.assertNotIn("LANGSMITH_API_KEY", os.environ)
            self.assertEqual(os.environ["LITELLM_LOCAL_MODEL_COST_MAP"], "True")


class OfflineOutboundServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_rss_fetch_is_blocked_before_feedparser(self):
        with (
            patched_env(OFFLINE_MODE="true"),
            patch.object(rss_parser.feedparser, "parse") as parse,
        ):
            with self.assertRaises(OfflineModeError):
                rss_parser.fetch_feed_entries("https://example.com/feed.xml")
            parse.assert_not_called()

    async def test_cloud_parsers_are_blocked_before_http_client_creation(self):
        with patched_env(OFFLINE_MODE="true"):
            with patch.object(mineru_service.httpx, "AsyncClient") as mineru_client:
                with self.assertRaises(OfflineModeError):
                    await mineru_service.submit_parse_task(
                        Path("missing.pdf"),
                        "missing.pdf",
                        "token",
                    )
                mineru_client.assert_not_called()

            with patch.object(doc2x_service.httpx, "AsyncClient") as doc2x_client:
                with self.assertRaises(OfflineModeError):
                    await doc2x_service.submit_parse_task(
                        Path("missing.pdf"),
                        "missing.pdf",
                        "token",
                    )
                doc2x_client.assert_not_called()

    async def test_cloud_parse_http_boundary_returns_clear_503(self):
        app = FastAPI()
        app.include_router(files_routes.router)
        app.dependency_overrides[files_routes.get_current_user] = lambda: object()
        app.dependency_overrides[files_routes.get_db] = lambda: None

        with patched_env(OFFLINE_MODE="true"):
            response = TestClient(app).post("/api/papers/1/files/1/parse?engine=mineru")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], OFFLINE_ERROR_CODE)

    async def test_invalid_parse_engine_returns_400_in_offline_mode(self):
        app = FastAPI()
        app.include_router(files_routes.router)
        app.dependency_overrides[files_routes.get_current_user] = lambda: object()
        app.dependency_overrides[files_routes.get_db] = lambda: None

        with patched_env(OFFLINE_MODE="true"):
            response = TestClient(app).post("/api/papers/1/files/1/parse?engine=invalid")
        self.assertEqual(response.status_code, 400)


class OfflineStartupTests(unittest.TestCase):
    def test_offline_app_rejects_wildcard_cors(self):
        environment = os.environ.copy()
        environment.update(
            {
                "OFFLINE_MODE": "true",
                "CORS_ORIGINS": "*",
            }
        )
        result = subprocess.run(
            [sys.executable, "-c", "import backend.app.main"],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "CORS_ORIGINS must not contain",
            result.stdout + result.stderr,
        )

    def test_rss_scheduler_init_does_not_start_or_open_database(self):
        test_scheduler = BackgroundScheduler()
        with (
            patched_env(OFFLINE_MODE="true"),
            patch.object(scheduler_service, "_scheduler", test_scheduler),
            patch.object(scheduler_service, "SessionLocal") as session_factory,
        ):
            scheduler_service.init_scheduler()
            self.assertFalse(test_scheduler.running)
            self.assertEqual(test_scheduler.get_jobs(), [])
            session_factory.assert_not_called()

    def test_backup_scheduler_start_removes_feed_jobs_in_offline_mode(self):
        test_scheduler = BackgroundScheduler()
        test_scheduler.add_job(lambda: None, "interval", hours=1, id="feed_7")
        test_scheduler.add_job(lambda: None, "interval", hours=1, id="db_backup")
        try:
            with (
                patched_env(OFFLINE_MODE="true"),
                patch.object(scheduler_service, "_scheduler", test_scheduler),
            ):
                scheduler_service.start_scheduler()
                self.assertTrue(test_scheduler.running)
                self.assertIsNone(test_scheduler.get_job("feed_7"))
                self.assertIsNotNone(test_scheduler.get_job("db_backup"))
        finally:
            if test_scheduler.running:
                test_scheduler.shutdown(wait=False)

    def test_offline_app_does_not_register_feed_or_scheduler_routers(self):
        script = "\n".join(
            (
                "import json",
                "from backend.app.main import app",
                "included = [getattr(route, 'original_router', None) for route in app.routes]",
                "paths = sorted({",
                "  child.path",
                "  for router in included if router is not None",
                "  for child in router.routes",
                "})",
                "print(json.dumps(paths))",
            )
        )
        environment = os.environ.copy()
        environment.update(
            {
                "OFFLINE_MODE": "true",
                "DATABASE_URL": "",
                "CONTROL_DATABASE_URL": "",
                "CHECKPOINT_DB_PATH": "",
            }
        )
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=ROOT,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
        )
        paths = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertNotIn("/api/feeds", paths)
        self.assertFalse(any(path.startswith("/api/scheduler") for path in paths))
        self.assertIn("/api/papers/run", paths)

    def test_offline_lifespan_starts_only_backup_job_in_persistent_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            script = "\n".join(
                (
                    "import json",
                    "from pathlib import Path",
                    "from fastapi.testclient import TestClient",
                    "from backend.app.main import app",
                    "from backend.app.services.scheduler import get_scheduler",
                    "with TestClient(app) as client:",
                    "    health = client.get('/health').json()",
                    "    jobs = sorted(job.id for job in get_scheduler().get_jobs())",
                    "root = Path(__import__('os').environ['PAPER_TRACKER_DATA_DIR'])",
                    "files = sorted(path.relative_to(root).as_posix() for path in root.rglob('*') if path.is_file())",
                    "print(json.dumps({'health': health, 'jobs': jobs, 'files': files}))",
                )
            )
            environment = os.environ.copy()
            environment.update(
                {
                    "OFFLINE_MODE": "true",
                    "PAPER_TRACKER_DATA_DIR": str(root),
                    "DATABASE_URL": "",
                    "CONTROL_DATABASE_URL": "",
                    "CHECKPOINT_DB_PATH": "",
                    "ENCRYPTION_KEY": TEST_ENCRYPTION_KEY,
                    "JWT_SECRET_KEY": "offline-startup-jwt-secret-with-more-than-32-characters",
                }
            )
            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=ROOT,
                env=environment,
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout.strip().splitlines()[-1])
            self.assertEqual(payload["health"]["status"], "ok")
            self.assertEqual(payload["jobs"], ["db_backup"])
            self.assertIn("paper_tracker.db", payload["files"])
            self.assertIn("control/control_plane.db", payload["files"])
            self.assertIn("graph_checkpoints.db", payload["files"])
            self.assertTrue(
                any(name.startswith("backups/paper_tracker_") for name in payload["files"])
            )


if __name__ == "__main__":
    unittest.main()

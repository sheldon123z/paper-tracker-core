#!/usr/bin/env python3
from __future__ import annotations

import os
import importlib
import sys
import socket
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
import types


ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"
PY_VERSION = f"python{sys.version_info.major}.{sys.version_info.minor}"
SITE_PACKAGES = [
    ROOT / ".venv" / "lib" / PY_VERSION / "site-packages",
    ROOT / ".venv" / "Lib" / "site-packages",
]
for path in (str(ROOT), str(BACKEND_ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)
for path in SITE_PACKAGES:
    if path.exists() and str(path) not in sys.path:
        sys.path.insert(0, str(path))


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str = ""


class CheckFailure(AssertionError):
    pass


@contextmanager
def patched_env(**updates: str | None):
    original: dict[str, str | None] = {}
    try:
        for key, value in updates.items():
            original[key] = os.environ.get(key)
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        yield
    finally:
        for key, value in original.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


@contextmanager
def patched_module(name: str, module: types.ModuleType):
    original = sys.modules.get(name)
    sys.modules[name] = module
    try:
        yield
    finally:
        if original is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = original


@contextmanager
def patched_attr(obj: object, attr: str, value):
    original = getattr(obj, attr)
    setattr(obj, attr, value)
    try:
        yield
    finally:
        setattr(obj, attr, original)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise CheckFailure(message)


def run_check(name: str, fn: Callable[[], None]) -> CheckResult:
    try:
        fn()
    except Exception as exc:  # pragma: no cover - explicit CLI feedback
        detail = f"{type(exc).__name__}: {exc}"
        return CheckResult(name=name, ok=False, detail=detail)
    return CheckResult(name=name, ok=True)


def check_database_url_normalization() -> None:
    dotenv_stub = types.ModuleType("dotenv")
    dotenv_stub.load_dotenv = lambda *args, **kwargs: None  # type: ignore[attr-defined]

    with patched_module("dotenv", dotenv_stub):
        settings = importlib.import_module("backend.app.settings")

    expected = f"sqlite:///{(settings.BACKEND_ROOT / 'paper_tracker.db').resolve()}"
    require(
        settings._normalize_sqlite_url("sqlite:///./paper_tracker.db") == expected,
        "relative sqlite URL should resolve under backend/.",
    )
    require(
        settings._normalize_sqlite_url("sqlite:////tmp/custom.db") == "sqlite:////tmp/custom.db",
        "absolute sqlite URL should stay unchanged.",
    )
    require(
        settings._normalize_sqlite_url("postgresql://user:pass@db/test") == "postgresql://user:pass@db/test",
        "non-sqlite URL should stay unchanged.",
    )


def check_provider_registry_contract() -> None:
    from backend.app.services.llm_registry import PROVIDER_REGISTRY, get_provider_profile, list_provider_profiles

    keys = set(PROVIDER_REGISTRY)
    require({"openrouter", "ollama", "vllm", "deepseek", "volcengine_ark"}.issubset(keys), "registry missing core providers.")
    require(get_provider_profile("openrouter").default_headers_factory is not None, "OpenRouter should provide default headers.")
    require(get_provider_profile("ollama").local_provider is True, "Ollama should be a local provider.")
    require(get_provider_profile("vllm").local_provider is True, "vLLM should be a local provider.")
    profiles = list_provider_profiles()
    require(len(profiles) >= len(PROVIDER_REGISTRY), "provider list should expose all profiles.")


def check_base_url_rules() -> None:
    from backend.app.services.llm_registry import ProviderConfigError, normalize_base_url, validate_base_url
    import backend.app.services.llm_registry as llm_registry

    require(
        normalize_base_url("moonshot", "https://api.moonshot.cn/v1/chat/completions") == "https://api.moonshot.cn/v1",
        "Moonshot URL should normalize to /v1.",
    )
    require(
        normalize_base_url("zhipu", "https://open.bigmodel.cn/api/paas/v4/chat/completions") == "https://open.bigmodel.cn/api/paas/v4",
        "Zhipu URL should normalize to /api/paas/v4.",
    )
    require(
        normalize_base_url("openrouter", "https://openrouter.ai") == "https://openrouter.ai/api/v1",
        "OpenRouter should normalize to /api/v1.",
    )

    with patched_attr(llm_registry.socket, "getaddrinfo", lambda *args, **kwargs: (_ for _ in ()).throw(socket.gaierror())):
        require(
            validate_base_url("openai", "https://api.openai.com/v1", is_local=False) == "https://api.openai.com/v1",
            "remote HTTPS URL should be accepted.",
        )
        try:
            validate_base_url("openai", "http://api.openai.com/v1", is_local=False)
        except ProviderConfigError as exc:
            require(exc.code == "INVALID_BASE_URL", "remote HTTP URL should be rejected as INVALID_BASE_URL.")
        else:
            raise CheckFailure("remote HTTP URL should have failed.")

    try:
        validate_base_url("openai", "http://127.0.0.1:11434/v1", is_local=False)
    except ProviderConfigError as exc:
        require(exc.code == "SSRF_BLOCKED", "loopback target should be blocked for remote providers.")
    else:
        raise CheckFailure("loopback target should have failed.")

    with patched_env(ALLOW_LOCAL_LLM_BASE_URLS="true"):
        require(
            validate_base_url("ollama", "http://127.0.0.1:11434/v1", is_local=True) == "http://127.0.0.1:11434",
            "local Ollama URL should be allowed when explicitly enabled.",
        )
        require(
            validate_base_url("vllm", "http://127.0.0.1:8000/v1/chat/completions", is_local=True) == "http://127.0.0.1:8000/v1",
            "local vLLM URL should be allowed when explicitly enabled.",
        )

    with patched_env(ALLOW_LOCAL_LLM_BASE_URLS="false"):
        try:
            validate_base_url("ollama", "http://127.0.0.1:11434/v1", is_local=True)
        except ProviderConfigError as exc:
            require(exc.code == "SSRF_BLOCKED", "local provider should be blocked when local mode is disabled.")
        else:
            raise CheckFailure("local provider should have failed when disabled.")

    with patched_env(LLM_ALLOWED_REMOTE_HOSTS="proxy.example"):
        with patched_attr(llm_registry, "_has_private_or_link_local_ip", lambda host: True):
            require(
                validate_base_url("openai_compatible", "https://api.proxy.example/v1", is_local=False) == "https://api.proxy.example/v1",
                "generic provider should support explicit remote host allowlist.",
            )


def check_headers_and_seeds() -> None:
    from backend.app.services.llm_registry import build_default_headers, resolve_api_key, validate_extra_headers
    from backend.app.services.llm_service import normalize_config_payload
    seed_source = (ROOT / "backend/app/services/seed.py").read_text(encoding="utf-8")
    registry_source = (ROOT / "backend/app/services/llm_registry.py").read_text(encoding="utf-8")

    with patched_env(OPENROUTER_HTTP_REFERER="https://paper-tracker.example", OPENROUTER_APP_TITLE="Paper Tracker Core"):
        headers = build_default_headers("openrouter")
        require(headers.get("HTTP-Referer") == "https://paper-tracker.example", "OpenRouter referer header missing.")
        require(headers.get("X-OpenRouter-Title") == "Paper Tracker Core", "OpenRouter title header missing.")

    require(validate_extra_headers("openai_compatible", {"X-Test": "1"}) == {"X-Test": "1"}, "generic OpenAI-compatible provider should allow custom headers.")
    try:
        validate_extra_headers("openai", {"Authorization": "bearer x"})
    except Exception as exc:
        require(getattr(exc, "code", "") == "FORBIDDEN_HEADER", "sensitive headers should be blocked.")
    else:
        raise CheckFailure("sensitive header should have failed.")

    require(resolve_api_key("ollama", None) == "ollama", "ollama should not require a real API key.")
    require(resolve_api_key("vllm", None) == "vllm", "vLLM should not require a real API key.")
    require(
        normalize_config_payload("openrouter", None, "sk-test", model_name="google/gemini-2.5-flash")["extra_headers"] == {},
        "provider-managed default headers should not be persisted into config.extra_headers.",
    )

    require('"provider": "ollama"' in seed_source, "seed list should contain Ollama.")
    require('"provider": "vllm"' in seed_source, "seed list should contain vLLM.")
    require('"env_base_url": "OLLAMA_API_BASE"' in seed_source, "Ollama seed should use env-based base URL.")
    require('"env_base_url": "VLLM_API_BASE"' in seed_source, "vLLM seed should use env-based base URL.")
    require("ep-" not in seed_source, "seed list should not hardcode tenant-specific ARK deployment IDs.")
    require('default_headers_factory=_openrouter_headers' in registry_source, "OpenRouter registry should inject default headers.")


def check_legacy_row_migration() -> None:
    migration_source = (ROOT / "backend/app/services/db_migrations.py").read_text(encoding="utf-8")
    require("def migrate_llm_config_rows" in migration_source, "migration function should exist.")
    require("config.provider = inferred_provider" in migration_source, "migration should normalize provider.")
    require("normalize_base_url(inferred_provider, config.base_url)" in migration_source, "migration should normalize base URLs.")
    require("config.key_version = 1" in migration_source, "migration should initialize key version.")
    require('"api_format"] = "openai_compatible"' not in migration_source, "migration should use explicit field assignment.")
    require('config.api_format = "openai_compatible"' in migration_source, "migration should set openai-compatible format for compatible providers.")
    require("config.extra_headers = json_dumps_or_none({})" in migration_source, "migration should initialize extra headers.")
    require("config.is_local = True" in migration_source, "migration should mark local providers as local.")


def check_admin_access_guard() -> None:
    from fastapi import HTTPException
    from backend.app.security import require_llm_config_access

    loopback_request = types.SimpleNamespace(
        client=types.SimpleNamespace(host="127.0.0.1"),
        cookies={},
    )
    remote_request = types.SimpleNamespace(
        client=types.SimpleNamespace(host="203.0.113.10"),
        cookies={},
    )

    with patched_env(LLM_CONFIG_ADMIN_TOKEN=None, LLM_CONFIG_TRUST_LAN="false"):
        require_llm_config_access(loopback_request, authorization=None, x_llm_admin_token=None)
        try:
            require_llm_config_access(remote_request, authorization=None, x_llm_admin_token=None)
        except HTTPException as exc:
            require(exc.status_code == 403, "remote access without admin token should be forbidden.")
        else:
            raise CheckFailure("remote access without token should fail.")

    with patched_env(LLM_CONFIG_ADMIN_TOKEN="secret-token"):
        try:
            require_llm_config_access(remote_request, authorization=None, x_llm_admin_token=None)
        except HTTPException as exc:
            require(exc.status_code == 401, "missing admin token should be unauthorized.")
        else:
            raise CheckFailure("missing admin token should fail.")

        require_llm_config_access(
            remote_request,
            authorization="Bearer secret-token",
            x_llm_admin_token=None,
        )


def main() -> int:
    checks: list[tuple[str, Callable[[], None]]] = [
        ("database_url_normalization", check_database_url_normalization),
        ("provider_registry_contract", check_provider_registry_contract),
        ("base_url_rules", check_base_url_rules),
        ("headers_and_seeds", check_headers_and_seeds),
        ("legacy_row_migration", check_legacy_row_migration),
        ("admin_access_guard", check_admin_access_guard),
    ]

    print("LLM Provider Registry Validation")
    print(f"Worktree: {ROOT}")
    print(f"Python: {sys.version.split()[0]}")
    print()

    results = [run_check(name, fn) for name, fn in checks]
    for result in results:
        status = "PASS" if result.ok else "FAIL"
        if result.ok:
            print(f"[{status}] {result.name}")
        else:
            print(f"[{status}] {result.name}: {result.detail}")

    passed = sum(1 for result in results if result.ok)
    failed = len(results) - passed
    print()
    print(f"Summary: {passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

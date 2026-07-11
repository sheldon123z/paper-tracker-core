from __future__ import annotations

import ipaddress
import json
import logging
import os
import socket
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from typing import Any
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger("paper-tracker.llm_registry")


class ProviderConfigError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ProviderCapabilities:
    supports_streaming: bool = True
    supports_tool_calling: bool = True
    supports_reasoning: bool = False
    supports_vision: bool = False


@dataclass(frozen=True)
class ProviderProfile:
    key: str
    label: str
    litellm_provider: str
    api_format: str
    default_base_url: str | None = None
    requires_api_key: bool = True
    local_provider: bool = False
    allowed_host_suffixes: tuple[str, ...] = ()
    model_placeholder: str = ""
    endpoint_hint: str = ""
    capabilities: ProviderCapabilities = field(default_factory=ProviderCapabilities)
    default_headers_factory: Callable[[], dict[str, str]] | None = None


def _openrouter_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    referer = os.getenv("OPENROUTER_HTTP_REFERER", "").strip()
    title = os.getenv("OPENROUTER_APP_TITLE", "").strip()
    if referer:
        headers["HTTP-Referer"] = referer
    if title:
        headers["X-OpenRouter-Title"] = title
    return headers


PROVIDER_REGISTRY: dict[str, ProviderProfile] = {
    "openai": ProviderProfile(
        key="openai",
        label="OpenAI",
        litellm_provider="openai",
        api_format="native",
        allowed_host_suffixes=("openai.com",),
        model_placeholder="gpt-4o-mini",
        endpoint_hint="Official OpenAI models.",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
    ),
    "claude": ProviderProfile(
        key="claude",
        label="Anthropic Claude",
        litellm_provider="anthropic",
        api_format="native",
        allowed_host_suffixes=("anthropic.com",),
        model_placeholder="claude-sonnet-4-20250514",
        endpoint_hint="Anthropic native API.",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
    ),
    "deepseek": ProviderProfile(
        key="deepseek",
        label="DeepSeek",
        litellm_provider="deepseek",
        api_format="native",
        default_base_url="https://api.deepseek.com",
        allowed_host_suffixes=("deepseek.com",),
        model_placeholder="deepseek-chat",
        endpoint_hint="Official DeepSeek API.",
        capabilities=ProviderCapabilities(supports_reasoning=True),
    ),
    "volcengine_ark": ProviderProfile(
        key="volcengine_ark",
        label="Volcengine ARK",
        litellm_provider="openai",
        api_format="openai_compatible",
        default_base_url="https://ark.cn-beijing.volces.com/api/v3",
        allowed_host_suffixes=("volces.com",),
        model_placeholder="ep-xxxxxxxx",
        endpoint_hint="Use your ARK deployment endpoint ID (ep-...).",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
    ),
    "dashscope": ProviderProfile(
        key="dashscope",
        label="Alibaba DashScope",
        litellm_provider="openai",
        api_format="openai_compatible",
        default_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        allowed_host_suffixes=("aliyuncs.com",),
        model_placeholder="qwen-plus",
        endpoint_hint="DashScope OpenAI-compatible endpoint.",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
    ),
    "openrouter": ProviderProfile(
        key="openrouter",
        label="OpenRouter",
        litellm_provider="openrouter",
        api_format="native",
        default_base_url="https://openrouter.ai/api/v1",
        allowed_host_suffixes=("openrouter.ai",),
        model_placeholder="openai/gpt-5.2-mini",
        endpoint_hint="OpenRouter unified routing endpoint.",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
        default_headers_factory=_openrouter_headers,
    ),
    "moonshot": ProviderProfile(
        key="moonshot",
        label="Moonshot / Kimi",
        litellm_provider="openai",
        api_format="openai_compatible",
        default_base_url="https://api.moonshot.cn/v1",
        allowed_host_suffixes=("moonshot.cn",),
        model_placeholder="moonshot-v1-auto",
        endpoint_hint="Moonshot OpenAI-compatible endpoint.",
        capabilities=ProviderCapabilities(supports_reasoning=True),
    ),
    "zhipu": ProviderProfile(
        key="zhipu",
        label="Zhipu GLM",
        litellm_provider="openai",
        api_format="openai_compatible",
        default_base_url="https://open.bigmodel.cn/api/paas/v4",
        allowed_host_suffixes=("bigmodel.cn",),
        model_placeholder="glm-4.5-air",
        endpoint_hint="Zhipu OpenAI-compatible root endpoint.",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
    ),
    "xai": ProviderProfile(
        key="xai",
        label="xAI",
        litellm_provider="xai",
        api_format="native",
        default_base_url="https://api.x.ai/v1",
        allowed_host_suffixes=("x.ai",),
        model_placeholder="grok-3-mini-fast",
        endpoint_hint="xAI Grok models.",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
    ),
    "ollama": ProviderProfile(
        key="ollama",
        label="Ollama",
        litellm_provider="ollama",
        api_format="native",
        default_base_url="http://localhost:11434",
        requires_api_key=False,
        local_provider=True,
        model_placeholder="qwen3:8b",
        endpoint_hint="Local Ollama server.",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
    ),
    "vllm": ProviderProfile(
        key="vllm",
        label="vLLM",
        litellm_provider="openai",
        api_format="openai_compatible",
        default_base_url="http://localhost:8000/v1",
        requires_api_key=False,
        local_provider=True,
        model_placeholder="Qwen/Qwen2.5-7B-Instruct",
        endpoint_hint="OpenAI-compatible vLLM server.",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
    ),
    "lmstudio": ProviderProfile(
        key="lmstudio",
        label="LM Studio",
        litellm_provider="openai",
        api_format="openai_compatible",
        default_base_url="http://127.0.0.1:1234/v1",
        requires_api_key=False,
        local_provider=True,
        model_placeholder="qwen/qwen3.5-9b",
        endpoint_hint="Local LM Studio OpenAI-compatible server.",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
    ),
    "llamacpp": ProviderProfile(
        key="llamacpp",
        label="llama.cpp",
        litellm_provider="openai",
        api_format="openai_compatible",
        default_base_url="http://localhost:30000/v1",
        requires_api_key=False,
        local_provider=True,
        model_placeholder="Qwen3-Coder-Next-Q4_K_M.gguf",
        endpoint_hint="Local or LAN llama.cpp server with OpenAI-compatible API.",
        capabilities=ProviderCapabilities(supports_reasoning=True),
    ),
    "openai_compatible": ProviderProfile(
        key="openai_compatible",
        label="Generic OpenAI-Compatible",
        litellm_provider="openai",
        api_format="openai_compatible",
        model_placeholder="custom-model",
        endpoint_hint="Remote OpenAI-compatible endpoint over HTTPS.",
        capabilities=ProviderCapabilities(supports_reasoning=True, supports_vision=True),
    ),
}

_BLOCKED_HOSTS = {"169.254.169.254", "metadata.google.internal"}


@dataclass(frozen=True)
class ResolvedLLMConfig:
    provider_key: str
    display_name: str
    model_name: str
    litellm_model: str
    api_key: str | None
    api_base: str | None
    extra_headers: dict[str, str]
    model_kwargs: dict[str, Any]
    api_format: str
    is_local: bool
    supports_streaming: bool
    supports_tool_calling: bool
    supports_reasoning: bool
    supports_vision: bool
    config_id: int | None = None

    def to_state(self) -> dict[str, Any]:
        return {
            "provider_key": self.provider_key,
            "display_name": self.display_name,
            "model_name": self.model_name,
            "litellm_model": self.litellm_model,
            "api_key": self.api_key,
            "base_url": self.api_base,
            "extra_headers": self.extra_headers,
            "model_kwargs": self.model_kwargs,
            "is_local": self.is_local,
        }


def list_provider_profiles() -> list[dict[str, Any]]:
    profiles = []
    for profile in PROVIDER_REGISTRY.values():
        payload = asdict(profile)
        payload["capabilities"] = asdict(profile.capabilities)
        payload.pop("default_headers_factory", None)
        profiles.append(payload)
    return sorted(profiles, key=lambda item: item["label"].lower())


def get_provider_profile(provider_key: str) -> ProviderProfile:
    key = (provider_key or "").strip().lower()
    profile = PROVIDER_REGISTRY.get(key)
    if not profile:
        raise ProviderConfigError("UNKNOWN_PROVIDER", f"Unsupported LLM provider: {provider_key}")
    return profile


def parse_json_mapping(value: Any, *, field_name: str) -> dict[str, Any]:
    if value in (None, "", {}):
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ProviderConfigError("INVALID_JSON", f"{field_name} must be valid JSON.") from exc
        if not isinstance(parsed, dict):
            raise ProviderConfigError("INVALID_JSON", f"{field_name} must be a JSON object.")
        return parsed
    raise ProviderConfigError("INVALID_JSON", f"{field_name} must be a JSON object.")


def json_dumps_or_none(value: dict[str, Any] | None) -> str | None:
    if not value:
        return None
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def infer_provider_key(
    raw_provider: str | None,
    base_url: str | None,
    *,
    model_name: str | None = None,
    display_name: str | None = None,
) -> str:
    provider = (raw_provider or "").strip().lower()
    if provider in PROVIDER_REGISTRY:
        return provider

    parsed = urlparse((base_url or "").strip())
    host = (parsed.hostname or "").lower()
    port = parsed.port

    if "openrouter.ai" in host:
        return "openrouter"
    if "volces.com" in host or "ark" in host:
        return "volcengine_ark"
    if "dashscope" in host or "aliyuncs.com" in host:
        return "dashscope"
    if "moonshot.cn" in host:
        return "moonshot"
    if "bigmodel.cn" in host:
        return "zhipu"
    if "x.ai" in host:
        return "xai"
    if host in {"localhost", "127.0.0.1", "::1"}:
        if port == 11434:
            return "ollama"
        if port == 1234:
            return "lmstudio"
        if port == 30000:
            return "llamacpp"
        if port == 8000 or parsed.path.startswith("/v1"):
            return "vllm"

    name_parts = " ".join(part for part in (display_name, model_name) if part).lower()
    if "ollama" in name_parts:
        return "ollama"
    if "lm studio" in name_parts or "lmstudio" in name_parts:
        return "lmstudio"
    if "vllm" in name_parts:
        return "vllm"
    if "moonshot" in name_parts or "kimi" in name_parts:
        return "moonshot"
    if "glm" in name_parts or "zhipu" in name_parts:
        return "zhipu"

    if provider == "anthropic":
        return "claude"
    if provider == "custom":
        return "openai_compatible"
    result = provider or "openai_compatible"
    if result not in PROVIDER_REGISTRY:
        logger.warning("Unknown provider '%s', falling back to openai_compatible", provider)
        result = "openai_compatible"
    return result


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _remote_host_allowlist() -> tuple[str, ...]:
    raw = os.getenv("LLM_ALLOWED_REMOTE_HOSTS", "").strip()
    if not raw:
        return ()
    return tuple(part.strip().lower().lstrip(".") for part in raw.split(",") if part.strip())


def _strip_endpoint_suffixes(path: str, provider_key: str) -> str:
    normalized = path or ""
    for suffix in ("/chat/completions", "/responses", "/completions"):
        if normalized.endswith(suffix):
            normalized = normalized[: -len(suffix)]
            break

    if provider_key == "zhipu" and normalized.endswith("/api/paas/v4"):
        return normalized

    if provider_key == "ollama" and normalized == "/v1":
        return ""

    return normalized


def normalize_base_url(provider_key: str, base_url: str | None) -> str | None:
    profile = get_provider_profile(provider_key)
    raw_url = (base_url or profile.default_base_url or "").strip()
    if not raw_url:
        return None

    parsed = urlparse(raw_url)
    path = _strip_endpoint_suffixes(parsed.path, provider_key)

    if provider_key == "openrouter" and path in {"", "/"}:
        path = "/api/v1"
    elif provider_key == "moonshot" and path in {"", "/"}:
        path = "/v1"
    elif provider_key == "zhipu" and path in {"", "/"}:
        path = "/api/paas/v4"
    elif provider_key in {"vllm", "lmstudio", "llamacpp"} and path in {"", "/"}:
        path = "/v1"
    elif provider_key == "ollama" and path == "/":
        path = ""
    elif provider_key == "volcengine_ark" and path in {"", "/"}:
        path = "/api/v3"
    elif provider_key == "dashscope" and path in {"", "/"}:
        path = "/compatible-mode/v1"

    path = path.rstrip("/") or ("/" if path == "/" else "")
    rebuilt = parsed._replace(path=path, params="", query="", fragment="")
    return urlunparse(rebuilt).rstrip("/")


def _resolve_host_ips(host: str) -> set[ipaddress._BaseAddress]:
    ips: set[ipaddress._BaseAddress] = set()
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return ips
    for info in infos:
        sockaddr = info[4]
        if not sockaddr:
            continue
        try:
            ips.add(ipaddress.ip_address(sockaddr[0]))
        except ValueError:
            continue
    return ips


def _is_local_host(host: str) -> bool:
    lowered = host.lower()
    if lowered in {"localhost", "127.0.0.1", "::1", "host.docker.internal"}:
        return True
    if lowered.endswith(".local"):
        return True
    try:
        address = ipaddress.ip_address(lowered)
    except ValueError:
        return any(ip.is_loopback for ip in _resolve_host_ips(lowered))
    return address.is_loopback


def _has_private_or_link_local_ip(host: str) -> bool:
    try:
        ips = {ipaddress.ip_address(host)}
    except ValueError:
        ips = _resolve_host_ips(host)
    if not ips:
        # DNS resolution failed — fail-closed: treat as private
        logger.warning("DNS resolution failed for host=%s, treating as private", host)
        return True
    return any(ip.is_private or ip.is_link_local or ip.is_loopback or ip.is_multicast or ip.is_reserved for ip in ips)


def _matches_allowed_host_suffix(host: str, allowed_suffixes: tuple[str, ...]) -> bool:
    lowered = host.lower()
    for suffix in allowed_suffixes:
        cleaned = suffix.lower().lstrip(".")
        if lowered == cleaned or lowered.endswith(f".{cleaned}"):
            return True
    return False


def validate_extra_headers(provider_key: str, headers: dict[str, Any]) -> dict[str, str]:
    profile = get_provider_profile(provider_key)
    if not headers:
        return {}

    if profile.key != "openai_compatible":
        raise ProviderConfigError(
            "FORBIDDEN_HEADER",
            "Custom headers are only supported for the generic OpenAI-compatible provider.",
        )

    for forbidden in ("authorization", "x-api-key", "api-key", "host", "content-length", "connection"):
        if forbidden in {key.lower() for key in headers}:
            raise ProviderConfigError(
                "FORBIDDEN_HEADER",
                "Sensitive or hop-by-hop headers are managed by the provider profile and cannot be set manually.",
            )

    return {str(key): str(value) for key, value in headers.items()}


def validate_base_url(provider_key: str, base_url: str | None, *, is_local: bool) -> str | None:
    normalized = normalize_base_url(provider_key, base_url)
    if not normalized:
        return None

    profile = get_provider_profile(provider_key)
    parsed = urlparse(normalized)
    host = parsed.hostname
    if not host:
        logger.warning("validate_base_url blocked: provider=%s reason=no_hostname url=%s", provider_key, base_url)
        raise ProviderConfigError("INVALID_BASE_URL", "Base URL must include a hostname.")
    if parsed.username or parsed.password:
        logger.warning("validate_base_url blocked: provider=%s reason=credentials_in_url", provider_key)
        raise ProviderConfigError("INVALID_BASE_URL", "Base URL must not include credentials.")
    if host.lower() in _BLOCKED_HOSTS:
        logger.warning("validate_base_url blocked: provider=%s reason=blocked_host host=%s", provider_key, host)
        raise ProviderConfigError("SSRF_BLOCKED", "This base URL target is not allowed.")

    local_allowed = profile.local_provider and _bool_env("ALLOW_LOCAL_LLM_BASE_URLS", False)
    is_local_host = _is_local_host(host)
    allowed_remote_hosts = profile.allowed_host_suffixes
    if profile.key == "openai_compatible":
        allowed_remote_hosts = allowed_remote_hosts + _remote_host_allowlist()
    private_host = False if _matches_allowed_host_suffix(host, allowed_remote_hosts) else _has_private_or_link_local_ip(host)

    if parsed.scheme not in {"http", "https"}:
        logger.warning("validate_base_url blocked: provider=%s reason=invalid_scheme scheme=%s", provider_key, parsed.scheme)
        raise ProviderConfigError("INVALID_BASE_URL", "Base URL must use http or https.")

    if is_local_host or private_host:
        if not (local_allowed and is_local):
            logger.warning("validate_base_url blocked: provider=%s reason=ssrf_local host=%s", provider_key, host)
            raise ProviderConfigError(
                "SSRF_BLOCKED",
                "Local or private-network base URLs are blocked unless explicitly enabled for local providers.",
            )
        if parsed.scheme != "http":
            logger.warning("validate_base_url blocked: provider=%s reason=local_https host=%s", provider_key, host)
            raise ProviderConfigError("INVALID_BASE_URL", "Local provider base URLs must use http.")
        if not is_local_host and not _bool_env("ALLOW_LAN_LLM_BASE_URLS", False):
            logger.warning("validate_base_url blocked: provider=%s reason=lan_blocked host=%s", provider_key, host)
            raise ProviderConfigError(
                "SSRF_BLOCKED",
                "LAN base URLs are blocked. Set ALLOW_LAN_LLM_BASE_URLS=true to allow private-network endpoints.",
            )
        logger.debug("validate_base_url allowed: provider=%s url=%s (local)", provider_key, normalized)
        return normalized

    if parsed.scheme != "https":
        logger.warning("validate_base_url blocked: provider=%s reason=remote_no_https host=%s", provider_key, host)
        raise ProviderConfigError("INVALID_BASE_URL", "Remote provider base URLs must use https.")
    logger.debug("validate_base_url allowed: provider=%s url=%s", provider_key, normalized)
    return normalized


def build_default_headers(provider_key: str) -> dict[str, str]:
    profile = get_provider_profile(provider_key)
    if profile.default_headers_factory is None:
        return {}
    return profile.default_headers_factory()


def build_litellm_model(provider_key: str, model_name: str) -> str:
    profile = get_provider_profile(provider_key)
    return f"{profile.litellm_provider}/{model_name}"


def resolve_api_key(provider_key: str, api_key: str | None) -> str | None:
    profile = get_provider_profile(provider_key)
    clean_key = (api_key or "").strip() or None
    if clean_key:
        return clean_key
    if profile.requires_api_key:
        raise ProviderConfigError("MISSING_API_KEY", f"{profile.label} requires an API key.")
    return {
        "ollama": "ollama",
        "vllm": "vllm",
        "lmstudio": "lmstudio",
        "llamacpp": "none",
    }.get(provider_key, "local")

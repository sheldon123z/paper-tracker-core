"""LLM configuration, provider resolution, and runtime helpers."""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from ..models import LLMConfig, SystemPromptConfig
from .encryption import decrypt_value
from .llm_registry import (
    ProviderProfile,
    ResolvedLLMConfig,
    build_default_headers,
    build_litellm_model,
    get_provider_profile,
    infer_provider_key,
    list_provider_profiles,
    parse_json_mapping,
    resolve_api_key,
    validate_base_url,
    validate_extra_headers,
)
from .llm_runtime import classify_runtime_error, probe_llm

logger = logging.getLogger("paper-tracker.llm")

# Hardcoded fallback defaults (used only when DB has no entry)
_FALLBACK_PROMPTS = {
    "paper": (
        "You are a research assistant analyzing an academic paper. "
        "Respond in Chinese unless asked otherwise. Be precise and scholarly."
    ),
    "global": (
        "You are a research assistant with access to a library of academic papers. "
        "Use the provided paper index to answer questions. Respond in Chinese unless asked otherwise."
    ),
    "assistant": "你是论文研究助手。默认中文回复。",
}

_prompt_cache: dict[str, str] = {}
_prompt_cache_time: dict[str, float] = {}
PROMPT_CACHE_TTL = int(os.getenv("PROMPT_CACHE_TTL", "60"))


def get_system_prompt(db: Session, prompt_type: str) -> str:
    now = time.time()
    if prompt_type in _prompt_cache and now - _prompt_cache_time.get(prompt_type, 0) < PROMPT_CACHE_TTL:
        return _prompt_cache[prompt_type]

    config = db.query(SystemPromptConfig).filter(
        SystemPromptConfig.prompt_type == prompt_type,
        SystemPromptConfig.is_active == True,  # noqa: E712
    ).first()
    if config:
        _prompt_cache[prompt_type] = config.prompt_text
        _prompt_cache_time[prompt_type] = now
        return config.prompt_text

    return _FALLBACK_PROMPTS.get(prompt_type, _FALLBACK_PROMPTS["assistant"])


def clear_prompt_cache(prompt_type: str | None = None) -> None:
    """Clear prompt cache entries. Call after updating system prompts."""
    if prompt_type:
        _prompt_cache.pop(prompt_type, None)
        _prompt_cache_time.pop(prompt_type, None)
    else:
        _prompt_cache.clear()
        _prompt_cache_time.clear()


def list_provider_options() -> list[dict[str, Any]]:
    profiles = []
    for profile in list_provider_profiles():
        capabilities = profile["capabilities"]
        profiles.append(
            {
                "key": profile["key"],
                "label": profile["label"],
                "description": profile["endpoint_hint"],
                "default_base_url": profile["default_base_url"],
                "requires_api_key": profile["requires_api_key"],
                "is_local": profile["local_provider"],
                "allows_custom_headers": profile["key"] == "openai_compatible",
                "supports_reasoning": capabilities["supports_reasoning"],
                "supports_streaming": capabilities["supports_streaming"],
                "supports_tools": capabilities["supports_tool_calling"],
                "default_model_hint": profile["model_placeholder"],
                "api_format": profile["api_format"],
            }
        )
    return profiles


@dataclass
class _NormalizedCore:
    """Shared normalization result used by normalize/enrich/resolve paths."""
    provider_key: str
    profile: ProviderProfile
    effective_base_url: str | None
    safe_headers: dict[str, str]
    safe_body: dict[str, Any]
    is_local: bool
    api_format: str


def _normalize_core(
    provider: str,
    base_url: str | None,
    *,
    model_name: str | None = None,
    display_name: str | None = None,
    extra_headers: dict[str, Any] | None = None,
    extra_body: dict[str, Any] | None = None,
    is_local: bool = False,
) -> _NormalizedCore:
    """Core normalization shared by normalize_config_payload, _resolve_config_values, and enrich_llm_config."""
    provider_key = infer_provider_key(provider, base_url, model_name=model_name, display_name=display_name)
    profile = get_provider_profile(provider_key)
    effective_is_local = bool(is_local or profile.local_provider)
    safe_base_url = validate_base_url(provider_key, base_url, is_local=effective_is_local)
    safe_headers = validate_extra_headers(provider_key, extra_headers or {})
    safe_body = parse_json_mapping(extra_body or {}, field_name="extra_body")
    return _NormalizedCore(
        provider_key=provider_key,
        profile=profile,
        effective_base_url=safe_base_url,
        safe_headers=safe_headers,
        safe_body=safe_body,
        is_local=effective_is_local,
        api_format=profile.api_format,
    )


def _config_json(config: LLMConfig, field_name: str, *, safe: bool = False) -> dict[str, Any]:
    try:
        return parse_json_mapping(getattr(config, field_name, None), field_name=field_name)
    except Exception as exc:
        if safe:
            logger.debug("Ignoring malformed %s for config: %s", field_name, exc)
            return {}
        raise


def _resolved_headers(config: LLMConfig, provider_key: str) -> dict[str, str]:
    headers = build_default_headers(provider_key)
    stored_headers = validate_extra_headers(provider_key, _config_json(config, "extra_headers"))
    headers.update(stored_headers)
    return headers


def enrich_llm_config(config: LLMConfig) -> dict[str, Any]:
    try:
        core = _normalize_core(
            config.provider,
            config.base_url,
            model_name=config.model_name,
            display_name=config.display_name,
            is_local=bool(getattr(config, "is_local", False)),
        )
        effective_base_url = core.effective_base_url
        provider_key = core.provider_key
        profile = core.profile
    except Exception as exc:
        logger.warning(
            "validate_base_url failed for config id=%s provider=%s: %s",
            getattr(config, "id", "?"), config.provider, exc,
        )
        effective_base_url = config.base_url
        provider_key = infer_provider_key(
            config.provider, config.base_url,
            model_name=config.model_name, display_name=config.display_name,
        )
        profile = get_provider_profile(provider_key)
    return {
        "id": config.id,
        "provider": provider_key,
        "provider_label": profile.label,
        "display_name": config.display_name,
        "model_name": config.model_name,
        "base_url": config.base_url,
        "effective_base_url": effective_base_url,
        "api_format": getattr(config, "api_format", None) or profile.api_format,
        "extra_headers": _config_json(config, "extra_headers", safe=True),
        "extra_body": _config_json(config, "extra_body", safe=True),
        "is_default": config.is_default,
        "requires_api_key": profile.requires_api_key,
        "is_local": bool(getattr(config, "is_local", False) or profile.local_provider),
        "is_enabled": bool(getattr(config, "is_enabled", True)),
        "health_status": getattr(config, "health_status", "unknown") or "unknown",
        "last_tested_at": getattr(config, "last_tested_at", None),
        "last_error": getattr(config, "last_error", None),
        "is_pinned": bool(getattr(config, "is_pinned", False)),
        "last_ttft_ms": getattr(config, "last_ttft_ms", None),
        "last_tokens_per_second": getattr(config, "last_tokens_per_second", None),
        "user_tags": json.loads(config.user_tags) if getattr(config, "user_tags", None) else [],
        "capabilities": {
            "supports_streaming": profile.capabilities.supports_streaming,
            "supports_tool_calling": profile.capabilities.supports_tool_calling,
            "supports_reasoning": profile.capabilities.supports_reasoning,
            "supports_vision": profile.capabilities.supports_vision,
        },
        "created_at": config.created_at,
    }


def _resolve_config_values(
    provider: str,
    model_name: str,
    base_url: str | None,
    api_key: str | None,
    *,
    extra_headers: dict[str, Any] | None = None,
    extra_body: dict[str, Any] | None = None,
    is_local: bool = False,
    display_name: str | None = None,
    allow_missing_api_key: bool = False,
    config_id: int | None = None,
) -> ResolvedLLMConfig:
    core = _normalize_core(
        provider, base_url,
        model_name=model_name, display_name=display_name,
        extra_headers=extra_headers, extra_body=extra_body,
        is_local=is_local,
    )
    # Runtime resolution merges default headers on top of validated custom headers
    merged_headers = build_default_headers(core.provider_key)
    merged_headers.update(core.safe_headers)
    runtime_api_key = None if api_key is None and allow_missing_api_key else resolve_api_key(core.provider_key, api_key)
    return ResolvedLLMConfig(
        provider_key=core.provider_key,
        display_name=display_name or model_name,
        model_name=model_name,
        litellm_model=build_litellm_model(core.provider_key, model_name),
        api_key=runtime_api_key,
        api_base=core.effective_base_url,
        extra_headers=merged_headers,
        model_kwargs=core.safe_body,
        api_format=core.api_format,
        is_local=core.is_local,
        supports_streaming=core.profile.capabilities.supports_streaming,
        supports_tool_calling=core.profile.capabilities.supports_tool_calling,
        supports_reasoning=core.profile.capabilities.supports_reasoning,
        supports_vision=core.profile.capabilities.supports_vision,
        config_id=config_id,
    )


def _resolve_env_fallback() -> ResolvedLLMConfig:
    model_str = os.getenv("LLM_MODEL", "openai/gpt-4o-mini").strip()
    base_url = os.getenv("LLM_BASE_URL")
    api_key = os.getenv("LLM_API_KEY")
    if "/" in model_str:
        provider_key, model_name = model_str.split("/", 1)
    else:
        provider_key, model_name = "openai", model_str
    return _resolve_config_values(
        provider_key,
        model_name,
        base_url,
        api_key,
        display_name=model_name,
    )


def resolve_llm_config(db: Session, config_id: int | None = None) -> ResolvedLLMConfig:
    if config_id:
        config = db.query(LLMConfig).filter(
            LLMConfig.id == config_id,
            LLMConfig.is_enabled == True,  # noqa: E712
        ).first()
        if not config:
            raise ValueError(f"LLM 配置 (id={config_id}) 不存在或已被禁用。")
    else:
        config = db.query(LLMConfig).filter(
            LLMConfig.is_default.is_(True),
            LLMConfig.is_enabled == True,  # noqa: E712
        ).first()

    if not config:
        return _resolve_env_fallback()

    api_key = decrypt_value(config.api_key_encrypted) if config.api_key_encrypted else None
    return _resolve_config_values(
        config.provider,
        (config.model_name or "").strip(),
        config.base_url,
        api_key,
        extra_headers=_config_json(config, "extra_headers"),
        extra_body=_config_json(config, "extra_body"),
        is_local=bool(getattr(config, "is_local", False)),
        display_name=config.display_name,
        config_id=config.id,
    )


async def test_llm_connection(config: ResolvedLLMConfig) -> dict[str, Any]:
    try:
        probe = await probe_llm(config)
        return {
            "success": True,
            "status": "ok",
            "message": "连接成功",
            "provider": config.provider_key,
            "model": config.model_name,
            "invoke_ok": probe["invoke_ok"],
            "streaming_ok": probe["streaming_ok"],
            "ttft_ms": probe.get("ttft_ms"),
            "tokens_per_second": probe.get("tokens_per_second"),
            "invoke_latency_ms": probe.get("invoke_latency_ms"),
        }
    except Exception as exc:
        error_code, message = classify_runtime_error(exc)
        logger.warning("LLM test failed for provider=%s model=%s: %s", config.provider_key, config.model_name, exc)
        return {
            "success": False,
            "status": "error",
            "message": message,
            "provider": config.provider_key,
            "model": config.model_name,
            "invoke_ok": False,
            "streaming_ok": False,
            "error_code": error_code,
        }


def normalize_config_payload(
    provider: str,
    base_url: str | None,
    api_key: str | None,
    *,
    model_name: str | None = None,
    display_name: str | None = None,
    extra_headers: dict[str, Any] | None = None,
    extra_body: dict[str, Any] | None = None,
    is_local: bool = False,
) -> dict[str, Any]:
    model_value = (model_name or "").strip()
    if not model_value:
        pk = infer_provider_key(provider, base_url, display_name=display_name)
        model_value = get_provider_profile(pk).model_placeholder or "placeholder"
    core = _normalize_core(
        provider, base_url,
        model_name=model_value, display_name=display_name,
        extra_headers=extra_headers, extra_body=extra_body,
        is_local=is_local,
    )
    runtime_api_key = None if api_key is None else resolve_api_key(core.provider_key, api_key)
    return {
        "provider": core.provider_key,
        "base_url": core.effective_base_url,
        "api_key": runtime_api_key,
        "api_format": core.api_format,
        "extra_headers": core.safe_headers,
        "extra_body": core.safe_body,
        "is_local": core.is_local,
    }


def get_llm_config(db: Session, config_id: int | None = None) -> tuple[str, str | None, str | None]:
    resolved = resolve_llm_config(db, config_id)
    return resolved.litellm_model, resolved.api_key, resolved.api_base

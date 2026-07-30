from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_litellm import ChatLiteLLM

from ..offline import (
    OfflineModeError,
    configure_offline_environment,
    require_offline_llm_endpoint,
)
from .llm_registry import ResolvedLLMConfig

logger = logging.getLogger("paper-tracker.llm_runtime")


def extract_text_parts(content: Any) -> list[str]:
    if content is None:
        return []
    if isinstance(content, str):
        return [content] if content else []
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                if block:
                    parts.append(block)
                continue
            if not isinstance(block, dict):
                continue
            block_type = str(block.get("type", "")).lower()
            if block_type in {"text", "output_text", "input_text"}:
                text = block.get("text") or block.get("content")
                if isinstance(text, str) and text:
                    parts.append(text)
            elif block_type == "tool_result":
                text = block.get("content")
                if isinstance(text, str) and text:
                    parts.append(text)
        return parts
    return []


def extract_reasoning_parts(content: Any) -> list[str]:
    if not isinstance(content, list):
        return []
    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type", "")).lower()
        if block_type in {"reasoning", "thinking"}:
            text = block.get("reasoning") or block.get("thinking") or block.get("text")
            if isinstance(text, str) and text:
                parts.append(text)
    return parts


def extract_stream_text_from_chunk(chunk: Any) -> list[str]:
    pieces: list[str] = []
    content = getattr(chunk, "content", None)
    pieces.extend(extract_text_parts(content))
    if not pieces and isinstance(content, str) and content:
        pieces.append(content)
    return pieces


def build_chat_llm(config: ResolvedLLMConfig, *, streaming: bool = True) -> ChatLiteLLM:
    # This is the final shared construction point used by chat, workflows,
    # probes, translation, and PDF analysis.  Keep this guard even though
    # configuration validation also rejects remote endpoints.
    configure_offline_environment()
    require_offline_llm_endpoint(config.api_base)
    return ChatLiteLLM(
        model=config.litellm_model,
        api_key=config.api_key,
        api_base=config.api_base,
        extra_headers=config.extra_headers or None,
        model_kwargs=config.model_kwargs,
        streaming=streaming,
    )


async def invoke_llm_simple(config: ResolvedLLMConfig, prompt: str) -> str:
    """Simple non-streaming LLM invocation. Returns the text response."""
    llm = build_chat_llm(config, streaming=False)
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    if isinstance(response.content, str):
        return response.content
    return "".join(extract_text_parts(response.content))


async def probe_llm(config: ResolvedLLMConfig) -> dict[str, Any]:
    import time

    result = {
        "provider": config.provider_key,
        "model": config.model_name,
        "streaming_ok": False,
        "invoke_ok": False,
    }

    # Non-streaming invoke with latency measurement
    t0 = time.time()
    llm = build_chat_llm(config, streaming=False)
    response = await llm.ainvoke([HumanMessage(content="Reply with exactly ok")])
    invoke_text = response.content if isinstance(response.content, str) else "".join(extract_text_parts(response.content))
    result["invoke_ok"] = True
    result["invoke_preview"] = invoke_text[:80]
    result["invoke_latency_ms"] = int((time.time() - t0) * 1000)

    # Streaming with TTFT and tokens/s measurement
    stream_llm = build_chat_llm(config, streaming=True)
    collected: list[str] = []
    stream_t0 = time.time()
    ttft_recorded = False
    async for chunk in stream_llm.astream([HumanMessage(content="Reply with exactly ok")]):
        parts = extract_stream_text_from_chunk(chunk)
        collected.extend(parts)
        if parts and not ttft_recorded:
            result["ttft_ms"] = int((time.time() - stream_t0) * 1000)
            ttft_recorded = True
    stream_elapsed = time.time() - stream_t0
    result["streaming_ok"] = True
    result["stream_preview"] = "".join(collected)[:80]
    if stream_elapsed > 0 and len(collected) > 0:
        result["tokens_per_second"] = round(len(collected) / stream_elapsed, 2)
    return result


def classify_runtime_error(exc: Exception) -> tuple[str, str]:
    if isinstance(exc, OfflineModeError):
        return exc.code, str(exc)
    message = str(exc)
    lowered = message.lower()
    if "ssrf_blocked" in lowered or "local or private-network" in lowered:
        return "SSRF_BLOCKED", "Base URL blocked by security policy."
    if "authentication" in lowered or "invalid api key" in lowered or "令牌已过期" in lowered:
        return "AUTH_ERROR", "Authentication failed for this provider."
    if "credit balance" in lowered or "billing" in lowered or "credits" in lowered:
        return "BILLING_ERROR", "Provider account does not have available credits."
    if "region" in lowered:
        return "REGION_BLOCKED", "Provider rejected the request because of region restrictions."
    if "timeout" in lowered:
        return "TIMEOUT", "Provider request timed out."
    if "not found" in lowered or "url.not_found" in lowered or "404" in lowered:
        return "CONFIG_INVALID", "Provider endpoint or model configuration is invalid."
    return "RUNTIME_ERROR", "Provider request failed."

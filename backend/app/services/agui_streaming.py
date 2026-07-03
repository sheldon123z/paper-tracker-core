"""AG-UI SSE protocol encoding layer.

Exports the core streaming helpers used by both chat and workflow endpoints:
- emit_text()              — yield start + content + end for a simple text reply
- append_text()            — accumulate text with paragraph separators
- extract_visible_stream_text() — extract visible tokens from a streaming chunk
- stream_graph_as_agui()   — stream LangGraph astream_events as AG-UI SSE events
- Request parsing helpers  — parse_agui_request, make_agui_encoder, emit_validation_error
"""

import json
import logging
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from ag_ui.core import (
    EventType,
    MessagesSnapshotEvent,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    ToolCallStartEvent,
)
from ag_ui.encoder import EventEncoder
from fastapi import Request
from langchain_core.messages import ToolMessage

from .llm_runtime import classify_runtime_error, extract_stream_text_from_chunk, extract_text_parts

logger = logging.getLogger("paper-tracker.agui_streaming")


async def emit_text(encoder: EventEncoder, message_id: str, text: str):
    """Async generator: yield start + content + end for a simple text reply."""
    yield encoder.encode(TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=message_id, role="assistant"))
    yield encoder.encode(TextMessageContentEvent(type=EventType.TEXT_MESSAGE_CONTENT, message_id=message_id, delta=text))
    yield encoder.encode(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=message_id))


def append_text(parts: list[str], text: str) -> None:
    normalized = str(text or "")
    if not normalized:
        return
    if parts and not parts[-1].endswith(("\n", " ")):
        parts.append("\n\n")
    parts.append(normalized)


def extract_visible_stream_text(chunk) -> list[str]:
    return extract_stream_text_from_chunk(chunk)


async def stream_graph_as_agui(
    graph, initial_state: dict, encoder: EventEncoder,
    thread_id: str, run_id: str, msg_id: str,
    config: dict | None = None,
    full_text: list[str] | None = None,
    history_snapshot: list | None = None,
    tool_interactions: list[dict] | None = None,
    ordered_segments: list[dict] | None = None,
    usage_collector: dict | None = None,
) -> AsyncGenerator[str, None]:
    """Stream LangGraph astream_events as AG-UI protocol events.

    Handles:
    - on_chat_model_stream → TEXT_MESSAGE_CONTENT
    - on_chat_model_end    → TOOL_CALL_START + TOOL_CALL_ARGS
    - on_chain_end         → TOOL_CALL_RESULT + TOOL_CALL_END
    - Exceptions           → error message in text stream

    Yields AG-UI SSE lines.

    Args:
        config: LangGraph RunnableConfig (e.g. with thread_id for checkpointing).
        full_text: Optional mutable list. The generator appends streamed text
            chunks to it so the caller can read the full response after
            iteration completes.
        history_snapshot: Optional list of AG-UI message objects. If provided,
            a MESSAGES_SNAPSHOT event is emitted after RUN_STARTED to restore
            conversation history for the thread.
        tool_interactions: Optional mutable list. The generator appends tool
            call data dicts to it for DB persistence by the caller.
        ordered_segments: Optional mutable list. When provided, the generator
            appends {"type": "text", "content": ...} and {"type": "tool",
            "data": ...} entries in chronological order so the caller can
            persist messages in the correct interleaved sequence.
    """
    text_started = False
    if full_text is None:
        full_text = []
    if tool_interactions is None:
        tool_interactions = []
    # Per-segment text accumulator (resets at each text boundary)
    _seg_text: list[str] = []

    def _flush_text_segment():
        """Save current text segment to ordered_segments if tracking."""
        if ordered_segments is not None and _seg_text:
            ordered_segments.append({"type": "text", "content": "".join(_seg_text)})
        _seg_text.clear()

    yield encoder.encode(RunStartedEvent(type=EventType.RUN_STARTED, thread_id=thread_id, run_id=run_id))

    # Restore conversation history for this thread (AG-UI thread persistence)
    if history_snapshot:
        yield encoder.encode(MessagesSnapshotEvent(
            type=EventType.MESSAGES_SNAPSHOT, messages=history_snapshot,
        ))

    # Track pending tool calls so we can emit TOOL_CALL_RESULT + TOOL_CALL_END
    pending_tool_ids: list[str] = []
    # Map tool_call_id → {name, args} for collecting interaction data
    pending_tool_info: dict[str, dict] = {}

    try:
        async for event in graph.astream_events(initial_state, config=config or {}, version="v2"):
            kind = event["event"]

            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                # Skip tool-call streaming chunks (partial tool call data)
                if hasattr(chunk, "tool_call_chunks") and chunk.tool_call_chunks:
                    continue
                for part in extract_visible_stream_text(chunk):
                    if not text_started:
                        yield encoder.encode(TextMessageStartEvent(
                            type=EventType.TEXT_MESSAGE_START, message_id=msg_id, role="assistant",
                        ))
                        text_started = True
                        # Record TTFT on first visible token
                        if usage_collector and not usage_collector.get("_first_token_received"):
                            usage_collector["_first_token_received"] = True
                            usage_collector["ttft_ms"] = int((time.time() - usage_collector["start_time"]) * 1000)
                    full_text.append(part)
                    _seg_text.append(part)
                    yield encoder.encode(TextMessageContentEvent(
                        type=EventType.TEXT_MESSAGE_CONTENT, message_id=msg_id, delta=part,
                    ))

            elif kind == "on_chat_model_end":
                # Detect tool calls from the LLM response
                output = event["data"].get("output")
                if output and not full_text:
                    for part in extract_text_parts(getattr(output, "content", None)):
                        if not text_started:
                            yield encoder.encode(TextMessageStartEvent(
                                type=EventType.TEXT_MESSAGE_START, message_id=msg_id, role="assistant",
                            ))
                            text_started = True
                        full_text.append(part)
                        _seg_text.append(part)
                        yield encoder.encode(TextMessageContentEvent(
                            type=EventType.TEXT_MESSAGE_CONTENT, message_id=msg_id, delta=part,
                        ))
                # Extract token usage from LLM response metadata
                if usage_collector and output:
                    um = getattr(output, "usage_metadata", None)
                    if um:
                        usage_collector["prompt_tokens"] += getattr(um, "input_tokens", 0) or um.get("input_tokens", 0) if isinstance(um, dict) else 0
                        usage_collector["completion_tokens"] += getattr(um, "output_tokens", 0) or um.get("output_tokens", 0) if isinstance(um, dict) else 0
                        usage_collector["total_tokens"] += getattr(um, "total_tokens", 0) or um.get("total_tokens", 0) if isinstance(um, dict) else 0
                    elif not um:
                        rm = getattr(output, "response_metadata", {}) or {}
                        tu = rm.get("token_usage") or rm.get("usage") or {}
                        if tu:
                            usage_collector["prompt_tokens"] += tu.get("prompt_tokens", 0)
                            usage_collector["completion_tokens"] += tu.get("completion_tokens", 0)
                            usage_collector["total_tokens"] += tu.get("total_tokens", 0)

                if output and hasattr(output, "tool_calls") and output.tool_calls:
                    # Close any open text message before tool calls
                    if text_started:
                        yield encoder.encode(TextMessageEndEvent(
                            type=EventType.TEXT_MESSAGE_END, message_id=msg_id,
                        ))
                        text_started = False
                        _flush_text_segment()

                    for tc in output.tool_calls:
                        tc_id = tc.get("id", str(uuid.uuid4()))
                        pending_tool_ids.append(tc_id)
                        tc_args = tc.get("args", {})
                        pending_tool_info[tc_id] = {"name": tc["name"], "args": tc_args}
                        yield encoder.encode(ToolCallStartEvent(
                            type=EventType.TOOL_CALL_START, tool_call_id=tc_id,
                            tool_call_name=tc["name"], parent_message_id=msg_id,
                        ))
                        yield encoder.encode(ToolCallArgsEvent(
                            type=EventType.TOOL_CALL_ARGS, tool_call_id=tc_id,
                            delta=json.dumps(tc_args, ensure_ascii=False),
                        ))

            elif kind == "on_chain_end" and event.get("name") == "call_tools":
                # Tool execution completed — emit results + close pending tool calls
                output = event["data"].get("output", {})
                tool_messages = output.get("messages", []) if isinstance(output, dict) else []

                # Build tool_call_id → result content mapping from ToolMessages
                result_map: dict[str, str] = {}
                for tm in tool_messages:
                    if isinstance(tm, ToolMessage) and tm.tool_call_id:
                        result_map[tm.tool_call_id] = tm.content

                for tc_id in pending_tool_ids:
                    # Spec order: END before RESULT
                    yield encoder.encode(ToolCallEndEvent(
                        type=EventType.TOOL_CALL_END, tool_call_id=tc_id,
                    ))
                    # Emit TOOL_CALL_RESULT if we have a result for this tool
                    if tc_id in result_map:
                        yield encoder.encode(ToolCallResultEvent(
                            type=EventType.TOOL_CALL_RESULT,
                            tool_call_id=tc_id,
                            message_id=str(uuid.uuid4()),
                            content=result_map[tc_id],
                            role="tool",
                        ))
                        # Collect tool interaction for DB persistence
                        info = pending_tool_info.get(tc_id, {})
                        td_entry = {
                            "tool_call_id": tc_id,
                            "name": info.get("name", ""),
                            "args": json.dumps(info.get("args", {}), ensure_ascii=False),
                            "result": result_map[tc_id],
                        }
                        tool_interactions.append(td_entry)
                        if usage_collector is not None:
                            usage_collector["tool_calls_count"] = usage_collector.get("tool_calls_count", 0) + 1
                        if ordered_segments is not None:
                            ordered_segments.append({"type": "tool", "data": td_entry})
                pending_tool_ids.clear()
                pending_tool_info.clear()

                # Use a new message ID for the next text segment (post-tool response)
                msg_id = str(uuid.uuid4())

    except GeneratorExit:
        # Client disconnected (user cancelled output) — gracefully stop
        _flush_text_segment()
        logger.info("Client disconnected (GeneratorExit), partial text: %d chars", len("".join(full_text)))
        return
    except Exception as exc:
        logger.exception("LangGraph execution failed")
        _flush_text_segment()
        error_code, safe_message = classify_runtime_error(exc)
        if usage_collector:
            usage_collector["status"] = "error"
            usage_collector["error_code"] = error_code
        try:
            if text_started:
                yield encoder.encode(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=msg_id))
            yield encoder.encode(RunErrorEvent(type=EventType.RUN_ERROR, message=safe_message))
        except Exception:
            pass  # Client may have already disconnected
        return

    # Finalize text message
    if text_started:
        yield encoder.encode(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=msg_id))
        _flush_text_segment()
    else:
        yield encoder.encode(TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=msg_id, role="assistant"))
        yield encoder.encode(TextMessageContentEvent(type=EventType.TEXT_MESSAGE_CONTENT, message_id=msg_id, delta="[完成]"))
        yield encoder.encode(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=msg_id))

    yield encoder.encode(RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=thread_id, run_id=run_id))


# ---------------------------------------------------------------------------
# Shared request parsing and validation helpers
# ---------------------------------------------------------------------------

def parse_agui_request(body: dict[str, Any]) -> tuple[str, str, list[dict], dict]:
    """Parse AG-UI request body into (thread_id, run_id, messages, props).

    Extracts threadId, runId, messages, and forwardedProps from the raw JSON body.
    Generates UUIDs for missing thread_id/run_id. Filters messages to valid roles.

    Args:
        body: Raw request JSON body from FastAPI

    Returns:
        tuple of (thread_id, run_id, messages, forwarded_props)
    """
    thread_id = body.get("threadId") or str(uuid.uuid4())
    run_id = body.get("runId") or str(uuid.uuid4())
    raw_messages = body.get("messages") or []
    messages = [
        {"role": m.get("role", ""), "content": m.get("content", "")}
        for m in raw_messages
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    props = body.get("forwardedProps") or {}
    return thread_id, run_id, messages, props


def make_agui_encoder(request: Request) -> EventEncoder:
    """Create AG-UI SSE encoder matching client's Accept header.

    Args:
        request: FastAPI Request object

    Returns:
        EventEncoder configured for the client's Accept header
    """
    return EventEncoder(accept=request.headers.get("accept"))


async def emit_validation_error(
    encoder: EventEncoder,
    thread_id: str,
    run_id: str,
    message_id: str,
    error_message: str,
) -> AsyncGenerator[str, None]:
    """Emit a complete error response stream (RUN_STARTED → text → RUN_FINISHED).

    Use this helper to emit validation errors in a consistent format across
    all AG-UI endpoints.

    Args:
        encoder: AG-UI event encoder
        thread_id: Thread identifier
        run_id: Run identifier
        message_id: Message ID for the error text
        error_message: Human-readable error message

    Yields:
        SSE-encoded event strings
    """
    yield encoder.encode(RunStartedEvent(
        type=EventType.RUN_STARTED,
        thread_id=thread_id,
        run_id=run_id,
    ))
    async for chunk in emit_text(encoder, message_id, error_message):
        yield chunk
    yield encoder.encode(RunFinishedEvent(
        type=EventType.RUN_FINISHED,
        thread_id=thread_id,
        run_id=run_id,
    ))


async def emit_llm_config_error(
    encoder: EventEncoder,
    thread_id: str,
    run_id: str,
    message_id: str,
    config_id: int | None,
    exception: Exception,
) -> AsyncGenerator[str, None]:
    """Emit LLM config validation error stream.

    Wraps LLM config resolution errors in a user-friendly message while
    logging the technical details.

    Args:
        encoder: AG-UI event encoder
        thread_id: Thread identifier
        run_id: Run identifier
        message_id: Message ID for the error text
        config_id: Requested LLM config ID (may be None)
        exception: The original exception from resolve_llm_config

    Yields:
        SSE-encoded event strings
    """
    logger.warning("LLM config resolution failed: config_id=%s error=%s", config_id, exception)
    error_msg = f"错误: LLM 配置无效 — {exception}"
    async for chunk in emit_validation_error(encoder, thread_id, run_id, message_id, error_msg):
        yield chunk


async def emit_paper_validation_error(
    encoder: EventEncoder,
    thread_id: str,
    run_id: str,
    message_id: str,
    paper_id: int | None,
    paper_exists: bool = True,
) -> AsyncGenerator[str, None]:
    """Emit paper validation error stream.

    Handles two cases: missing paper_id and paper not found in DB.

    Args:
        encoder: AG-UI event encoder
        thread_id: Thread identifier
        run_id: Run identifier
        message_id: Message ID for the error text
        paper_id: Requested paper ID (may be None)
        paper_exists: False if paper_id not provided, True if provided but not found

    Yields:
        SSE-encoded event strings
    """
    if not paper_exists:
        error_msg = "错误: 未指定论文 ID。请在论文标签页中使用此功能。"
    else:
        error_msg = f"错误: 论文不存在 (id={paper_id})"
    async for chunk in emit_validation_error(encoder, thread_id, run_id, message_id, error_msg):
        yield chunk

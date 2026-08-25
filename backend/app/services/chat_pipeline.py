"""Shared chat agent pipeline — configuration, message conversion, and persistence.

Exports:
- ChatAgentConfig     — dataclass for per-agent configuration
- to_langchain_messages()   — convert raw dicts to LangChain message objects
- last_user_content()       — extract the last user message content
- build_initial_state()     — build LangGraph initial state from resolved config
- build_history_snapshot()  — build AG-UI MESSAGES_SNAPSHOT from DB records
- update_session_title()    — generate smart session title from first message
- save_user_message()       — persist a user message to DB
- save_response_messages()  — persist assistant/tool messages to DB
- run_chat_agent()          — unified 8-step chat agent async generator
"""

import json
import uuid as _uuid
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass, field

from ag_ui.core import AssistantMessage as AGUIAssistantMessage
from ag_ui.core import ToolCall as AGUIToolCall
from ag_ui.core import ToolMessage as AGUIToolMessage
from ag_ui.core import UserMessage as AGUIUserMessage
from ag_ui.encoder import EventEncoder
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from ..models import ChatMessage
from .agui_streaming import stream_graph_as_agui
from .graph_factory import create_tool_graph
from .llm_registry import ResolvedLLMConfig
from .pricing import estimate_cost
from .structured_logging import get_logger, log_llm_call
from .usage_tracker import create_usage_collector, save_usage_log

logger = get_logger("chat_pipeline")

# ---------------------------------------------------------------------------
# Configuration dataclass
# ---------------------------------------------------------------------------

@dataclass
class ChatAgentConfig:
    agent_type: str                         # "paper" | "global" | "assistant"
    session_type: str                       # ChatMessage.session_type
    session_id: str | None = None           # global/assistant session id
    paper_id: int | None = None             # paper only
    system_prompt: str = ""
    # Server-provided document data is inserted as a lower-priority human
    # message immediately before the latest user request. It is never
    # persisted as user-authored chat history.
    context_messages: list[str] = field(default_factory=list)
    tool_defs: list[dict] = field(default_factory=list)
    tool_executor: Callable | None = None
    resolved: ResolvedLLMConfig | None = None
    track_history: bool = False             # assistant: True
    track_ordered_segments: bool = False    # assistant: True
    user_id: int | None = None
    department_id: int | None = None
    # Redacted server checkpoint for automatically attached PDF context.  It
    # contains only paper/file IDs and the next cursor, never source text.
    pdf_cursor_checkpoint: dict | None = None


# ---------------------------------------------------------------------------
# Message conversion
# ---------------------------------------------------------------------------

def last_user_content(messages: list[dict]) -> str | None:
    """Return the content of the last user message, or None."""
    for m in reversed(messages):
        if m.get("role") == "user":
            return m.get("content")
    return None


def to_langchain_messages(
    system_prompt: str,
    messages: list[dict],
    context_messages: list[str] | None = None,
):
    """Convert messages, keeping untrusted document context below system role."""
    lc = [SystemMessage(content=system_prompt)]
    latest_user_index = next(
        (index for index in range(len(messages) - 1, -1, -1) if messages[index].get("role") == "user"),
        len(messages),
    )
    for index, m in enumerate(messages):
        if index == latest_user_index:
            lc.extend(HumanMessage(content=context) for context in (context_messages or []))
        if m["role"] == "user":
            lc.append(HumanMessage(content=m["content"]))
        elif m["role"] == "assistant":
            lc.append(AIMessage(content=m["content"]))
    if latest_user_index == len(messages):
        lc.extend(HumanMessage(content=context) for context in (context_messages or []))
    return lc


# ---------------------------------------------------------------------------
# State builders
# ---------------------------------------------------------------------------

def build_initial_state(messages, resolved: ResolvedLLMConfig) -> dict:
    """Build LangGraph initial state from resolved config.

    NOTE: api_key is intentionally excluded from state to prevent cleartext
    propagation across all LangGraph nodes. It is passed via closure instead.
    """
    return {
        "messages": messages,
        "provider_key": resolved.provider_key,
        "display_name": resolved.display_name,
        "model_name": resolved.model_name,
        "litellm_model": resolved.litellm_model,
        "base_url": resolved.api_base,
        "extra_headers": resolved.extra_headers,
        "model_kwargs": resolved.model_kwargs,
        "api_format": resolved.api_format,
        "is_local": resolved.is_local,
        "supports_streaming": resolved.supports_streaming,
        "supports_tool_calling": resolved.supports_tool_calling,
        "supports_reasoning": resolved.supports_reasoning,
        "supports_vision": resolved.supports_vision,
    }


def build_history_snapshot(db: Session, config: ChatAgentConfig) -> list:
    """Query DB history and convert to AG-UI MESSAGES_SNAPSHOT format.

    Filters by session_id and session_type from config.
    """
    if not config.session_id:
        return []
    history = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.session_id == config.session_id,
            ChatMessage.session_type == config.session_type,
        )
        .order_by(ChatMessage.id)
        .all()
    )
    return _build_history_snapshot_from_records(history)


def _build_history_snapshot_from_records(history: list) -> list:
    """Build AG-UI MESSAGES_SNAPSHOT from ChatMessage DB records.

    Supports roles: user, assistant, tool (JSON with tool_call_id/name/args/result).
    Returns a list of AG-UI message objects for MessagesSnapshotEvent.
    """
    snapshot = []
    for i, m in enumerate(history):
        if m.role == "user":
            snapshot.append(AGUIUserMessage(id=f"h-{i}", role="user", content=m.content))
        elif m.role == "assistant":
            snapshot.append(AGUIAssistantMessage(id=f"h-{i}", role="assistant", content=m.content))
        elif m.role == "tool":
            try:
                td = json.loads(m.content)
            except (json.JSONDecodeError, TypeError):
                continue
            tc_id = td.get("tool_call_id", f"tc-{i}")
            # AssistantMessage with tool_calls (the LLM's decision to call a tool)
            snapshot.append(AGUIAssistantMessage(
                id=f"h-{i}-tc", role="assistant",
                tool_calls=[AGUIToolCall(
                    id=tc_id, type="function",
                    function={"name": td.get("name", ""), "arguments": td.get("args", "{}")},
                )],
            ))
            # ToolMessage with the result
            if "result" in td:
                snapshot.append(AGUIToolMessage(
                    id=f"h-{i}-tr", role="tool",
                    tool_call_id=tc_id,
                    content=td["result"],
                ))
    return snapshot


# ---------------------------------------------------------------------------
# Session title update
# ---------------------------------------------------------------------------

def update_session_title(db: Session, session, user_content: str | None) -> None:
    """Generate a smart session title from the first user message.

    Extracts the core topic from the user's message:
    - Strips common prefixes like "帮我", "请", "搜索"
    - Keeps it concise (max 30 chars)
    - Falls back to the raw content if stripping leaves nothing
    """
    if not user_content:
        return

    title = user_content.strip()

    # Strip common Chinese conversational prefixes
    for prefix in ("帮我", "请你", "请", "我想", "能不能", "可以", "麻烦"):
        if title.startswith(prefix):
            title = title[len(prefix):]
            break

    title = title.strip("，。、 ")

    if not title:
        title = user_content.strip()

    session.title = title[:30]
    db.commit()


# ---------------------------------------------------------------------------
# Message persistence
# ---------------------------------------------------------------------------

def save_user_message(db: Session, config: ChatAgentConfig, user_content: str | None) -> None:
    """Persist a user message to DB based on config session type."""
    if not user_content:
        return
    if config.session_type == "paper":
        db.add(ChatMessage(
            paper_id=config.paper_id,
            user_id=config.user_id,
            session_type="paper",
            role="user",
            content=user_content,
        ))
    else:
        db.add(ChatMessage(
            session_id=config.session_id,
            user_id=config.user_id,
            session_type=config.session_type,
            role="user",
            content=user_content,
        ))
    db.commit()


def save_response_messages(
    db: Session,
    config: ChatAgentConfig,
    full_text: list[str],
    tool_interactions: list[dict],
    ordered_segments: list[dict],
    *,
    pdf_resume_eligible: bool = True,
) -> None:
    """Persist assistant/tool response messages to DB.

    Simple mode (paper/global): save a single assistant text message.
    Segment mode (assistant): save text+tool segments in chronological order,
    with a fallback if no segments were tracked.
    """
    def persisted_interaction(interaction: dict) -> dict:
        if interaction.get("name") != "read_current_paper_pdf":
            return interaction
        return {**interaction, "resume_eligible": pdf_resume_eligible}

    tool_interactions = [
        persisted_interaction(interaction)
        for interaction in tool_interactions
    ]
    checkpoint_interaction = None
    pdf_cursor_checkpoint = getattr(config, "pdf_cursor_checkpoint", None)
    if pdf_resume_eligible and pdf_cursor_checkpoint and not any(
        interaction.get("name") == "read_current_paper_pdf"
        for interaction in tool_interactions
    ):
        checkpoint_interaction = {
            "tool_call_id": f"server-pdf-cursor-{_uuid.uuid4()}",
            "name": "read_current_paper_pdf",
            "resume_eligible": True,
            "args": json.dumps({"source": "automatic_context"}),
            "result": json.dumps({
                "type": "current_paper_pdf",
                "summary": "PDF 自动上下文正文未写入聊天历史；仅保存续读游标。",
                "data": {
                    **pdf_cursor_checkpoint,
                    "text_omitted": True,
                    "text_length": 0,
                },
            }, ensure_ascii=False),
        }
        tool_interactions = [*tool_interactions, checkpoint_interaction]

    if config.track_ordered_segments:
        # Segment mode: assistant agent with interleaved text+tool messages
        if ordered_segments:
            for seg in ordered_segments:
                if seg["type"] == "text" and seg["content"].strip():
                    db.add(ChatMessage(
                        session_id=config.session_id,
                        user_id=config.user_id,
                        session_type=config.session_type,
                        role="assistant",
                        content=seg["content"],
                    ))
                elif seg["type"] == "tool":
                    interaction = persisted_interaction(seg["data"])
                    db.add(ChatMessage(
                        session_id=config.session_id,
                        user_id=config.user_id,
                        session_type=config.session_type,
                        role="tool",
                        content=json.dumps(interaction, ensure_ascii=False),
                    ))
            if checkpoint_interaction is not None:
                db.add(ChatMessage(
                    session_id=config.session_id,
                    user_id=config.user_id,
                    session_type=config.session_type,
                    role="tool",
                    content=json.dumps(checkpoint_interaction, ensure_ascii=False),
                ))
            db.commit()
        elif tool_interactions or full_text:
            # Fallback: no ordered segments tracked (shouldn't happen)
            for td in tool_interactions:
                db.add(ChatMessage(
                    session_id=config.session_id,
                    user_id=config.user_id,
                    session_type=config.session_type,
                    role="tool",
                    content=json.dumps(td, ensure_ascii=False),
                ))
            if full_text:
                db.add(ChatMessage(
                    session_id=config.session_id,
                    user_id=config.user_id,
                    session_type=config.session_type,
                    role="assistant",
                    content="".join(full_text),
                ))
            db.commit()
    else:
        # Simple mode: paper or global — one assistant text message.  Preserve
        # only the redacted PDF cursor for paper chat so a later bare "继续"
        # can resume after the last tool-read chunk without storing PDF body.
        changed = False
        if config.session_type == "paper":
            for interaction in tool_interactions:
                if interaction.get("name") != "read_current_paper_pdf":
                    continue
                db.add(ChatMessage(
                    paper_id=config.paper_id,
                    user_id=config.user_id,
                    session_type="paper",
                    role="tool",
                    content=json.dumps(interaction, ensure_ascii=False),
                ))
                changed = True
        if full_text:
            if config.session_type == "paper":
                db.add(ChatMessage(
                    paper_id=config.paper_id,
                    user_id=config.user_id,
                    session_type="paper",
                    role="assistant",
                    content="".join(full_text),
                ))
            else:
                db.add(ChatMessage(
                    session_id=config.session_id,
                    user_id=config.user_id,
                    session_type=config.session_type,
                    role="assistant",
                    content="".join(full_text),
                ))
            changed = True
        if changed:
            db.commit()


# ---------------------------------------------------------------------------
# Unified chat agent pipeline
# ---------------------------------------------------------------------------


def _can_advance_pdf_cursor(usage_collector: dict, full_text: list[str]) -> bool:
    """Advance source only after a successful, non-truncated visible response."""
    return (
        usage_collector.get("status", "success") == "success"
        and not usage_collector.get("output_truncated", False)
        and bool("".join(full_text).strip())
    )


async def run_chat_agent(
    config: ChatAgentConfig,
    messages: list[dict],
    encoder: EventEncoder,
    thread_id: str,
    run_id: str,
    db: Session,
) -> AsyncGenerator[str, None]:
    """Unified 8-step chat agent pipeline.

    Steps:
    1. Generate message ID
    2. Extract last user content
    3. Convert to LangChain messages
    4. Persist user message
    5. Build history snapshot (assistant only)
    6. Build graph and initial state
    7. Stream via stream_graph_as_agui
    8. Persist response messages (in finally block)
    """
    msg_id = str(_uuid.uuid4())
    user_content = last_user_content(messages)
    lc_messages = to_langchain_messages(
        config.system_prompt,
        messages,
        config.context_messages,
    )

    save_user_message(db, config, user_content)

    history_snapshot = None
    if config.track_history and config.session_id:
        history = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.session_id == config.session_id,
                ChatMessage.session_type == config.session_type,
                ChatMessage.user_id == config.user_id,
            )
            .order_by(ChatMessage.id)
            .all()
        )
        history_snapshot = _build_history_snapshot_from_records(history)

    graph = create_tool_graph(config.tool_defs, config.tool_executor, resolved=config.resolved)
    initial_state = build_initial_state(lc_messages, config.resolved)

    full_text: list[str] = []
    tool_interactions: list[dict] = []
    ordered_segments: list[dict] = [] if config.track_ordered_segments else []

    usage_col = create_usage_collector(
        config_id=getattr(config.resolved, "config_id", None),
        provider=config.resolved.provider_key,
        model_name=config.resolved.model_name,
        is_local=config.resolved.is_local,
        agent_type=config.agent_type,
        session_id=config.session_id,
        user_id=config.user_id,
        department_id=config.department_id,
        request_type=config.agent_type,
    )

    run_completed = False
    try:
        async for line in stream_graph_as_agui(
            graph, initial_state, encoder, thread_id, run_id, msg_id,
            full_text=full_text,
            history_snapshot=history_snapshot if history_snapshot else None,
            tool_interactions=tool_interactions,
            ordered_segments=ordered_segments if config.track_ordered_segments else None,
            usage_collector=usage_col,
        ):
            yield line
        run_completed = _can_advance_pdf_cursor(usage_col, full_text)
    finally:
        save_response_messages(
            db,
            config,
            full_text,
            tool_interactions,
            ordered_segments,
            pdf_resume_eligible=run_completed,
        )
        # Fallback token estimation if provider didn't return usage metadata
        if usage_col["total_tokens"] == 0 and full_text:
            text_len = len("".join(full_text))
            usage_col["completion_tokens"] = max(1, text_len // 4)
            usage_col["total_tokens"] = usage_col["completion_tokens"]

        # Estimate cost
        cost_usd = None
        try:
            cost_usd = estimate_cost(
                config.resolved.provider_key,
                config.resolved.model_name,
                usage_col["prompt_tokens"],
                usage_col["completion_tokens"],
            )
        except Exception:
            pass

        # Log structured LLM call metrics
        elapsed = usage_col.get("start_time")
        duration_ms = None
        if elapsed:
            import time
            duration_ms = int((time.time() - elapsed) * 1000)

        log_llm_call(
            logger,
            provider=config.resolved.provider_key,
            model=config.resolved.model_name,
            input_tokens=usage_col["prompt_tokens"],
            output_tokens=usage_col["completion_tokens"],
            duration_ms=duration_ms,
            cost_usd=cost_usd,
            ttft_ms=usage_col.get("ttft_ms"),
            status=usage_col.get("status", "success"),
            error_code=usage_col.get("error_code"),
            agent_type=config.agent_type,
            session_id=config.session_id,
            config_id=getattr(config.resolved, "config_id", None),
        )

        save_usage_log(db, usage_col)

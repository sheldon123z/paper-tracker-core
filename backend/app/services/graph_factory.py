"""Unified LangGraph graph factory for all agent types."""

import copy
from collections.abc import Callable
from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from .llm_registry import ResolvedLLMConfig
from .llm_runtime import build_chat_llm

# ---------------------------------------------------------------------------
# Cross-provider message sanitization
# ---------------------------------------------------------------------------
# Anthropic uses {"type": "thinking"} content blocks inside the content array
# of AIMessage. These blocks are NOT accepted by other providers:
#
#   claude          — native format, MUST keep (required for multi-turn thinking)
#   openai          — rejects; uses hidden reasoning or encrypted blobs
#   deepseek        — rejects; uses flat `reasoning_content` field on message
#   volcengine_ark  — rejects; same OpenAI-compatible format, `reasoning_content`
#   dashscope       — rejects; same, `reasoning_content`
#   moonshot        — rejects; same, `reasoning_content`
#   zhipu           — rejects; same, `reasoning_content`
#   xai             — rejects; `reasoning_content` (grok-3-mini) or encrypted
#   openrouter      — varies by target model; strip to be safe
#   ollama          — rejects; uses `thinking` string field (NOT content blocks)
#   vllm            — accepts & converts to `reasoning` field internally
#   llamacpp        — rejects; no native thinking support
#   openai_compat   — rejects; generic endpoint, assume strict OpenAI format
#
# litellm does NOT sanitize message content arrays automatically.
# `drop_params` and `modify_params` only affect request *parameters*,
# not content blocks inside the conversation history.
# ---------------------------------------------------------------------------

# Providers whose API natively accepts thinking/reasoning content blocks
# in the messages[].content array.
#   - claude: Anthropic native format, required for multi-turn thinking
#   - vllm:   OpenAI-compat endpoint accepts "thinking" part type and
#             converts internally via _convert_message_content()
_THINKING_NATIVE_PROVIDERS = frozenset({"claude", "vllm"})


def _sanitize_messages(
    messages: list[BaseMessage], *, provider_key: str
) -> list[BaseMessage]:
    """Sanitize message history for cross-provider compatibility.

    Strips Anthropic-style ``{"type": "thinking"}`` and ``{"type": "reasoning"}``
    content blocks from AIMessage.content arrays when the target provider does
    not support them.  This prevents BadRequest errors like the one from
    Volcengine: ``invalid value: thinking, supported values are: text, image_url,
    video_url, and input_audio``.

    Providers that natively accept these blocks (see _THINKING_NATIVE_PROVIDERS)
    receive messages unmodified.
    """
    if provider_key in _THINKING_NATIVE_PROVIDERS:
        return messages

    cleaned: list[BaseMessage] = []
    for msg in messages:
        if not isinstance(msg, AIMessage) or not isinstance(msg.content, list):
            cleaned.append(msg)
            continue
        filtered = [
            block for block in msg.content
            if not (isinstance(block, dict) and block.get("type") in ("thinking", "reasoning"))
        ]
        if not filtered:
            # All blocks were thinking — keep a single empty text so the
            # message isn't dropped entirely (would break tool-call chains).
            filtered = [{"type": "text", "text": ""}]
        if len(filtered) == len(msg.content):
            cleaned.append(msg)
        else:
            new_msg = copy.copy(msg)
            new_msg.content = filtered
            cleaned.append(new_msg)
    return cleaned


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    provider_key: str
    display_name: str
    model_name: str
    litellm_model: str
    base_url: str | None
    extra_headers: dict[str, str]
    model_kwargs: dict[str, Any]
    api_format: str
    is_local: bool
    supports_streaming: bool
    supports_tool_calling: bool
    supports_reasoning: bool
    supports_vision: bool


def _make_llm(resolved: ResolvedLLMConfig):
    """Create a streaming LLM from a pre-built ResolvedLLMConfig (closure-captured)."""
    return build_chat_llm(resolved, streaming=True)


def create_simple_graph(resolved: ResolvedLLMConfig, checkpointer=None):
    async def call_model(state: AgentState):
        llm = _make_llm(resolved)
        msgs = _sanitize_messages(state["messages"], provider_key=state["provider_key"])
        response = await llm.ainvoke(msgs)
        return {"messages": [response]}

    workflow = StateGraph(AgentState)
    workflow.add_node("call_model", call_model)
    workflow.add_edge(START, "call_model")
    workflow.add_edge("call_model", END)
    return workflow.compile(checkpointer=checkpointer)


def create_tool_graph(
    tool_definitions: list[dict],
    tool_executor: Callable[[str, dict], str],
    checkpointer=None,
    resolved: ResolvedLLMConfig | None = None,
):
    async def call_model(state: AgentState):
        llm = _make_llm(resolved)
        if tool_definitions and state.get("supports_tool_calling", True):
            llm = llm.bind_tools(tool_definitions)
        msgs = _sanitize_messages(state["messages"], provider_key=state["provider_key"])
        response = await llm.ainvoke(msgs)
        return {"messages": [response]}

    async def call_tools(state: AgentState):
        last_message = state["messages"][-1]
        tool_responses = []
        for tool_call in last_message.tool_calls:
            result_str = tool_executor(tool_call["name"], tool_call["args"])
            tool_responses.append(
                ToolMessage(
                    content=result_str,
                    name=tool_call["name"],
                    tool_call_id=tool_call["id"],
                )
            )
        return {"messages": tool_responses}

    def should_continue(state: AgentState) -> str:
        if not state.get("supports_tool_calling", True):
            return END
        last = state["messages"][-1]
        if hasattr(last, "tool_calls") and last.tool_calls:
            return "call_tools"
        return END

    workflow = StateGraph(AgentState)
    workflow.add_node("call_model", call_model)
    workflow.add_node("call_tools", call_tools)
    workflow.add_edge(START, "call_model")
    workflow.add_conditional_edges("call_model", should_continue)
    workflow.add_edge("call_tools", "call_model")
    return workflow.compile(checkpointer=checkpointer)

from __future__ import annotations

import unittest
from unittest.mock import patch

import backend.tests  # noqa: F401
from backend.app.services.graph_factory import create_tool_graph
from langchain_core.messages import AIMessage, HumanMessage


class _FakeLLM:
    def __init__(self):
        self.bind_tools_called = False

    def bind_tools(self, tool_definitions):
        self.bind_tools_called = True
        return self

    async def ainvoke(self, messages):
        return AIMessage(content="ok")


def _state(*, supports_tool_calling: bool):
    return {
        "messages": [HumanMessage(content="hello")],
        "provider_key": "openai",
        "display_name": "OpenAI",
        "model_name": "gpt-4o-mini",
        "litellm_model": "openai/gpt-4o-mini",
        "api_key": "sk-test",
        "base_url": "https://api.openai.com/v1",
        "extra_headers": {},
        "model_kwargs": {},
        "api_format": "native",
        "is_local": False,
        "supports_streaming": True,
        "supports_tool_calling": supports_tool_calling,
        "supports_reasoning": True,
        "supports_vision": True,
    }


class GraphFactoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_tool_binding_skipped_when_provider_disables_tools(self):
        fake_llm = _FakeLLM()
        with patch("backend.app.services.graph_factory.build_chat_llm", return_value=fake_llm):
            graph = create_tool_graph([{"name": "search_papers"}], lambda _name, _args: "done")
            result = await graph.ainvoke(_state(supports_tool_calling=False))
        self.assertFalse(fake_llm.bind_tools_called)
        self.assertEqual(result["messages"][-1].content, "ok")

    async def test_tool_binding_enabled_when_provider_supports_tools(self):
        fake_llm = _FakeLLM()
        with patch("backend.app.services.graph_factory.build_chat_llm", return_value=fake_llm):
            graph = create_tool_graph([{"name": "search_papers"}], lambda _name, _args: "done")
            result = await graph.ainvoke(_state(supports_tool_calling=True))
        self.assertTrue(fake_llm.bind_tools_called)
        self.assertEqual(result["messages"][-1].content, "ok")

"""AI tools package — tool definitions, executors, and helpers for LLM function calling.

Re-exports the public API so existing imports continue to work:
    from ..services.tools import TOOL_DEFINITIONS, execute_tool
"""

from .registry import TOOL_DEFINITIONS, execute_tool, get_tool_descriptions, get_tool_descriptions_for

__all__ = [
    "TOOL_DEFINITIONS",
    "execute_tool",
    "get_tool_descriptions",
    "get_tool_descriptions_for",
]

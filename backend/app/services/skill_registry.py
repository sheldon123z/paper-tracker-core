"""Skill registry — dynamic tool binding per agent type from DB.

Queries the AgentSkill table to determine which tools are enabled for each
agent type, then returns filtered tool definitions and a scoped executor.
"""

from collections.abc import Callable

from sqlalchemy.orm import Session

from ..models import AgentSkill
from .tools import TOOL_DEFINITIONS, execute_tool

# Quick lookup: tool_name → tool definition dict
_TOOL_MAP: dict[str, dict] = {td["function"]["name"]: td for td in TOOL_DEFINITIONS}


def get_tools_for_agent(
    db: Session, agent_type: str
) -> tuple[list[dict], Callable[[str, dict], str]]:
    """Query DB for enabled tools and return (filtered_definitions, executor).

    Args:
        db: SQLAlchemy session.
        agent_type: One of "paper", "global", "assistant".

    Returns:
        tool_definitions: Filtered list of OpenAI function calling format dicts.
        tool_executor: Callable(name, args) -> str, scoped to enabled tools only.
    """
    enabled = (
        db.query(AgentSkill.tool_name)
        .filter(AgentSkill.agent_type == agent_type, AgentSkill.is_enabled.is_(True))
        .all()
    )
    enabled_names = {row.tool_name for row in enabled}
    filtered_defs = [_TOOL_MAP[name] for name in enabled_names if name in _TOOL_MAP]

    def executor(name: str, args: dict) -> str:
        if name not in enabled_names:
            return f"Tool '{name}' is not enabled for agent '{agent_type}'."
        return execute_tool(db, name, args)

    return filtered_defs, executor

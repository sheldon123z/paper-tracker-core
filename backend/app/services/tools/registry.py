"""Tool definitions, dispatcher, and description helpers.

Contains:
- TOOL_DEFINITIONS: All tool definitions in OpenAI function calling format.
- _TOOL_EXECUTORS: Mapping from tool name to executor function.
- execute_tool(): Dispatch a tool call by name.
- get_tool_descriptions() / get_tool_descriptions_for(): Human-readable summaries.
"""

import logging

from sqlalchemy.orm import Session

from .feed_tools import (
    _execute_get_feed_status,
    _execute_get_recent_activity,
)
from .paper_tools import (
    _execute_analyze_paper_highlights,
    _execute_compare_papers,
    _execute_get_category_papers,
    _execute_get_favorites_overview,
    _execute_get_latest_papers,
    _execute_get_paper_detail,
    _execute_get_paper_notes,
    _execute_get_paper_timeline,
    _execute_search_papers,
)
from .stats_tools import (
    _execute_find_duplicates,
    _execute_get_reading_progress,
    _execute_get_research_stats,
    _execute_get_research_trends,
    _execute_get_tag_analysis,
)

logger = logging.getLogger("paper-tracker.ai-tools")


# ---------------------------------------------------------------------------
# Tool Definitions (OpenAI function calling format)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "search_papers",
            "description": "Search papers in the database by keyword query. Searches title, authors, abstract, and category fields.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search keyword or phrase to match against paper titles, authors, abstracts, and categories.",
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional category filter (e.g. 'cs.AI', 'cs.CL'). If provided, only papers in this category are returned.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results to return. Default is 10.",
                        "default": 10,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_paper_detail",
            "description": "Get full details of a specific paper by its database ID, including title, authors, abstract, notes, category, relevance, and metadata.",
            "parameters": {
                "type": "object",
                "properties": {
                    "paper_id": {
                        "type": "integer",
                        "description": "The database ID of the paper.",
                    },
                },
                "required": ["paper_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_latest_papers",
            "description": "Get the most recently added papers from the database, ordered by creation time descending.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Number of papers to return. Default is 10.",
                        "default": 10,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_research_stats",
            "description": "Get research statistics: total papers, category distribution, source distribution, and average relevance score.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_papers",
            "description": "Compare two papers side by side. Returns details of both papers for comparison of methods, results, and contributions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "paper_id_1": {
                        "type": "integer",
                        "description": "Database ID of the first paper.",
                    },
                    "paper_id_2": {
                        "type": "integer",
                        "description": "Database ID of the second paper.",
                    },
                },
                "required": ["paper_id_1", "paper_id_2"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_category_papers",
            "description": "Get all papers in a specific category.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": "The category to filter by (e.g. 'cs.AI', 'cs.CL', 'Uncategorized').",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results to return. Default is 20.",
                        "default": 20,
                    },
                },
                "required": ["category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_feed_status",
            "description": "Get the status of all RSS feeds: name, URL, active status, last fetch time, and any errors.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_paper_timeline",
            "description": "Get a timeline of papers added to the library over time, grouped by week or month. Shows research intake patterns.",
            "parameters": {
                "type": "object",
                "properties": {
                    "granularity": {
                        "type": "string",
                        "enum": ["week", "month"],
                        "description": "Group by week or month. Default: week.",
                        "default": "week",
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional category filter.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Number of time periods. Default 12.",
                        "default": 12,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_tag_analysis",
            "description": "Analyze tag usage: frequency, co-occurrence pairs, and untagged paper count.",
            "parameters": {
                "type": "object",
                "properties": {
                    "top_n": {
                        "type": "integer",
                        "description": "Number of top tags. Default 15.",
                        "default": 15,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_reading_progress",
            "description": "Get reading progress: read/unread counts, favorites, and top unread papers ranked by relevance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "recommend_count": {
                        "type": "integer",
                        "description": "Number of recommended unread papers. Default 5.",
                        "default": 5,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_activity",
            "description": "Get recent activity summary: recently added, read, and favorited papers, plus feed fetches.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Lookback period in days. Default 7.",
                        "default": 7,
                    },
                    "limit_per_type": {
                        "type": "integer",
                        "description": "Max items per type. Default 5.",
                        "default": 5,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_paper_notes",
            "description": "Get notes and AI summaries for papers. Retrieve notes for a specific paper or list all papers with notes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "paper_id": {
                        "type": "integer",
                        "description": "Specific paper ID (optional).",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max papers to return. Default 10.",
                        "default": 10,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_duplicates",
            "description": "Detect potential duplicate papers based on title similarity. May be slow for large libraries (>500 papers).",
            "parameters": {
                "type": "object",
                "properties": {
                    "threshold": {
                        "type": "number",
                        "description": "Similarity threshold 0.0-1.0. Default 0.90.",
                        "default": 0.90,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max duplicate groups. Default 10.",
                        "default": 10,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_favorites_overview",
            "description": "Overview of favorited papers organized by category with relevance statistics.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max papers. Default 20.",
                        "default": 20,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_paper_highlights",
            "description": "Extract structured highlights from a paper including abstract, AI analysis, tags, and key sections.",
            "parameters": {
                "type": "object",
                "properties": {
                    "paper_id": {
                        "type": "integer",
                        "description": "The database ID of the paper to analyze.",
                    },
                },
                "required": ["paper_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_research_trends",
            "description": "Analyze research trends: category growth/decline over time and hot keywords from recent paper titles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Lookback period in days for 'recent' papers. Default 30.",
                        "default": 30,
                    },
                    "top_n": {
                        "type": "integer",
                        "description": "Number of top trending categories and keywords to return. Default 10.",
                        "default": 10,
                    },
                },
                "required": [],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

_TOOL_EXECUTORS = {
    "search_papers": _execute_search_papers,
    "get_paper_detail": _execute_get_paper_detail,
    "get_latest_papers": _execute_get_latest_papers,
    "get_research_stats": _execute_get_research_stats,
    "compare_papers": _execute_compare_papers,
    "get_category_papers": _execute_get_category_papers,
    "get_feed_status": _execute_get_feed_status,
    "get_paper_timeline": _execute_get_paper_timeline,
    "get_tag_analysis": _execute_get_tag_analysis,
    "get_reading_progress": _execute_get_reading_progress,
    "get_recent_activity": _execute_get_recent_activity,
    "get_paper_notes": _execute_get_paper_notes,
    "find_duplicates": _execute_find_duplicates,
    "get_favorites_overview": _execute_get_favorites_overview,
    "analyze_paper_highlights": _execute_analyze_paper_highlights,
    "get_research_trends": _execute_get_research_trends,
}


def execute_tool(db: Session, tool_name: str, arguments: dict) -> str:
    """Execute a tool by name with the given arguments. Returns a formatted string result."""
    executor = _TOOL_EXECUTORS.get(tool_name)
    if not executor:
        return f"Unknown tool: {tool_name}"

    try:
        return executor(db, arguments)
    except Exception as exc:
        logger.exception("Error executing tool %s: %s", tool_name, exc)
        return f"Error executing {tool_name}: {exc}"


def get_tool_descriptions() -> str:
    """Return a human-readable summary of all available tools for inclusion in system prompts."""
    return get_tool_descriptions_for(TOOL_DEFINITIONS)


def get_tool_descriptions_for(tool_defs: list[dict]) -> str:
    """Return tool descriptions for a specific set of tools."""
    lines = ["你可以使用以下工具查询论文数据库："]
    for tool_def in tool_defs:
        fn = tool_def["function"]
        name = fn["name"]
        desc = fn["description"]
        params = fn.get("parameters", {}).get("properties", {})
        param_names = ", ".join(params.keys()) if params else "none"
        lines.append(f"  - {name}({param_names}): {desc}")
    return "\n".join(lines)

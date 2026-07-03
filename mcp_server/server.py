"""
Paper Tracker Core MCP Server

Exposes tools for interacting with the Paper Tracker API via the
Model Context Protocol (MCP). Designed to be used by Claude Desktop,
Claude Code, or any MCP-compatible client.

Usage:
    python mcp_server/server.py

Environment:
    PAPER_TRACKER_API_URL  - Base URL of the Paper Tracker API
                             (default: http://localhost:5002)
"""

import json
import os
from datetime import UTC, datetime, timedelta
from typing import Optional

import httpx
from mcp.server.fastmcp import FastMCP

API_BASE = os.environ.get("PAPER_TRACKER_API_URL", "http://localhost:5002")

_MCP_INSTRUCTIONS = (
    "MCP server for academic paper tracking, search, and AI analysis."
)

try:
    # mcp >= 1.10 重命名了 description -> instructions
    mcp = FastMCP("Paper Tracker Core", instructions=_MCP_INSTRUCTIONS)
except TypeError:
    try:
        # mcp < 1.10 仍使用 description
        mcp = FastMCP("Paper Tracker Core", description=_MCP_INSTRUCTIONS)
    except TypeError:
        # 极旧版本只接受 name
        mcp = FastMCP("Paper Tracker Core")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _client() -> httpx.AsyncClient:
    """Create an httpx async client with reasonable defaults."""
    headers: dict[str, str] = {}
    svc_token = os.environ.get("PAPER_TRACKER_SERVICE_TOKEN", "").strip()
    if svc_token:
        headers["X-Service-Token"] = svc_token
    return httpx.AsyncClient(base_url=API_BASE, timeout=30.0, headers=headers)


def _format_paper(p: dict) -> str:
    """Format a single paper dict into a readable string."""
    lines = []
    lines.append(f"[ID {p.get('id')}] {p.get('title', 'Untitled')}")
    if p.get("authors"):
        lines.append(f"  Authors: {p['authors']}")
    if p.get("source"):
        lines.append(f"  Source: {p['source']}")
    if p.get("category"):
        lines.append(f"  Category: {p['category']}")
    if p.get("relevance") is not None:
        lines.append(f"  Relevance: {p['relevance']}")
    if p.get("published_date"):
        lines.append(f"  Published: {p['published_date']}")
    if p.get("link"):
        lines.append(f"  Link: {p['link']}")
    if p.get("is_read") is not None:
        lines.append(f"  Read: {'Yes' if p['is_read'] else 'No'}")
    if p.get("is_favorited"):
        lines.append(f"  Favorited: Yes")
    if p.get("abstract"):
        abstract = p["abstract"]
        if len(abstract) > 300:
            abstract = abstract[:300] + "..."
        lines.append(f"  Abstract: {abstract}")
    if p.get("notes"):
        lines.append(f"  Notes: {p['notes']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def search_papers(query: str, page: int = 1, size: int = 20) -> str:
    """Search papers by keyword in the Paper Tracker library.

    Searches across title, authors, abstract, and notes.

    Args:
        query: Search keyword or phrase
        page: Page number for pagination (default 1)
        size: Number of results per page (default 20, max 100)
    """
    async with _client() as client:
        try:
            resp = await client.get(
                "/api/papers",
                params={"search": query, "page": page, "size": size},
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            return f"Error searching papers: {e}"

    data = resp.json()
    items = data.get("items", [])
    meta = data.get("meta", {})

    if not items:
        return f"No papers found for query: '{query}'"

    total = meta.get("total", len(items))
    header = f"Found {total} papers (showing page {meta.get('page', page)} of {-(-total // size)}):\n"
    formatted = [_format_paper(p) for p in items]
    return header + "\n\n".join(formatted)


@mcp.tool()
async def get_paper(paper_id: int) -> str:
    """Get full details of a single paper by its ID.

    Args:
        paper_id: The numeric ID of the paper
    """
    async with _client() as client:
        try:
            resp = await client.get(f"/api/papers/{paper_id}")
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return f"Paper with ID {paper_id} not found."
            return f"Error fetching paper: {e}"
        except httpx.HTTPError as e:
            return f"Error fetching paper: {e}"

    return _format_paper(resp.json())


@mcp.tool()
async def get_stats(period: int = 30) -> str:
    """Get research statistics from the Paper Tracker library.

    Returns paper counts, category distribution, source distribution,
    and a timeline of paper additions.

    Args:
        period: Number of days for the papers-over-time timeline (default 30)
    """
    async with _client() as client:
        try:
            resp = await client.get("/api/stats", params={"period": period})
            resp.raise_for_status()
        except httpx.HTTPError as e:
            return f"Error fetching stats: {e}"

    s = resp.json()
    lines = [
        "=== Paper Tracker Statistics ===",
        f"Total papers: {s.get('total_papers', 0)}",
        f"Unread: {s.get('unread_papers', 0)}",
        f"Favorited: {s.get('favorited_papers', 0)}",
        f"Avg relevance: {s.get('avg_relevance', 0)}",
    ]

    src = s.get("source_distribution", {})
    if src:
        lines.append("\nSource Distribution:")
        for source, count in sorted(src.items(), key=lambda x: -x[1]):
            lines.append(f"  {source}: {count}")

    cat = s.get("category_distribution", {})
    if cat:
        lines.append("\nCategory Distribution:")
        for category, count in sorted(cat.items(), key=lambda x: -x[1]):
            label = category if category else "(uncategorized)"
            lines.append(f"  {label}: {count}")

    timeline = s.get("papers_over_time", {})
    if timeline:
        lines.append(f"\nPapers added (last {period} days):")
        for day in sorted(timeline.keys()):
            lines.append(f"  {day}: {timeline[day]}")

    return "\n".join(lines)


@mcp.tool()
async def fetch_latest(feed_id: Optional[int] = None) -> str:
    """Trigger RSS feed fetch to pull the latest papers.

    If feed_id is provided, only that feed is fetched. Otherwise all
    active feeds are fetched.

    Args:
        feed_id: Optional feed ID to fetch. If omitted, fetches all active feeds.
    """
    async with _client() as client:
        try:
            if feed_id is not None:
                # Trigger a specific feed via the scheduler endpoint
                resp = await client.post(f"/api/scheduler/trigger/{feed_id}")
            else:
                # Trigger all active feeds
                resp = await client.post("/api/papers/run")
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                detail = e.response.json().get("detail", "")
            except Exception:
                pass
            return f"Error triggering feed fetch: {e.response.status_code} {detail}"
        except httpx.HTTPError as e:
            return f"Error triggering feed fetch: {e}"

    data = resp.json()
    message = data.get("message", "Feed fetch completed")
    stats = data.get("stats", {})

    lines = [message]
    if stats:
        for feed_name, result in stats.items():
            lines.append(f"  {feed_name}: {result}")

    return "\n".join(lines)


@mcp.tool()
async def analyze_paper(paper_id: int, question: str = "请总结这篇论文的主要贡献和方法") -> str:
    """Ask AI to analyze a specific paper from the library.

    Uses the configured LLM to answer questions about the paper's content,
    methodology, findings, or significance.

    Args:
        paper_id: The numeric ID of the paper to analyze
        question: The question or analysis request (default: summarize main contributions and methods)
    """
    async with _client() as client:
        try:
            # This is a streaming SSE endpoint; we collect all chunks
            async with client.stream(
                "POST",
                "/api/chat/paper",
                json={"paper_id": paper_id, "message": question},
                timeout=120.0,
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    return f"Error analyzing paper: HTTP {resp.status_code} — {body.decode(errors='replace')}"

                collected = []
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line[len("data: "):]
                    if payload == "[DONE]":
                        break
                    collected.append(payload)

        except httpx.HTTPError as e:
            return f"Error analyzing paper: {e}"

    if not collected:
        return "No response received from the AI. Ensure an LLM is configured in Settings."

    return "".join(collected)


@mcp.tool()
async def update_notes(paper_id: int, notes: str) -> str:
    """Update the notes field for a paper.

    Args:
        paper_id: The numeric ID of the paper
        notes: The new notes content to set
    """
    async with _client() as client:
        try:
            resp = await client.patch(
                f"/api/papers/{paper_id}",
                json={"notes": notes},
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return f"Paper with ID {paper_id} not found."
            return f"Error updating notes: {e}"
        except httpx.HTTPError as e:
            return f"Error updating notes: {e}"

    paper = resp.json()
    return f"Notes updated for paper [{paper_id}] \"{paper.get('title', 'Unknown')}\"."


@mcp.tool()
async def list_feeds() -> str:
    """List all configured RSS feeds.

    Returns feed names, URLs, active status, and last fetch time.
    """
    async with _client() as client:
        try:
            resp = await client.get("/api/feeds")
            resp.raise_for_status()
        except httpx.HTTPError as e:
            return f"Error listing feeds: {e}"

    feeds = resp.json()
    if not feeds:
        return "No RSS feeds configured."

    lines = [f"=== RSS Feeds ({len(feeds)}) ==="]
    for f in feeds:
        status = "Active" if f.get("is_active") else "Inactive"
        last = f.get("last_fetched") or "Never"
        lines.append(
            f"[ID {f.get('id')}] {f.get('name', 'Unnamed')} ({status})\n"
            f"  URL: {f.get('url', 'N/A')}\n"
            f"  Last fetched: {last}"
        )

    return "\n\n".join(lines)


# ---------------------------------------------------------------------------
# Knowledge-engine integration tools (JSON output)
# ---------------------------------------------------------------------------

@mcp.tool()
async def list_feed_papers(
    feed_id: int,
    since_days: int = 7,
    limit: int = 50,
    min_relevance: Optional[float] = None,
) -> str:
    """List papers ingested from a specific RSS feed (newest first).

    Designed for downstream orchestration (knowledge-engine etc.): the JSON
    payload exposes pdf_url / arxiv_id / doi so callers can chain into
    /paper-download, /parse-pdf, /deepread, etc.

    Args:
        feed_id: Feed identifier from list_feeds()
        since_days: Look back window in days (default 7)
        limit: Max items to return (default 50, capped by API)
        min_relevance: Optional minimum relevance score
    """
    params: dict[str, object] = {"since_days": since_days, "limit": limit}
    if min_relevance is not None:
        params["min_relevance"] = min_relevance
    async with _client() as client:
        try:
            resp = await client.get(f"/api/feeds/{feed_id}/papers", params=params)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)
    return json.dumps(resp.json(), ensure_ascii=False, indent=2)


@mcp.tool()
async def fetch_feed_now(feed_id: int) -> str:
    """Synchronously trigger one feed and return papers added by this run.

    Returns a JSON object {"stats": {...}, "new_items": [...]} where each
    new_items entry includes pdf_url / arxiv_id / doi for downstream tools.

    Args:
        feed_id: Feed identifier to trigger
    """
    async with _client() as client:
        try:
            resp = await client.post(f"/api/scheduler/trigger/{feed_id}")
            resp.raise_for_status()
        except httpx.HTTPError as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)
    return json.dumps(resp.json(), ensure_ascii=False, indent=2)


@mcp.tool()
async def get_paper_pdf_info(paper_id: int) -> str:
    """Return the minimal download payload for a single paper.

    Output contains only the fields paper-download / parse-pdf actually need:
    paper_id, title, pdf_url, arxiv_id, doi, link, source_feed_id.

    Args:
        paper_id: Paper identifier
    """
    async with _client() as client:
        try:
            resp = await client.get(f"/api/papers/{paper_id}")
            resp.raise_for_status()
        except httpx.HTTPError as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)
    p = resp.json()
    return json.dumps(
        {
            "paper_id": p.get("id"),
            "title": p.get("title"),
            "pdf_url": p.get("pdf_url"),
            "arxiv_id": p.get("arxiv_id"),
            "doi": p.get("doi"),
            "link": p.get("link"),
            "source_feed_id": p.get("source_feed_id"),
        },
        ensure_ascii=False,
        indent=2,
    )


@mcp.tool()
async def list_recent_papers_by_feed(
    feed_id: Optional[int] = None,
    days: int = 7,
    min_relevance: float = 0.0,
) -> str:
    """List recent papers from a specific feed (or all feeds) with a relevance floor.

    Useful as a shortlist source for deepread / paper-download pipelines.

    Args:
        feed_id: Optional feed filter; None means all feeds
        days: Look back window in days (default 7)
        min_relevance: Minimum relevance score (default 0.0)
    """
    params: dict[str, object] = {"page": 1, "size": 100, "min_relevance": min_relevance}
    if feed_id is not None:
        params["feed_id"] = feed_id
    if days:
        params["date_from"] = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    async with _client() as client:
        try:
            resp = await client.get("/api/papers", params=params)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)
    return json.dumps(resp.json(), ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()

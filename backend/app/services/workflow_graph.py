"""Template-driven academic workflow graph.

This module powers the workflow agent used by the workflow page. Unlike the
previous MVP, each workflow template has an explicit stage pipeline and the
core data-collection steps are deterministic, so the graph does not rely on
the model to "remember" which tools to call next.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from collections import Counter
from collections.abc import Iterable
from datetime import date, datetime
from itertools import combinations
from typing import Annotated, Any

from langchain_core.callbacks import dispatch_custom_event
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import Command
from sqlalchemy.orm import Session, sessionmaker
from typing_extensions import TypedDict

from .llm_registry import ResolvedLLMConfig
from .llm_runtime import build_chat_llm, extract_text_parts
from .tools.registry import execute_tool
from .workflow_template_registry import WorkflowTemplateSpec, get_workflow_template

logger = logging.getLogger("paper-tracker.workflow")

STAGE_TO_NODE = {
    "normalize": "normalize_request",
    "search": "search_agent",
    "select": "select_agent",
    "analysis": "analysis_agent",
    "trends": "trends_agent",
    "comparison": "comparison_agent",
    "gap": "gap_agent",
    "submission": "submission_agent",
    "synthesis": "synthesis_agent",
}

STAGE_TO_AGENT = {
    "normalize": "supervisor",
    "search": "search",
    "select": "supervisor",
    "analysis": "analysis",
    "trends": "trends",
    "comparison": "analysis",
    "gap": "analysis",
    "submission": "writing",
    "synthesis": "writing",
    "discussion": "discussion",
}

STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "in",
    "into",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "using",
    "via",
    "with",
    "研究",
    "方法",
    "系统",
    "问题",
    "相关",
    "方向",
}

METHOD_HINTS = (
    ("rag", "RAG / 检索增强"),
    ("retrieval", "检索"),
    ("transformer", "Transformer"),
    ("attention", "注意力机制"),
    ("reinforcement learning", "强化学习"),
    ("rl", "强化学习"),
    ("diffusion", "扩散模型"),
    ("graph", "图神经网络"),
    ("gcn", "图神经网络"),
    ("agent", "Agent 系统"),
    ("benchmark", "基准评测"),
    ("survey", "综述"),
    ("federated", "联邦学习"),
    ("multimodal", "多模态"),
    ("vision", "视觉方法"),
    ("llm", "大模型"),
)

VENUE_HINTS = (
    (("rag", "retrieval", "llm", "agent", "nlp", "language"), ["ACL", "EMNLP", "NAACL", "Findings of ACL"]),
    (("vision", "diffusion", "image", "video"), ["CVPR", "ICCV", "ECCV", "WACV"]),
    (("reinforcement", "rl", "control", "robot"), ["ICML", "NeurIPS", "ICRA", "IROS"]),
    (("graph", "gnn"), ["NeurIPS", "ICLR", "KDD", "WWW"]),
    (("system", "database", "infra", "serving"), ["OSDI", "SOSP", "USENIX ATC", "SIGMOD"]),
)


class ResearchWorkflowState(TypedDict):
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

    template_id: str
    template_params: dict[str, Any]
    llm_config_id: int | None
    workflow_status: str
    active_agent: str
    current_stage: str
    planned_stages: list[str]
    completed_stages: list[str]
    completed_agents: list[str]
    error: str | None

    research_topic: str
    source_scope: list[str]
    normalized_sources: list[str]
    time_range: str
    depth: str

    search_results: list[dict[str, Any]]
    candidate_papers: list[dict[str, Any]]
    selected_papers: list[dict[str, Any]]
    paper_analyses: list[dict[str, Any]]
    comparison_pairs: list[dict[str, Any]]
    comparison_report: str
    trend_data: dict[str, Any]
    gap_report: list[dict[str, Any]]
    submission_plan: dict[str, Any]
    final_report: str
    literature_draft: str
    recommendations: list[str]
    follow_up_questions: list[str]

    last_stage_summary: str
    recent_tool_activity: list[dict[str, Any]]


WORKFLOW_INITIAL_STATE: dict[str, Any] = {
    "template_id": "",
    "template_params": {},
    "llm_config_id": None,
    "workflow_status": "idle",
    "active_agent": "supervisor",
    "current_stage": "",
    "planned_stages": [],
    "completed_stages": [],
    "completed_agents": [],
    "error": None,
    "research_topic": "",
    "source_scope": [],
    "normalized_sources": [],
    "time_range": "近3年",
    "depth": "深度分析",
    "search_results": [],
    "candidate_papers": [],
    "selected_papers": [],
    "paper_analyses": [],
    "comparison_pairs": [],
    "comparison_report": "",
    "trend_data": {},
    "gap_report": [],
    "submission_plan": {},
    "final_report": "",
    "literature_draft": "",
    "recommendations": [],
    "follow_up_questions": [],
    "last_stage_summary": "",
    "recent_tool_activity": [],
}


def _get_template(template_id: str | None) -> WorkflowTemplateSpec:
    return get_workflow_template(template_id)


MAX_SEARCH_QUERIES = 3
MAX_CONCURRENT_TOOL_JOBS = 3


def _resolved_config_from_state(state: ResearchWorkflowState, *, api_key: str | None = None) -> ResolvedLLMConfig:
    """Reconstruct ResolvedLLMConfig from state + closure-captured api_key."""
    return ResolvedLLMConfig(
        provider_key=state["provider_key"],
        display_name=state["display_name"],
        model_name=state["model_name"],
        litellm_model=state["litellm_model"],
        api_key=api_key,
        api_base=state["base_url"],
        extra_headers=state.get("extra_headers", {}),
        model_kwargs=state.get("model_kwargs", {}),
        api_format=state["api_format"],
        is_local=state["is_local"],
        supports_streaming=state["supports_streaming"],
        supports_tool_calling=state["supports_tool_calling"],
        supports_reasoning=state["supports_reasoning"],
        supports_vision=state["supports_vision"],
    )


def _normalize_sources(raw_sources: Any) -> list[str]:
    if not raw_sources:
        return ["local"]
    if isinstance(raw_sources, str):
        raw_items = [raw_sources]
    elif isinstance(raw_sources, Iterable):
        raw_items = list(raw_sources)
    else:
        return ["local"]

    normalized: list[str] = []
    for item in raw_items:
        lowered = str(item).strip().lower()
        if lowered in {"本地论文库", "local", "db", "database"}:
            normalized.append("local")
    return normalized or ["local"]


def _extract_keywords(text: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9\-\+\.#/]{1,}|[\u4e00-\u9fff]{2,}", (text or "").lower())
    seen: set[str] = set()
    keywords: list[str] = []
    for token in tokens:
        if token in STOP_WORDS:
            continue
        if len(token) < 2:
            continue
        if token in seen:
            continue
        seen.add(token)
        keywords.append(token)
    return keywords


def _paper_unique_key(paper: dict[str, Any]) -> str:
    for key in ("doi", "arxiv_id"):
        value = str(paper.get(key) or "").strip().lower()
        if value:
            return f"{key}:{value}"
    title = re.sub(r"\s+", " ", str(paper.get("title") or "").strip().lower())
    return f"title:{title}"


def _parse_year(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, datetime):
        return value.year
    if isinstance(value, date):
        return value.year
    text = str(value).strip()
    match = re.search(r"(19|20)\d{2}", text)
    if match:
        return int(match.group(0))
    return None


def _year_allowed(year: int | None, time_range: str) -> bool:
    if year is None or time_range in {"全部", "", None}:
        return True
    now_year = datetime.now().year
    if time_range == "近1年":
        return year >= now_year - 1
    if time_range == "近3年":
        return year >= now_year - 3
    if time_range == "近5年":
        return year >= now_year - 5
    return True


def _first_sentences(text: str, limit: int = 2, fallback_chars: int = 180) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return ""
    sentences = re.split(r"(?<=[。！？.!?])\s+", cleaned)
    useful = [sentence.strip() for sentence in sentences if sentence.strip()]
    if useful:
        return " ".join(useful[:limit])
    return cleaned[:fallback_chars]


def _extract_methodology(text: str) -> str:
    lowered = (text or "").lower()
    matches = [label for needle, label in METHOD_HINTS if needle in lowered]
    deduped: list[str] = []
    for match in matches:
        if match not in deduped:
            deduped.append(match)
    return "、".join(deduped[:3]) if deduped else "待阅读全文确认"


def _extract_limitations(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return "元数据中未直接给出局限性，需要阅读全文确认。"
    sentences = re.split(r"(?<=[。！？.!?])\s+", cleaned)
    for sentence in sentences:
        lowered = sentence.lower()
        if any(keyword in lowered for keyword in ("limitation", "future work", "however", "不足", "局限", "未来工作")):
            return sentence.strip()
    return "元数据中未直接给出局限性，需要阅读全文确认。"


def _safe_author_string(authors: Any) -> str:
    if isinstance(authors, list):
        return ", ".join(str(item) for item in authors if item)
    return str(authors or "").strip()


def _topic_match_score(topic_keywords: list[str], paper: dict[str, Any]) -> float:
    title = str(paper.get("title") or "").lower()
    abstract = str(paper.get("abstract") or paper.get("summary") or "").lower()
    category = str(paper.get("category") or "").lower()
    score = 0.0
    for keyword in topic_keywords:
        if keyword in title:
            score += 3.0
        if keyword in abstract:
            score += 1.5
        if keyword in category:
            score += 1.0
    relevance = paper.get("relevance")
    try:
        if relevance is not None:
            score += float(relevance) / 2.0
    except (TypeError, ValueError):
        pass
    year = _parse_year(paper.get("year") or paper.get("published_date"))
    if year:
        score += max(0.0, year - 2018) * 0.1
    return round(score, 2)


def _parse_tool_result(raw: str) -> tuple[Any, Any]:
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None, raw
    if isinstance(parsed, dict) and "data" in parsed:
        return parsed, parsed.get("data")
    return parsed, parsed


def _run_tool(db: Session, name: str, args: dict[str, Any]) -> tuple[Any, Any, str]:
    raw = execute_tool(db, name, args)
    parsed, data = _parse_tool_result(raw)
    return parsed, data, raw


def _session_factory_from(db: Session):
    return sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind())


def _can_offload_tool_calls(db: Session) -> bool:
    bind = db.get_bind()
    pool_name = bind.pool.__class__.__name__
    return pool_name != "StaticPool"


def _run_tool_in_new_session(session_factory, name: str, args: dict[str, Any]) -> tuple[Any, Any, str]:
    session = session_factory()
    try:
        return _run_tool(session, name, args)
    finally:
        session.close()


async def _run_tool_async(session_factory, name: str, args: dict[str, Any]) -> tuple[Any, Any, str]:
    return await asyncio.to_thread(_run_tool_in_new_session, session_factory, name, args)


async def _run_tool_jobs(
    session_factory,
    jobs: list[tuple[str, dict[str, Any]]],
    *,
    concurrency: int = MAX_CONCURRENT_TOOL_JOBS,
) -> list[tuple[str, dict[str, Any], tuple[Any, Any, str]]]:
    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def _runner(name: str, args: dict[str, Any]):
        async with semaphore:
            return name, args, await _run_tool_async(session_factory, name, args)

    return await asyncio.gather(*(_runner(name, args) for name, args in jobs))


def _normalize_local_paper(paper: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": paper.get("id"),
        "paper_id": paper.get("id"),
        "title": paper.get("title") or "未命名论文",
        "authors": _safe_author_string(paper.get("authors")),
        "abstract": paper.get("abstract") or paper.get("ai_summary") or "",
        "summary": paper.get("ai_summary") or _first_sentences(paper.get("abstract") or "", limit=2),
        "notes": paper.get("notes") or "",
        "source_kind": "local",
        "source_label": paper.get("source") or "本地论文库",
        "published_date": paper.get("published_date"),
        "year": _parse_year(paper.get("published_date")),
        "category": paper.get("category") or "",
        "relevance": paper.get("relevance"),
        "doi": paper.get("doi"),
        "arxiv_id": paper.get("arxiv_id"),
        "link": paper.get("link") or paper.get("pdf_url"),
    }


def _deduplicate_candidates(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for item in items:
        key = _paper_unique_key(item)
        existing = deduped.get(key)
        if existing is None or float(item.get("match_score") or 0) > float(existing.get("match_score") or 0):
            deduped[key] = item
    return list(deduped.values())


def _count_keywords(papers: list[dict[str, Any]], *, limit: int = 8) -> list[dict[str, Any]]:
    counter: Counter[str] = Counter()
    for paper in papers:
        text = " ".join(
            str(paper.get(key) or "")
            for key in ("title", "abstract", "summary", "category")
        )
        for token in _extract_keywords(text):
            counter[token] += 1
    return [
        {"keyword": keyword, "count": count}
        for keyword, count in counter.most_common(limit)
    ]


def _selection_count(template: WorkflowTemplateSpec, params: dict[str, Any]) -> int:
    explicit = params.get("paperCount") or params.get("comparisonCount") or params.get("targetPaperCount")
    if explicit is not None:
        match = re.search(r"\d+", str(explicit))
        if match:
            return max(2, min(int(match.group(0)), 10))
    return template.default_selection_count


def _recommend_venues(topic: str, papers: list[dict[str, Any]]) -> list[str]:
    source_text = " ".join([topic] + [str(p.get("title") or "") for p in papers] + [str(p.get("category") or "") for p in papers]).lower()
    venues: list[str] = []
    for keywords, suggestions in VENUE_HINTS:
        if any(keyword in source_text for keyword in keywords):
            for venue in suggestions:
                if venue not in venues:
                    venues.append(venue)
    if not venues:
        venues.extend(["NeurIPS", "ICLR", "ICML"])
    return venues[:4]


def _markdown_bullets_from_report(report: str, heading: str) -> list[str]:
    if not report:
        return []
    pattern = rf"^##\s*{re.escape(heading)}\s*$"
    lines = report.splitlines()
    collecting = False
    items: list[str] = []
    for line in lines:
        stripped = line.strip()
        if re.match(pattern, stripped, re.IGNORECASE):
            collecting = True
            continue
        if collecting and stripped.startswith("## "):
            break
        if collecting and stripped.startswith(("- ", "* ", "1. ", "2. ", "3. ")):
            items.append(re.sub(r"^(\-|\*|\d+\.)\s*", "", stripped))
    return items[:5]


def _mark_stage_complete(state: ResearchWorkflowState, stage: str) -> dict[str, Any]:
    completed_stages = list(state.get("completed_stages", []))
    if stage not in completed_stages:
        completed_stages.append(stage)
    completed_agents = list(state.get("completed_agents", []))
    if stage not in completed_agents:
        completed_agents.append(stage)
    workflow_status = "completed" if stage == "synthesis" else "running"
    return {
        "completed_stages": completed_stages,
        "completed_agents": completed_agents,
        "current_stage": stage,
        "active_agent": "supervisor",
        "workflow_status": workflow_status,
    }


def _build_stage_summary(stage_label: str, detail: str) -> str:
    return f"{stage_label}已完成。\n\n{detail}".strip()


def _latest_user_message(state: ResearchWorkflowState) -> str:
    for message in reversed(state.get("messages", [])):
        if isinstance(message, HumanMessage):
            return str(message.content or "").strip()
    return ""


async def supervisor_node(state: ResearchWorkflowState) -> Command:
    template = _get_template(state.get("template_id"))
    completed_stages = set(state.get("completed_stages", []))
    final_report = str(state.get("final_report") or "")
    last_message = state.get("messages", [])[-1] if state.get("messages") else None

    if final_report and state.get("workflow_status") == "completed" and isinstance(last_message, HumanMessage):
        return Command(
            goto="discussion_agent",
            update={
                "active_agent": "discussion",
                "current_stage": "discussion",
                "last_stage_summary": "",
                "recent_tool_activity": [],
                "workflow_status": "completed",
            },
        )

    planned_stages = state.get("planned_stages") or list(template.stages)
    for stage in planned_stages:
        if stage not in completed_stages:
            return Command(
                goto=STAGE_TO_NODE[stage],
                update={
                    "active_agent": STAGE_TO_AGENT.get(stage, "supervisor"),
                    "current_stage": stage,
                    "planned_stages": planned_stages,
                    "workflow_status": "running",
                    "last_stage_summary": "",
                    "recent_tool_activity": [],
                },
            )

    return Command(
        goto=END,
        update={
            "active_agent": "supervisor",
            "current_stage": "completed",
            "workflow_status": "completed",
            "last_stage_summary": "",
            "recent_tool_activity": [],
        },
    )


async def normalize_request_node(state: ResearchWorkflowState) -> Command:
    template = _get_template(state.get("template_id"))
    params = dict(state.get("template_params") or {})
    topic = str(params.get("topic") or state.get("research_topic") or _latest_user_message(state)).strip()
    normalized_sources = _normalize_sources(params.get("sources"))
    update = {
        **_mark_stage_complete(state, "normalize"),
        "template_id": template.template_id,
        "planned_stages": list(template.stages),
        "template_params": params,
        "research_topic": topic,
        "time_range": str(params.get("timeRange") or state.get("time_range") or "近3年"),
        "depth": str(params.get("depth") or state.get("depth") or "深度分析"),
        "source_scope": normalized_sources,
        "normalized_sources": normalized_sources,
        "last_stage_summary": _build_stage_summary(
            "工作流初始化",
            f"已启动「{template.label}」，研究主题为「{topic or '未指定主题'}」，后续将按模板阶段自动执行。",
        ),
        "recent_tool_activity": [],
        "error": None,
    }
    return Command(goto="supervisor", update=update)


async def search_agent_node(state: ResearchWorkflowState, db: Session) -> Command:
    topic = state.get("research_topic", "").strip()
    time_range = state.get("time_range", "近3年")
    sources = state.get("normalized_sources", ["local"])
    topic_keywords = _extract_keywords(topic)
    search_queries: list[str] = []
    for query in [topic, *topic_keywords[: MAX_SEARCH_QUERIES - 1]]:
        normalized_query = str(query or "").strip()
        if normalized_query and normalized_query not in search_queries:
            search_queries.append(normalized_query)
    if not search_queries and topic:
        search_queries.append(topic)

    session_factory = _session_factory_from(db)
    can_offload = _can_offload_tool_calls(db)
    tool_activity: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []

    dispatch_custom_event("workflow_progress", {
        "activity_type": "search_progress",
        "stage": "search",
        "current": 0,
        "total": len(search_queries),
        "detail": f"开始检索: {len(search_queries)} 个查询",
    })

    if "local" in sources:
        local_jobs = [("search_papers", {"query": query, "limit": 12}) for query in search_queries]
        local_results = (
            await _run_tool_jobs(session_factory, local_jobs)
            if can_offload
            else [(name, args, _run_tool(db, name, args)) for name, args in local_jobs]
        )
        for tool_name, args, (_, local_data, local_raw) in local_results:
            tool_activity.append({
                "id": str(uuid.uuid4()),
                "name": tool_name,
                "args": args,
                "result": local_raw,
            })
            if isinstance(local_data, list):
                for item in local_data:
                    normalized = _normalize_local_paper(item)
                    if _year_allowed(normalized.get("year"), time_range):
                        normalized["match_score"] = _topic_match_score(topic_keywords, normalized)
                        candidates.append(normalized)

        if len(candidates) < 3:
            _, latest_data, latest_raw = (
                await _run_tool_async(session_factory, "get_latest_papers", {"limit": 12})
                if can_offload
                else _run_tool(db, "get_latest_papers", {"limit": 12})
            )
            tool_activity.append({
                "id": str(uuid.uuid4()),
                "name": "get_latest_papers",
                "args": {"limit": 12},
                "result": latest_raw,
            })
            if isinstance(latest_data, list):
                for item in latest_data:
                    normalized = _normalize_local_paper(item)
                    if _year_allowed(normalized.get("year"), time_range):
                        normalized["match_score"] = _topic_match_score(topic_keywords, normalized)
                        candidates.append(normalized)

    dispatch_custom_event("workflow_progress", {
        "activity_type": "search_progress",
        "stage": "search",
        "current": len(search_queries),
        "total": len(search_queries),
        "detail": f"本地检索完成，找到 {len(candidates)} 篇候选",
    })

    deduped = _deduplicate_candidates(candidates)
    deduped.sort(
        key=lambda paper: (
            float(paper.get("match_score") or 0),
            paper.get("year") or 0,
            float(paper.get("relevance") or 0),
        ),
        reverse=True,
    )
    deduped = deduped[:20]

    summary_parts = [f"共整理出 {len(deduped)} 篇候选文献。"]
    if not deduped:
        summary_parts.append("当前数据源中未找到高相关文献，建议放宽时间范围或补充数据源。")

    update = {
        **_mark_stage_complete(state, "search"),
        "candidate_papers": deduped,
        "search_results": deduped,
        "last_stage_summary": _build_stage_summary("文献检索", " ".join(summary_parts)),
        "recent_tool_activity": tool_activity,
    }
    return Command(goto="supervisor", update=update)


async def select_agent_node(state: ResearchWorkflowState) -> Command:
    template = _get_template(state.get("template_id"))
    topic_keywords = _extract_keywords(state.get("research_topic", ""))
    candidates = list(state.get("candidate_papers", []))
    for paper in candidates:
        if paper.get("match_score") is None:
            paper["match_score"] = _topic_match_score(topic_keywords, paper)
    candidates.sort(
        key=lambda paper: (
            float(paper.get("match_score") or 0),
            paper.get("year") or 0,
            float(paper.get("relevance") or 0),
        ),
        reverse=True,
    )
    limit = _selection_count(template, state.get("template_params", {}))
    selected = candidates[:limit]
    summary = (
        f"已从候选集中筛出 {len(selected)} 篇代表性论文，后续将围绕这些论文做深入分析。"
        if selected
        else "候选文献为空，后续分析将基于当前主题给出策略建议。"
    )
    update = {
        **_mark_stage_complete(state, "select"),
        "selected_papers": selected,
        "last_stage_summary": _build_stage_summary("代表论文筛选", summary),
        "recent_tool_activity": [],
    }
    return Command(goto="supervisor", update=update)


async def analysis_agent_node(state: ResearchWorkflowState, db: Session) -> Command:
    selected = list(state.get("selected_papers", []))
    tool_activity: list[dict[str, Any]] = []
    analyses: list[dict[str, Any]] = []
    session_factory = _session_factory_from(db)
    can_offload = _can_offload_tool_calls(db)
    detail_jobs = [
        ("get_paper_detail", {"paper_id": paper["paper_id"]})
        for paper in selected[:8]
        if paper.get("source_kind") == "local" and paper.get("paper_id")
    ]
    detail_results = (
        await _run_tool_jobs(session_factory, detail_jobs)
        if detail_jobs and can_offload
        else [(name, args, _run_tool(db, name, args)) for name, args in detail_jobs]
    )
    detail_by_paper_id = {
        args["paper_id"]: (detail_data, detail_raw)
        for _, args, (_, detail_data, detail_raw) in detail_results
    }

    dispatch_custom_event("workflow_progress", {
        "activity_type": "analysis_progress",
        "stage": "analysis",
        "current": 0,
        "total": min(len(selected), 8),
        "detail": f"开始分析 {min(len(selected), 8)} 篇论文",
    })

    for paper in selected[:8]:
        enriched = dict(paper)
        if paper.get("source_kind") == "local" and paper.get("paper_id") in detail_by_paper_id:
            detail_data, detail_raw = detail_by_paper_id[paper["paper_id"]]
            tool_activity.append({
                "id": str(uuid.uuid4()),
                "name": "get_paper_detail",
                "args": {"paper_id": paper["paper_id"]},
                "result": detail_raw,
            })
            if isinstance(detail_data, dict):
                enriched.update(_normalize_local_paper(detail_data))
        text_blobs = [
            str(enriched.get("summary") or ""),
            str(enriched.get("abstract") or ""),
            str(enriched.get("notes") or ""),
        ]
        full_text = " ".join(text_blobs)
        analyses.append(
            {
                "paper_id": enriched.get("paper_id"),
                "source_kind": enriched.get("source_kind"),
                "title": enriched.get("title"),
                "authors": enriched.get("authors"),
                "year": enriched.get("year"),
                "methodology": _extract_methodology(full_text),
                "key_findings": _first_sentences(full_text, limit=2),
                "contributions": _first_sentences(str(enriched.get("summary") or enriched.get("abstract") or ""), limit=1),
                "limitations": _extract_limitations(" ".join([str(enriched.get("notes") or ""), str(enriched.get("abstract") or "")])),
                "category": enriched.get("category"),
                "link": enriched.get("link"),
            }
        )
        dispatch_custom_event("workflow_progress", {
            "activity_type": "analysis_progress",
            "stage": "analysis",
            "current": len(analyses),
            "total": min(len(selected), 8),
            "detail": f"分析论文: {enriched.get('title', '未知')[:40]}",
        })

    summary = (
        f"已对 {len(analyses)} 篇论文完成结构化分析。"
        if analyses
        else "没有可分析的代表论文，后续会基于主题与已有检索结果给出建议。"
    )
    update = {
        **_mark_stage_complete(state, "analysis"),
        "paper_analyses": analyses,
        "last_stage_summary": _build_stage_summary("论文分析", summary),
        "recent_tool_activity": tool_activity,
    }
    return Command(goto="supervisor", update=update)


async def trends_agent_node(state: ResearchWorkflowState) -> Command:
    papers = list(state.get("selected_papers") or state.get("candidate_papers") or [])
    year_counts: Counter[int] = Counter()
    source_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    method_counts: Counter[str] = Counter()

    for paper in papers:
        year = _parse_year(paper.get("year") or paper.get("published_date"))
        if year:
            year_counts[year] += 1
        source_counts[str(paper.get("source_label") or paper.get("source_kind") or "未知来源")] += 1
        category_counts[str(paper.get("category") or "未分类")] += 1

    for analysis in state.get("paper_analyses", []):
        for part in str(analysis.get("methodology") or "").split("、"):
            part = part.strip()
            if part:
                method_counts[part] += 1

    trend_data = {
        "year_distribution": [
            {"year": year, "count": count}
            for year, count in sorted(year_counts.items())
        ],
        "source_distribution": [
            {"source": source, "count": count}
            for source, count in source_counts.most_common()
        ],
        "category_distribution": [
            {"category": category, "count": count}
            for category, count in category_counts.most_common(6)
        ],
        "method_distribution": [
            {"method": method, "count": count}
            for method, count in method_counts.most_common(6)
        ],
        "top_keywords": _count_keywords(papers, limit=8),
    }
    hot_keywords = [item["keyword"] for item in trend_data["top_keywords"][:3]]
    summary = "已完成趋势梳理。"
    if hot_keywords:
        summary += f" 当前高频主题包括：{'、'.join(hot_keywords)}。"
    update = {
        **_mark_stage_complete(state, "trends"),
        "trend_data": trend_data,
        "last_stage_summary": _build_stage_summary("趋势分析", summary),
        "recent_tool_activity": [],
    }
    return Command(goto="supervisor", update=update)


async def comparison_agent_node(state: ResearchWorkflowState) -> Command:
    analyses = list(state.get("paper_analyses", []))
    if len(analyses) < 2:
        update = {
            **_mark_stage_complete(state, "comparison"),
            "comparison_pairs": [],
            "comparison_report": "代表论文不足两篇，暂无法形成有效对比。",
            "last_stage_summary": _build_stage_summary("论文对比", "代表论文不足两篇，已记录为待补充。"),
            "recent_tool_activity": [],
        }
        return Command(goto="supervisor", update=update)

    pairs: list[dict[str, Any]] = []
    report_lines = ["## 论文对比概览"]
    for left, right in combinations(analyses[:4], 2):
        pair = {
            "paper_a": left.get("title"),
            "paper_b": right.get("title"),
            "method_a": left.get("methodology"),
            "method_b": right.get("methodology"),
            "finding_a": left.get("key_findings"),
            "finding_b": right.get("key_findings"),
            "difference": f"{left.get('title')} 偏重 {left.get('methodology')}；{right.get('title')} 偏重 {right.get('methodology')}。",
        }
        pairs.append(pair)
        report_lines.extend(
            [
                f"### {left.get('title')} vs {right.get('title')}",
                f"- 方法差异：{pair['difference']}",
                f"- 论文 A 重点：{left.get('key_findings')}",
                f"- 论文 B 重点：{right.get('key_findings')}",
            ]
        )
    update = {
        **_mark_stage_complete(state, "comparison"),
        "comparison_pairs": pairs,
        "comparison_report": "\n".join(report_lines),
        "last_stage_summary": _build_stage_summary("论文对比", f"已生成 {len(pairs)} 组论文对比。"),
        "recent_tool_activity": [],
    }
    return Command(goto="supervisor", update=update)


async def gap_agent_node(state: ResearchWorkflowState) -> Command:
    analyses = list(state.get("paper_analyses", []))
    trend_data = dict(state.get("trend_data") or {})
    method_distribution = trend_data.get("method_distribution") or []
    year_distribution = trend_data.get("year_distribution") or []
    gap_report: list[dict[str, Any]] = []

    if method_distribution:
        dominant = method_distribution[0]
        gap_report.append(
            {
                "title": "方法多样性不足",
                "rationale": f"当前代表论文中 {dominant['method']} 占比最高，说明替代性方法探索仍有空间。",
                "opportunity": "引入不同范式或跨模态组合，验证方法稳健性。",
            }
        )
    if year_distribution and max(item["year"] for item in year_distribution) < datetime.now().year - 1:
        gap_report.append(
            {
                "title": "近一年更新不足",
                "rationale": "近一年没有足够新的代表性文献，领域可能缺少最新公开结果或你的数据源尚未覆盖。",
                "opportunity": "补充最新预印本、工业博客或会议论文，校验最近趋势是否变化。",
            }
        )
    if analyses:
        gap_report.append(
            {
                "title": "评测与真实场景落差",
                "rationale": "从现有摘要与笔记看，多数工作强调方法贡献，但对部署成本、数据质量和长期效果讨论较少。",
                "opportunity": "围绕真实场景约束、成本或可解释性设计新的实验轴。",
            }
        )
    if not gap_report:
        gap_report.append(
            {
                "title": "数据不足",
                "rationale": "候选论文不足以支持稳定的研究空白判断。",
                "opportunity": "建议扩大时间范围、接入更多数据源或补充更明确的关键词。",
            }
        )

    update = {
        **_mark_stage_complete(state, "gap"),
        "gap_report": gap_report,
        "last_stage_summary": _build_stage_summary("研究空白发现", f"已提炼出 {len(gap_report)} 个潜在研究空白。"),
        "recent_tool_activity": [],
    }
    return Command(goto="supervisor", update=update)


async def submission_agent_node(state: ResearchWorkflowState) -> Command:
    selected = list(state.get("selected_papers", []))
    analyses = list(state.get("paper_analyses", []))
    topic = state.get("research_topic", "")
    submission_plan = {
        "recommended_venues": _recommend_venues(topic, selected),
        "positioning": _first_sentences(state.get("comparison_report") or state.get("final_report") or topic, limit=2),
        "related_work_clusters": [item["keyword"] for item in _count_keywords(selected, limit=5)],
        "novelty_checks": [
            "确认你的方法是否覆盖当前代表论文未解决的约束或场景。",
            "对比至少 2-3 篇最接近工作，明确方法、数据和评测差异。",
            "准备实验设计，证明你的方案在成本、效果或可解释性上有增益。",
        ],
    }
    if analyses:
        submission_plan["positioning"] = (
            f"建议把工作定位为围绕「{topic}」的差异化方案，重点回应代表论文在 {analyses[0].get('methodology')} "
            "与真实落地之间的断层。"
        )
    update = {
        **_mark_stage_complete(state, "submission"),
        "submission_plan": submission_plan,
        "last_stage_summary": _build_stage_summary(
            "投稿准备",
            f"已整理投稿策略，并给出 {len(submission_plan['recommended_venues'])} 个优先 venue 建议。",
        ),
        "recent_tool_activity": [],
    }
    return Command(goto="supervisor", update=update)


def _template_specific_sections(template: WorkflowTemplateSpec) -> str:
    return "\n".join(template.synthesis_instructions)


async def synthesis_agent_node(state: ResearchWorkflowState, *, resolved: ResolvedLLMConfig | None = None) -> Command:
    template = _get_template(state.get("template_id"))
    resolved_cfg = resolved or _resolved_config_from_state(state)
    llm = build_chat_llm(resolved_cfg, streaming=True)
    context_payload = {
        "topic": state.get("research_topic"),
        "template": template.label,
        "description": template.description,
        "time_range": state.get("time_range"),
        "sources": state.get("normalized_sources"),
        "selected_papers": state.get("selected_papers", [])[:8],
        "paper_analyses": state.get("paper_analyses", [])[:8],
        "trend_data": state.get("trend_data", {}),
        "comparison_report": state.get("comparison_report", ""),
        "gap_report": state.get("gap_report", []),
        "submission_plan": state.get("submission_plan", {}),
    }
    prompt = (
        f"当前 workflow 模板：{template.label}\n"
        f"目标：{template.synthesis_goal}\n\n"
        f"{_template_specific_sections(template)}\n\n"
        "请基于下面的结构化上下文生成最终 Markdown 报告，内容务必具体、专业、可执行，"
        "不要虚构未给出的论文结论。\n\n"
        f"上下文 JSON:\n{json.dumps(context_payload, ensure_ascii=False, indent=2)}"
    )
    response = await llm.ainvoke(
        [
            SystemMessage(content="你是资深科研顾问，负责把结构化文献信息整理成高质量研究报告。默认使用中文。"),
            HumanMessage(content=prompt),
        ]
    )
    response_text = "".join(extract_text_parts(response.content)).strip()
    if not response_text:
        response_text = str(response.content)

    recommendations = _markdown_bullets_from_report(response_text, "建议")
    follow_up_questions = _markdown_bullets_from_report(response_text, "后续问题")
    update = {
        **_mark_stage_complete(state, "synthesis"),
        "messages": [response],
        "final_report": response_text,
        "literature_draft": response_text if template.template_id == "literature_survey" else state.get("literature_draft", ""),
        "recommendations": recommendations,
        "follow_up_questions": follow_up_questions,
        "last_stage_summary": "",
        "recent_tool_activity": [],
    }
    return Command(goto="supervisor", update=update)


async def discussion_agent_node(state: ResearchWorkflowState, *, resolved: ResolvedLLMConfig | None = None) -> dict[str, Any]:
    resolved_cfg = resolved or _resolved_config_from_state(state)
    llm = build_chat_llm(resolved_cfg, streaming=True)
    question = _latest_user_message(state)
    context_payload = {
        "topic": state.get("research_topic"),
        "template_id": state.get("template_id"),
        "final_report": state.get("final_report"),
        "selected_papers": state.get("selected_papers", [])[:6],
        "paper_analyses": state.get("paper_analyses", [])[:6],
        "trend_data": state.get("trend_data", {}),
        "comparison_report": state.get("comparison_report", ""),
        "gap_report": state.get("gap_report", []),
        "submission_plan": state.get("submission_plan", {}),
    }
    prompt = (
        "你正在继续回答同一个 workflow 会话中的追问。"
        "只能基于现有 workflow 上下文回答，若信息不足要明确指出。\n\n"
        f"用户问题：{question}\n\n"
        f"Workflow 上下文：\n{json.dumps(context_payload, ensure_ascii=False, indent=2)}"
    )
    response = await llm.ainvoke(
        [
            SystemMessage(content="你是 Paper Tracker Core 的 workflow 助手，负责围绕已有工作流结果回答追问。默认中文。"),
            HumanMessage(content=prompt),
        ]
    )
    return {
        "messages": [response],
        "active_agent": "supervisor",
        "current_stage": "discussion",
        "workflow_status": "completed",
        "last_stage_summary": "",
        "recent_tool_activity": [],
    }


def create_workflow_graph(db: Session, checkpointer=None, resolved: ResolvedLLMConfig | None = None):
    async def _search_agent(state: ResearchWorkflowState) -> Command:
        return await search_agent_node(state, db)

    async def _analysis_agent(state: ResearchWorkflowState) -> Command:
        return await analysis_agent_node(state, db)

    async def _synthesis_agent(state: ResearchWorkflowState) -> Command:
        return await synthesis_agent_node(state, resolved=resolved)

    async def _discussion_agent(state: ResearchWorkflowState) -> dict[str, Any]:
        return await discussion_agent_node(state, resolved=resolved)

    workflow = StateGraph(ResearchWorkflowState)
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("normalize_request", normalize_request_node)
    workflow.add_node("search_agent", _search_agent)
    workflow.add_node("select_agent", select_agent_node)
    workflow.add_node("analysis_agent", _analysis_agent)
    workflow.add_node("trends_agent", trends_agent_node)
    workflow.add_node("comparison_agent", comparison_agent_node)
    workflow.add_node("gap_agent", gap_agent_node)
    workflow.add_node("submission_agent", submission_agent_node)
    workflow.add_node("synthesis_agent", _synthesis_agent)
    workflow.add_node("discussion_agent", _discussion_agent)

    workflow.add_edge(START, "supervisor")
    for node_name in (
        "normalize_request",
        "search_agent",
        "select_agent",
        "analysis_agent",
        "trends_agent",
        "comparison_agent",
        "gap_agent",
        "submission_agent",
        "synthesis_agent",
        "discussion_agent",
    ):
        workflow.add_edge(node_name, "supervisor")

    return workflow.compile(checkpointer=checkpointer)

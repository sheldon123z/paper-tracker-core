"""Paper-related tool executors."""

import json

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models import Paper, PaperTag, Tag
from .helpers import _format_paper, _format_paper_detail, _paper_to_dict


def _execute_search_papers(db: Session, arguments: dict) -> str:
    query_str = arguments.get("query", "")
    category = arguments.get("category")
    limit = min(arguments.get("limit", 10), 50)

    q = db.query(Paper)
    if query_str:
        like_pattern = f"%{query_str}%"
        q = q.filter(
            Paper.title.ilike(like_pattern)
            | Paper.authors.ilike(like_pattern)
            | Paper.abstract.ilike(like_pattern)
            | Paper.category.ilike(like_pattern)
        )
    if category:
        q = q.filter(Paper.category.ilike(f"%{category}%"))

    papers = q.order_by(Paper.relevance.desc(), Paper.created_at.desc()).limit(limit).all()

    if not papers:
        return f"No papers found matching '{query_str}'" + (f" in category '{category}'" if category else "") + "."

    header = f"Found {len(papers)} paper(s) matching '{query_str}'"
    if category:
        header += f" in category '{category}'"
    lines = [header + ":\n"]
    for paper in papers:
        lines.append(_format_paper(paper))
        lines.append("")
    text = "\n".join(lines)
    return json.dumps({
        "type": "search_papers",
        "summary": text,
        "data": [_paper_to_dict(p) for p in papers],
    }, ensure_ascii=False)


def _execute_get_paper_detail(db: Session, arguments: dict) -> str:
    paper_id = arguments.get("paper_id")
    if not paper_id:
        return "Error: paper_id is required."

    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        return f"Paper with ID {paper_id} not found."

    text = _format_paper_detail(paper)
    return json.dumps({
        "type": "get_paper_detail",
        "summary": text,
        "data": _paper_to_dict(paper),
    }, ensure_ascii=False)


def _execute_get_latest_papers(db: Session, arguments: dict) -> str:
    limit = min(arguments.get("limit", 10), 50)
    papers = db.query(Paper).order_by(Paper.created_at.desc()).limit(limit).all()

    if not papers:
        return "No papers in the database."

    lines = [f"Latest {len(papers)} paper(s):\n"]
    for paper in papers:
        lines.append(_format_paper(paper))
        lines.append("")
    text = "\n".join(lines)
    return json.dumps({
        "type": "get_latest_papers",
        "summary": text,
        "data": [_paper_to_dict(p) for p in papers],
    }, ensure_ascii=False)


def _execute_get_category_papers(db: Session, arguments: dict) -> str:
    category = arguments.get("category", "")
    limit = min(arguments.get("limit", 20), 50)

    if not category:
        return "Error: category is required."

    papers = (
        db.query(Paper)
        .filter(Paper.category.ilike(f"%{category}%"))
        .order_by(Paper.relevance.desc(), Paper.created_at.desc())
        .limit(limit)
        .all()
    )

    if not papers:
        return f"No papers found in category '{category}'."

    lines = [f"Papers in category '{category}' ({len(papers)} results):\n"]
    for paper in papers:
        lines.append(_format_paper(paper))
        lines.append("")
    text = "\n".join(lines)
    return json.dumps({
        "type": "get_category_papers",
        "summary": text,
        "data": [_paper_to_dict(p) for p in papers],
    }, ensure_ascii=False)


def _execute_get_paper_timeline(db: Session, arguments: dict) -> str:
    granularity = arguments.get("granularity", "week")
    category = arguments.get("category")
    limit = min(arguments.get("limit", 12), 52)

    fmt = "%Y-%W" if granularity == "week" else "%Y-%m"
    label = "week" if granularity == "week" else "month"

    q = db.query(
        func.strftime(fmt, Paper.created_at).label("period"),
        func.count(Paper.id).label("count"),
        func.round(func.avg(Paper.relevance), 2).label("avg_relevance"),
    )
    if category:
        q = q.filter(Paper.category.ilike(f"%{category}%"))
    rows = (
        q.group_by("period")
        .order_by(func.strftime(fmt, Paper.created_at).desc())
        .limit(limit)
        .all()
    )

    if not rows:
        return "No papers found for timeline analysis."

    # Reverse to chronological order for display
    rows = list(reversed(rows))

    lines = [f"Paper intake timeline (by {label})" + (f", category: {category}" if category else "") + ":\n"]
    data_list = []
    for period, count, avg_rel in rows:
        avg_rel_val = float(avg_rel) if avg_rel else 0.0
        lines.append(f"  {period}: {count} papers (avg relevance: {avg_rel_val:.2f})")
        data_list.append({"period": period, "count": count, "avg_relevance": avg_rel_val})

    total = sum(r["count"] for r in data_list)
    lines.append(f"\n  Total: {total} papers across {len(data_list)} {label}s")
    text = "\n".join(lines)
    return json.dumps({
        "type": "get_paper_timeline",
        "summary": text,
        "data": {"granularity": granularity, "periods": data_list, "total": total},
    }, ensure_ascii=False)


def _execute_get_paper_notes(db: Session, arguments: dict) -> str:
    paper_id = arguments.get("paper_id")
    limit = min(arguments.get("limit", 10), 50)

    if paper_id:
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            return f"Paper with ID {paper_id} not found."
        lines = [
            f"Notes for [ID:{paper.id}] {paper.title}:\n",
            f"  Notes: {paper.notes or '(empty)'}",
            f"  AI Summary: {paper.ai_summary or '(none)'}",
        ]
        text = "\n".join(lines)
        return json.dumps({
            "type": "get_paper_notes",
            "summary": text,
            "data": [{
                "id": paper.id, "title": paper.title,
                "notes": paper.notes or "", "ai_summary": paper.ai_summary or "",
            }],
        }, ensure_ascii=False)

    # List all papers with notes
    papers = (
        db.query(Paper)
        .filter((Paper.notes.isnot(None)) & (Paper.notes != ""))
        .order_by(Paper.updated_at.desc())
        .limit(limit)
        .all()
    )

    if not papers:
        return "No papers with notes found."

    lines = [f"Papers with notes ({len(papers)} results):\n"]
    data_list = []
    for p in papers:
        notes_preview = (p.notes or "")[:150]
        if len(p.notes or "") > 150:
            notes_preview += "..."
        lines.append(f"  [ID:{p.id}] {p.title}")
        lines.append(f"    Notes: {notes_preview}")
        if p.ai_summary:
            lines.append(f"    AI Summary: {p.ai_summary[:100]}...")
        lines.append("")
        data_list.append({
            "id": p.id, "title": p.title,
            "notes": p.notes or "", "ai_summary": p.ai_summary or "",
        })

    text = "\n".join(lines)
    return json.dumps({
        "type": "get_paper_notes",
        "summary": text,
        "data": data_list,
    }, ensure_ascii=False)


def _execute_get_favorites_overview(db: Session, arguments: dict) -> str:
    limit = min(arguments.get("limit", 20), 50)

    favorites = (
        db.query(Paper)
        .filter(Paper.is_favorited.is_(True))
        .order_by(Paper.relevance.desc(), Paper.created_at.desc())
        .limit(limit)
        .all()
    )

    if not favorites:
        return "No favorited papers found."

    # Group by category
    by_category: dict[str, list[Paper]] = {}
    for p in favorites:
        cat = p.category or "Uncategorized"
        by_category.setdefault(cat, []).append(p)

    # Compute average relevance for favorites vs all papers
    avg_fav_rel = db.query(func.avg(Paper.relevance)).filter(Paper.is_favorited.is_(True)).scalar() or 0.0
    avg_all_rel = db.query(func.avg(Paper.relevance)).scalar() or 0.0

    lines = [
        f"Favorites Overview ({len(favorites)} papers):\n",
        f"  Avg relevance (favorites): {float(avg_fav_rel):.2f}",
        f"  Avg relevance (all papers): {float(avg_all_rel):.2f}\n",
    ]
    data_categories = []
    for cat in sorted(by_category.keys()):
        papers = by_category[cat]
        lines.append(f"  {cat} ({len(papers)} papers):")
        cat_papers = []
        for p in papers:
            lines.append(f"    [ID:{p.id}] {p.title} (relevance: {p.relevance:.1f})")
            cat_papers.append(_paper_to_dict(p))
        lines.append("")
        data_categories.append({"category": cat, "papers": cat_papers})

    text = "\n".join(lines)
    return json.dumps({
        "type": "get_favorites_overview",
        "summary": text,
        "data": {
            "total_favorites": len(favorites),
            "avg_relevance_favorites": round(float(avg_fav_rel), 2),
            "avg_relevance_all": round(float(avg_all_rel), 2),
            "categories": data_categories,
        },
    }, ensure_ascii=False)


def _execute_compare_papers(db: Session, arguments: dict) -> str:
    id1 = arguments.get("paper_id_1")
    id2 = arguments.get("paper_id_2")
    if not id1 or not id2:
        return "Error: both paper_id_1 and paper_id_2 are required."

    paper1 = db.query(Paper).filter(Paper.id == id1).first()
    paper2 = db.query(Paper).filter(Paper.id == id2).first()

    if not paper1:
        return f"Paper with ID {id1} not found."
    if not paper2:
        return f"Paper with ID {id2} not found."

    lines = [
        "=== Paper 1 ===",
        _format_paper_detail(paper1),
        "",
        "=== Paper 2 ===",
        _format_paper_detail(paper2),
    ]
    text = "\n".join(lines)
    return json.dumps({
        "type": "compare_papers",
        "summary": text,
        "data": {"paper1": _paper_to_dict(paper1), "paper2": _paper_to_dict(paper2)},
    }, ensure_ascii=False)


def _execute_analyze_paper_highlights(db: Session, arguments: dict) -> str:
    paper_id = arguments.get("paper_id")
    if not paper_id:
        return "Error: paper_id is required."

    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        return f"Paper with ID {paper_id} not found."

    # Collect tags for this paper
    tag_rows = (
        db.query(Tag.name)
        .join(PaperTag, PaperTag.tag_id == Tag.id)
        .filter(PaperTag.paper_id == paper_id)
        .all()
    )
    tag_names = [row[0] for row in tag_rows]

    # Build key_sections from non-empty fields
    key_sections = []
    abstract_text = paper.abstract or ""
    ai_summary_text = paper.ai_summary or ""

    if abstract_text and abstract_text != "N/A":
        key_sections.append({"label": "摘要", "content": abstract_text})
    if ai_summary_text and ai_summary_text != "N/A":
        key_sections.append({"label": "AI 分析", "content": ai_summary_text})

    # Build summary text
    lines = [
        f"Paper Highlights for [ID:{paper.id}] {paper.title}\n",
        f"  Authors: {paper.authors or 'N/A'}",
        f"  Category: {paper.category}",
        f"  Relevance: {paper.relevance:.1f}",
    ]
    if tag_names:
        lines.append(f"  Tags: {', '.join(tag_names)}")
    if key_sections:
        lines.append("")
        for section in key_sections:
            lines.append(f"  [{section['label']}]")
            lines.append(f"  {section['content']}")
            lines.append("")

    text = "\n".join(lines)
    return json.dumps({
        "type": "paper_highlights",
        "summary": text,
        "data": {
            "title": paper.title,
            "authors": paper.authors or "",
            "category": paper.category,
            "relevance": paper.relevance,
            "abstract": abstract_text,
            "ai_summary": ai_summary_text,
            "tags": tag_names,
            "key_sections": key_sections,
        },
    }, ensure_ascii=False)

"""Statistics and analysis tool executors."""

import json
import re
from collections import Counter
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models import Paper, PaperTag, Tag
from .helpers import _paper_to_dict


def _execute_get_research_stats(db: Session, arguments: dict) -> str:
    total = db.query(func.count(Paper.id)).scalar() or 0
    unread = db.query(func.count(Paper.id)).filter(Paper.is_read.is_(False)).scalar() or 0
    favorited = db.query(func.count(Paper.id)).filter(Paper.is_favorited.is_(True)).scalar() or 0
    avg_relevance = db.query(func.avg(Paper.relevance)).scalar() or 0.0

    category_rows = db.query(Paper.category, func.count(Paper.id)).group_by(Paper.category).all()
    source_rows = db.query(Paper.source, func.count(Paper.id)).group_by(Paper.source).all()

    lines = [
        "Research Statistics:",
        f"  Total papers: {total}",
        f"  Unread: {unread}",
        f"  Favorited: {favorited}",
        f"  Average relevance: {float(avg_relevance):.2f}",
        "",
        "Category distribution:",
    ]
    for cat, count in sorted(category_rows, key=lambda x: x[1], reverse=True):
        lines.append(f"  {cat}: {count}")

    lines.append("")
    lines.append("Source distribution:")
    for src, count in sorted(source_rows, key=lambda x: x[1], reverse=True):
        lines.append(f"  {src}: {count}")

    text = "\n".join(lines)
    return json.dumps({
        "type": "get_research_stats",
        "summary": text,
        "data": {
            "total": total, "unread": unread, "favorited": favorited,
            "avg_relevance": float(avg_relevance),
            "categories": sorted([(c, n) for c, n in category_rows], key=lambda x: x[1], reverse=True),
            "sources": sorted([(s, n) for s, n in source_rows], key=lambda x: x[1], reverse=True),
        },
    }, ensure_ascii=False)


def _execute_get_reading_progress(db: Session, arguments: dict) -> str:
    recommend_count = min(arguments.get("recommend_count", 5), 20)

    total = db.query(func.count(Paper.id)).scalar() or 0
    read_count = db.query(func.count(Paper.id)).filter(Paper.is_read.is_(True)).scalar() or 0
    unread_count = total - read_count
    fav_count = db.query(func.count(Paper.id)).filter(Paper.is_favorited.is_(True)).scalar() or 0
    read_pct = (read_count / total * 100) if total > 0 else 0.0

    # Top unread papers by relevance
    top_unread = (
        db.query(Paper)
        .filter(Paper.is_read.is_(False))
        .order_by(Paper.relevance.desc(), Paper.created_at.desc())
        .limit(recommend_count)
        .all()
    )

    lines = [
        "Reading Progress:\n",
        f"  Total papers: {total}",
        f"  Read: {read_count} ({read_pct:.1f}%)",
        f"  Unread: {unread_count}",
        f"  Favorited: {fav_count}",
    ]
    if top_unread:
        lines.append(f"\nTop {len(top_unread)} recommended unread papers (by relevance):")
        for p in top_unread:
            lines.append(f"  [ID:{p.id}] {p.title} (relevance: {p.relevance:.1f})")

    text = "\n".join(lines)
    return json.dumps({
        "type": "get_reading_progress",
        "summary": text,
        "data": {
            "total": total,
            "read": read_count,
            "unread": unread_count,
            "favorited": fav_count,
            "read_percentage": round(read_pct, 1),
            "recommended_unread": [_paper_to_dict(p) for p in top_unread],
        },
    }, ensure_ascii=False)


def _execute_get_tag_analysis(db: Session, arguments: dict) -> str:
    top_n = min(arguments.get("top_n", 15), 50)

    # Tag frequency via PaperTag join
    tag_counts = (
        db.query(Tag.id, Tag.name, Tag.color, func.count(PaperTag.id).label("count"))
        .join(PaperTag, PaperTag.tag_id == Tag.id)
        .group_by(Tag.id)
        .order_by(func.count(PaperTag.id).desc())
        .limit(top_n)
        .all()
    )

    # Co-occurrence: find papers with 2+ tags, build pair counts
    paper_tags_map: dict[int, list[str]] = {}
    all_pt = db.query(PaperTag.paper_id, Tag.name).join(Tag, Tag.id == PaperTag.tag_id).all()
    for paper_id, tag_name in all_pt:
        paper_tags_map.setdefault(paper_id, []).append(tag_name)

    pair_counter: Counter = Counter()
    for tags_list in paper_tags_map.values():
        if len(tags_list) < 2:
            continue
        sorted_tags = sorted(tags_list)
        for i in range(len(sorted_tags)):
            for j in range(i + 1, len(sorted_tags)):
                pair_counter[(sorted_tags[i], sorted_tags[j])] += 1

    top_pairs = pair_counter.most_common(10)

    # Untagged paper count
    tagged_ids = db.query(PaperTag.paper_id).distinct().subquery()
    untagged_count = db.query(func.count(Paper.id)).filter(~Paper.id.in_(db.query(tagged_ids.c.paper_id))).scalar() or 0
    total_papers = db.query(func.count(Paper.id)).scalar() or 0

    lines = [f"Tag Analysis ({len(tag_counts)} tags shown):\n"]
    tag_data = []
    for tag_id, name, color, count in tag_counts:
        lines.append(f"  {name}: {count} papers")
        tag_data.append({"id": tag_id, "name": name, "color": color, "count": count})

    lines.append(f"\n  Untagged papers: {untagged_count}/{total_papers}")

    if top_pairs:
        lines.append("\nTop co-occurring tag pairs:")
        pairs_data = []
        for (t1, t2), count in top_pairs:
            lines.append(f"  {t1} + {t2}: {count} papers")
            pairs_data.append({"tag1": t1, "tag2": t2, "count": count})
    else:
        pairs_data = []

    text = "\n".join(lines)
    return json.dumps({
        "type": "get_tag_analysis",
        "summary": text,
        "data": {
            "tags": tag_data,
            "co_occurrence": pairs_data,
            "untagged_count": untagged_count,
            "total_papers": total_papers,
        },
    }, ensure_ascii=False)


def _execute_find_duplicates(db: Session, arguments: dict) -> str:
    from ..dedup_service import find_duplicates as dedup_find

    threshold = arguments.get("threshold", 0.90)
    limit = min(arguments.get("limit", 10), 30)

    # Clamp threshold to valid range
    threshold = max(0.5, min(1.0, threshold))

    try:
        groups = dedup_find(db, threshold=threshold)
    except Exception as exc:
        return f"Error detecting duplicates: {exc}"

    groups = groups[:limit]

    if not groups:
        return f"No duplicate papers found with similarity threshold {threshold:.2f}."

    lines = [f"Found {len(groups)} duplicate group(s) (threshold: {threshold:.2f}):\n"]
    data_list = []
    for i, group in enumerate(groups, 1):
        papers = group["papers"]
        sim = group["similarity"]
        lines.append(f"  Group {i} (similarity: {sim:.3f}):")
        group_papers = []
        for p in papers:
            lines.append(f"    [ID:{p.id}] {p.title}")
            group_papers.append(_paper_to_dict(p))
        lines.append("")
        data_list.append({"similarity": sim, "papers": group_papers})

    text = "\n".join(lines)
    return json.dumps({
        "type": "find_duplicates",
        "summary": text,
        "data": {"threshold": threshold, "groups": data_list},
    }, ensure_ascii=False)


# Common English stop words to filter from keyword extraction
_STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "can", "shall", "not", "no", "nor",
    "so", "if", "then", "than", "that", "this", "these", "those", "it",
    "its", "as", "up", "out", "about", "into", "over", "after", "before",
    "between", "under", "through", "during", "each", "few", "more", "most",
    "other", "some", "such", "only", "own", "same", "very", "just", "how",
    "what", "which", "who", "when", "where", "why", "all", "both", "any",
    "here", "there", "above", "below", "again", "once", "also", "too",
    "we", "our", "us", "via", "using", "based", "new", "two", "one",
}


def _execute_get_research_trends(db: Session, arguments: dict) -> str:
    days = arguments.get("days", 30)
    top_n = min(arguments.get("top_n", 10), 50)

    cutoff = datetime.now(UTC) - timedelta(days=days)

    # Category frequency in recent papers (within `days`)
    recent_cats = (
        db.query(Paper.category, func.count(Paper.id).label("count"))
        .filter(Paper.created_at >= cutoff)
        .group_by(Paper.category)
        .all()
    )
    recent_cat_map = {cat: count for cat, count in recent_cats}

    # Category frequency in older papers (before cutoff)
    older_cats = (
        db.query(Paper.category, func.count(Paper.id).label("count"))
        .filter(Paper.created_at < cutoff)
        .group_by(Paper.category)
        .all()
    )
    older_cat_map = {cat: count for cat, count in older_cats}

    # Compute growth for all categories
    all_categories = set(recent_cat_map.keys()) | set(older_cat_map.keys())
    trends = []
    for cat in all_categories:
        recent_count = recent_cat_map.get(cat, 0)
        previous_count = older_cat_map.get(cat, 0)
        if previous_count > 0:
            growth = ((recent_count - previous_count) / previous_count) * 100
        elif recent_count > 0:
            growth = 100.0  # New category, treat as 100% growth
        else:
            growth = 0.0
        trends.append({
            "category": cat,
            "recent": recent_count,
            "previous": previous_count,
            "growth": round(growth, 1),
        })

    # Split into trending up vs down, sort by absolute growth
    trending_up = sorted(
        [t for t in trends if t["growth"] > 0],
        key=lambda x: x["growth"],
        reverse=True,
    )[:top_n]
    trending_down = sorted(
        [t for t in trends if t["growth"] < 0],
        key=lambda x: x["growth"],
    )[:top_n]

    # Hot keywords from recent paper titles
    recent_papers = (
        db.query(Paper.title, Paper.relevance)
        .filter(Paper.created_at >= cutoff)
        .all()
    )

    word_counts: Counter = Counter()
    word_relevance_sums: dict[str, float] = {}
    for title, relevance in recent_papers:
        if not title:
            continue
        words = re.findall(r"[a-zA-Z]{3,}", title.lower())
        unique_words = set(words)
        for w in unique_words:
            if w not in _STOP_WORDS:
                word_counts[w] += 1
                word_relevance_sums[w] = word_relevance_sums.get(w, 0.0) + (relevance or 0.0)

    hot_keywords = []
    for word, count in word_counts.most_common(top_n):
        avg_rel = word_relevance_sums[word] / count if count > 0 else 0.0
        hot_keywords.append({
            "keyword": word,
            "count": count,
            "avg_relevance": round(avg_rel, 2),
        })

    # Build summary text
    lines = [f"Research Trends (last {days} days):\n"]

    if trending_up:
        lines.append("Trending Up:")
        for t in trending_up:
            lines.append(f"  {t['category']}: {t['recent']} recent vs {t['previous']} previous ({t['growth']:+.1f}%)")
    else:
        lines.append("Trending Up: (none)")

    lines.append("")
    if trending_down:
        lines.append("Trending Down:")
        for t in trending_down:
            lines.append(f"  {t['category']}: {t['recent']} recent vs {t['previous']} previous ({t['growth']:+.1f}%)")
    else:
        lines.append("Trending Down: (none)")

    if hot_keywords:
        lines.append("")
        lines.append(f"Hot Keywords (top {len(hot_keywords)}):")
        for kw in hot_keywords:
            lines.append(f"  \"{kw['keyword']}\": {kw['count']} papers (avg relevance: {kw['avg_relevance']:.2f})")

    text = "\n".join(lines)
    return json.dumps({
        "type": "research_trends",
        "summary": text,
        "data": {
            "period_days": days,
            "trending_up": trending_up,
            "trending_down": trending_down,
            "hot_keywords": hot_keywords,
        },
    }, ensure_ascii=False)

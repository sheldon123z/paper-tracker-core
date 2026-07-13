"""Shared helper functions for formatting papers with per-user state."""

from sqlalchemy.orm import Session

from ...models import Paper, PaperUserState


def _current_user_id(db: Session) -> int | None:
    return (db.info.get("access_scope") or {}).get("user_id")


def _personal_state(db: Session, paper: Paper) -> tuple[bool, bool, str]:
    scope = db.info.get("access_scope") or {}
    user_id = scope.get("user_id")
    if user_id is None:
        return bool(paper.is_read), bool(paper.is_favorited), paper.notes or ""
    state = db.query(PaperUserState).filter(
        PaperUserState.paper_id == paper.id,
        PaperUserState.user_id == user_id,
    ).first()
    if state is None:
        return False, False, ""
    return bool(state.is_read), bool(state.is_favorited), state.notes or ""


def _paper_to_dict(db: Session, paper: Paper) -> dict:
    """Convert a Paper ORM object to a JSON-serializable dict for frontend rendering."""
    is_read, is_favorited, notes = _personal_state(db, paper)
    return {
        "id": paper.id,
        "title": paper.title,
        "authors": paper.authors or "",
        "category": paper.category,
        "relevance": paper.relevance,
        "source": paper.source,
        "published_date": paper.published_date.strftime("%Y-%m-%d") if paper.published_date else None,
        "is_read": is_read,
        "is_favorited": is_favorited,
        "abstract": paper.abstract or "",
        "notes": notes,
        "tags": paper.tags or "",
        "arxiv_id": paper.arxiv_id,
        "doi": paper.doi,
        "link": paper.link,
        "pdf_url": paper.pdf_url,
        "ai_summary": paper.ai_summary,
    }


def _format_paper(db: Session, paper: Paper) -> str:
    """Format a single paper into a readable string."""
    is_read, is_favorited, notes = _personal_state(db, paper)
    published = paper.published_date.strftime("%Y-%m-%d") if paper.published_date else "N/A"
    lines = [
        f"[ID:{paper.id}] {paper.title}",
        f"  Authors: {paper.authors or 'N/A'}",
        f"  Category: {paper.category}",
        f"  Published: {published}",
        f"  Relevance: {paper.relevance:.1f}",
        f"  Source: {paper.source}",
        f"  Read: {'Yes' if is_read else 'No'} | Favorited: {'Yes' if is_favorited else 'No'}",
    ]
    if paper.abstract:
        abstract_preview = paper.abstract[:300]
        if len(paper.abstract) > 300:
            abstract_preview += "..."
        lines.append(f"  Abstract: {abstract_preview}")
    if notes:
        lines.append(f"  Notes: {notes[:200]}")
    if paper.arxiv_id:
        lines.append(f"  arXiv: {paper.arxiv_id}")
    if paper.doi:
        lines.append(f"  DOI: {paper.doi}")
    if paper.link:
        lines.append(f"  Link: {paper.link}")
    return "\n".join(lines)


def _format_paper_detail(db: Session, paper: Paper) -> str:
    """Format a paper with full details (no truncation on abstract)."""
    is_read, is_favorited, notes = _personal_state(db, paper)
    published = paper.published_date.strftime("%Y-%m-%d") if paper.published_date else "N/A"
    lines = [
        f"[ID:{paper.id}] {paper.title}",
        f"  Authors: {paper.authors or 'N/A'}",
        f"  Category: {paper.category}",
        f"  Published: {published}",
        f"  Relevance: {paper.relevance:.1f}",
        f"  Source: {paper.source}",
        f"  Read: {'Yes' if is_read else 'No'} | Favorited: {'Yes' if is_favorited else 'No'}",
        f"  Abstract: {paper.abstract or 'N/A'}",
        f"  Notes: {notes or 'N/A'}",
        f"  Tags: {paper.tags or 'N/A'}",
    ]
    if paper.arxiv_id:
        lines.append(f"  arXiv: {paper.arxiv_id}")
    if paper.doi:
        lines.append(f"  DOI: {paper.doi}")
    if paper.pdf_url:
        lines.append(f"  PDF: {paper.pdf_url}")
    if paper.link:
        lines.append(f"  Link: {paper.link}")
    if paper.ai_summary:
        lines.append(f"  AI Summary: {paper.ai_summary}")
    created = paper.created_at.strftime("%Y-%m-%d %H:%M") if paper.created_at else "N/A"
    lines.append(f"  Added: {created}")
    return "\n".join(lines)

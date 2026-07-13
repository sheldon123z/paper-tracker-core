from collections import namedtuple
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from ..models import ChatMessage, Paper, PaperTag

# Lightweight row proxy for dedup — avoids loading abstract/notes blobs
_PaperRow = namedtuple("_PaperRow", ["id", "title", "authors"])


def _normalize(title: str) -> str:
    return title.lower().strip()


def _title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def _length_ratio(len_a: int, len_b: int) -> float:
    """Return the ratio of the shorter length to the longer length."""
    return min(len_a, len_b) / max(len_a, len_b) if len_a and len_b else 0.0


def _compute_min_length_ratio(threshold: float) -> float:
    """Compute the minimum length ratio needed for two strings to potentially reach the threshold.

    For SequenceMatcher.ratio(), the theoretical maximum similarity between two strings
    depends on their length ratio. Given lengths L1 >= L2, the maximum possible ratio is:
        max_ratio = 2 * L2 / (L1 + L2) = 2 * r / (1 + r) where r = L2/L1

    Solving for the minimum r such that max_ratio >= threshold:
        r >= threshold / (2 - threshold)
    """
    return threshold / (2 - threshold)


def find_duplicates(db: Session, threshold: float = 0.90) -> list[dict]:
    if not (0.0 < threshold <= 1.0):
        raise ValueError("Threshold must be between 0.0 (exclusive) and 1.0 (inclusive)")
    if threshold < 0.5:
        raise ValueError("Threshold must be at least 0.5 to avoid meaningless matches")

    # Load only the columns needed for dedup (id, title, authors) in batches
    # to avoid OOM when the papers table has large abstract/notes blobs.
    _BATCH_SIZE = 500
    papers: list[_PaperRow] = []
    offset = 0
    while True:
        rows = (
            db.query(Paper.id, Paper.title, Paper.authors)
            .order_by(Paper.id)
            .offset(offset)
            .limit(_BATCH_SIZE)
            .all()
        )
        if not rows:
            break
        papers.extend(_PaperRow(id=r[0], title=r[1], authors=r[2]) for r in rows)
        offset += _BATCH_SIZE

    if len(papers) <= 1:
        return []

    # Pre-sort by normalized title so that similar titles are adjacent
    sorted_papers = sorted(papers, key=lambda p: _normalize(p.title or ""))

    # Sliding window size: at least 10, at most 5% of total count (but never exceeds n)
    window = max(10, int(len(sorted_papers) * 0.05))
    window = min(window, len(sorted_papers))

    # Dynamic length-difference pre-filter: compute minimum length ratio based on threshold
    # This prevents systematic false negatives when threshold < 0.75
    min_length_ratio = _compute_min_length_ratio(threshold)

    seen = set()
    groups = []

    for i, p1 in enumerate(sorted_papers):
        if p1.id in seen:
            continue

        norm1 = _normalize(p1.title or "")
        len1 = len(norm1)

        group = [p1]

        # Only compare within the sliding window ahead
        end = min(i + window + 1, len(sorted_papers))
        for j in range(i + 1, end):
            p2 = sorted_papers[j]
            if p2.id in seen:
                continue

            norm2 = _normalize(p2.title or "")
            len2 = len(norm2)

            # Pre-filter: skip pairs whose length ratio is too low for the threshold
            # to be theoretically reachable — avoids expensive SequenceMatcher calls
            if _length_ratio(len1, len2) < min_length_ratio:
                continue

            sim = _title_similarity(p1.title, p2.title)
            if sim >= threshold:
                group.append(p2)
                seen.add(p2.id)

        if len(group) > 1:
            seen.add(p1.id)
            groups.append({
                "papers": group,
                "similarity": round(_title_similarity(group[0].title, group[1].title), 3),
            })

    return groups


def merge_duplicates(db: Session, keep_id: int, remove_ids: list[int]):
    keep = db.query(Paper).filter(Paper.id == keep_id).first()
    if not keep:
        raise ValueError("Keep paper not found")

    for rid in remove_ids:
        dup = db.query(Paper).filter(Paper.id == rid).first()
        if not dup:
            continue
        if dup.notes and dup.notes.strip():
            keep.notes = ((keep.notes or "") + "\n---\n" + dup.notes).strip()
        dup_tags = db.query(PaperTag).filter(PaperTag.paper_id == rid).all()
        existing_tag_ids = {pt.tag_id for pt in db.query(PaperTag).filter(PaperTag.paper_id == keep_id).all()}
        for pt in dup_tags:
            if pt.tag_id not in existing_tag_ids:
                pt.paper_id = keep_id
            else:
                db.delete(pt)
        db.query(ChatMessage).filter(ChatMessage.paper_id == rid).delete()
        db.delete(dup)

    db.commit()

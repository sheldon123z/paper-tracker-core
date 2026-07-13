import hashlib
import logging
import re
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import feedparser
from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..models import Feed, Paper
from .relevance import infer_category, load_keywords_from_env, score_relevance

logger = logging.getLogger(__name__)


def _feed_paper_scope(feed: Feed):
    if feed.visibility == "public":
        return and_(Paper.visibility == "public", Paper.department_id.is_(None))
    return and_(Paper.visibility == "department", Paper.department_id == feed.department_id)


def _extract_published_date(entry: dict[str, Any]) -> datetime | None:
    if entry.get("published_parsed"):
        return datetime(*entry.published_parsed[:6])

    if entry.get("published"):
        try:
            return parsedate_to_datetime(entry.get("published"))
        except (TypeError, ValueError):
            return None
    return None


def _extract_arxiv_id(link: str | None) -> str | None:
    """Extract arXiv ID from a link such as https://arxiv.org/abs/2301.12345."""
    if not link:
        return None
    match = re.search(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5}(?:v\d+)?)", link)
    if match:
        return match.group(1)
    return None


def _compute_content_hash(title: str) -> str:
    """Compute a short SHA-256 hash of the normalised title for dedup."""
    normalised = re.sub(r"\s+", " ", title.strip().lower())
    return hashlib.sha256(normalised.encode()).hexdigest()[:64]


def _extract_doi(entry: dict[str, Any]) -> str | None:
    """Try to extract DOI from feed entry metadata.

    Checks common RSS/Atom extensions (prism, dc, id) and link patterns.
    """
    # Check prism:doi (used by Elsevier/Springer RSS)
    doi = entry.get("prism_doi") or entry.get("doi")
    if doi:
        return doi.strip()

    # Check dc:identifier for DOI pattern
    dc_id = entry.get("dc_identifier", "")
    if dc_id and "10." in dc_id:
        match = re.search(r"(10\.\d{4,}/\S+)", dc_id)
        if match:
            return match.group(1)

    # Check entry id or link for DOI pattern
    for field in ("id", "link"):
        val = entry.get(field, "")
        if val and "doi.org/" in val:
            match = re.search(r"doi\.org/(10\.\d{4,}/\S+)", val)
            if match:
                return match.group(1).rstrip(".")

    return None


def _extract_pdf_url(entry: dict[str, Any]) -> str | None:
    """Try to extract a direct PDF URL from the feed entry."""
    # Check entry links list first
    for link_obj in entry.get("links", []):
        if link_obj.get("type") == "application/pdf":
            return link_obj.get("href")

    # For arXiv, derive the PDF link from the abstract link
    link = entry.get("link", "")
    if link and "arxiv.org/abs/" in link:
        return link.replace("arxiv.org/abs/", "arxiv.org/pdf/") + ".pdf"

    return None


def _extract_abstract(entry: dict[str, Any]) -> str:
    """Extract the best abstract from all available fields.

    Different RSS sources store abstracts in different places:
    - IET/Wiley: summary = journal name only, content[] has the actual abstract
    - IEEE: summary has the abstract (or literal "null")
    - CNKI: summary has the abstract
    """
    best = ""

    # 1. Check content field (IET/Wiley put full abstracts here)
    content_list = entry.get("content", [])
    if content_list:
        # Prefer text/plain for cleaner output
        for c in content_list:
            if isinstance(c, dict) and c.get("type") == "text/plain":
                val = c.get("value", "")
                if len(val) > len(best):
                    best = val
        # If no text/plain, use longest HTML content
        if not best:
            for c in content_list:
                if isinstance(c, dict):
                    val = c.get("value", "")
                    if len(val) > len(best):
                        best = val

    # 2. Check summary (IEEE, CNKI, most feeds)
    summary = entry.get("summary", "")

    # Use whichever is longer (content vs summary)
    if len(summary) > len(best):
        best = summary

    # 3. Handle literal "null" from IEEE feeds
    if best.strip().lower() == "null":
        return ""

    # 4. Strip HTML tags if present
    if "<" in best:
        best = re.sub(r"<[^>]+>", "", best)

    # 5. Clean up whitespace (collapse multiple newlines, strip)
    best = re.sub(r"\n\s*\n", "\n\n", best).strip()

    # 6. Handle IET/Wiley duplicate pattern: "highlight...ABSTRACT\nformal abstract"
    #    Take only the formal abstract after the ABSTRACT heading
    abstract_marker = re.search(r"\n\s*ABSTRACT\s*\n", best)
    if abstract_marker:
        formal = best[abstract_marker.end():].strip()
        if len(formal) > 100:
            best = formal

    return best


def _extract_authors(entry: dict[str, Any]) -> str:
    """Return a normalized author string, using ``Unknown`` when absent."""
    raw_authors = entry.get("authors", [])
    names: list[str] = []

    if isinstance(raw_authors, list):
        for author in raw_authors:
            name = author.get("name", "") if isinstance(author, dict) else str(author)
            if name and name.strip():
                names.append(name.strip())
    elif isinstance(raw_authors, str):
        names.extend(part.strip() for part in raw_authors.replace(";", ",").split(",") if part.strip())

    if not names:
        fallback = entry.get("author")
        if isinstance(fallback, str):
            names.extend(part.strip() for part in fallback.replace(";", ",").split(",") if part.strip())

    return ", ".join(names) or "Unknown"


def fetch_feed_entries(feed_url: str) -> list[dict[str, Any]]:
    parsed = feedparser.parse(feed_url)
    return parsed.entries or []


def ingest_feeds(db: Session, feeds: list[Feed]) -> dict[str, int]:
    stats = {
        "new_papers": 0,
        "skipped_duplicates": 0,
        "skipped_unknown_authors": 0,
        "backfilled_feed_id": 0,
        "feeds_processed": 0,
        "feed_errors": 0,
    }
    keyword_map = load_keywords_from_env()

    for feed in feeds:
        feed_backfilled = 0
        try:
            entries = fetch_feed_entries(feed.url)
            for entry in entries:
                link = entry.get("link")
                arxiv_id = _extract_arxiv_id(link)
                title = entry.get("title", "Untitled")
                content_hash = _compute_content_hash(title)
                authors = _extract_authors(entry)

                # RSS feeds sometimes include issue metadata or publication notices
                # as entries. Missing authors are normalized to Unknown; keep these
                # non-paper rows out of the paper library before dedup/backfill runs.
                if authors.strip().casefold() == "unknown":
                    stats["skipped_unknown_authors"] += 1
                    continue

                # Triple dedup: link → arxiv_id → content_hash (fallback chain).
                # 命中已有 paper 时机会主义补齐 source_feed_id：PR #119 后新增字段，
                # 老数据 + 已 ingested 的 duplicate 都没值，否则下游按 feed 过滤永远空集。
                existing = None
                if link:
                    existing = db.query(Paper).filter(Paper.link == link, _feed_paper_scope(feed)).first()
                if not existing and arxiv_id:
                    existing = db.query(Paper).filter(Paper.arxiv_id == arxiv_id, _feed_paper_scope(feed)).first()
                if not existing:
                    existing = db.query(Paper).filter(
                        Paper.content_hash == content_hash, _feed_paper_scope(feed),
                    ).first()

                if existing is not None:
                    if existing.source_feed_id is None:
                        existing.source_feed_id = feed.id
                        stats["backfilled_feed_id"] += 1
                        feed_backfilled += 1
                    stats["skipped_duplicates"] += 1
                    continue

                abstract = _extract_abstract(entry)

                pdf_url = _extract_pdf_url(entry)
                doi = _extract_doi(entry)

                paper = Paper(
                    title=title,
                    authors=authors,
                    abstract=abstract,
                    link=link,
                    source=feed.source or "rss",
                    published_date=_extract_published_date(entry),
                    relevance=score_relevance(title, abstract, keyword_map),
                    category=infer_category(title, abstract),
                    arxiv_id=arxiv_id,
                    content_hash=content_hash,
                    pdf_url=pdf_url,
                    doi=doi,
                    source_feed_id=feed.id,
                    visibility=feed.visibility,
                    department_id=feed.department_id,
                    created_by_user_id=feed.created_by_user_id,
                )
                db.add(paper)
                stats["new_papers"] += 1

            feed.last_fetched = datetime.now(UTC)
            feed.last_error = None
            stats["feeds_processed"] += 1
            if feed_backfilled:
                logger.info(
                    "Backfilled source_feed_id on %d existing papers for feed %s",
                    feed_backfilled,
                    feed.name,
                )

        except Exception as exc:
            logger.error("Error processing feed %s: %s", feed.url, exc)
            feed.last_error = str(exc)
            stats["feed_errors"] += 1

    db.commit()
    return stats


def refresh_abstracts(db: Session, feeds: list[Feed]) -> dict[str, int]:
    """Re-fetch RSS feeds and update abstracts for existing papers that have
    missing, stub, or truncated abstracts.
    """
    stats = {"updated": 0, "feeds_processed": 0, "feed_errors": 0}

    for feed in feeds:
        try:
            entries = fetch_feed_entries(feed.url)
            for entry in entries:
                link = entry.get("link")
                if not link:
                    continue

                paper = db.query(Paper).filter(Paper.link == link, _feed_paper_scope(feed)).first()
                if not paper:
                    continue

                new_abstract = _extract_abstract(entry)
                if not new_abstract:
                    continue

                old = paper.abstract or ""
                # Update if: old is empty, is "null", is very short, or new is significantly longer
                if not old or old.strip().lower() == "null" or len(old) < 150 or len(new_abstract) > len(old) * 1.2:
                    paper.abstract = new_abstract
                    stats["updated"] += 1

                # Opportunistically backfill feed ownership for legacy rows
                if paper.source_feed_id is None:
                    paper.source_feed_id = feed.id

            stats["feeds_processed"] += 1
        except Exception as exc:
            logger.error("Error refreshing from feed %s: %s", feed.url, exc)
            stats["feed_errors"] += 1

    db.commit()
    return stats

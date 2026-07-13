import asyncio
import hashlib
import json as json_lib
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user_or_service
from ..database import get_db
from ..models import Feed, Paper, PaperTag, Tag
from ..schemas import (
    BatchActionRequest,
    DuplicateMergeRequest,
    PaginationMeta,
    PaperListResponse,
    PaperOut,
    PaperPatch,
    TagAssignRequest,
    TagOut,
)
from ..services.cache import cache
from ..services.dedup_service import find_duplicates, merge_duplicates
from ..services.file_storage import delete_file
from ..services.rss_parser import ingest_feeds
from . import limiter  # shared rate limiter instance

logger = logging.getLogger("paper-tracker.papers")

router = APIRouter(prefix="/api/papers", tags=["papers"], dependencies=[Depends(get_current_user_or_service)])


@router.get("", response_model=PaperListResponse)
@limiter.limit("30/minute")
def list_papers(
    request: Request,
    search: str | None = Query(default=None),
    source: str | None = Query(default=None),
    category: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    feed_id: int | None = Query(default=None),
    min_relevance: float | None = Query(default=None),
    is_read: bool | None = Query(default=None),
    is_favorited: bool | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    # Generate cache key from query parameters
    cache_params = {
        "search": search,
        "source": source,
        "category": category,
        "tag": tag,
        "feed_id": feed_id,
        "min_relevance": min_relevance,
        "is_read": is_read,
        "is_favorited": is_favorited,
        "date_from": date_from,
        "date_to": date_to,
        "page": page,
        "size": size,
    }
    cache_key = "papers:list:" + hashlib.md5(json_lib.dumps(cache_params, sort_keys=True).encode()).hexdigest()

    # Try to get from cache (60 second TTL)
    cached_result = cache.get(cache_key)
    if cached_result is not None:
        return cached_result

    query = db.query(Paper)

    if search:
        # Sanitize LIKE wildcards and limit length to prevent DoS
        # First escape backslashes, then escape % and _
        sanitized = search[:200].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{sanitized}%"
        query = query.filter(
            (Paper.title.ilike(like, escape="\\"))
            | (Paper.authors.ilike(like, escape="\\"))
            | (Paper.abstract.ilike(like, escape="\\"))
            | (Paper.notes.ilike(like, escape="\\"))
        )
    if source:
        query = query.filter(Paper.source == source)
    if feed_id is not None:
        query = query.filter(Paper.source_feed_id == feed_id)
    if category:
        query = query.filter(Paper.category == category)
    if tag:
        # Sanitize tag LIKE wildcards to prevent injection
        # First escape backslashes, then escape % and _
        sanitized_tag = tag[:200].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(Paper.tags.ilike(f"%{sanitized_tag}%", escape="\\"))
    if min_relevance is not None:
        query = query.filter(Paper.relevance >= min_relevance)
    if is_read is not None:
        query = query.filter(Paper.is_read == is_read)
    if is_favorited is not None:
        query = query.filter(Paper.is_favorited == is_favorited)
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            query = query.filter(Paper.published_date >= dt_from)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format, use ISO 8601") from None
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            query = query.filter(Paper.published_date <= dt_to)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format, use ISO 8601") from None

    total = query.count()
    items = (
        query.order_by(Paper.published_date.desc(), Paper.created_at.desc()).offset((page - 1) * size).limit(size).all()
    )

    result = PaperListResponse(items=items, meta=PaginationMeta(total=total, page=page, size=size))

    # Cache the result for 60 seconds
    cache.set(cache_key, result, ttl=60)

    return result


@router.get("/duplicates")
def list_duplicates(
    threshold: float = Query(default=0.90, ge=0.5, le=1.0),
    db: Session = Depends(get_db),
):
    groups = find_duplicates(db, threshold=threshold)
    return [
        {
            "papers": [{"id": p.id, "title": p.title, "authors": p.authors} for p in g["papers"]],
            "similarity": g["similarity"],
        }
        for g in groups
    ]


@router.post("/duplicates/merge")
def merge_duplicate_papers(payload: DuplicateMergeRequest, db: Session = Depends(get_db)):
    try:
        merge_duplicates(db, keep_id=payload.keep_id, remove_ids=payload.merge_ids)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Invalidate paper list cache
    cache.delete_by_prefix("papers:list:")

    return {"message": "Papers merged", "kept_id": payload.keep_id, "removed_ids": payload.merge_ids}


@router.post("/batch")
def batch_action(payload: BatchActionRequest, db: Session = Depends(get_db)):
    if not payload.paper_ids:
        raise HTTPException(status_code=400, detail="No paper IDs provided")

    papers = db.query(Paper).filter(Paper.id.in_(payload.paper_ids)).all()
    if not papers:
        raise HTTPException(status_code=404, detail="No matching papers found")

    action = payload.action
    affected = 0
    try:
        for paper in papers:
            if action == "mark_read":
                paper.is_read = True
            elif action == "mark_unread":
                paper.is_read = False
            elif action == "favorite":
                paper.is_favorited = True
            elif action == "unfavorite":
                paper.is_favorited = False
            elif action == "delete":
                for paper_file in paper.files:
                    try:
                        delete_file(paper_file.storage_path)
                    except Exception as e:
                        logger.warning("Failed to delete file %s on disk: %s", paper_file.storage_path, e)
                db.delete(paper)
            else:
                raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
            affected += 1

        db.commit()

        # Invalidate paper list cache
        cache.delete_by_prefix("papers:list:")
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Batch action '%s' failed, rolled back: %s", action, e)
        raise HTTPException(status_code=500, detail=f"Batch action failed: {str(e)}") from e

    return {"message": f"Action '{action}' applied", "affected": affected}


@router.post("/run")
def run_feed_ingestion(db: Session = Depends(get_db)):
    feeds = db.query(Feed).filter(Feed.is_active.is_(True)).all()
    if not feeds:
        return {"message": "No active feeds configured", "stats": {}}

    stats = ingest_feeds(db, feeds)
    logger.info("Feed ingestion completed: %s", stats)

    # Invalidate paper list cache
    cache.delete_by_prefix("papers:list:")

    return {"message": "RSS fetch completed", "stats": stats}


@router.get("/export/bibtex")
def export_bibtex(db: Session = Depends(get_db)):
    # Derive a sessionmaker from the request-scoped session's bind so the
    # streaming generator gets its own session bound to the same database.
    # This keeps the cross-thread session safety from #23 while honoring
    # FastAPI dependency overrides (used by tests via app.dependency_overrides).
    from sqlalchemy.orm import sessionmaker

    bind = db.get_bind()
    # If bind is a Connection, extract its underlying Engine
    if hasattr(bind, "engine"):
        bind = bind.engine
    ExportSessionLocal = sessionmaker(bind=bind, autocommit=False, autoflush=False)

    # Pre-check DB connectivity using the injected session
    try:
        db.query(Paper).first()
    except Exception as e:
        logger.error("BibTeX export DB pre-check failed: %s", e)
        raise HTTPException(status_code=500, detail="Database connection failed") from None

    def generate():
        # Create export session inside generator to avoid cross-thread session sharing
        db_gen = ExportSessionLocal()
        try:
            query = db_gen.query(Paper).order_by(
                Paper.published_date.desc(), Paper.id.desc()
            ).yield_per(500)
            for paper in query:
                year = paper.published_date.year if paper.published_date else datetime.now(UTC).year
                key_author = (paper.authors.split(",")[0] or "unknown").strip().replace(" ", "")
                citation_key = f"{key_author}{year}{paper.id}"
                entry = (
                    f"@article{{{citation_key},\n"
                    f"  title = {{{paper.title}}},\n"
                    f"  author = {{{paper.authors}}},\n"
                    f"  year = {{{year}}},\n"
                    f"  url = {{{paper.link or ''}}},\n"
                    f"  abstract = {{{paper.abstract or ''}}}\n"
                    "}\n\n"
                )
                yield entry
        finally:
            db_gen.close()

    return StreamingResponse(
        generate(),
        media_type="application/x-bibtex",
        headers={"Content-Disposition": "attachment; filename=papers.bib"},
    )


@router.get("/{paper_id}", response_model=PaperOut)
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


@router.patch("/{paper_id}", response_model=PaperOut)
def update_paper(paper_id: int, payload: PaperPatch, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(paper, field, value)

    db.commit()
    db.refresh(paper)

    # Invalidate paper list cache
    cache.delete_by_prefix("papers:list:")

    return paper


@router.post("/{paper_id}/tags", response_model=list[TagOut])
def assign_tags(paper_id: int, payload: TagAssignRequest, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    db.query(PaperTag).filter(PaperTag.paper_id == paper_id).delete()

    tag_records: list[Tag] = []
    clean_tags = [tag.strip() for tag in payload.tags if tag.strip()]
    for name in dict.fromkeys(clean_tags):
        tag = db.query(Tag).filter(func.lower(Tag.name) == name.lower()).first()
        if not tag:
            tag = Tag(name=name, color=payload.default_color)
            db.add(tag)
            db.flush()
        db.add(PaperTag(paper_id=paper_id, tag_id=tag.id))
        tag_records.append(tag)

    paper.tags = ", ".join([t.name for t in tag_records])
    db.commit()

    # Invalidate paper list cache
    cache.delete_by_prefix("papers:list:")

    return tag_records


def _run_abstract_translate(paper_id: int, config_id: int | None, db: Session):
    """Background task: translate paper abstract using LLM.

    Receives a DB session from the route handler via Depends(get_db).
    The session lifecycle is managed by FastAPI's dependency injection.
    """
    import textwrap

    from ..services.llm_runtime import invoke_llm_simple
    from ..services.llm_service import resolve_llm_config

    prompt = textwrap.dedent("""\
        你是一位专业学术翻译。请将以下英文学术论文摘要翻译为中文。
        翻译要求：准确、流畅、符合中文学术写作习惯。专业术语首次出现时用括号注明英文原文。
        只输出翻译后的中文摘要，不要添加任何前缀或解释。

        原文摘要：
    """)

    try:
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper or not paper.abstract:
            return

        resolved = resolve_llm_config(db, config_id)
        full_prompt = prompt + paper.abstract
        loop = asyncio.new_event_loop()
        try:
            translated = loop.run_until_complete(invoke_llm_simple(resolved, full_prompt))
        finally:
            loop.close()

        paper.abstract_zh = translated.strip()
        db.commit()
        logger.info("Abstract translation completed for paper %d", paper_id)

        # Invalidate paper list cache
        cache.delete_by_prefix("papers:list:")
    except Exception:
        logger.exception("Abstract translation failed for paper %d", paper_id)


@router.post("/{paper_id}/translate-abstract", response_model=PaperOut)
def translate_abstract(
    paper_id: int,
    background_tasks: BackgroundTasks,
    config_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Trigger LLM translation of paper abstract to Chinese."""
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    if not paper.abstract:
        raise HTTPException(status_code=400, detail="该论文没有摘要内容")

    background_tasks.add_task(_run_abstract_translate, paper_id, config_id, db)
    logger.info("Triggered abstract translation for paper %d", paper_id)
    return paper

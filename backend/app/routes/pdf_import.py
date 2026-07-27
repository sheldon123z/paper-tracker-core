"""Two-phase offline PDF paper import routes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..control_plane.models import User
from ..database import get_db
from ..models import Paper, PaperFile
from ..schemas import PdfImportAnalyzeOut, PdfImportCommitOut, PdfImportMetadata
from ..services.access_control import normalize_new_scope, paper_response, require_writable
from ..services.cache import cache
from ..services.file_storage import (
    MAX_FILE_SIZE,
    delete_file,
    read_file,
    save_file,
    validate_upload,
)
from ..services.pdf_import_service import (
    duplicate_payload,
    enrich_with_local_llm,
    extract_pdf_offline,
    finalize_metadata,
    find_duplicate,
    merge_missing_fields,
    metadata_link,
    normalize_title,
    sha256_bytes,
)
from ..services.relevance import load_keywords_from_env, score_relevance

router = APIRouter(
    prefix="/api/papers/import/pdf",
    tags=["paper-import"],
    dependencies=[Depends(get_current_user)],
)

PDF_READ_CHUNK_SIZE = 1024 * 1024


async def _read_pdf(file: UploadFile) -> tuple[str, bytes]:
    filename = Path(file.filename or "unnamed.pdf").name
    content = bytearray()
    while chunk := await file.read(PDF_READ_CHUNK_SIZE):
        if len(content) + len(chunk) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"文件过大，上限为 {MAX_FILE_SIZE // (1024 * 1024)} MB",
            )
        content.extend(chunk)
    payload = bytes(content)
    try:
        validate_upload(filename, file.content_type or "application/pdf", len(payload))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if Path(filename).suffix.lower() != ".pdf" or not payload.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="仅支持有效的 PDF 文件")
    return filename, payload


@router.post("/analyze", response_model=PdfImportAnalyzeOut)
async def analyze_pdf(
    file: UploadFile = File(...),
    visibility: str | None = Form(default=None),
    department_id: int | None = Form(default=None),
    llm_config_id: int | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Extract one PDF and optionally enrich it with the selected enabled LLM config."""
    filename, content = await _read_pdf(file)
    resolved_visibility, resolved_department = normalize_new_scope(user, visibility, department_id)
    try:
        extraction = extract_pdf_offline(content, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        extraction = await enrich_with_local_llm(db, extraction, llm_config_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        metadata = finalize_metadata(PdfImportMetadata.model_validate(extraction.metadata))
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    content_hash = sha256_bytes(content)
    duplicate, match_by = find_duplicate(
        db, metadata, content_hash, resolved_visibility, resolved_department,
    )
    return PdfImportAnalyzeOut(
        filename=filename,
        content_hash=content_hash,
        language=extraction.language,
        metadata=metadata,
        confidence=extraction.confidence,
        warnings=extraction.warnings,
        duplicate=duplicate_payload(duplicate, match_by, metadata),
    )


@router.post("/commit", response_model=PdfImportCommitOut)
async def commit_pdf(
    file: UploadFile = File(...),
    metadata_json: str = Form(...),
    expected_content_hash: str = Form(...),
    visibility: str | None = Form(default=None),
    department_id: int | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename, content = await _read_pdf(file)
    content_hash = sha256_bytes(content)
    if content_hash != expected_content_hash:
        raise HTTPException(status_code=409, detail="PDF 文件已发生变化，请重新识别")
    try:
        raw_metadata = json.loads(metadata_json)
        metadata = finalize_metadata(PdfImportMetadata.model_validate(raw_metadata))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=f"论文元数据无效：{exc}") from exc

    resolved_visibility, resolved_department = normalize_new_scope(user, visibility, department_id)
    duplicate, match_by = find_duplicate(
        db, metadata, content_hash, resolved_visibility, resolved_department,
    )
    saved_path: str | None = None
    attachment_created = False
    changed = False
    warnings: list[str] = []
    duplicate_info = duplicate_payload(duplicate, match_by, metadata)
    if duplicate_info and duplicate_info["conflicts"]:
        warnings.append(
            "已保留现有非空字段：" + "、".join(duplicate_info["conflicts"])
        )
    try:
        if duplicate:
            require_writable(duplicate, user)
            paper = duplicate
            changed = merge_missing_fields(paper, metadata)
        else:
            basis = metadata.abstract or metadata.ai_summary or ""
            paper = Paper(
                title=metadata.title.strip(),
                authors=metadata.authors.strip(),
                abstract=metadata.abstract,
                ai_summary=metadata.ai_summary,
                link=metadata_link(metadata),
                source="local_pdf",
                published_date=metadata.published_date,
                relevance=score_relevance(metadata.title, basis, load_keywords_from_env()),
                category=metadata.category or "Uncategorized",
                arxiv_id=metadata.arxiv_id,
                doi=metadata.doi,
                pdf_url=None,
                content_hash=hashlib.sha256(
                    normalize_title(metadata.title).encode("utf-8")
                ).hexdigest(),
                visibility=resolved_visibility,
                department_id=resolved_department,
                created_by_user_id=user.id,
            )
            db.add(paper)
            db.flush()
            changed = True

        # Older attachments predate PaperFile.content_hash.  Backfill only the
        # matched paper on demand so the same local PDF is not attached twice.
        for stored in db.query(PaperFile).filter(
            PaperFile.paper_id == paper.id,
            PaperFile.content_hash.is_(None),
        ).all():
            try:
                stored.content_hash = hashlib.sha256(read_file(stored.storage_path).read_bytes()).hexdigest()
            except (FileNotFoundError, OSError):
                continue

        existing_attachment = db.query(PaperFile).filter(
            PaperFile.paper_id == paper.id,
            PaperFile.content_hash == content_hash,
        ).first()
        if not existing_attachment:
            saved_path, file_size = save_file(paper.id, filename, content)
            db.query(PaperFile).filter(
                PaperFile.paper_id == paper.id,
                PaperFile.is_primary.is_(True),
            ).update({"is_primary": False})
            db.add(PaperFile(
                paper_id=paper.id,
                filename=filename,
                storage_path=saved_path,
                file_type="pdf",
                content_type="application/pdf",
                file_size=file_size,
                content_hash=content_hash,
                is_primary=True,
            ))
            attachment_created = True
        elif not existing_attachment.is_primary:
            db.query(PaperFile).filter(
                PaperFile.paper_id == paper.id,
                PaperFile.is_primary.is_(True),
            ).update({"is_primary": False})
            existing_attachment.is_primary = True
            changed = True
            warnings.append("相同 PDF 已存在，已将其设为论文主附件。")
        else:
            warnings.append("相同 PDF 已作为主附件存在，未重复保存。")

        db.commit()
        db.refresh(paper)
    except HTTPException:
        db.rollback()
        if saved_path:
            delete_file(saved_path)
        raise
    except Exception as exc:
        db.rollback()
        if saved_path:
            delete_file(saved_path)
        raise HTTPException(status_code=500, detail=f"PDF 入库失败：{str(exc)[:200]}") from exc

    cache.delete_by_prefix("papers:list:")
    action = "created" if duplicate is None else ("enriched" if changed or attachment_created else "unchanged")
    return PdfImportCommitOut(
        action=action,
        paper=paper_response(db, paper, user),
        attachment_created=attachment_created,
        warnings=warnings,
    )

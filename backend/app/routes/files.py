"""File upload/download API routes for paper attachments."""

import asyncio
import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..control_plane.models import User
from ..database import SessionLocal, get_db
from ..models import Paper, PaperFile
from ..offline import require_online_http
from ..schemas import PaperFileOut, PaperFileUpdate
from ..services.access_control import get_visible_or_404, require_writable
from ..services.file_storage import (
    delete_file,
    infer_file_type,
    read_file,
    save_file,
    validate_upload,
)

logger = logging.getLogger("paper-tracker.files")

router = APIRouter(prefix="/api/papers/{paper_id}/files", tags=["files"], dependencies=[Depends(get_current_user)])


def _get_paper_or_404(paper_id: int, db: Session, user: User) -> Paper:
    paper = get_visible_or_404(db, Paper, paper_id, user)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    return paper


@router.get("", response_model=list[PaperFileOut])
def list_files(paper_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_paper_or_404(paper_id, db, user)
    files = (
        db.query(PaperFile)
        .filter(PaperFile.paper_id == paper_id)
        .order_by(PaperFile.is_primary.desc(), PaperFile.created_at.desc())
        .all()
    )
    return files


@router.post("", response_model=PaperFileOut)
async def upload_file(
    paper_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = _get_paper_or_404(paper_id, db, user)
    require_writable(paper, user)

    content = await file.read()
    content_type = file.content_type or "application/octet-stream"
    filename = file.filename or "unnamed"

    try:
        validate_upload(filename, content_type, len(content))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    file_type = infer_file_type(filename, content_type)
    storage_path, file_size = save_file(paper_id, filename, content)

    # If this is the first file, mark as primary
    existing_count = db.query(PaperFile).filter(PaperFile.paper_id == paper_id).count()
    is_primary = existing_count == 0

    paper_file = PaperFile(
        paper_id=paper_id,
        filename=filename,
        storage_path=storage_path,
        file_type=file_type,
        content_type=content_type,
        file_size=file_size,
        is_primary=is_primary,
    )
    db.add(paper_file)
    db.commit()
    db.refresh(paper_file)
    logger.info("Uploaded file %s for paper %d", filename, paper_id)
    return paper_file


@router.get("/{file_id}/download")
def download_file(paper_id: int, file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_paper_or_404(paper_id, db, user)
    paper_file = (
        db.query(PaperFile)
        .filter(PaperFile.id == file_id, PaperFile.paper_id == paper_id)
        .first()
    )
    if not paper_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    try:
        file_path = read_file(paper_file.storage_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="文件已丢失") from None

    return FileResponse(
        path=str(file_path),
        filename=paper_file.filename,
        media_type=paper_file.content_type,
    )


@router.get("/{file_id}/content")
def get_file_content(paper_id: int, file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_paper_or_404(paper_id, db, user)
    paper_file = (
        db.query(PaperFile)
        .filter(PaperFile.id == file_id, PaperFile.paper_id == paper_id)
        .first()
    )
    if not paper_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    try:
        file_path = read_file(paper_file.storage_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="文件已丢失") from None

    if paper_file.file_type in ("markdown", "text"):
        text_content = file_path.read_text(encoding="utf-8", errors="replace")
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(content=text_content, media_type="text/plain; charset=utf-8")

    # PDF, Office docs, or other binary: return as file
    return FileResponse(
        path=str(file_path),
        media_type=paper_file.content_type or "application/octet-stream",
    )


@router.patch("/{file_id}", response_model=PaperFileOut)
def update_file(
    paper_id: int,
    file_id: int,
    payload: PaperFileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paper = _get_paper_or_404(paper_id, db, user)
    require_writable(paper, user)
    paper_file = (
        db.query(PaperFile)
        .filter(PaperFile.id == file_id, PaperFile.paper_id == paper_id)
        .first()
    )
    if not paper_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    if payload.is_primary is not None:
        if payload.is_primary:
            # Unset other primary files for this paper
            db.query(PaperFile).filter(
                PaperFile.paper_id == paper_id, PaperFile.id != file_id
            ).update({"is_primary": False})
        paper_file.is_primary = payload.is_primary

    if payload.annotations_json is not None:
        paper_file.annotations_json = (
            json.dumps(payload.annotations_json, ensure_ascii=False)
            if payload.annotations_json
            else None
        )

    db.commit()
    db.refresh(paper_file)
    return paper_file


@router.delete("/{file_id}")
def delete_paper_file(paper_id: int, file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    paper = _get_paper_or_404(paper_id, db, user)
    require_writable(paper, user)
    paper_file = (
        db.query(PaperFile)
        .filter(PaperFile.id == file_id, PaperFile.paper_id == paper_id)
        .first()
    )
    if not paper_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    try:
        delete_file(paper_file.storage_path)
    except Exception as e:
        logger.warning("Failed to delete file from disk: %s", e)

    db.delete(paper_file)
    db.commit()
    return {"detail": "文件已删除"}


def _run_parse_task(paper_id: int, file_id: int, engine: str = "mineru"):
    """Wrapper to run async parse_pdf_to_markdown in a new event loop for BackgroundTasks."""
    if engine == "doc2x":
        from ..services.doc2x_service import parse_pdf_to_markdown
    else:
        from ..services.mineru_service import parse_pdf_to_markdown
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(parse_pdf_to_markdown(paper_id, file_id, SessionLocal))
    finally:
        loop.close()


@router.post("/{file_id}/parse", response_model=PaperFileOut)
def trigger_parse(
    paper_id: int,
    file_id: int,
    background_tasks: BackgroundTasks,
    engine: str = "mineru",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger PDF parsing for a file. engine: 'mineru' or 'doc2x'."""
    require_online_http(f"{engine} cloud parsing")
    paper = _get_paper_or_404(paper_id, db, user)
    require_writable(paper, user)
    if engine not in ("mineru", "doc2x"):
        raise HTTPException(status_code=400, detail=f"不支持的解析引擎: {engine}")

    paper_file = (
        db.query(PaperFile)
        .filter(PaperFile.id == file_id, PaperFile.paper_id == paper_id)
        .first()
    )
    if not paper_file:
        raise HTTPException(status_code=404, detail="文件不存在")
    if paper_file.file_type != "pdf":
        raise HTTPException(status_code=400, detail="仅支持解析 PDF 文件")
    if paper_file.parse_status in ("pending", "processing"):
        raise HTTPException(status_code=409, detail="该文件正在解析中")

    paper_file.parse_status = "pending"
    paper_file.parse_error = None
    db.commit()
    db.refresh(paper_file)

    background_tasks.add_task(_run_parse_task, paper_id, file_id, engine)
    logger.info("Triggered %s parse for paper %d, file %d", engine, paper_id, file_id)
    return paper_file


@router.get("/{file_id}/parse-status")
def get_parse_status(paper_id: int, file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Check parsing status of a file."""
    _get_paper_or_404(paper_id, db, user)
    paper_file = (
        db.query(PaperFile)
        .filter(PaperFile.id == file_id, PaperFile.paper_id == paper_id)
        .first()
    )
    if not paper_file:
        raise HTTPException(status_code=404, detail="文件不存在")

    return {
        "file_id": paper_file.id,
        "parse_status": paper_file.parse_status,
        "parse_error": paper_file.parse_error,
        "parsed_file_id": paper_file.parsed_file_id,
        "mineru_task_id": paper_file.mineru_task_id,
    }


def _run_translate_task(paper_id: int, file_id: int, config_id: int | None):
    """Wrapper to run async translate in a new event loop for BackgroundTasks."""
    from ..services.translate_service import translate_markdown_file
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(translate_markdown_file(paper_id, file_id, config_id, SessionLocal))
    finally:
        loop.close()


@router.post("/{file_id}/translate", response_model=PaperFileOut)
def trigger_translate(
    paper_id: int,
    file_id: int,
    background_tasks: BackgroundTasks,
    config_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Translate a parsed markdown file to Chinese using LLM."""
    paper = _get_paper_or_404(paper_id, db, user)
    require_writable(paper, user)
    paper_file = (
        db.query(PaperFile)
        .filter(PaperFile.id == file_id, PaperFile.paper_id == paper_id)
        .first()
    )
    if not paper_file:
        raise HTTPException(status_code=404, detail="文件不存在")
    if paper_file.file_type != "markdown":
        raise HTTPException(status_code=400, detail="仅支持翻译 Markdown 文件")
    if paper_file.parse_status == "translating":
        raise HTTPException(status_code=409, detail="该文件正在翻译中")

    paper_file.parse_status = "translating"
    paper_file.parse_error = None
    db.commit()
    db.refresh(paper_file)

    background_tasks.add_task(_run_translate_task, paper_id, file_id, config_id)
    logger.info("Triggered translation for paper %d, file %d", paper_id, file_id)
    return paper_file

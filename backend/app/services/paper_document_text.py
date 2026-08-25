"""Read bounded text from a paper's original PDF attachment.

The chat agents consume text-only messages, so a PDF must be converted from its
embedded text layer before it can be used as model context.  This module keeps
that conversion local, bounded, and tied to a concrete ``paper_id``.
"""

from __future__ import annotations

import json
import logging
import multiprocessing
import tempfile
import threading
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader
from sqlalchemy.orm import Session

from ..models import Paper, PaperFile
from .file_storage import read_file

logger = logging.getLogger("paper-tracker.paper_document_text")

MAX_PDF_CONTEXT_CHARS = 32_000
MAX_PDF_CONTEXT_PAGES = 16
MAX_PDF_TOOL_PAGES = 8
MAX_PDF_TOOL_CHARS = 16_000
MAX_PDF_TOOL_CALLS = 4
MAX_PDF_TOOL_TOTAL_CHARS = MAX_PDF_TOOL_CHARS * MAX_PDF_TOOL_CALLS
MAX_PDF_SOURCE_BYTES = 100 * 1024 * 1024
MAX_PDF_EXTRACT_SECONDS = 15
MAX_PDF_EXTRACT_MEMORY_BYTES = 512 * 1024 * 1024
MAX_CONCURRENT_PDF_EXTRACTIONS = 2

_PDF_EXTRACTION_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT_PDF_EXTRACTIONS)


@dataclass(frozen=True)
class ExtractedPdfText:
    """Text and pagination metadata extracted from a PDF text layer."""

    text: str
    total_pages: int
    start_page: int
    last_page: int
    text_truncated: bool
    next_page: int | None = None
    next_page_char_offset: int | None = None


@dataclass(frozen=True)
class PaperDocumentText:
    """Model-ready text associated with one original paper PDF."""

    file_id: int
    filename: str
    text: str
    source: str
    total_pages: int | None
    start_page: int
    last_page: int | None
    has_more_pages: bool
    warning: str | None = None
    next_page: int | None = None
    next_page_char_offset: int | None = None
    text_offset: int | None = None
    next_text_offset: int | None = None


def _normalize_text(value: str) -> str:
    return unicodedata.normalize("NFKC", value or "").replace("\x00", "").strip()


def _extract_pdf_text_layer(
    path: Path,
    *,
    start_page: int,
    page_count: int | None,
    max_chars: int,
    page_char_offset: int = 0,
) -> ExtractedPdfText:
    """Extract page-labelled text with a resumable page/character cursor."""

    reader = PdfReader(str(path))
    if reader.is_encrypted and not reader.decrypt(""):
        raise ValueError("PDF is encrypted")

    total_pages = len(reader.pages)
    normalized_start = max(1, int(start_page))
    normalized_page_offset = max(0, int(page_char_offset))
    start_index = normalized_start - 1
    if start_index >= total_pages:
        return ExtractedPdfText("", total_pages, normalized_start, total_pages, False)

    stop_index = (
        total_pages
        if page_count is None
        else min(total_pages, start_index + max(1, int(page_count)))
    )

    remaining = max(1, int(max_chars))
    chunks: list[str] = []
    last_page = normalized_start - 1
    text_truncated = False
    next_page: int | None = None
    next_page_char_offset: int | None = None

    for page_index in range(start_index, stop_index):
        page_text = _normalize_text(reader.pages[page_index].extract_text() or "")
        if not page_text:
            continue

        page_offset = normalized_page_offset if page_index == start_index else 0
        if page_offset >= len(page_text):
            continue

        label = f"[PDF 第 {page_index + 1} 页]"
        if page_offset:
            label = f"[PDF 第 {page_index + 1} 页（从字符 {page_offset + 1} 继续）]"
        separator = "\n\n" if chunks else ""
        prefix = f"{separator}{label}\n"
        available_for_text = remaining - len(prefix)
        if available_for_text <= 0:
            next_page = page_index + 1
            next_page_char_offset = page_offset
            text_truncated = True
            break

        remaining_page_text = page_text[page_offset:]
        if len(remaining_page_text) <= available_for_text:
            chunks.append(f"{prefix}{remaining_page_text}")
            remaining -= len(prefix) + len(remaining_page_text)
            last_page = page_index + 1
            continue

        chunks.append(f"{prefix}{remaining_page_text[:available_for_text]}")
        last_page = page_index + 1
        next_page = page_index + 1
        next_page_char_offset = page_offset + available_for_text
        text_truncated = True
        break

    if next_page is None and stop_index < total_pages:
        next_page = stop_index + 1
        next_page_char_offset = 0
        text_truncated = True

    return ExtractedPdfText(
        text="".join(chunks).strip(),
        total_pages=total_pages,
        start_page=normalized_start,
        last_page=last_page,
        text_truncated=text_truncated,
        next_page=next_page,
        next_page_char_offset=next_page_char_offset,
    )


def _apply_pdf_worker_limits() -> None:
    """Apply OS limits when supported (Linux Docker); Windows uses timeout."""
    try:
        import resource

        resource.setrlimit(
            resource.RLIMIT_AS,
            (MAX_PDF_EXTRACT_MEMORY_BYTES, MAX_PDF_EXTRACT_MEMORY_BYTES),
        )
        resource.setrlimit(
            resource.RLIMIT_CPU,
            (MAX_PDF_EXTRACT_SECONDS, MAX_PDF_EXTRACT_SECONDS + 1),
        )
    except (ImportError, OSError, ValueError):
        return


def _pdf_extraction_worker(result_path: str, path: str, kwargs: dict) -> None:
    """Child-process entry point; never receives database/session objects."""
    try:
        _apply_pdf_worker_limits()
        result = _extract_pdf_text_layer(Path(path), **kwargs)
        payload = {"status": "ok", "result": result.__dict__}
    except BaseException as exc:  # child must report a bounded failure to parent
        payload = {
            "status": "error",
            "error": f"{type(exc).__name__}: {str(exc)[:500]}",
        }
    Path(result_path).write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )


def _cleanup_pdf_process(process) -> None:
    """Best-effort child cleanup; callers must release their slot separately."""
    if process is None:
        return
    try:
        try:
            alive = process.is_alive()
        except Exception:
            alive = True
        if alive:
            try:
                process.terminate()
            except Exception:
                pass
            try:
                process.join(2)
            except Exception:
                pass
            try:
                alive = process.is_alive()
            except Exception:
                alive = True
            if alive:
                try:
                    process.kill()
                except Exception:
                    pass
                try:
                    process.join(2)
                except Exception:
                    pass
    finally:
        try:
            process.close()
        except Exception:
            pass


def _extract_pdf_text_safely(
    path: Path,
    *,
    start_page: int,
    page_count: int | None,
    max_chars: int,
    page_char_offset: int = 0,
) -> ExtractedPdfText:
    """Extract in a concurrency-limited, timeout-terminated subprocess."""
    try:
        source_size = path.stat().st_size
    except OSError as exc:
        raise ValueError("PDF source cannot be inspected") from exc
    if source_size > MAX_PDF_SOURCE_BYTES:
        raise ValueError("PDF source exceeds the 100 MB extraction limit")

    if not _PDF_EXTRACTION_SLOTS.acquire(timeout=MAX_PDF_EXTRACT_SECONDS):
        raise ValueError("PDF extraction is busy; retry later")

    process = None
    temp_dir_handle = None
    try:
        temp_dir_handle = tempfile.TemporaryDirectory(prefix="paper-pdf-extract-")
        result_path = Path(temp_dir_handle.name) / "result.json"
        process_context = multiprocessing.get_context("spawn")
        process = process_context.Process(
            target=_pdf_extraction_worker,
            args=(
                str(result_path),
                str(path),
                {
                    "start_page": start_page,
                    "page_count": page_count,
                    "max_chars": max_chars,
                    "page_char_offset": page_char_offset,
                },
            ),
            daemon=True,
        )
        process.start()
        process.join(MAX_PDF_EXTRACT_SECONDS)
        if process.is_alive():
            raise ValueError("PDF extraction timed out")
        if not result_path.is_file():
            raise ValueError(
                f"PDF extraction worker exited without a result (code={process.exitcode})"
            )
        payload = json.loads(result_path.read_text(encoding="utf-8"))
        if payload.get("status") != "ok":
            raise ValueError(f"PDF extraction failed: {payload.get('error', 'unknown error')}")
        return ExtractedPdfText(**payload["result"])
    finally:
        try:
            _cleanup_pdf_process(process)
        finally:
            try:
                if temp_dir_handle is not None:
                    temp_dir_handle.cleanup()
            finally:
                _PDF_EXTRACTION_SLOTS.release()


def _select_original_pdf(
    db: Session,
    paper_id: int,
    preferred_file_id: int | str | None,
) -> PaperFile | None:
    base_query = db.query(PaperFile).filter(
        PaperFile.paper_id == paper_id,
        PaperFile.file_type == "pdf",
    )

    if preferred_file_id not in (None, ""):
        try:
            normalized_file_id = int(preferred_file_id)
        except (TypeError, ValueError):
            normalized_file_id = None
        if normalized_file_id is not None:
            preferred = base_query.filter(PaperFile.id == normalized_file_id).first()
            if preferred is not None:
                return preferred

    return base_query.order_by(
        PaperFile.is_primary.desc(),
        PaperFile.created_at.desc(),
        PaperFile.id.desc(),
    ).first()


def _load_parsed_fallback(
    db: Session,
    paper_id: int,
    pdf_file: PaperFile,
    max_chars: int,
    text_offset: int = 0,
) -> tuple[str, int | None] | None:
    if not pdf_file.parsed_file_id:
        return None
    parsed_file = db.query(PaperFile).filter(
        PaperFile.id == pdf_file.parsed_file_id,
        PaperFile.paper_id == paper_id,
        PaperFile.file_type.in_(("markdown", "text")),
    ).first()
    if parsed_file is None:
        return None
    try:
        parsed_path = read_file(
            parsed_file.storage_path,
            expected_paper_id=parsed_file.paper_id,
        )
        normalized_offset = max(0, int(text_offset))
        with parsed_path.open("r", encoding="utf-8", errors="replace") as parsed_stream:
            skipped = 0
            while skipped < normalized_offset:
                part = parsed_stream.read(min(8_192, normalized_offset - skipped))
                if not part:
                    break
                skipped += len(part)
            if skipped < normalized_offset:
                return "", None
            raw_text = parsed_stream.read(max_chars + 1)
    except (FileNotFoundError, OSError, ValueError):
        logger.warning(
            "Parsed PDF fallback is missing for paper %d, file %d",
            paper_id,
            pdf_file.id,
        )
        return None
    has_more = len(raw_text) > max_chars
    consumed_text = raw_text[:max_chars]
    # Parsed Markdown is already Unicode text. Avoid NFKC here because some
    # compatibility characters expand; advancing a raw-text cursor after a
    # normalized truncation would otherwise skip source characters forever.
    parsed_text = consumed_text.replace("\x00", "").strip()
    next_offset = normalized_offset + len(consumed_text) if has_more else None
    if not parsed_text:
        return "", next_offset
    return parsed_text, next_offset


def load_paper_document_text(
    db: Session,
    paper_id: int,
    *,
    preferred_file_id: int | str | None = None,
    start_page: int = 1,
    page_count: int | None = None,
    max_chars: int = MAX_PDF_CONTEXT_CHARS,
    page_char_offset: int = 0,
    parsed_text_offset: int = 0,
) -> PaperDocumentText | None:
    """Load bounded text from the selected or primary original PDF.

    A parsed Markdown attachment is used only when the original PDF has no
    extractable text layer.  The fallback is labelled so the model cannot
    mistake derived text for the binary original.
    """

    bounded_chars = max(1_000, min(int(max_chars), MAX_PDF_CONTEXT_CHARS))
    # ``scope_session`` applies row-level criteria to this Paper query.  Keep
    # the check here as defense in depth even though chat routes already
    # resolve a visible paper before calling the service.
    if db.query(Paper.id).filter(Paper.id == int(paper_id)).first() is None:
        return None
    pdf_file = _select_original_pdf(db, int(paper_id), preferred_file_id)
    if pdf_file is None:
        return None

    extraction: ExtractedPdfText | None = None
    extraction_error = False
    try:
        pdf_path = read_file(
            pdf_file.storage_path,
            expected_paper_id=pdf_file.paper_id,
        )
        extraction = _extract_pdf_text_safely(
            pdf_path,
            start_page=start_page,
            page_count=page_count,
            max_chars=bounded_chars,
            page_char_offset=page_char_offset,
        )
    except (FileNotFoundError, OSError, ValueError) as exc:
        extraction_error = True
        logger.warning(
            "Unable to read PDF text for paper %d, file %d: %s",
            paper_id,
            pdf_file.id,
            exc,
        )
    except Exception:
        extraction_error = True
        logger.exception(
            "Unexpected PDF text extraction failure for paper %d, file %d",
            paper_id,
            pdf_file.id,
        )

    if extraction is not None and extraction.text:
        has_more_pages = extraction.next_page is not None
        return PaperDocumentText(
            file_id=pdf_file.id,
            filename=pdf_file.filename,
            text=extraction.text,
            source="pdf_text_layer",
            total_pages=extraction.total_pages,
            start_page=extraction.start_page,
            last_page=extraction.last_page,
            has_more_pages=has_more_pages,
            next_page=extraction.next_page,
            next_page_char_offset=extraction.next_page_char_offset,
        )

    # Parsed Markdown has no reliable page map, so only use it for requests
    # beginning at the start of the document.
    if int(start_page) <= 1:
        parsed_fallback = _load_parsed_fallback(
            db,
            int(paper_id),
            pdf_file,
            bounded_chars,
            text_offset=parsed_text_offset,
        )
        if parsed_fallback is not None:
            parsed_text, next_text_offset = parsed_fallback
            if not parsed_text:
                return PaperDocumentText(
                    file_id=pdf_file.id,
                    filename=pdf_file.filename,
                    text="",
                    source="unavailable",
                    total_pages=extraction.total_pages if extraction is not None else None,
                    start_page=1,
                    last_page=extraction.last_page if extraction is not None else None,
                    has_more_pages=False,
                    warning="本地解析文本偏移超出范围或该段没有可用文本。",
                    text_offset=max(0, int(parsed_text_offset)),
                    next_text_offset=next_text_offset,
                )
            return PaperDocumentText(
                file_id=pdf_file.id,
                filename=pdf_file.filename,
                text=parsed_text,
                source="parsed_markdown_fallback",
                total_pages=extraction.total_pages if extraction is not None else None,
                start_page=1,
                last_page=extraction.last_page if extraction is not None else None,
                has_more_pages=False,
                warning="PDF 文本层不可用，已使用该 PDF 的本地解析文本。",
                text_offset=max(0, int(parsed_text_offset)),
                next_text_offset=next_text_offset,
            )

    if extraction is not None and int(start_page) > extraction.total_pages:
        warning = f"请求页码超出范围；该 PDF 共 {extraction.total_pages} 页。"
    elif extraction_error:
        warning = "PDF 原件无法读取，且没有可用的本地解析文本。"
    else:
        warning = "PDF 原件没有可提取的文本层，且没有可用的本地解析文本。"

    return PaperDocumentText(
        file_id=pdf_file.id,
        filename=pdf_file.filename,
        text="",
        source="unavailable",
        total_pages=extraction.total_pages if extraction is not None else None,
        start_page=max(1, int(start_page)),
        last_page=extraction.last_page if extraction is not None else None,
        has_more_pages=bool(extraction and extraction.next_page is not None),
        warning=warning,
        next_page=extraction.next_page if extraction is not None else None,
        next_page_char_offset=(
            extraction.next_page_char_offset if extraction is not None else None
        ),
    )

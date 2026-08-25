"""Doc2X API client for PDF-to-Markdown parsing."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import httpx

from ..offline import require_online
from ..settings import get_secret_value

logger = logging.getLogger("paper-tracker.doc2x")

DOC2X_BASE_URL = "https://v2.doc2x.noedgeai.com"
POLL_MAX_SECONDS = 600
POLL_INTERVALS = [2, 4, 8, 16, 30]


def _get_token() -> str:
    token = get_secret_value("DOC2X_API_KEY", "") or ""
    if not token:
        raise ValueError("DOC2X_API_KEY 环境变量未配置，请在 .env 中设置")
    return token


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def submit_parse_task(file_path: Path, filename: str, token: str) -> str:
    """Submit a PDF to Doc2X for parsing. Returns task uuid."""
    require_online("Doc2X cloud parsing")
    async with httpx.AsyncClient(timeout=120) as client:
        file_content = file_path.read_bytes()
        resp = await client.post(
            f"{DOC2X_BASE_URL}/api/v2/parse/pdf",
            headers=_headers(token),
            files={"file": (filename, file_content, "application/pdf")},
            data={"ocr": "auto"},
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") not in ("success", "ok", 200, "200"):
            raise RuntimeError(f"Doc2X 提交失败: {data}")

        uuid = data.get("data", {}).get("uuid") or data.get("uuid")
        if not uuid:
            raise RuntimeError(f"Doc2X 未返回 uuid: {data}")

        logger.info("Submitted PDF to Doc2X: %s (uuid=%s)", filename, uuid)
        return uuid


async def poll_task_status(uuid: str, token: str) -> dict:
    """Poll Doc2X task until completed or failed.

    Returns: {"status": "done"|"failed", "texts": list[str]|None, "error": str|None}
    """
    require_online("Doc2X cloud parsing")
    elapsed = 0
    interval_idx = 0

    async with httpx.AsyncClient(timeout=30) as client:
        while elapsed < POLL_MAX_SECONDS:
            resp = await client.get(
                f"{DOC2X_BASE_URL}/api/v2/parse/status",
                headers=_headers(token),
                params={"uuid": uuid},
            )
            resp.raise_for_status()
            data = resp.json()

            status = data.get("data", {}).get("status", "")

            if status == "success":
                # Extract markdown from pages
                result = data.get("data", {}).get("result", {})
                pages = result.get("pages", [])
                texts = [p.get("md", "") for p in pages if p.get("md")]
                if not texts:
                    # Try alternative result format
                    md_content = result.get("markdown") or result.get("md") or ""
                    texts = [md_content] if md_content else []
                return {"status": "done", "texts": texts, "error": None}

            if status in ("failed", "error", "pages limit exceeded"):
                error_msg = data.get("data", {}).get("error") or status
                return {"status": "failed", "texts": None, "error": error_msg}

            wait = POLL_INTERVALS[min(interval_idx, len(POLL_INTERVALS) - 1)]
            await asyncio.sleep(wait)
            elapsed += wait
            interval_idx += 1
            logger.debug("Polling Doc2X uuid %s... elapsed=%ds", uuid, elapsed)

    return {"status": "failed", "texts": None, "error": f"轮询超时 ({POLL_MAX_SECONDS}s)"}


async def parse_pdf_to_markdown(paper_id: int, file_id: int, db_factory) -> None:
    """Full pipeline: submit PDF → poll → extract markdown → store.

    Runs as a background task. Updates PaperFile.parse_status throughout.
    """
    require_online("Doc2X cloud parsing")

    from ..models import PaperFile
    from .file_storage import read_file, save_file

    db = db_factory()
    try:
        paper_file = db.query(PaperFile).filter(
            PaperFile.id == file_id,
            PaperFile.paper_id == paper_id,
        ).first()
        if not paper_file:
            logger.error("PaperFile %d not found", file_id)
            return

        token = _get_token()
        file_path = read_file(
            paper_file.storage_path,
            expected_paper_id=paper_file.paper_id,
        )

        paper_file.parse_status = "processing"
        db.commit()

        uuid = await submit_parse_task(file_path, paper_file.filename, token)
        paper_file.mineru_task_id = uuid  # Reuse field for task tracking
        db.commit()

        result = await poll_task_status(uuid, token)

        if result["status"] != "done" or not result["texts"]:
            paper_file.parse_status = "failed"
            paper_file.parse_error = result.get("error", "解析失败")
            db.commit()
            logger.error("Doc2X parse failed for file %d: %s", file_id, result.get("error"))
            return

        markdown_content = "\n\n".join(result["texts"])

        parsed_filename = Path(paper_file.filename).stem + "_parsed.md"
        storage_path, file_size = save_file(paper_id, parsed_filename, markdown_content.encode("utf-8"))

        parsed_file = PaperFile(
            paper_id=paper_id,
            filename=parsed_filename,
            storage_path=storage_path,
            file_type="markdown",
            content_type="text/markdown",
            file_size=file_size,
            is_primary=False,
        )
        db.add(parsed_file)
        db.flush()

        paper_file.parse_status = "completed"
        paper_file.parse_error = None
        paper_file.parsed_file_id = parsed_file.id
        db.commit()

        logger.info(
            "Doc2X parse completed for file %d → parsed file %d (%d chars)",
            file_id, parsed_file.id, len(markdown_content),
        )

    except Exception as exc:
        logger.exception("Doc2X parse error for file %d", file_id)
        try:
            paper_file = db.query(PaperFile).filter(PaperFile.id == file_id).first()
            if paper_file:
                paper_file.parse_status = "failed"
                paper_file.parse_error = str(exc)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()

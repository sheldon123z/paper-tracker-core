"""MinerU v4 Precision API client for PDF-to-Markdown parsing."""

from __future__ import annotations

import asyncio
import io
import logging
import os
import zipfile
from pathlib import Path

import httpx

logger = logging.getLogger("paper-tracker.mineru")

MINERU_BASE_URL = "https://mineru.net"
POLL_MAX_SECONDS = 600  # 10 minutes timeout
POLL_INTERVALS = [2, 4, 8, 16, 30]  # exponential backoff, max 30s


def _get_token() -> str:
    token = os.getenv("MINERU_API_TOKEN", "")
    if not token:
        raise ValueError("MINERU_API_TOKEN 环境变量未配置，请在 .env 中设置")
    return token


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def submit_parse_task(file_path: Path, filename: str, token: str) -> str:
    """Submit a PDF to MinerU v4 batch upload flow. Returns batch_id.

    Flow:
    1. POST /api/v4/file-urls/batch → get signed upload URL
    2. PUT file to signed URL
    3. Return batch_id for polling
    """
    async with httpx.AsyncClient(timeout=60) as client:
        # Step 1: Get signed upload URL
        resp = await client.post(
            f"{MINERU_BASE_URL}/api/v4/file-urls/batch",
            headers=_headers(token),
            json={
                "files": [{"name": filename, "is_ocr": False}],
                "enable_formula": True,
                "enable_table": True,
                "language": "ch",
                "model_version": "vlm",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"MinerU 提交失败: {data.get('msg', data)}")

        batch_id = data["data"]["batch_id"]
        file_urls = data["data"]["file_urls"]
        if not file_urls:
            raise RuntimeError("MinerU 未返回上传 URL")

        upload_url = file_urls[0]

        # Step 2: Upload file via PUT
        file_content = file_path.read_bytes()
        put_resp = await client.put(
            upload_url,
            content=file_content,
            headers={"Content-Type": "application/pdf"},
        )
        put_resp.raise_for_status()
        logger.info("Uploaded PDF to MinerU: %s (batch_id=%s)", filename, batch_id)

    return batch_id


async def poll_task_status(batch_id: str, token: str) -> dict:
    """Poll MinerU batch results until completed or failed.

    Returns: {"status": "done"|"failed", "full_zip_url": str|None, "error": str|None}
    """
    elapsed = 0
    interval_idx = 0

    async with httpx.AsyncClient(timeout=30) as client:
        while elapsed < POLL_MAX_SECONDS:
            resp = await client.get(
                f"{MINERU_BASE_URL}/api/v4/extract-results/batch/{batch_id}",
                headers=_headers(token),
            )
            resp.raise_for_status()
            data = resp.json()

            if data.get("code") != 0:
                return {"status": "failed", "full_zip_url": None, "error": data.get("msg", "未知错误")}

            results = data.get("data", {}).get("extract_result", [])
            if results:
                result = results[0]
                state = result.get("state", "pending")

                if state == "done":
                    return {
                        "status": "done",
                        "full_zip_url": result.get("full_zip_url"),
                        "error": None,
                    }
                if state == "failed":
                    return {
                        "status": "failed",
                        "full_zip_url": None,
                        "error": result.get("err_msg", "解析失败"),
                    }

            # Wait before next poll
            wait = POLL_INTERVALS[min(interval_idx, len(POLL_INTERVALS) - 1)]
            await asyncio.sleep(wait)
            elapsed += wait
            interval_idx += 1
            logger.debug("Polling MinerU batch %s... elapsed=%ds", batch_id, elapsed)

    return {"status": "failed", "full_zip_url": None, "error": f"轮询超时 ({POLL_MAX_SECONDS}s)"}


async def download_and_extract_markdown(zip_url: str) -> str:
    """Download ZIP from MinerU and extract the markdown content."""
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(zip_url)
        resp.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        # Look for the markdown file (typically named *.md or full.md)
        md_files = [n for n in zf.namelist() if n.endswith(".md")]
        if not md_files:
            raise RuntimeError("MinerU ZIP 中未找到 Markdown 文件")

        # Prefer file named 'full.md', otherwise take the first .md
        target = next((f for f in md_files if f.endswith("full.md")), md_files[0])
        content = zf.read(target).decode("utf-8", errors="replace")
        logger.info("Extracted markdown from ZIP: %s (%d chars)", target, len(content))
        return content


async def parse_pdf_to_markdown(paper_id: int, file_id: int, db_factory) -> None:
    """Full pipeline: submit PDF → poll → download → store parsed markdown.

    Runs as a background task. Updates PaperFile.parse_status throughout.
    db_factory should be a callable that returns a new DB session (e.g. SessionLocal).
    """
    from ..models import PaperFile
    from .file_storage import read_file, save_file

    db = db_factory()
    try:
        paper_file = db.query(PaperFile).filter(PaperFile.id == file_id).first()
        if not paper_file:
            logger.error("PaperFile %d not found", file_id)
            return

        token = _get_token()
        file_path = read_file(paper_file.storage_path)

        # Update status to processing
        paper_file.parse_status = "processing"
        db.commit()

        # Submit
        batch_id = await submit_parse_task(file_path, paper_file.filename, token)
        paper_file.mineru_task_id = batch_id
        db.commit()

        # Poll
        result = await poll_task_status(batch_id, token)

        if result["status"] != "done" or not result["full_zip_url"]:
            paper_file.parse_status = "failed"
            paper_file.parse_error = result.get("error", "解析失败")
            db.commit()
            logger.error("MinerU parse failed for file %d: %s", file_id, result.get("error"))
            return

        # Download and extract
        markdown_content = await download_and_extract_markdown(result["full_zip_url"])

        # Save as new PaperFile
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

        # Update original file with reference to parsed file
        paper_file.parse_status = "completed"
        paper_file.parse_error = None
        paper_file.parsed_file_id = parsed_file.id
        db.commit()

        logger.info(
            "MinerU parse completed for file %d → parsed file %d (%d chars)",
            file_id, parsed_file.id, len(markdown_content),
        )

    except Exception as exc:
        logger.exception("MinerU parse error for file %d", file_id)
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

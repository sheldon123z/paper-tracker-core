"""LLM-powered markdown translation service."""

from __future__ import annotations

import logging
import textwrap

from ..services.file_storage import read_file, save_file
from ..services.llm_runtime import invoke_llm_simple
from ..services.llm_service import resolve_llm_config

logger = logging.getLogger("paper-tracker.translate")

# Translate in chunks to stay within LLM context limits
_CHUNK_SIZE = 3000  # chars per chunk

_TRANSLATE_PROMPT = textwrap.dedent("""\
    你是一位专业学术翻译，请将以下英文学术论文 Markdown 内容翻译为中文。

    翻译要求：
    - 保留所有 Markdown 格式（标题、列表、代码块、公式、表格等）
    - 专业术语保留英文原文并在首次出现时括号注明中文
    - 翻译要准确、流畅、符合中文学术写作习惯
    - 不要添加任何解释或注释，只输出翻译后的 Markdown

    原文内容：
""")


def _split_markdown_chunks(text: str, chunk_size: int = _CHUNK_SIZE) -> list[str]:
    """Split markdown by paragraphs, respecting headings and code blocks."""
    lines = text.split('\n')
    chunks = []
    current = []
    current_len = 0

    for line in lines:
        line_len = len(line) + 1  # +1 for newline
        # Start new chunk if too large, unless in a code block
        if current_len + line_len > chunk_size and current:
            chunks.append('\n'.join(current))
            current = []
            current_len = 0
        current.append(line)
        current_len += line_len

    if current:
        chunks.append('\n'.join(current))

    return chunks


async def translate_markdown_file(
    paper_id: int,
    file_id: int,
    config_id: int | None,
    db_factory,
) -> None:
    """Translate a markdown file to Chinese using the configured LLM.

    Runs as a background task. Updates PaperFile.parse_status throughout.
    """
    from pathlib import Path

    from ..models import PaperFile

    db = db_factory()
    try:
        paper_file = db.query(PaperFile).filter(
            PaperFile.id == file_id,
            PaperFile.paper_id == paper_id,
        ).first()
        if not paper_file:
            logger.error("PaperFile %d not found", file_id)
            return

        # Read markdown content
        file_path = read_file(
            paper_file.storage_path,
            expected_paper_id=paper_file.paper_id,
        )
        content = file_path.read_text(encoding="utf-8", errors="replace")

        if not content.strip():
            paper_file.parse_status = "failed"
            paper_file.parse_error = "文件内容为空"
            db.commit()
            return

        # Resolve LLM config
        resolved = resolve_llm_config(db, config_id)

        # Split into chunks and translate
        chunks = _split_markdown_chunks(content)
        translated_parts = []

        for i, chunk in enumerate(chunks):
            logger.info("Translating chunk %d/%d (%d chars)", i + 1, len(chunks), len(chunk))
            prompt = _TRANSLATE_PROMPT + chunk
            result = await invoke_llm_simple(resolved, prompt)
            translated_parts.append(result)

        translated_content = '\n\n'.join(translated_parts)

        # Save as new file
        original_stem = Path(paper_file.filename).stem
        # Remove _parsed suffix if present for cleaner naming
        if original_stem.endswith("_parsed"):
            original_stem = original_stem[:-7]
        translated_filename = f"{original_stem}_translated_zh.md"
        storage_path, file_size = save_file(
            paper_id, translated_filename, translated_content.encode("utf-8")
        )

        translated_file = PaperFile(
            paper_id=paper_id,
            filename=translated_filename,
            storage_path=storage_path,
            file_type="markdown",
            content_type="text/markdown",
            file_size=file_size,
            is_primary=False,
        )
        db.add(translated_file)
        db.flush()

        paper_file.parse_status = "completed"
        paper_file.parse_error = None
        db.commit()

        logger.info(
            "Translation completed for file %d → translated file %d (%d chars)",
            file_id, translated_file.id, len(translated_content),
        )

    except Exception as exc:
        logger.exception("Translation error for file %d", file_id)
        try:
            paper_file = db.query(PaperFile).filter(PaperFile.id == file_id).first()
            if paper_file:
                paper_file.parse_status = "failed"
                paper_file.parse_error = f"翻译失败: {str(exc)[:300]}"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()

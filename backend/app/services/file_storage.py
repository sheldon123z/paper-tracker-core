"""File storage service for paper attachments."""

import logging
import uuid
from pathlib import Path

from ..settings import get_file_storage_dir

logger = logging.getLogger("paper-tracker.file_storage")

# Defaults to backend/data/paper_files for development, or to the configured
# PAPER_TRACKER_DATA_DIR for container/persistent deployments.
_STORAGE_ROOT = get_file_storage_dir()

ALLOWED_CONTENT_TYPES = {
    "application/pdf": "pdf",
    "text/markdown": "markdown",
    "text/x-markdown": "markdown",
    "text/plain": "text",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.ms-powerpoint": "pptx",
}

ALLOWED_EXTENSIONS = {
    ".pdf", ".md", ".markdown", ".txt", ".text",
    ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
}

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def infer_file_type(filename: str, content_type: str) -> str:
    """Infer logical file type from filename extension and content type."""
    ext = Path(filename).suffix.lower()
    _EXT_MAP = {
        ".pdf": "pdf",
        ".md": "markdown",
        ".markdown": "markdown",
        ".txt": "text",
        ".text": "text",
        ".docx": "docx",
        ".doc": "docx",
        ".xlsx": "xlsx",
        ".xls": "xlsx",
        ".pptx": "pptx",
        ".ppt": "pptx",
    }
    if ext in _EXT_MAP:
        return _EXT_MAP[ext]
    return ALLOWED_CONTENT_TYPES.get(content_type, "text")


def validate_upload(filename: str, content_type: str, size: int) -> None:
    """Validate file before saving. Raises ValueError on failure."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的文件类型: {ext}。允许: {', '.join(ALLOWED_EXTENSIONS)}")
    if size > MAX_FILE_SIZE:
        raise ValueError(f"文件过大: {size} bytes。上限: {MAX_FILE_SIZE // (1024*1024)} MB")


def save_file(paper_id: int, filename: str, content: bytes) -> tuple[str, int]:
    """Save file to disk. Returns (relative_storage_path, file_size)."""
    short_uuid = uuid.uuid4().hex[:8]
    safe_name = Path(filename).name  # strip any directory components
    target_dir = _STORAGE_ROOT / str(paper_id)
    _ensure_dir(target_dir)

    storage_name = f"{short_uuid}_{safe_name}"
    full_path = target_dir / storage_name
    full_path.write_bytes(content)

    # Relative path for DB storage
    rel_path = f"{paper_id}/{storage_name}"
    logger.info("Saved file: %s (%d bytes)", rel_path, len(content))
    return rel_path, len(content)


def read_file(storage_path: str) -> Path:
    """Return the absolute Path to a stored file."""
    full_path = _STORAGE_ROOT / storage_path
    if not full_path.exists():
        raise FileNotFoundError(f"文件不存在: {storage_path}")
    return full_path


def delete_file(storage_path: str) -> None:
    """Delete a file from disk."""
    full_path = _STORAGE_ROOT / storage_path
    if full_path.exists():
        full_path.unlink()
        logger.info("Deleted file: %s", storage_path)
        # Clean up empty parent directory
        parent = full_path.parent
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()

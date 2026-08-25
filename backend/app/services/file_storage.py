"""File storage service for paper attachments."""

import logging
import stat
import uuid
from pathlib import Path, PurePosixPath, PureWindowsPath

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


class UnsafeStoragePathError(ValueError):
    """Raised when a stored attachment path escapes the managed storage tree."""


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _absolute_storage_root() -> Path:
    """Return the lexical absolute root without following a root symlink."""

    root = _STORAGE_ROOT.expanduser()
    return root if root.is_absolute() else Path.cwd() / root


def _is_reparse_point(path: Path) -> bool:
    """Return whether *path* is a symlink, junction, or other reparse point."""

    if path.is_symlink():
        return True

    is_junction = getattr(path, "is_junction", None)
    if is_junction is not None and is_junction():
        return True

    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except FileNotFoundError:
        return False
    return bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def _validate_paper_id(paper_id: int) -> int:
    """Return a canonical positive integer paper identifier."""

    if not isinstance(paper_id, int) or isinstance(paper_id, bool) or paper_id <= 0:
        raise UnsafeStoragePathError("论文 ID 必须是正整数")
    return paper_id


def _validate_storage_segment(segment: str) -> None:
    """Validate one portable storage path segment without normalizing it."""

    if segment in {"", ".", ".."}:
        raise UnsafeStoragePathError("附件存储路径包含不安全的路径段")
    if segment != segment.rstrip(" ."):
        # Windows silently normalizes trailing dots/spaces, which could make
        # the validated lexical path differ from the path actually opened.
        raise UnsafeStoragePathError("附件存储路径包含不安全的 Windows 路径段")
    if any(ord(char) < 32 for char in segment):
        raise UnsafeStoragePathError("附件存储路径包含控制字符")


def _validate_storage_path(
    storage_path: str,
    *,
    expected_paper_id: int,
) -> tuple[str, str]:
    """Validate ``<paper_id>/<filename>`` and bind it to one paper.

    Database paths are capabilities: callers must name the paper that owns the
    ``PaperFile`` row.  Requiring the canonical paper-id prefix here prevents a
    corrupt or malicious row from borrowing another paper's otherwise-safe
    attachment path.
    """

    expected_paper_id = _validate_paper_id(expected_paper_id)

    if not isinstance(storage_path, str) or not storage_path.strip():
        raise UnsafeStoragePathError("附件存储路径不能为空")
    if storage_path != storage_path.strip() or "\x00" in storage_path:
        raise UnsafeStoragePathError("附件存储路径格式无效")
    if "\\" in storage_path:
        raise UnsafeStoragePathError("附件存储路径必须使用正斜杠")
    if ":" in storage_path:
        # Reject Windows drive prefixes and NTFS alternate data streams.
        raise UnsafeStoragePathError("附件存储路径不能包含盘符或备用数据流")

    posix_path = PurePosixPath(storage_path)
    windows_path = PureWindowsPath(storage_path)
    if posix_path.is_absolute() or windows_path.is_absolute() or windows_path.drive:
        raise UnsafeStoragePathError("附件存储路径必须是相对路径")

    parts = tuple(storage_path.split("/"))
    if len(parts) != 2:
        raise UnsafeStoragePathError("附件存储路径必须是论文 ID 和文件名两段")
    for part in parts:
        _validate_storage_segment(part)

    canonical_paper_id = str(expected_paper_id)
    if parts[0] != canonical_paper_id:
        raise UnsafeStoragePathError("附件存储路径与所属论文不匹配")
    return canonical_paper_id, parts[1]


def _resolve_storage_path(storage_path: str, *, expected_paper_id: int) -> Path:
    """Resolve a safe relative attachment path below ``_STORAGE_ROOT``.

    Validation is deliberately fail-closed.  Existing path components may not
    be symlinks, junctions, or any other Windows reparse point.
    """

    parts = _validate_storage_path(
        storage_path,
        expected_paper_id=expected_paper_id,
    )
    lexical_root = _absolute_storage_root()
    if _is_reparse_point(lexical_root):
        raise UnsafeStoragePathError("附件存储根目录不能是链接或重解析点")

    resolved_root = lexical_root.resolve(strict=False)
    current = lexical_root
    for part in parts:
        current = current / part
        if _is_reparse_point(current):
            raise UnsafeStoragePathError("附件存储路径不能经过链接或重解析点")

    try:
        resolved_path = current.resolve(strict=False)
        resolved_path.relative_to(resolved_root)
    except (OSError, RuntimeError, ValueError) as exc:
        raise UnsafeStoragePathError("附件存储路径超出允许目录") from exc
    return resolved_path


def _safe_filename(filename: str) -> str:
    """Return a cross-platform basename suitable for a storage path segment."""

    if not isinstance(filename, str) or not filename.strip():
        raise UnsafeStoragePathError("附件文件名不能为空")
    # Treat both separators as directory delimiters regardless of host OS.
    safe_name = filename.replace("\\", "/").rsplit("/", 1)[-1]
    if ":" in safe_name:
        raise UnsafeStoragePathError("附件文件名不能包含盘符或备用数据流")
    _validate_storage_segment(safe_name)
    return safe_name


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
    paper_id = _validate_paper_id(paper_id)

    short_uuid = uuid.uuid4().hex[:8]
    safe_name = _safe_filename(filename)
    storage_name = f"{short_uuid}_{safe_name}"
    rel_path = f"{paper_id}/{storage_name}"

    storage_root = _absolute_storage_root()
    if _is_reparse_point(storage_root):
        raise UnsafeStoragePathError("附件存储根目录不能是链接或重解析点")
    _ensure_dir(storage_root)

    full_path = _resolve_storage_path(rel_path, expected_paper_id=paper_id)
    target_dir = full_path.parent
    _ensure_dir(target_dir)
    # Re-resolve after directory creation so a concurrent or pre-existing
    # reparse point is rejected before opening the destination.
    full_path = _resolve_storage_path(rel_path, expected_paper_id=paper_id)

    # Exclusive creation avoids following a pre-created link on UUID collision.
    with full_path.open("xb") as stored_file:
        stored_file.write(content)

    # Relative path for DB storage
    logger.info("Saved file: %s (%d bytes)", rel_path, len(content))
    return rel_path, len(content)


def read_file(storage_path: str, *, expected_paper_id: int) -> Path:
    """Return the absolute Path to a stored file."""
    full_path = _resolve_storage_path(
        storage_path,
        expected_paper_id=expected_paper_id,
    )
    try:
        file_stat = full_path.lstat()
    except FileNotFoundError:
        raise FileNotFoundError(f"文件不存在: {storage_path}") from None
    if _is_reparse_point(full_path):
        raise UnsafeStoragePathError("附件文件不能是链接或重解析点")
    if not stat.S_ISREG(file_stat.st_mode):
        raise FileNotFoundError(f"附件不是普通文件: {storage_path}")
    return full_path


def delete_file(storage_path: str, *, expected_paper_id: int) -> None:
    """Delete a file from disk."""
    full_path = _resolve_storage_path(
        storage_path,
        expected_paper_id=expected_paper_id,
    )
    try:
        file_stat = full_path.lstat()
    except FileNotFoundError:
        return
    if _is_reparse_point(full_path):
        raise UnsafeStoragePathError("附件文件不能是链接或重解析点")
    if not stat.S_ISREG(file_stat.st_mode):
        raise FileNotFoundError(f"附件不是普通文件: {storage_path}")

    full_path.unlink()
    logger.info("Deleted file: %s", storage_path)

    # Clean up only an empty, ordinary directory below the storage root.
    parent = full_path.parent
    storage_root = _absolute_storage_root().resolve(strict=False)
    if parent != storage_root and parent.exists():
        if _is_reparse_point(parent) or not parent.is_dir():
            raise UnsafeStoragePathError("附件父目录不是安全的普通目录")
        if not any(parent.iterdir()):
            parent.rmdir()

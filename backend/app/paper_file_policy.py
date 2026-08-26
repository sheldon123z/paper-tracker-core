"""Runtime policy for returning stored paper attachment bytes to clients."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import HTTPException, status

from .offline import is_offline_mode

PDF_EGRESS_DISABLED_CODE = "PAPER_PDF_EGRESS_DISABLED"
_TRUE_VALUES = {"1", "true", "yes", "on"}
_PDF_CONTENT_TYPES = {"application/pdf", "application/x-pdf"}


def is_paper_pdf_egress_enabled() -> bool:
    """Return whether clients may receive original PDF attachment bytes.

    Online/development deployments retain the historical behavior unless the
    operator explicitly disables it.  Strict offline bundles default to the
    safer no-egress policy and also set the flag explicitly in Compose.
    """

    configured = os.getenv("PAPER_TRACKER_ALLOW_PDF_EGRESS")
    if configured is not None and configured.strip():
        return configured.strip().lower() in _TRUE_VALUES
    return not is_offline_mode()


def is_pdf_attachment(paper_file, file_path: Path | None = None) -> bool:
    """Identify PDFs from metadata, path, and the file signature.

    Stored metadata may be legacy, incomplete, or intentionally misleading, so
    a disabled egress policy must not rely on a single database field.
    """

    file_type = str(getattr(paper_file, "file_type", "") or "").strip().lower()
    filename = str(getattr(paper_file, "filename", "") or "").strip().lower()
    content_type = str(getattr(paper_file, "content_type", "") or "")
    content_type = content_type.split(";", 1)[0].strip().lower()

    if file_type == "pdf" or filename.endswith(".pdf") or content_type in _PDF_CONTENT_TYPES:
        return True

    if file_path is None:
        return False
    if file_path.suffix.lower() == ".pdf":
        return True
    try:
        with file_path.open("rb") as source:
            # ISO 32000 readers accept a PDF header within the first 1024
            # bytes, so checking only byte zero would permit a padded PDF to
            # masquerade as a text attachment.
            return b"%PDF-" in source.read(1024)
    except OSError:
        return False


def require_pdf_egress_allowed(paper_file, file_path: Path) -> None:
    """Reject any response that would return stored PDF bytes to a client."""

    if is_paper_pdf_egress_enabled() or not is_pdf_attachment(paper_file, file_path):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": PDF_EGRESS_DISABLED_CODE,
            "message": "论文 PDF 原件的在线查看与下载已由服务策略关闭。",
        },
    )

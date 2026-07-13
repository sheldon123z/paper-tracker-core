"""Self-contained Markdown -> DOCX -> Word PDF workflow report exports."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ASSET_ROOT = Path(__file__).resolve().parents[1] / "assets" / "workflow_export"
REFERENCE_DOC = ASSET_ROOT / "reference.docx"
WORD_EXPORT_RUNNER = Path(__file__).with_name("workflow_export_runner.py")
SUPPORTED_FORMATS = {"docx", "pdf"}


class WorkflowExportError(RuntimeError):
    """Raised when Paper Tracker cannot produce a workflow report export."""


def _pandoc_path() -> Path:
    try:
        import pypandoc
    except ImportError as exc:
        raise WorkflowExportError(
            "Paper Tracker's Pandoc dependency is missing. Install backend requirements."
        ) from exc
    try:
        path = Path(pypandoc.get_pandoc_path()).resolve()
    except OSError as exc:
        raise WorkflowExportError("Paper Tracker's bundled Pandoc executable is unavailable.") from exc
    if os.name == "nt" and not path.is_file():
        path = path.with_suffix(".exe")
    if not path.is_file():
        raise WorkflowExportError(f"Paper Tracker's bundled Pandoc executable was not found: {path}")
    return path


def _generate_docx(markdown_path: Path, output_path: Path) -> None:
    if not REFERENCE_DOC.is_file():
        raise WorkflowExportError(f"Paper Tracker's workflow export template is missing: {REFERENCE_DOC}")
    command = [
        str(_pandoc_path()),
        str(markdown_path),
        "--from=markdown+smart",
        "--to=docx",
        "--standalone",
        "--toc",
        "--number-sections",
        "--metadata=lang:zh-CN",
        f"--resource-path={markdown_path.parent}",
        f"--reference-doc={REFERENCE_DOC}",
        f"--output={output_path}",
    ]
    result = subprocess.run(
        command,
        cwd=markdown_path.parent,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=120,
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode != 0 or not output_path.is_file() or output_path.stat().st_size == 0:
        raise WorkflowExportError(
            "Paper Tracker failed to generate the Word document:\n"
            + (result.stdout.strip() or "Pandoc did not produce an output file.")
        )


def _terminate_word_from_pid_file(pid_file: Path) -> None:
    try:
        pid = int(pid_file.read_text(encoding="ascii").strip())
    except (OSError, ValueError):
        return
    subprocess.run(
        ["taskkill", "/PID", str(pid), "/T", "/F"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=15,
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def _export_pdf(docx_path: Path, pdf_path: Path) -> None:
    if os.name != "nt":
        raise WorkflowExportError("Workflow PDF export currently requires Microsoft Word on Windows.")
    pid_file = pdf_path.with_suffix(".pdf.word.pid")
    try:
        try:
            result = subprocess.run(
                [sys.executable, str(WORD_EXPORT_RUNNER), str(docx_path), str(pdf_path), str(pid_file)],
                cwd=docx_path.parent,
                text=True,
                encoding="utf-8",
                errors="replace",
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=180,
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except subprocess.TimeoutExpired as exc:
            _terminate_word_from_pid_file(pid_file)
            raise WorkflowExportError("Microsoft Word PDF export timed out after 180 seconds.") from exc
        if result.returncode != 0 or not pdf_path.is_file() or pdf_path.stat().st_size == 0:
            raise WorkflowExportError(
                "Paper Tracker failed to export PDF through Microsoft Word:\n"
                + (result.stdout.strip() or "Word did not produce an output file.")
            )
    finally:
        pid_file.unlink(missing_ok=True)


def export_workflow_report(markdown: str, output_format: str) -> Path:
    """Create an export using only Paper Tracker-owned code, assets, and environment."""
    output_format = output_format.lower().strip()
    if output_format not in SUPPORTED_FORMATS:
        raise WorkflowExportError(f"Unsupported workflow export format: {output_format}")
    if not markdown.strip():
        raise WorkflowExportError("The workflow report is empty.")

    temp_root = Path(tempfile.mkdtemp(prefix="paper-tracker-workflow-export-"))
    markdown_path = temp_root / "report.md"
    docx_path = temp_root / "report.docx"
    try:
        markdown_path.write_text(markdown, encoding="utf-8")
        _generate_docx(markdown_path, docx_path)
        if output_format == "pdf":
            pdf_path = temp_root / "report.pdf"
            _export_pdf(docx_path, pdf_path)
            docx_path.unlink(missing_ok=True)
            return pdf_path
        return docx_path
    except Exception:
        shutil.rmtree(temp_root, ignore_errors=True)
        raise

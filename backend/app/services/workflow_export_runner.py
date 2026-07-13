"""Export DOCX to PDF through an isolated Microsoft Word COM process."""

from __future__ import annotations

import sys
import time
from pathlib import Path


def _word_pids(win32com_client) -> set[int]:
    service = win32com_client.GetObject("winmgmts:")
    processes = service.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name='WINWORD.EXE'")
    return {int(process.ProcessId) for process in processes}


def export_docx(docx_path: Path, pdf_path: Path, pid_file: Path) -> None:
    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    word = None
    document = None
    try:
        existing_pids = _word_pids(win32com.client)
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        word.AutomationSecurity = 3
        word.ScreenUpdating = False
        for _ in range(20):
            new_pids = _word_pids(win32com.client) - existing_pids
            if new_pids:
                pid_file.write_text(str(min(new_pids)), encoding="ascii")
                break
            time.sleep(0.1)

        document = word.Documents.Open(
            FileName=str(docx_path),
            ConfirmConversions=False,
            ReadOnly=True,
            AddToRecentFiles=False,
            Visible=False,
            OpenAndRepair=False,
            NoEncodingDialog=True,
        )
        document.ExportAsFixedFormat(
            OutputFileName=str(pdf_path),
            ExportFormat=17,
            OpenAfterExport=False,
            OptimizeFor=0,
            Range=0,
            Item=0,
            IncludeDocProps=True,
            KeepIRM=True,
            CreateBookmarks=1,
            DocStructureTags=True,
            BitmapMissingFonts=True,
            UseISO19005_1=False,
        )
    finally:
        if document is not None:
            try:
                document.Close(SaveChanges=0)
            except Exception:
                pass
        if word is not None:
            try:
                word.Quit(SaveChanges=0)
            except Exception:
                pass
        pythoncom.CoUninitialize()


def main() -> int:
    if len(sys.argv) != 4:
        print("workflow_export_runner.py <input.docx> <output.pdf> <pid-file>", file=sys.stderr)
        return 2
    docx_path, pdf_path, pid_file = (Path(value).resolve() for value in sys.argv[1:])
    if not docx_path.is_file():
        print(f"DOCX does not exist: {docx_path}", file=sys.stderr)
        return 2
    try:
        export_docx(docx_path, pdf_path, pid_file)
        return 0
    except Exception as exc:
        print(f"WORD_EXPORT_ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

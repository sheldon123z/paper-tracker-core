"""Export DOCX to PDF through an isolated Microsoft Word COM process."""

from __future__ import annotations

import ctypes
import sys
from pathlib import Path


def _record_word_pid(word, pid_file: Path) -> None:
    try:
        try:
            window_handle = int(word.Hwnd)
        except (AttributeError, TypeError, ValueError):
            window_handle = int(word.ActiveWindow.Hwnd)
        process_id = ctypes.c_ulong()
        if ctypes.windll.user32.GetWindowThreadProcessId(
            window_handle,
            ctypes.byref(process_id),
        ):
            pid_file.write_text(str(process_id.value), encoding="ascii")
    except Exception:
        return


def _update_document_fields(document) -> None:
    for index in range(1, document.TablesOfContents.Count + 1):
        document.TablesOfContents(index).Update()
    document.Fields.Update()
    document.Repaginate()


def refresh_docx(docx_path: Path, pid_file: Path) -> None:
    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    word = None
    document = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        _record_word_pid(word, pid_file)
        word.Visible = False
        word.DisplayAlerts = 0
        word.AutomationSecurity = 3
        word.ScreenUpdating = False
        document = word.Documents.Open(
            FileName=str(docx_path),
            ConfirmConversions=False,
            ReadOnly=False,
            AddToRecentFiles=False,
            Visible=False,
            OpenAndRepair=False,
            NoEncodingDialog=True,
        )
        if not pid_file.is_file():
            _record_word_pid(word, pid_file)
        _update_document_fields(document)
        document.Save()
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


def export_docx(docx_path: Path, pdf_path: Path, pid_file: Path) -> None:
    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    word = None
    document = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        _record_word_pid(word, pid_file)
        word.Visible = False
        word.DisplayAlerts = 0
        word.AutomationSecurity = 3
        word.ScreenUpdating = False
        document = word.Documents.Open(
            FileName=str(docx_path),
            ConfirmConversions=False,
            ReadOnly=True,
            AddToRecentFiles=False,
            Visible=False,
            OpenAndRepair=False,
            NoEncodingDialog=True,
        )
        if not pid_file.is_file():
            _record_word_pid(word, pid_file)
        _update_document_fields(document)
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
    if len(sys.argv) not in {4, 5}:
        print(
            "workflow_export_runner.py refresh <input.docx> <pid-file> | "
            "workflow_export_runner.py pdf <input.docx> <output.pdf> <pid-file>",
            file=sys.stderr,
        )
        return 2
    mode = sys.argv[1]
    if mode == "refresh" and len(sys.argv) == 4:
        docx_path = Path(sys.argv[2]).resolve()
        pid_file = Path(sys.argv[3]).resolve()
        pdf_path = None
    elif mode == "pdf" and len(sys.argv) == 5:
        docx_path = Path(sys.argv[2]).resolve()
        pdf_path = Path(sys.argv[3]).resolve()
        pid_file = Path(sys.argv[4]).resolve()
    else:
        print("Invalid workflow export runner arguments.", file=sys.stderr)
        return 2
    if not docx_path.is_file():
        print(f"DOCX does not exist: {docx_path}", file=sys.stderr)
        return 2
    try:
        if mode == "refresh":
            refresh_docx(docx_path, pid_file)
        else:
            export_docx(docx_path, pdf_path, pid_file)
        return 0
    except Exception as exc:
        print(f"WORD_EXPORT_ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

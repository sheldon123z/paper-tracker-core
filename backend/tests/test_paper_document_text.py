from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import backend.tests  # noqa: F401
from backend.app.models import Paper, PaperFile
from backend.app.services import paper_document_text as document_module
from backend.app.services.access_control import scope_session
from backend.app.services.paper_document_text import (
    ExtractedPdfText,
    _extract_pdf_text_layer,
    load_paper_document_text,
)
from backend.tests.support import make_test_session_factory
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject


class PaperDocumentTextTests(unittest.TestCase):
    @staticmethod
    def _write_text_pdf(path: Path, page_count: int) -> None:
        writer = PdfWriter()
        font = DictionaryObject({
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        })
        font_ref = writer._add_object(font)
        for page_number in range(1, page_count + 1):
            page = writer.add_blank_page(width=612, height=792)
            page[NameObject("/Resources")] = DictionaryObject({
                NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref}),
            })
            content = DecodedStreamObject()
            content.set_data(
                f"BT /F1 12 Tf 72 720 Td (UNIQUE-PAGE-{page_number}) Tj ET".encode("ascii"),
            )
            page[NameObject("/Contents")] = writer._add_object(content)
        with path.open("wb") as output:
            writer.write(output)

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        with self.session_factory() as db:
            paper = Paper(title="PDF context paper", source="local", visibility="public")
            other = Paper(
                title="Other paper",
                source="local",
                visibility="department",
                department_id=1,
            )
            db.add_all([paper, other])
            db.flush()
            self.paper_id = paper.id
            self.other_paper_id = other.id

            primary = PaperFile(
                paper_id=paper.id,
                filename="primary.pdf",
                storage_path="primary.pdf",
                file_type="pdf",
                content_type="application/pdf",
                is_primary=True,
            )
            secondary = PaperFile(
                paper_id=paper.id,
                filename="secondary.pdf",
                storage_path="secondary.pdf",
                file_type="pdf",
                content_type="application/pdf",
                is_primary=False,
            )
            foreign = PaperFile(
                paper_id=other.id,
                filename="foreign.pdf",
                storage_path="foreign.pdf",
                file_type="pdf",
                content_type="application/pdf",
                is_primary=True,
            )
            db.add_all([primary, secondary, foreign])
            db.flush()
            self.primary_file_id = primary.id
            self.secondary_file_id = secondary.id
            self.foreign_file_id = foreign.id
            db.commit()

    def tearDown(self):
        with self.session_factory() as db:
            for table in reversed(Paper.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def test_extracts_requested_pages_beyond_import_preview_limit(self):
        pages = [SimpleNamespace(extract_text=lambda index=index: f"page-{index + 1}") for index in range(12)]
        reader = SimpleNamespace(is_encrypted=False, pages=pages)

        with patch.object(document_module, "PdfReader", return_value=reader):
            extracted = _extract_pdf_text_layer(
                Path("paper.pdf"),
                start_page=9,
                page_count=2,
                max_chars=5_000,
            )

        self.assertEqual(extracted.total_pages, 12)
        self.assertEqual(extracted.start_page, 9)
        self.assertEqual(extracted.last_page, 10)
        self.assertIn("[PDF 第 9 页]\npage-9", extracted.text)
        self.assertIn("[PDF 第 10 页]\npage-10", extracted.text)

    def test_empty_page_window_returns_cursor_for_later_pages(self):
        pages = [SimpleNamespace(extract_text=lambda: "") for _ in range(16)]
        pages.append(SimpleNamespace(extract_text=lambda: "page-17-text"))
        reader = SimpleNamespace(is_encrypted=False, pages=pages)

        with patch.object(document_module, "PdfReader", return_value=reader):
            first = _extract_pdf_text_layer(
                Path("paper.pdf"),
                start_page=1,
                page_count=16,
                max_chars=5_000,
            )
            second = _extract_pdf_text_layer(
                Path("paper.pdf"),
                start_page=first.next_page,
                page_count=1,
                max_chars=5_000,
            )

        self.assertEqual(first.text, "")
        self.assertEqual(first.next_page, 17)
        self.assertIn("page-17-text", second.text)

    def test_extracts_a_real_pdf_text_layer(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "text-layer.pdf"
            self._write_text_pdf(pdf_path, 10)

            extracted = _extract_pdf_text_layer(
                pdf_path,
                start_page=9,
                page_count=1,
                max_chars=5_000,
            )
            isolated = document_module._extract_pdf_text_safely(
                pdf_path,
                start_page=9,
                page_count=1,
                max_chars=5_000,
            )

        self.assertEqual(extracted.total_pages, 10)
        self.assertEqual(extracted.start_page, 9)
        self.assertEqual(extracted.last_page, 9)
        self.assertIn("UNIQUE-PAGE-9", extracted.text)
        self.assertEqual(isolated.text, extracted.text)

    def test_extraction_slot_is_released_when_process_cleanup_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "broken-worker.pdf"
            pdf_path.write_bytes(b"%PDF-1.4\n")
            slots = Mock()
            slots.acquire.return_value = True
            process = Mock()
            process.is_alive.side_effect = RuntimeError("process state unavailable")
            process.terminate.side_effect = RuntimeError("terminate failed")
            process.kill.side_effect = RuntimeError("kill failed")
            process.close.side_effect = RuntimeError("close failed")
            process_context = Mock()
            process_context.Process.return_value = process

            with patch.object(document_module, "_PDF_EXTRACTION_SLOTS", slots), \
                 patch.object(
                     document_module.multiprocessing,
                     "get_context",
                     return_value=process_context,
                 ), \
                 self.assertRaisesRegex(RuntimeError, "process state unavailable"):
                document_module._extract_pdf_text_safely(
                    pdf_path,
                    start_page=1,
                    page_count=1,
                    max_chars=1_000,
                )

        slots.release.assert_called_once_with()

    def test_context_is_bounded_and_reports_more_pages(self):
        pages = [SimpleNamespace(extract_text=lambda: "x" * 900) for _ in range(4)]
        reader = SimpleNamespace(is_encrypted=False, pages=pages)

        with patch.object(document_module, "PdfReader", return_value=reader):
            extracted = _extract_pdf_text_layer(
                Path("paper.pdf"),
                start_page=1,
                page_count=None,
                max_chars=1_000,
            )

        self.assertLessEqual(len(extracted.text), 1_000)
        self.assertTrue(extracted.text_truncated)
        self.assertEqual(extracted.last_page, 2)
        self.assertEqual(extracted.next_page, 2)
        self.assertGreater(extracted.next_page_char_offset, 0)

    def test_long_single_page_cursor_resumes_without_losing_text(self):
        page_body = "ABCDEFGHIJ" * 300
        reader = SimpleNamespace(
            is_encrypted=False,
            pages=[SimpleNamespace(extract_text=lambda: page_body)],
        )

        with patch.object(document_module, "PdfReader", return_value=reader):
            first = _extract_pdf_text_layer(
                Path("paper.pdf"),
                start_page=1,
                page_count=1,
                max_chars=1_000,
            )
            second = _extract_pdf_text_layer(
                Path("paper.pdf"),
                start_page=first.next_page,
                page_count=1,
                max_chars=1_000,
                page_char_offset=first.next_page_char_offset,
            )

        first_payload = first.text.split("\n", 1)[1]
        second_payload = second.text.split("\n", 1)[1]
        self.assertEqual(
            first_payload + second_payload,
            page_body[:len(first_payload) + len(second_payload)],
        )

    def test_foreign_preferred_file_id_cannot_redirect_current_paper(self):
        extraction = ExtractedPdfText(
            text="primary body",
            total_pages=2,
            start_page=1,
            last_page=2,
            text_truncated=False,
        )
        with self.session_factory() as db, \
             patch.object(document_module, "read_file", return_value=Path("primary.pdf")), \
             patch.object(document_module, "_extract_pdf_text_safely", return_value=extraction):
            document = load_paper_document_text(
                db,
                self.paper_id,
                preferred_file_id=self.foreign_file_id,
            )

        self.assertIsNotNone(document)
        self.assertEqual(document.file_id, self.primary_file_id)
        self.assertEqual(document.filename, "primary.pdf")
        self.assertEqual(document.text, "primary body")

    def test_hidden_department_paper_is_rejected_before_file_read(self):
        regular_user = SimpleNamespace(id=20, role="user", department_id=2)
        with self.session_factory() as db, \
             patch.object(document_module, "read_file") as file_reader:
            scope_session(db, regular_user)
            document = load_paper_document_text(db, self.other_paper_id)

        self.assertIsNone(document)
        file_reader.assert_not_called()

    def test_falls_back_to_same_paper_parsed_text_for_scanned_pdf(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            markdown_path = Path(temp_dir) / "parsed.md"
            markdown_path.write_text("locally parsed body", encoding="utf-8")
            with self.session_factory() as db:
                parsed = PaperFile(
                    paper_id=self.paper_id,
                    filename="primary.md",
                    storage_path="primary.md",
                    file_type="markdown",
                    content_type="text/markdown",
                )
                db.add(parsed)
                db.flush()
                pdf = db.query(PaperFile).filter(PaperFile.id == self.primary_file_id).one()
                pdf.parsed_file_id = parsed.id
                db.commit()

            empty_extraction = ExtractedPdfText(
                text="",
                total_pages=3,
                start_page=1,
                last_page=3,
                text_truncated=False,
            )

            def resolve_path(storage_path: str) -> Path:
                if storage_path == "primary.md":
                    return markdown_path
                return Path("primary.pdf")

            with self.session_factory() as db, \
                 patch.object(document_module, "read_file", side_effect=resolve_path), \
                 patch.object(document_module, "_extract_pdf_text_safely", return_value=empty_extraction):
                document = load_paper_document_text(db, self.paper_id)

        self.assertIsNotNone(document)
        self.assertEqual(document.source, "parsed_markdown_fallback")
        self.assertEqual(document.text, "locally parsed body")
        self.assertIn("本地解析文本", document.warning)

    def test_long_parsed_fallback_can_resume_by_text_offset(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            markdown_path = Path(temp_dir) / "parsed-long.md"
            parsed_body = "".join(f"段落-{index:05d};" for index in range(8_000))
            markdown_path.write_text(parsed_body, encoding="utf-8")
            with self.session_factory() as db:
                parsed = PaperFile(
                    paper_id=self.paper_id,
                    filename="primary.md",
                    storage_path="primary.md",
                    file_type="markdown",
                    content_type="text/markdown",
                )
                db.add(parsed)
                db.flush()
                pdf = db.query(PaperFile).filter(PaperFile.id == self.primary_file_id).one()
                pdf.parsed_file_id = parsed.id
                db.commit()

            empty_extraction = ExtractedPdfText(
                text="",
                total_pages=3,
                start_page=1,
                last_page=3,
                text_truncated=False,
            )

            def resolve_path(storage_path: str) -> Path:
                return markdown_path if storage_path == "primary.md" else Path("primary.pdf")

            with self.session_factory() as db, \
                 patch.object(document_module, "read_file", side_effect=resolve_path), \
                 patch.object(document_module, "_extract_pdf_text_safely", return_value=empty_extraction):
                first = load_paper_document_text(db, self.paper_id, max_chars=4_000)
                second = load_paper_document_text(
                    db,
                    self.paper_id,
                    max_chars=4_000,
                    parsed_text_offset=first.next_text_offset,
                )

        self.assertEqual(first.source, "parsed_markdown_fallback")
        self.assertEqual(first.next_text_offset, 4_000)
        self.assertEqual(second.text_offset, 4_000)
        self.assertNotEqual(first.text, second.text)

    def test_parsed_fallback_preserves_cursor_across_blank_and_compatibility_text(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            markdown_path = Path(temp_dir) / "parsed-cursor.md"
            markdown_path.write_text((" " * 4_000) + "ﬁ正文", encoding="utf-8")
            with self.session_factory() as db:
                parsed = PaperFile(
                    paper_id=self.paper_id,
                    filename="primary.md",
                    storage_path="primary.md",
                    file_type="markdown",
                    content_type="text/markdown",
                )
                db.add(parsed)
                db.flush()
                pdf = db.query(PaperFile).filter(PaperFile.id == self.primary_file_id).one()
                pdf.parsed_file_id = parsed.id
                db.commit()

            with self.session_factory() as db, \
                 patch.object(document_module, "read_file", return_value=markdown_path):
                pdf = db.query(PaperFile).filter(PaperFile.id == self.primary_file_id).one()
                blank, next_offset = document_module._load_parsed_fallback(
                    db, self.paper_id, pdf, 4_000,
                )
                resumed, final_offset = document_module._load_parsed_fallback(
                    db, self.paper_id, pdf, 4_000, text_offset=next_offset,
                )

        self.assertEqual(blank, "")
        self.assertEqual(next_offset, 4_000)
        self.assertEqual(resumed, "ﬁ正文")
        self.assertIsNone(final_offset)

    def test_missing_pdf_text_returns_explicit_unavailable_status(self):
        with self.session_factory() as db, \
             patch.object(document_module, "read_file", side_effect=FileNotFoundError), \
             patch.object(document_module, "_load_parsed_fallback", return_value=None):
            document = load_paper_document_text(db, self.paper_id)

        self.assertIsNotNone(document)
        self.assertEqual(document.source, "unavailable")
        self.assertEqual(document.text, "")
        self.assertIn("无法读取", document.warning)


if __name__ == "__main__":
    unittest.main()

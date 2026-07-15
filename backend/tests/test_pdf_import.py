"""Tests for bilingual offline PDF analysis and import."""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

from backend.app.auth.dependencies import get_current_user
from backend.app.database import Base, get_db
from backend.app.models import LLMConfig, Paper, PaperFile
from backend.app.schemas import PdfImportMetadata
from backend.app.services.pdf_import_service import (
    OfflineExtraction,
    _author_candidate,
    _coerce_model_field,
    _extract_abstract,
    _extract_date,
    _first_title_candidate,
    _ocr_pdf,
    _orient_image_for_ocr,
    _resolve_pdf_import_llm,
    detect_language,
    duplicate_payload,
    find_duplicate,
    merge_missing_fields,
    normalize_arxiv_id,
    normalize_doi,
    normalize_title,
    resolve_tesseract,
)
from backend.tests.support import make_fake_user, make_test_session_factory, patched_env
from pypdf import PdfWriter
from starlette.testclient import TestClient


def blank_pdf(title: str = "Test Paper") -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    writer.add_metadata({"/Title": title})
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


class PdfImportServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.SessionLocal = make_test_session_factory()

    def setUp(self):
        self.db = self.SessionLocal()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_bilingual_normalization_and_language_detection(self):
        self.assertEqual(detect_language("面向大语言模型的检索增强方法"), "zh")
        self.assertEqual(detect_language("Retrieval-Augmented Generation for LLMs"), "en")
        self.assertEqual(detect_language("大语言模型 LLM Retrieval 检索增强"), "mixed")
        self.assertEqual(normalize_title("全角：ＡＩ 论文！"), normalize_title("全角:AI论文"))
        self.assertEqual(normalize_doi("https://doi.org/10.1000/Test."), "10.1000/test")
        self.assertEqual(normalize_arxiv_id("arXiv:2401.12345v2"), "2401.12345")

    def test_publication_date_wins_over_received_date(self):
        english = "Received 2 January 2025\nPublished 14 July 2026"
        chinese = "收稿日期：2025年1月2日\n出版日期：2026年7月14日"
        self.assertEqual(_extract_date(english), datetime(2026, 7, 14, tzinfo=UTC))
        self.assertEqual(_extract_date(chinese), datetime(2026, 7, 14, tzinfo=UTC))

    def test_wrapped_title_author_list_and_numbered_abstract(self):
        text = """Neural-Symbolic Computing: An Effective
Methodology for Principled Integration of
Machine Learning and Reasoning
Artur Garcez, Marco Gori, Luis Lamb,
Luciano Serafini, Michael Spranger, Son Tran
City University of London
Abstract
This is the original abstract text and it is intentionally long enough for extraction.
1 Introduction
Body text.
"""
        title = _first_title_candidate(text)
        self.assertEqual(
            title,
            "Neural-Symbolic Computing: An Effective Methodology for Principled Integration of Machine Learning and Reasoning",
        )
        self.assertEqual(
            _author_candidate(text, title),
            "Artur Garcez, Marco Gori, Luis Lamb, Luciano Serafini, Michael Spranger, Son Tran",
        )
        self.assertTrue(_extract_abstract(text).startswith("This is the original abstract"))

    def test_pdf_import_uses_enabled_project_model_without_default_flag(self):
        config = LLMConfig(
            provider="openai_compatible",
            display_name="Project model",
            api_key_encrypted="placeholder",
            model_name="project-model",
            base_url="https://llm.example/v1",
            is_local=False,
            is_enabled=True,
            is_default=False,
            health_status="ok",
        )
        self.db.add(config)
        self.db.commit()
        with patch(
            "backend.app.services.pdf_import_service.resolve_llm_config",
            return_value="resolved-project-model",
        ) as resolver:
            resolved, explicitly_configured = _resolve_pdf_import_llm(self.db)
        self.assertEqual(resolved, "resolved-project-model")
        self.assertTrue(explicitly_configured)
        resolver.assert_called_once_with(self.db, config.id)

    def test_model_author_arrays_are_normalized(self):
        self.assertEqual(
            _coerce_model_field(
                "authors",
                [{"name": "Alice Example"}, "Bob Example", {"full_name": "陈晓"}],
            ),
            "Alice Example, Bob Example, 陈晓",
        )
        self.assertEqual(
            _coerce_model_field("authors", "Artur d’A vila Garcez, Alice Example"),
            "Artur d’Avila Garcez, Alice Example",
        )

    def test_bundled_ocr_resources_include_chinese_and_english(self):
        command, tessdata, warnings = resolve_tesseract()
        self.assertIsNotNone(command)
        self.assertIsNotNone(tessdata)
        self.assertEqual(warnings, [])
        self.assertTrue((tessdata / "eng.traineddata").is_file())
        self.assertTrue((tessdata / "chi_sim.traineddata").is_file())
        self.assertTrue((tessdata / "osd.traineddata").is_file())

    def test_real_bilingual_ocr_smoke(self):
        from pathlib import Path

        font_path = Path(r"C:\Windows\Fonts\msyh.ttc")
        if not font_path.is_file():
            self.skipTest("Microsoft YaHei is unavailable on this platform")
        from PIL import Image, ImageDraw, ImageFont

        image = Image.new("RGB", (1800, 1000), "white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype(str(font_path), 72)
        draw.text((100, 120), "中文论文批量导入测试", font=font, fill="black")
        draw.text((100, 300), "Offline Batch PDF Import Test", font=font, fill="black")
        output = io.BytesIO()
        image.save(output, format="PDF", resolution=250)

        text, warnings = _ocr_pdf(output.getvalue())
        self.assertTrue(all("方向检测" in warning for warning in warnings), warnings)
        self.assertRegex(text, r"[\u3400-\u9fff]")
        self.assertIn("Offline Batch PDF Import Test", text)

    def test_osd_rotation_is_applied_before_ocr(self):
        from PIL import Image

        class FakeTesseract:
            class Output:
                DICT = "dict"

            @staticmethod
            def image_to_osd(image, **kwargs):
                return {"rotate": 90}

        original = Image.new("RGB", (120, 60), "white")
        oriented, rotation, warning = _orient_image_for_ocr(
            original,
            FakeTesseract,
            resolve_tesseract()[1],
        )
        self.assertEqual(rotation, 90)
        self.assertIsNone(warning)
        self.assertEqual(oriented.size, (60, 120))

    def test_duplicate_detection_and_non_destructive_merge(self):
        existing = Paper(
            title="面向大语言模型的检索增强方法",
            authors="已有作者",
            abstract="",
            category="Uncategorized",
            source="rss",
            visibility="public",
            doi="10.1000/example",
        )
        self.db.add(existing)
        self.db.commit()
        self.db.refresh(existing)
        metadata = PdfImportMetadata(
            title="面向大语言模型的检索增强方法",
            authors="新识别作者",
            abstract="这是论文原始摘要。",
            category="LLM",
            doi="10.1000/example",
        )
        duplicate, reason = find_duplicate(self.db, metadata, "a" * 64, "public", None)
        self.assertEqual(reason, "doi")
        payload = duplicate_payload(duplicate, reason, metadata)
        self.assertIn("authors", payload["conflicts"])
        self.assertTrue(merge_missing_fields(existing, metadata))
        self.assertEqual(existing.authors, "已有作者")
        self.assertEqual(existing.abstract, "这是论文原始摘要。")
        self.assertEqual(existing.category, "LLM")


class PdfImportRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.SessionLocal = make_test_session_factory()

    def setUp(self):
        from backend.app.main import app

        self.db = self.SessionLocal()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = make_fake_user
        self.app = app

    def tearDown(self):
        self.app.dependency_overrides.pop(get_db, None)
        self.app.dependency_overrides.pop(get_current_user, None)
        self.db.close()

    def client(self):
        return TestClient(self.app)

    def test_analyze_returns_bilingual_review_payload_without_writing(self):
        extraction = OfflineExtraction(
            metadata={
                "title": "中文论文标题",
                "authors": "张三, 李四",
                "abstract": "这是原文摘要。",
                "ai_summary": None,
                "published_date": datetime(2026, 7, 14, tzinfo=UTC),
                "category": "LLM",
                "doi": "10.1000/example",
                "arxiv_id": None,
            },
            confidence={"title": "high", "authors": "medium"},
            language="zh",
            text="中文正文",
        )
        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ), patch(
            "backend.app.routes.pdf_import.extract_pdf_offline", return_value=extraction,
        ), patch(
            "backend.app.routes.pdf_import.enrich_with_local_llm", new=AsyncMock(return_value=extraction),
        ):
            response = self.client().post(
                "/api/papers/import/pdf/analyze",
                files={"file": ("论文.pdf", blank_pdf(), "application/pdf")},
                data={"visibility": "public"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["language"], "zh")
        self.assertEqual(data["metadata"]["title"], "中文论文标题")
        self.assertEqual(self.db.query(Paper).count(), 0)

    def test_analyze_accepts_pdf_larger_than_agui_body_limit(self):
        extraction = OfflineExtraction(
            metadata={"title": "Large Local PDF", "authors": "Alice Example"},
            confidence={"title": "high"},
            language="en",
            text="Large local PDF body",
        )
        content = blank_pdf("Large Local PDF") + (b"\0" * (2 * 1024 * 1024))
        with patch(
            "backend.app.routes.pdf_import.extract_pdf_offline", return_value=extraction,
        ), patch(
            "backend.app.routes.pdf_import.enrich_with_local_llm", new=AsyncMock(return_value=extraction),
        ):
            response = self.client().post(
                "/api/papers/import/pdf/analyze",
                files={"file": ("large-paper.pdf", content, "application/pdf")},
                data={"visibility": "public"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["metadata"]["title"], "Large Local PDF")

    def test_commit_creates_attachment_then_deduplicates_same_pdf(self):
        content = blank_pdf("English Paper")
        import hashlib

        digest = hashlib.sha256(content).hexdigest()
        metadata = {
            "title": "English Paper",
            "authors": "Alice Example",
            "abstract": "Original abstract.",
            "ai_summary": None,
            "published_date": "2026-07-14T00:00:00Z",
            "category": "NLP",
            "doi": "10.1000/english",
            "arxiv_id": None,
        }
        saved = []

        def fake_save(paper_id, filename, payload):
            path = f"{paper_id}/test_{filename}"
            saved.append(path)
            return path, len(payload)

        with patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ), patch("backend.app.routes.pdf_import.save_file", side_effect=fake_save):
            first = self.client().post(
                "/api/papers/import/pdf/commit",
                files={"file": ("paper.pdf", content, "application/pdf")},
                data={
                    "metadata_json": json.dumps(metadata),
                    "expected_content_hash": digest,
                    "visibility": "public",
                },
            )
            second = self.client().post(
                "/api/papers/import/pdf/commit",
                files={"file": ("paper.pdf", content, "application/pdf")},
                data={
                    "metadata_json": json.dumps(metadata),
                    "expected_content_hash": digest,
                    "visibility": "public",
                },
            )

        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["action"], "created")
        self.assertTrue(first.json()["attachment_created"])
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(second.json()["action"], "unchanged")
        self.assertFalse(second.json()["attachment_created"])
        self.assertEqual(self.db.query(Paper).count(), 1)
        self.assertEqual(self.db.query(PaperFile).count(), 1)
        self.assertTrue(self.db.query(PaperFile).one().is_primary)
        self.assertTrue(second.json()["warnings"])
        self.assertEqual(len(saved), 1)

    def test_commit_rejects_whitespace_only_title(self):
        import hashlib

        content = blank_pdf()
        response = self.client().post(
            "/api/papers/import/pdf/commit",
            files={"file": ("paper.pdf", content, "application/pdf")},
            data={
                "metadata_json": json.dumps({"title": "   "}),
                "expected_content_hash": hashlib.sha256(content).hexdigest(),
                "visibility": "public",
            },
        )
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.db.query(Paper).count(), 0)

    def test_multiple_commits_create_distinct_papers_and_pdf_content_reopens(self):
        payloads = [blank_pdf("First Paper"), blank_pdf("Second Paper")]
        metadata = [
            {"title": "First Paper", "authors": "Alice", "published_date": "2025-01-01"},
            {"title": "Second Paper", "authors": "Bob", "published_date": "2026-01-01"},
        ]
        import hashlib

        with tempfile.TemporaryDirectory() as temp_dir, patch(
            "backend.app.services.file_storage._STORAGE_ROOT", Path(temp_dir)
        ), patched_env(
            ENCRYPTION_KEY="lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU=",
            JWT_SECRET_KEY="test-jwt-secret-key-32-bytes-long!!",
        ):
            client = self.client()
            responses = []
            for index, content in enumerate(payloads):
                responses.append(client.post(
                    "/api/papers/import/pdf/commit",
                    files={"file": (f"paper-{index}.pdf", content, "application/pdf")},
                    data={
                        "metadata_json": json.dumps(metadata[index]),
                        "expected_content_hash": hashlib.sha256(content).hexdigest(),
                        "visibility": "public",
                    },
                ))

            self.assertTrue(all(response.status_code == 200 for response in responses), responses)
            self.assertEqual(self.db.query(Paper).count(), 2)
            self.assertEqual(self.db.query(PaperFile).count(), 2)

            first_file = self.db.query(PaperFile).order_by(PaperFile.id.asc()).first()
            first_read = client.get(f"/api/papers/{first_file.paper_id}/files/{first_file.id}/content")
            second_read = client.get(f"/api/papers/{first_file.paper_id}/files/{first_file.id}/content")
            self.assertEqual(first_read.status_code, 200, first_read.text)
            self.assertEqual(second_read.status_code, 200, second_read.text)
            self.assertEqual(first_read.content, payloads[0])
            self.assertEqual(second_read.content, payloads[0])


if __name__ == "__main__":
    unittest.main()

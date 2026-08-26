from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import backend.tests  # noqa: F401
from backend.app.auth.dependencies import get_current_user
from backend.app.models import Paper, PaperFile
from backend.app.routes import files as files_module
from backend.app.services import file_storage as storage_module
from backend.tests.support import make_fake_user, make_test_session_factory, patched_env
from fastapi import FastAPI
from fastapi.testclient import TestClient


class PaperFileDownloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(files_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[files_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

        with self.session_factory() as db:
            paper = Paper(title="Download paper", source="local", visibility="public")
            hidden = Paper(
                title="Hidden download paper",
                source="local",
                visibility="department",
                department_id=1,
            )
            db.add_all([paper, hidden])
            db.flush()
            paper_file = PaperFile(
                paper_id=paper.id,
                filename="论文原件.pdf",
                storage_path=f"{paper.id}/original.pdf",
                file_type="pdf",
                content_type="application/pdf",
                is_primary=True,
            )
            hidden_file = PaperFile(
                paper_id=hidden.id,
                filename="hidden.pdf",
                storage_path=f"{hidden.id}/hidden.pdf",
                file_type="pdf",
                content_type="application/pdf",
                is_primary=True,
            )
            db.add_all([paper_file, hidden_file])
            db.flush()
            self.paper_id = paper.id
            self.file_id = paper_file.id
            self.hidden_paper_id = hidden.id
            self.hidden_file_id = hidden_file.id
            db.commit()

        self.temp_dir = tempfile.TemporaryDirectory()
        self.pdf_bytes = b"%PDF-1.4\noriginal-payload\n%%EOF\n"
        self.pdf_path = Path(self.temp_dir.name) / "original.pdf"
        self.pdf_path.write_bytes(self.pdf_bytes)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        self.temp_dir.cleanup()
        with self.session_factory() as db:
            for table in reversed(Paper.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def test_download_returns_original_bytes_type_and_unicode_filename(self):
        with patch.object(files_module, "read_file", return_value=self.pdf_path):
            response = self.client.get(
                f"/api/papers/{self.paper_id}/files/{self.file_id}/download",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, self.pdf_bytes)
        self.assertEqual(
            hashlib.sha256(response.content).hexdigest(),
            hashlib.sha256(self.pdf_bytes).hexdigest(),
        )
        self.assertEqual(response.headers["content-type"], "application/pdf")
        disposition = response.headers["content-disposition"].lower()
        self.assertIn("attachment", disposition)
        self.assertIn("filename*=utf-8''", disposition)

    def test_head_preflight_validates_file_without_returning_pdf_body(self):
        with patch.object(files_module, "read_file", return_value=self.pdf_path):
            response = self.client.head(
                f"/api/papers/{self.paper_id}/files/{self.file_id}/download",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"")
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertEqual(int(response.headers["content-length"]), len(self.pdf_bytes))
        self.assertIn("attachment", response.headers["content-disposition"].lower())

    def test_disabled_pdf_egress_blocks_download_content_head_and_ranges(self):
        requests = (
            ("GET", f"/api/papers/{self.paper_id}/files/{self.file_id}/download", {}),
            ("HEAD", f"/api/papers/{self.paper_id}/files/{self.file_id}/download", {}),
            (
                "GET",
                f"/api/papers/{self.paper_id}/files/{self.file_id}/download",
                {"headers": {"Range": "bytes=0-7"}},
            ),
            ("GET", f"/api/papers/{self.paper_id}/files/{self.file_id}/content", {}),
            (
                "GET",
                f"/api/papers/{self.paper_id}/files/{self.file_id}/content",
                {"headers": {"Range": "bytes=0-7"}},
            ),
        )

        with (
            patched_env(PAPER_TRACKER_ALLOW_PDF_EGRESS="false"),
            patch.object(files_module, "read_file", return_value=self.pdf_path),
        ):
            responses = [self.client.request(method, path, **kwargs) for method, path, kwargs in requests]

        for response in responses:
            self.assertEqual(response.status_code, 403)
            self.assertNotIn(b"%PDF", response.content)
            self.assertNotEqual(response.headers.get("content-type"), "application/pdf")
            self.assertNotIn("accept-ranges", response.headers)
            self.assertNotIn("content-range", response.headers)
        self.assertEqual(responses[0].json()["detail"]["code"], "PAPER_PDF_EGRESS_DISABLED")

    def test_disabled_pdf_egress_sniffs_disguised_pdf_signature(self):
        with self.session_factory() as db:
            paper_file = db.query(PaperFile).filter(PaperFile.id == self.file_id).one()
            paper_file.filename = "notes.txt"
            paper_file.file_type = "text"
            paper_file.content_type = "text/plain"
            paper_file.storage_path = f"{self.paper_id}/notes.txt"
            db.commit()

        with (
            patched_env(PAPER_TRACKER_ALLOW_PDF_EGRESS="false"),
            patch.object(files_module, "read_file", return_value=self.pdf_path),
        ):
            response = self.client.get(
                f"/api/papers/{self.paper_id}/files/{self.file_id}/content",
            )

        self.assertEqual(response.status_code, 403)
        self.assertNotIn(b"%PDF", response.content)

    def test_disabled_pdf_egress_sniffs_a_padded_pdf_header(self):
        padded_pdf = Path(self.temp_dir.name) / "notes.txt"
        padded_pdf.write_bytes(b"\xef\xbb\xbf\n" + self.pdf_bytes)
        with self.session_factory() as db:
            paper_file = db.query(PaperFile).filter(PaperFile.id == self.file_id).one()
            paper_file.filename = "notes.txt"
            paper_file.file_type = "text"
            paper_file.content_type = "text/plain"
            paper_file.storage_path = f"{self.paper_id}/notes.txt"
            db.commit()

        with (
            patched_env(PAPER_TRACKER_ALLOW_PDF_EGRESS="false"),
            patch.object(files_module, "read_file", return_value=padded_pdf),
        ):
            response = self.client.get(
                f"/api/papers/{self.paper_id}/files/{self.file_id}/content",
            )

        self.assertEqual(response.status_code, 403)
        self.assertNotIn(b"%PDF", response.content)

    def test_disabled_pdf_egress_keeps_non_pdf_attachment_content_available(self):
        text_path = Path(self.temp_dir.name) / "notes.txt"
        text_path.write_text("local notes", encoding="utf-8")
        with self.session_factory() as db:
            paper_file = db.query(PaperFile).filter(PaperFile.id == self.file_id).one()
            paper_file.filename = "notes.txt"
            paper_file.file_type = "text"
            paper_file.content_type = "text/plain"
            paper_file.storage_path = f"{self.paper_id}/notes.txt"
            db.commit()

        with (
            patched_env(PAPER_TRACKER_ALLOW_PDF_EGRESS="false"),
            patch.object(files_module, "read_file", return_value=text_path),
        ):
            response = self.client.get(
                f"/api/papers/{self.paper_id}/files/{self.file_id}/content",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "local notes")

    def test_cross_paper_storage_path_is_unavailable_and_not_deleted(self):
        storage_root = Path(self.temp_dir.name) / "paper-files"
        other_file = storage_root / str(self.hidden_paper_id) / "hidden.pdf"
        other_file.parent.mkdir(parents=True)
        other_file.write_bytes(b"other-paper-secret")

        with self.session_factory() as db:
            paper_file = db.query(PaperFile).filter(PaperFile.id == self.file_id).one()
            paper_file.storage_path = f"{self.hidden_paper_id}/hidden.pdf"
            db.commit()

        with patch.object(storage_module, "_STORAGE_ROOT", storage_root):
            download_response = self.client.get(
                f"/api/papers/{self.paper_id}/files/{self.file_id}/download",
            )
            content_response = self.client.get(
                f"/api/papers/{self.paper_id}/files/{self.file_id}/content",
            )
            delete_response = self.client.delete(
                f"/api/papers/{self.paper_id}/files/{self.file_id}",
            )

        self.assertEqual(download_response.status_code, 404)
        self.assertEqual(download_response.json()["detail"], "附件不可用")
        self.assertNotIn(b"other-paper-secret", download_response.content)
        self.assertEqual(content_response.status_code, 404)
        self.assertEqual(content_response.json()["detail"], "附件不可用")
        self.assertNotIn(b"other-paper-secret", content_response.content)
        self.assertEqual(delete_response.status_code, 409)
        self.assertEqual(delete_response.json()["detail"], "附件不可用，未执行删除")
        self.assertEqual(other_file.read_bytes(), b"other-paper-secret")
        with self.session_factory() as db:
            self.assertIsNotNone(
                db.query(PaperFile).filter(PaperFile.id == self.file_id).first(),
            )

    def test_hidden_department_pdf_is_not_downloadable(self):
        regular_user = SimpleNamespace(
            id=2,
            role="user",
            department_id=2,
            department=SimpleNamespace(status="active"),
        )
        self.app.dependency_overrides[get_current_user] = lambda: regular_user

        with patch.object(files_module, "read_file") as file_reader:
            response = self.client.get(
                f"/api/papers/{self.hidden_paper_id}/files/{self.hidden_file_id}/download",
            )

        self.assertEqual(response.status_code, 404)
        file_reader.assert_not_called()


if __name__ == "__main__":
    unittest.main()

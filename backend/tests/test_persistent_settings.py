from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from backend.app.auth.tokens import create_access_token, decode_access_token
from backend.app.services.encryption import decrypt_value, encrypt_value
from backend.app.settings import (
    BACKEND_ROOT,
    SecretFileError,
    get_backup_dir,
    get_checkpoint_db_path,
    get_control_db_dir,
    get_database_url,
    get_file_storage_dir,
    get_secret_value,
    validate_secrets,
)
from backend.tests.support import ROOT, TEST_ENCRYPTION_KEY, patched_env

TEST_JWT_SECRET = "jwt-secret-key-for-file-tests-with-more-than-32-characters"


class PersistentDataPathTests(unittest.TestCase):
    def test_explicit_data_root_supplies_all_default_persistent_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            with patched_env(
                PAPER_TRACKER_DATA_DIR=str(root),
                DATABASE_URL=None,
                CONTROL_DATABASE_URL=None,
                CHECKPOINT_DB_PATH=None,
            ):
                self.assertEqual(
                    get_database_url(),
                    f"sqlite:///{root / 'paper_tracker.db'}",
                )
                self.assertEqual(get_control_db_dir(), root / "control")
                self.assertEqual(
                    get_checkpoint_db_path(),
                    root / "graph_checkpoints.db",
                )
                self.assertEqual(get_file_storage_dir(), root / "paper_files")
                self.assertEqual(get_backup_dir(), root / "backups")

    def test_non_persistent_development_defaults_remain_compatible(self):
        with patched_env(
            PAPER_TRACKER_DATA_DIR=None,
            DATABASE_URL=None,
            CHECKPOINT_DB_PATH=None,
        ):
            expected_db = (BACKEND_ROOT / "paper_tracker.db").resolve()
            self.assertEqual(get_database_url(), f"sqlite:///{expected_db}")
            self.assertEqual(get_checkpoint_db_path(), Path("graph_checkpoints.db"))
            self.assertEqual(
                get_file_storage_dir(),
                BACKEND_ROOT / "data" / "paper_files",
            )

    def test_fresh_process_wires_database_control_checkpoint_files_and_backups(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir).resolve()
            script = "\n".join(
                (
                    "import json",
                    "from backend.app import database",
                    "from backend.app.control_plane import database as control",
                    "from backend.app.services import db_backup, file_storage",
                    "from backend.app.settings import get_checkpoint_db_path",
                    "print(json.dumps({",
                    "  'main': database.engine.url.database,",
                    "  'control': control.control_engine.url.database,",
                    "  'checkpoint': str(get_checkpoint_db_path()),",
                    "  'files': str(file_storage._STORAGE_ROOT),",
                    "  'backups': str(db_backup._backup_dir()),",
                    "}))",
                )
            )
            environment = os.environ.copy()
            environment.update(
                {
                    "PAPER_TRACKER_DATA_DIR": str(root),
                    "DATABASE_URL": "",
                    "CONTROL_DATABASE_URL": "",
                    "CHECKPOINT_DB_PATH": "",
                }
            )
            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=ROOT,
                env=environment,
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout.strip().splitlines()[-1])
            self.assertEqual(Path(payload["main"]).resolve(), root / "paper_tracker.db")
            self.assertEqual(
                Path(payload["control"]).resolve(),
                root / "control" / "control_plane.db",
            )
            self.assertEqual(
                Path(payload["checkpoint"]).resolve(),
                root / "graph_checkpoints.db",
            )
            self.assertEqual(Path(payload["files"]).resolve(), root / "paper_files")
            self.assertEqual(Path(payload["backups"]).resolve(), root / "backups")


class SecretFileTests(unittest.TestCase):
    def test_encryption_and_jwt_secrets_load_from_files_without_env_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            encryption_file = Path(temp_dir) / "encryption_key"
            jwt_file = Path(temp_dir) / "jwt_secret"
            encryption_file.write_text(f"{TEST_ENCRYPTION_KEY}\n", encoding="utf-8")
            jwt_file.write_text(f"{TEST_JWT_SECRET}\n", encoding="utf-8")

            with patched_env(
                ENCRYPTION_KEY=None,
                ENCRYPTION_KEY_FILE=str(encryption_file),
                ENCRYPTION_KEY_FALLBACKS=None,
                ENCRYPTION_KEY_FALLBACKS_FILE=None,
                JWT_SECRET_KEY=None,
                JWT_SECRET_KEY_FILE=str(jwt_file),
            ):
                self.assertEqual(validate_secrets(), [])
                ciphertext = encrypt_value("sensitive-value")
                self.assertEqual(decrypt_value(ciphertext), "sensitive-value")
                token, _ = create_access_token(7, "test@example.com", "manager")
                self.assertEqual(decode_access_token(token)["sub"], "7")

    def test_generic_secret_file_reader_prefers_direct_value(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            secret_file = Path(temp_dir) / "custom_secret"
            secret_file.write_text("file-value\n", encoding="utf-8")

            with patched_env(
                CUSTOM_SERVICE_TOKEN=None,
                CUSTOM_SERVICE_TOKEN_FILE=str(secret_file),
            ):
                self.assertEqual(
                    get_secret_value("CUSTOM_SERVICE_TOKEN"),
                    "file-value",
                )

            with patched_env(
                CUSTOM_SERVICE_TOKEN="direct-value",
                CUSTOM_SERVICE_TOKEN_FILE=str(secret_file),
            ):
                self.assertEqual(
                    get_secret_value("CUSTOM_SERVICE_TOKEN"),
                    "direct-value",
                )

    def test_secret_file_errors_do_not_retain_or_report_the_mounted_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_path = Path(temp_dir) / "sensitive-layout" / "secret"
            with patched_env(
                CUSTOM_SERVICE_TOKEN=None,
                CUSTOM_SERVICE_TOKEN_FILE=str(missing_path),
            ):
                with self.assertRaises(SecretFileError) as ctx:
                    get_secret_value("CUSTOM_SERVICE_TOKEN")

            self.assertIsNone(ctx.exception.__cause__)
            self.assertNotIn(str(missing_path), str(ctx.exception))
            self.assertIn("CUSTOM_SERVICE_TOKEN_FILE", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()

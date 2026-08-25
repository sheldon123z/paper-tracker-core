from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sqlite3
import stat
import tarfile
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

MODULE_PATH = Path(__file__).resolve().parents[1] / "seed_archive.py"
SPEC = importlib.util.spec_from_file_location("seed_archive", MODULE_PATH)
assert SPEC and SPEC.loader
seed_archive = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(seed_archive)


class SeedArchiveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.export_root = self.root / "export"
        self.payload = self.export_root / "payload"
        self.payload.mkdir(parents=True)
        self.created_at = "2026-07-30T16:53:29+08:00"
        self._create_fixture()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _database(self, relative: str, statements: list[str]) -> Path:
        path = self.payload / Path(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(path)
        try:
            connection.execute("PRAGMA foreign_keys = ON")
            for statement in statements:
                connection.execute(statement)
            connection.commit()
        finally:
            connection.close()
        return path

    def _create_fixture(self) -> None:
        self._database(
            "backend/paper_tracker.db",
            [
                "CREATE TABLE papers (id INTEGER PRIMARY KEY)",
                (
                    "CREATE TABLE paper_files ("
                    "id INTEGER PRIMARY KEY, "
                    "paper_id INTEGER REFERENCES papers(id))"
                ),
                "INSERT INTO papers (id) VALUES (1)",
                "INSERT INTO papers (id) VALUES (2)",
                "INSERT INTO paper_files (id, paper_id) VALUES (1, 1)",
            ],
        )
        self._database(
            "backend/graph_checkpoints.db",
            [
                "CREATE TABLE checkpoints (id TEXT PRIMARY KEY)",
                (
                    "CREATE TABLE writes ("
                    "id INTEGER PRIMARY KEY, "
                    "checkpoint_id TEXT REFERENCES checkpoints(id))"
                ),
                "INSERT INTO checkpoints (id) VALUES ('checkpoint-1')",
                (
                    "INSERT INTO writes (id, checkpoint_id) "
                    "VALUES (1, 'checkpoint-1')"
                ),
                (
                    "INSERT INTO writes (id, checkpoint_id) "
                    "VALUES (2, 'checkpoint-1')"
                ),
            ],
        )
        self._database(
            "backend/data/control/control_plane.db",
            [
                "CREATE TABLE users (id INTEGER PRIMARY KEY)",
                (
                    "CREATE TABLE audit_events ("
                    "id INTEGER PRIMARY KEY, "
                    "actor_user_id INTEGER REFERENCES users(id))"
                ),
                (
                    "CREATE TABLE user_sessions ("
                    "id INTEGER PRIMARY KEY, "
                    "user_id INTEGER NOT NULL REFERENCES users(id), "
                    "refresh_token_hash TEXT NOT NULL)"
                ),
                "INSERT INTO users (id) VALUES (1)",
                "INSERT INTO audit_events (id, actor_user_id) VALUES (1, 1)",
                (
                    "INSERT INTO user_sessions "
                    "(id, user_id, refresh_token_hash) VALUES "
                    "(1, 1, 'old-refresh-hash-one')"
                ),
                (
                    "INSERT INTO user_sessions "
                    "(id, user_id, refresh_token_hash) VALUES "
                    "(2, 1, 'old-refresh-hash-two')"
                ),
            ],
        )

        attachment = self.payload / "backend/data/paper_files/1/paper.pdf"
        attachment.parent.mkdir(parents=True)
        attachment.write_bytes(b"%PDF-1.7\nfixture\n")
        backup = self.payload / "backend/data/backups/paper_tracker_fixture.db"
        backup.parent.mkdir(parents=True)
        backup.write_bytes(b"opaque backup fixture")
        # The implementation must verify these opaque bytes without parsing or
        # carrying them into either output.
        (self.payload / ".env").write_text(
            "ENCRYPTION_KEY=must-never-be-emitted\n",
            encoding="utf-8",
        )
        self._write_manifest()

    def _payload_files(self) -> list[dict[str, object]]:
        entries: list[dict[str, object]] = []
        for path in sorted(
            (item for item in self.payload.rglob("*") if item.is_file()),
            key=lambda item: item.relative_to(self.export_root).as_posix(),
        ):
            data = path.read_bytes()
            entries.append(
                {
                    "path": path.relative_to(self.export_root).as_posix(),
                    "size": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
            )
        return entries

    def _write_manifest(
        self,
        *,
        payload_files: list[dict[str, object]] | None = None,
    ) -> None:
        entries = payload_files if payload_files is not None else self._payload_files()
        manifest = {
            "format": "paper-tracker-backend-export-v1",
            "created_at": self.created_at,
            "active_databases": [
                "payload/backend/paper_tracker.db",
                "payload/backend/graph_checkpoints.db",
                "payload/backend/data/control/control_plane.db",
            ],
            "payload_files": entries,
            "payload_bytes": sum(int(item["size"]) for item in entries),
            # Deliberately sensitive-looking extra source fields prove that
            # metadata is rebuilt from an allowlist instead of copied.
            "database_summaries": {
                "users_without_credentials": [
                    {"email": "account-must-never-be-emitted@example.test"}
                ]
            },
        }
        (self.export_root / "manifest.json").write_text(
            json.dumps(manifest),
            encoding="utf-8",
        )

    def _build(self, suffix: str = "") -> tuple[Path, Path, dict[str, object]]:
        archive = self.root / f"seed{suffix}.tar.gz"
        metadata_path = self.root / f"seed{suffix}.json"
        metadata = seed_archive.build_seed_archive(
            self.export_root,
            archive,
            metadata_path,
        )
        return archive, metadata_path, metadata

    def test_builds_reproducible_seed_with_expected_layout_and_counts(self) -> None:
        first_archive, first_metadata_path, metadata = self._build("-one")
        second_archive, second_metadata_path, second_metadata = self._build("-two")

        self.assertEqual(first_archive.read_bytes(), second_archive.read_bytes())
        self.assertEqual(
            first_metadata_path.read_bytes(),
            second_metadata_path.read_bytes(),
        )
        self.assertEqual(metadata, second_metadata)
        self.assertEqual(metadata["schemaVersion"], 1)
        self.assertEqual(
            metadata["sourceFormat"],
            "paper-tracker-backend-export-v1",
        )
        self.assertEqual(metadata["createdAt"], self.created_at)
        self.assertEqual(metadata["sourceCreatedAt"], self.created_at)
        self.assertEqual(
            metadata["counts"],
            {
                "papers": 2,
                "users": 1,
                "auditEvents": 1,
                "paperFiles": 1,
                "checkpoints": 1,
                "writes": 2,
            },
        )
        self.assertEqual(
            metadata["security"],
            {
                "jwtRotationRequired": True,
                "revokedSessions": 2,
                "remainingSessions": 0,
            },
        )

        with tarfile.open(first_archive, "r:gz") as archive:
            names = archive.getnames()
            self.assertEqual(
                names,
                [
                    "backups",
                    "backups/paper_tracker_fixture.db",
                    "control",
                    "control/control_plane.db",
                    "graph_checkpoints.db",
                    "paper_files",
                    "paper_files/1",
                    "paper_files/1/paper.pdf",
                    "paper_tracker.db",
                ],
            )
            self.assertNotIn(".env", names)
            for member in archive.getmembers():
                self.assertNotIn("..", Path(member.name).parts)
                self.assertEqual(member.uid, 10001)
                self.assertEqual(member.gid, 10001)
                self.assertEqual(member.mtime, 0)
            extracted_control = archive.extractfile("control/control_plane.db")
            assert extracted_control is not None
            seeded_control_path = self.root / "seeded-control-plane.db"
            seeded_control_path.write_bytes(extracted_control.read())

        seeded_control = sqlite3.connect(seeded_control_path)
        try:
            self.assertEqual(
                seeded_control.execute(
                    "SELECT COUNT(*) FROM user_sessions"
                ).fetchone(),
                (0,),
            )
        finally:
            seeded_control.close()
        source_control = sqlite3.connect(
            self.payload / "backend/data/control/control_plane.db"
        )
        try:
            self.assertEqual(
                source_control.execute(
                    "SELECT COUNT(*) FROM user_sessions"
                ).fetchone(),
                (2,),
            )
        finally:
            source_control.close()

        metadata_text = first_metadata_path.read_text(encoding="utf-8")
        self.assertNotIn("must-never-be-emitted", metadata_text)
        self.assertNotIn("account-must-never-be-emitted", metadata_text)
        self.assertNotIn(".env", metadata_text)
        self.assertEqual(
            [entry["path"] for entry in metadata["archiveEntries"]],
            [
                "backups/paper_tracker_fixture.db",
                "control/control_plane.db",
                "graph_checkpoints.db",
                "paper_files/1/paper.pdf",
                "paper_tracker.db",
            ],
        )

    def test_rejects_hash_tampering_even_when_size_is_unchanged(self) -> None:
        attachment = self.payload / "backend/data/paper_files/1/paper.pdf"
        original = attachment.read_bytes()
        attachment.write_bytes(b"X" * len(original))

        with self.assertRaisesRegex(
            seed_archive.SeedArchiveError,
            "SHA-256 mismatch",
        ):
            self._build()

    def test_rejects_path_traversal_before_accessing_payload(self) -> None:
        entries = self._payload_files()
        entries.append(
            {
                "path": "payload/backend/data/paper_files/../../../../outside",
                "size": 1,
                "sha256": "0" * 64,
            }
        )
        self._write_manifest(payload_files=entries)

        with self.assertRaisesRegex(seed_archive.SeedArchiveError, "unsafe payload path"):
            self._build()

    def test_rejects_symlink_or_special_file_stat(self) -> None:
        special_stat = SimpleNamespace(
            st_mode=stat.S_IFIFO | 0o600,
            st_nlink=1,
            st_file_attributes=0,
        )
        with self.assertRaisesRegex(seed_archive.SeedArchiveError, "regular file"):
            seed_archive._require_regular_stat(special_stat, "special payload")

        symlink_stat = SimpleNamespace(
            st_mode=stat.S_IFLNK | 0o777,
            st_nlink=1,
            st_file_attributes=0,
        )
        with self.assertRaisesRegex(seed_archive.SeedArchiveError, "symlink"):
            seed_archive._require_regular_stat(symlink_stat, "linked payload")

    def test_rejects_unlisted_payload_file(self) -> None:
        (self.payload / "backend/data/paper_files/unlisted.pdf").write_bytes(b"x")

        with self.assertRaisesRegex(seed_archive.SeedArchiveError, "not listed"):
            self._build()

    def test_rejects_corrupt_database_after_hashes_match(self) -> None:
        database = self.payload / "backend/graph_checkpoints.db"
        database.write_bytes(b"not a SQLite database")
        self._write_manifest()

        with self.assertRaisesRegex(
            seed_archive.SeedArchiveError,
            "SQLite validation failed",
        ):
            self._build()

    def test_rejects_foreign_key_violations(self) -> None:
        database = self.payload / "backend/data/control/control_plane.db"
        connection = sqlite3.connect(database)
        try:
            connection.execute("PRAGMA foreign_keys = OFF")
            connection.execute(
                "INSERT INTO audit_events (id, actor_user_id) VALUES (2, 999)"
            )
            connection.commit()
        finally:
            connection.close()
        self._write_manifest()

        with self.assertRaisesRegex(
            seed_archive.SeedArchiveError,
            "foreign-key check failed",
        ):
            self._build()

    def test_rejects_hard_linked_payload(self) -> None:
        original = self.payload / "backend/data/paper_files/1/paper.pdf"
        external = self.root / "outside.pdf"
        original.replace(external)
        try:
            os.link(external, original)
        except OSError as exc:
            self.skipTest(f"hard links are not available: {exc}")
        if os.lstat(original).st_nlink <= 1:
            self.skipTest("this filesystem does not report hard-link counts")
        self._write_manifest()

        with self.assertRaisesRegex(
            seed_archive.SeedArchiveError,
            "multiple hard links",
        ):
            self._build()


if __name__ == "__main__":
    unittest.main()

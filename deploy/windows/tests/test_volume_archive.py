from __future__ import annotations

import importlib.util
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "volume_archive.py"
SPEC = importlib.util.spec_from_file_location("volume_archive", MODULE_PATH)
assert SPEC and SPEC.loader
volume_archive = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(volume_archive)


class VolumeArchiveRestoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.target = self.root / "target"
        self.archive_root = self.root / "archive"
        self.target.mkdir()
        self.archive_root.mkdir()

        self.old_roots = volume_archive.ALLOWED_ROOTS
        self.old_archive_root = volume_archive.ARCHIVE_ROOT
        volume_archive.ALLOWED_ROOTS = {
            "backup": self.root / "source",
            "restore": self.target,
        }
        volume_archive.ARCHIVE_ROOT = self.archive_root

    def tearDown(self) -> None:
        volume_archive.ALLOWED_ROOTS = self.old_roots
        volume_archive.ARCHIVE_ROOT = self.old_archive_root
        self.temp_dir.cleanup()

    def _write_originals(self) -> None:
        (self.target / "a-original.txt").write_text("original-a", encoding="utf-8")
        (self.target / "b-original.txt").write_text("original-b", encoding="utf-8")

    def _make_archive(self, files: dict[str, str]) -> Path:
        source = self.root / "archive-source"
        source.mkdir()
        for name, content in files.items():
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

        archive = self.archive_root / "restore.tar.gz"
        with tarfile.open(archive, "w:gz") as output:
            for child in sorted(source.iterdir(), key=lambda item: item.name):
                output.add(child, arcname=child.name)
        return archive

    def _assert_originals_intact(self) -> None:
        self.assertEqual(
            (self.target / "a-original.txt").read_text(encoding="utf-8"),
            "original-a",
        )
        self.assertEqual(
            (self.target / "b-original.txt").read_text(encoding="utf-8"),
            "original-b",
        )
        leftovers = [
            path.name
            for path in self.target.iterdir()
            if path.name.startswith(".restore-")
        ]
        self.assertEqual(leftovers, [])

    def test_original_move_failure_rolls_back_only_moved_items(self) -> None:
        self._write_originals()
        archive = self._make_archive({"replacement.txt": "new"})
        original_rename = Path.rename

        def fail_on_second_original(path: Path, destination: Path) -> Path:
            if path.parent == self.target and path.name == "b-original.txt":
                raise OSError("simulated original move failure")
            return original_rename(path, destination)

        with (
            patch.object(Path, "rename", new=fail_on_second_original),
            self.assertRaisesRegex(OSError, "simulated original move failure"),
        ):
            volume_archive.restore(str(self.target), str(archive))

        self._assert_originals_intact()
        self.assertFalse((self.target / "replacement.txt").exists())

    def test_unpack_failure_leaves_target_untouched(self) -> None:
        self._write_originals()
        archive = self.archive_root / "restore.tar.gz"
        archive.write_bytes(b"not a gzip archive")

        with self.assertRaises(tarfile.TarError):
            volume_archive.restore(str(self.target), str(archive))

        self._assert_originals_intact()

    def test_replacement_move_failure_restores_all_originals(self) -> None:
        self._write_originals()
        archive = self._make_archive(
            {
                "a-original.txt": "new-a",
                "new-only.txt": "new-only",
            }
        )
        original_rename = Path.rename

        def fail_on_new_only(path: Path, destination: Path) -> Path:
            if (
                path.parent.name.startswith(".restore-staging-")
                and path.name == "new-only.txt"
            ):
                raise OSError("simulated replacement move failure")
            return original_rename(path, destination)

        with (
            patch.object(Path, "rename", new=fail_on_new_only),
            self.assertRaisesRegex(OSError, "simulated replacement move failure"),
        ):
            volume_archive.restore(str(self.target), str(archive))

        self._assert_originals_intact()
        self.assertFalse((self.target / "new-only.txt").exists())

    def test_restore_requires_backend_uid_and_gid(self) -> None:
        archive = self._make_archive(
            {
                "paper_tracker.db": "db",
                "control/control_plane.db": "control",
            }
        )

        with (
            patch.object(os, "geteuid", create=True, return_value=10001),
            patch.object(os, "getegid", create=True, return_value=10001),
        ):
            volume_archive.restore(
                str(self.target),
                str(archive),
                owner_uid=10001,
                owner_gid=10001,
            )

        self.assertEqual(
            (self.target / "paper_tracker.db").read_text(encoding="utf-8"),
            "db",
        )
        self.assertEqual(
            (self.target / "control" / "control_plane.db").read_text(encoding="utf-8"),
            "control",
        )

    def test_restore_rejects_wrong_process_owner(self) -> None:
        archive = self._make_archive({"paper_tracker.db": "db"})

        with (
            patch.object(os, "geteuid", create=True, return_value=0),
            patch.object(os, "getegid", create=True, return_value=0),
            self.assertRaisesRegex(PermissionError, "must run as"),
        ):
            volume_archive.restore(
                str(self.target),
                str(archive),
                owner_uid=10001,
                owner_gid=10001,
            )


if __name__ == "__main__":
    unittest.main()

"""Security and lifecycle tests for attachment file storage."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services import file_storage


@pytest.fixture
def storage_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "paper_files"
    monkeypatch.setattr(file_storage, "_STORAGE_ROOT", root)
    return root


def test_safe_save_read_and_delete(storage_root: Path) -> None:
    content = b"%PDF-1.7\nexample"

    storage_path, size = file_storage.save_file(42, "folder\\paper.pdf", content)

    assert storage_path.startswith("42/")
    assert storage_path.endswith("_paper.pdf")
    assert size == len(content)
    saved_path = file_storage.read_file(storage_path)
    assert saved_path.read_bytes() == content
    assert saved_path.is_relative_to(storage_root.resolve())

    file_storage.delete_file(storage_path)

    assert not saved_path.exists()
    assert not saved_path.parent.exists()
    # Deleting a missing, otherwise valid attachment remains idempotent.
    file_storage.delete_file(storage_path)


@pytest.mark.parametrize(
    "storage_path",
    [
        "",
        "   ",
        ".",
        "./1/paper.pdf",
        "1/./paper.pdf",
        "1/../paper.pdf",
        "../outside.pdf",
        "/absolute/paper.pdf",
        "//server/share/paper.pdf",
        "C:/outside/paper.pdf",
        "C:\\outside\\paper.pdf",
        "\\\\server\\share\\paper.pdf",
        "1\\paper.pdf",
        "1/paper.pdf:payload",
        "1//paper.pdf",
        "1/paper.pdf ",
        "1/paper.pdf\x00",
    ],
)
def test_read_rejects_unsafe_storage_paths(storage_root: Path, storage_path: str) -> None:
    storage_root.mkdir()

    with pytest.raises(file_storage.UnsafeStoragePathError):
        file_storage.read_file(storage_path)


def test_same_prefix_sibling_cannot_be_read_or_deleted(storage_root: Path) -> None:
    storage_root.mkdir()
    outside_dir = storage_root.parent / f"{storage_root.name}-escape"
    outside_dir.mkdir()
    outside_file = outside_dir / "secret.pdf"
    outside_file.write_bytes(b"private")
    traversal = f"../{outside_dir.name}/{outside_file.name}"

    with pytest.raises(file_storage.UnsafeStoragePathError):
        file_storage.read_file(traversal)
    with pytest.raises(file_storage.UnsafeStoragePathError):
        file_storage.delete_file(traversal)

    assert outside_file.read_bytes() == b"private"


def test_read_and_delete_require_a_regular_file(storage_root: Path) -> None:
    attachment_dir = storage_root / "7" / "directory.pdf"
    attachment_dir.mkdir(parents=True)

    with pytest.raises(FileNotFoundError):
        file_storage.read_file("7/directory.pdf")
    with pytest.raises(FileNotFoundError):
        file_storage.delete_file("7/directory.pdf")

    assert attachment_dir.is_dir()


def test_symlink_is_rejected_for_read_delete_and_save(storage_root: Path) -> None:
    outside_dir = storage_root.parent / "outside"
    outside_dir.mkdir()
    outside_file = outside_dir / "secret.pdf"
    outside_file.write_bytes(b"private")

    attachment_dir = storage_root / "8"
    attachment_dir.mkdir(parents=True)
    linked_file = attachment_dir / "linked.pdf"
    linked_save_dir = storage_root / "9"
    try:
        linked_file.symlink_to(outside_file)
        linked_save_dir.symlink_to(outside_dir, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"symlinks are unavailable on this platform: {exc}")

    with pytest.raises(file_storage.UnsafeStoragePathError):
        file_storage.read_file("8/linked.pdf")
    with pytest.raises(file_storage.UnsafeStoragePathError):
        file_storage.delete_file("8/linked.pdf")
    with pytest.raises(file_storage.UnsafeStoragePathError):
        file_storage.save_file(9, "new.pdf", b"do not write")

    assert outside_file.read_bytes() == b"private"
    assert list(outside_dir.iterdir()) == [outside_file]


def test_reported_junction_or_reparse_component_is_rejected(
    storage_root: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    junction = storage_root / "10" / "junction"
    junction.mkdir(parents=True)
    real_is_reparse_point = file_storage._is_reparse_point

    def report_junction(path: Path) -> bool:
        return path == junction or real_is_reparse_point(path)

    monkeypatch.setattr(file_storage, "_is_reparse_point", report_junction)

    with pytest.raises(file_storage.UnsafeStoragePathError):
        file_storage.read_file("10/junction/paper.pdf")


@pytest.mark.parametrize("filename", ["paper.pdf:payload", "paper.pdf ", "\x00.pdf"])
def test_save_rejects_unsafe_filename(storage_root: Path, filename: str) -> None:
    with pytest.raises(file_storage.UnsafeStoragePathError):
        file_storage.save_file(11, filename, b"content")

    assert not storage_root.exists()

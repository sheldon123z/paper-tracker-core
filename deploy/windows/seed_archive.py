#!/usr/bin/env python3
"""Validate a backend export and build a deterministic Docker-volume seed.

The backend export contains a ``payload/.env`` file.  This helper verifies
that file as opaque bytes, but deliberately never parses, copies, archives, or
reports its contents or digest.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import sqlite3
import stat
import sys
import tarfile
import tempfile
import unicodedata
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import BinaryIO, NamedTuple

SOURCE_FORMAT = "paper-tracker-backend-export-v1"
MANIFEST_NAME = "manifest.json"
OPAQUE_ENV_PATH = PurePosixPath("payload/.env")
MAX_MANIFEST_BYTES = 16 * 1024 * 1024
COPY_CHUNK_BYTES = 1024 * 1024
SHA256_RE = re.compile(r"[0-9a-fA-F]{64}\Z")
REPARSE_POINT_ATTRIBUTE = 0x400

ACTIVE_DATABASE_PATHS = (
    PurePosixPath("payload/backend/paper_tracker.db"),
    PurePosixPath("payload/backend/graph_checkpoints.db"),
    PurePosixPath("payload/backend/data/control/control_plane.db"),
)

EXACT_TARGETS = {
    ACTIVE_DATABASE_PATHS[0]: PurePosixPath("paper_tracker.db"),
    ACTIVE_DATABASE_PATHS[1]: PurePosixPath("graph_checkpoints.db"),
    ACTIVE_DATABASE_PATHS[2]: PurePosixPath("control/control_plane.db"),
}

TREE_TARGETS = (
    (
        PurePosixPath("payload/backend/data/paper_files"),
        PurePosixPath("paper_files"),
    ),
    (
        PurePosixPath("payload/backend/data/backups"),
        PurePosixPath("backups"),
    ),
)

REQUIRED_ARCHIVE_DIRECTORIES = (
    PurePosixPath("backups"),
    PurePosixPath("control"),
    PurePosixPath("paper_files"),
)

ALLOWED_SOURCE_DIRECTORIES = {
    PurePosixPath("payload/backend"),
    PurePosixPath("payload/backend/data"),
    PurePosixPath("payload/backend/data/backups"),
    PurePosixPath("payload/backend/data/control"),
    PurePosixPath("payload/backend/data/paper_files"),
}

DATABASE_COUNTS = {
    PurePosixPath("paper_tracker.db"): {
        "papers": "papers",
        "paperFiles": "paper_files",
    },
    PurePosixPath("control/control_plane.db"): {
        "users": "users",
        "auditEvents": "audit_events",
    },
    PurePosixPath("graph_checkpoints.db"): {
        "checkpoints": "checkpoints",
        "writes": "writes",
    },
}
CONTROL_DATABASE_TARGET = PurePosixPath("control/control_plane.db")
SESSION_TABLE = "user_sessions"


class SeedArchiveError(ValueError):
    """Raised when an export cannot safely become a seed archive."""


class PayloadSpec(NamedTuple):
    """One manifest payload entry and its optional volume destination."""

    source: PurePosixPath
    target: PurePosixPath | None
    size: int
    sha256: str


def _is_link_or_reparse(file_stat: os.stat_result) -> bool:
    return stat.S_ISLNK(file_stat.st_mode) or bool(
        getattr(file_stat, "st_file_attributes", 0) & REPARSE_POINT_ATTRIBUTE
    )


def _require_directory(path: Path, label: str) -> os.stat_result:
    try:
        file_stat = os.lstat(path)
    except OSError:
        raise SeedArchiveError(f"{label} is not an accessible directory") from None
    if _is_link_or_reparse(file_stat) or not stat.S_ISDIR(file_stat.st_mode):
        raise SeedArchiveError(f"{label} must be a real directory, not a link")
    return file_stat


def _require_regular_stat(
    file_stat: os.stat_result,
    label: str,
    *,
    reject_hard_links: bool = True,
) -> None:
    if _is_link_or_reparse(file_stat):
        raise SeedArchiveError(f"{label} must not be a symlink or reparse point")
    if not stat.S_ISREG(file_stat.st_mode):
        raise SeedArchiveError(f"{label} must be a regular file")
    # Some Windows Python/filesystem combinations report zero when link count
    # is unavailable.  A reported count above one is still unambiguously a
    # hard-linked file and is rejected.
    if reject_hard_links and getattr(file_stat, "st_nlink", 1) > 1:
        raise SeedArchiveError(f"{label} must not have multiple hard links")


def _same_file(before: os.stat_result, after: os.stat_result) -> bool:
    """Compare the identity observed before and after a no-follow open."""

    before_identity = (getattr(before, "st_dev", 0), getattr(before, "st_ino", 0))
    after_identity = (getattr(after, "st_dev", 0), getattr(after, "st_ino", 0))
    if 0 in before_identity or 0 in after_identity:
        return True
    return before_identity == after_identity


@contextmanager
def _open_regular(
    path: Path,
    label: str,
    *,
    expected_size: int | None = None,
) -> Iterator[BinaryIO]:
    """Open a regular file without accepting link/special-file substitutions."""

    try:
        before = os.lstat(path)
    except OSError:
        raise SeedArchiveError(f"{label} is missing or inaccessible") from None
    _require_regular_stat(before, label)
    if expected_size is not None and before.st_size != expected_size:
        raise SeedArchiveError(f"payload size mismatch for {label}")

    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError:
        raise SeedArchiveError(f"{label} could not be opened safely") from None

    try:
        after = os.fstat(descriptor)
        _require_regular_stat(after, label)
        if not _same_file(before, after):
            raise SeedArchiveError(f"{label} changed while it was being opened")
        if expected_size is not None and after.st_size != expected_size:
            raise SeedArchiveError(f"payload size mismatch for {label}")
        with os.fdopen(descriptor, "rb", closefd=True) as opened:
            descriptor = -1
            yield opened
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def _json_object_without_duplicates(pairs: list[tuple[str, object]]) -> dict:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise SeedArchiveError(f"manifest contains duplicate JSON key: {key}")
        result[key] = value
    return result


def _load_manifest(export_root: Path) -> dict:
    manifest_path = export_root / MANIFEST_NAME
    with _open_regular(manifest_path, MANIFEST_NAME) as manifest_file:
        data = manifest_file.read(MAX_MANIFEST_BYTES + 1)
    if len(data) > MAX_MANIFEST_BYTES:
        raise SeedArchiveError("manifest is unreasonably large")
    try:
        decoded = data.decode("utf-8")
        manifest = json.loads(
            decoded,
            object_pairs_hook=_json_object_without_duplicates,
        )
    except SeedArchiveError:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise SeedArchiveError("manifest is not valid UTF-8 JSON") from None
    if not isinstance(manifest, dict):
        raise SeedArchiveError("manifest root must be a JSON object")
    return manifest


def _validate_source_path(raw_path: object, label: str) -> PurePosixPath:
    if not isinstance(raw_path, str) or not raw_path or len(raw_path) > 4096:
        raise SeedArchiveError(f"{label} must be a non-empty relative path")
    if "\\" in raw_path or raw_path.startswith("/") or raw_path.endswith("/"):
        raise SeedArchiveError(f"unsafe payload path in {label}")

    parts = raw_path.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise SeedArchiveError(f"unsafe payload path in {label}")
    if any(
        unicodedata.category(character) == "Cc"
        for part in parts
        for character in part
    ):
        raise SeedArchiveError(f"payload path contains control characters in {label}")

    return PurePosixPath(*parts)


def _map_target(source: PurePosixPath) -> PurePosixPath | None:
    if source == OPAQUE_ENV_PATH:
        return None
    exact = EXACT_TARGETS.get(source)
    if exact is not None:
        return exact
    for source_root, target_root in TREE_TARGETS:
        try:
            relative = source.relative_to(source_root)
        except ValueError:
            continue
        if not relative.parts:
            break
        return target_root / relative
    raise SeedArchiveError(f"payload path is not allowlisted: {source.as_posix()}")


def _validate_created_at(value: object) -> str:
    if not isinstance(value, str) or not value or len(value) > 128:
        raise SeedArchiveError("manifest.created_at must be a timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise SeedArchiveError("manifest.created_at must be ISO-8601") from None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise SeedArchiveError("manifest.created_at must include a timezone")
    return value


def _parse_manifest(manifest: dict) -> tuple[str, list[PayloadSpec]]:
    if manifest.get("format") != SOURCE_FORMAT:
        raise SeedArchiveError("unsupported backend export format")
    created_at = _validate_created_at(manifest.get("created_at"))

    raw_payload_files = manifest.get("payload_files")
    if not isinstance(raw_payload_files, list) or not raw_payload_files:
        raise SeedArchiveError("manifest.payload_files must be a non-empty array")

    specs: list[PayloadSpec] = []
    source_keys: set[str] = set()
    target_keys: set[str] = set()
    for index, item in enumerate(raw_payload_files):
        label = f"manifest.payload_files[{index}]"
        if not isinstance(item, dict):
            raise SeedArchiveError(f"{label} must be an object")

        source = _validate_source_path(item.get("path"), f"{label}.path")
        source_key = source.as_posix().casefold()
        if source_key in source_keys:
            raise SeedArchiveError(f"duplicate payload path: {source.as_posix()}")
        source_keys.add(source_key)

        size = item.get("size")
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            raise SeedArchiveError(f"{label}.size must be a non-negative integer")

        sha256 = item.get("sha256")
        if not isinstance(sha256, str) or not SHA256_RE.fullmatch(sha256):
            raise SeedArchiveError(f"{label}.sha256 must be a SHA-256 hex digest")

        target = _map_target(source)
        if target is not None:
            target_key = target.as_posix().casefold()
            if target_key in target_keys:
                raise SeedArchiveError(
                    f"multiple payload files map to {target.as_posix()}"
                )
            target_keys.add(target_key)

        specs.append(
            PayloadSpec(
                source=source,
                target=target,
                size=size,
                sha256=sha256.lower(),
            )
        )

    raw_active_databases = manifest.get("active_databases")
    if not isinstance(raw_active_databases, list):
        raise SeedArchiveError("manifest.active_databases must be an array")
    active_databases = [
        _validate_source_path(path, "manifest.active_databases")
        for path in raw_active_databases
    ]
    active_keys = [path.as_posix().casefold() for path in active_databases]
    if len(active_keys) != len(set(active_keys)):
        raise SeedArchiveError("manifest.active_databases contains duplicates")
    if set(active_databases) != set(ACTIVE_DATABASE_PATHS):
        raise SeedArchiveError("manifest must declare exactly three active databases")

    declared_sources = {spec.source for spec in specs}
    if not set(ACTIVE_DATABASE_PATHS).issubset(declared_sources):
        raise SeedArchiveError("an active database is missing from payload_files")

    payload_bytes = manifest.get("payload_bytes")
    if payload_bytes is not None:
        if isinstance(payload_bytes, bool) or not isinstance(payload_bytes, int):
            raise SeedArchiveError("manifest.payload_bytes must be an integer")
        if payload_bytes != sum(spec.size for spec in specs):
            raise SeedArchiveError("manifest.payload_bytes does not match payload_files")

    return created_at, specs


def _source_directory_allowed(source: PurePosixPath) -> bool:
    if source in ALLOWED_SOURCE_DIRECTORIES:
        return True
    return any(
        source != tree_root and tree_root in source.parents
        for tree_root, _target_root in TREE_TARGETS
    )


def _scan_payload_tree(payload_root: Path) -> dict[PurePosixPath, os.stat_result]:
    _require_directory(payload_root, "payload")
    files: dict[PurePosixPath, os.stat_result] = {}
    casefolded: set[str] = set()

    def walk(directory: Path, relative: PurePosixPath) -> None:
        try:
            with os.scandir(directory) as iterator:
                entries = sorted(iterator, key=lambda entry: entry.name)
        except OSError:
            raise SeedArchiveError("payload tree could not be inspected safely") from None

        for entry in entries:
            raw_source = (
                f"payload/{entry.name}"
                if not relative.parts
                else f"payload/{relative.as_posix()}/{entry.name}"
            )
            source = _validate_source_path(raw_source, "payload tree")
            try:
                file_stat = entry.stat(follow_symlinks=False)
            except OSError:
                raise SeedArchiveError(
                    f"payload entry is inaccessible: {source.as_posix()}"
                ) from None
            if _is_link_or_reparse(file_stat):
                raise SeedArchiveError(
                    f"payload entry must not be a symlink or reparse point: "
                    f"{source.as_posix()}"
                )
            if stat.S_ISDIR(file_stat.st_mode):
                if not _source_directory_allowed(source):
                    raise SeedArchiveError(
                        f"payload directory is not allowlisted: {source.as_posix()}"
                    )
                walk(Path(entry.path), PurePosixPath(*source.parts[1:]))
                continue

            _require_regular_stat(file_stat, f"payload entry {source.as_posix()}")
            source_key = source.as_posix().casefold()
            if source_key in casefolded:
                raise SeedArchiveError(
                    f"case-insensitive duplicate payload path: {source.as_posix()}"
                )
            casefolded.add(source_key)
            files[source] = file_stat

    walk(payload_root, PurePosixPath())
    return files


def _validate_payload_tree(
    export_root: Path,
    specs: list[PayloadSpec],
) -> None:
    actual_files = _scan_payload_tree(export_root / "payload")
    declared = {spec.source for spec in specs}
    actual = set(actual_files)
    if declared != actual:
        missing = sorted(path.as_posix() for path in declared - actual)
        unlisted = sorted(path.as_posix() for path in actual - declared)
        if missing:
            raise SeedArchiveError(f"manifest payload file is missing: {missing[0]}")
        raise SeedArchiveError(f"payload file is not listed in manifest: {unlisted[0]}")

    for spec in specs:
        if actual_files[spec.source].st_size != spec.size:
            raise SeedArchiveError(
                f"payload size mismatch for {spec.source.as_posix()}"
            )


def _source_path(export_root: Path, source: PurePosixPath) -> Path:
    return export_root.joinpath(*source.parts)


def _copy_verified_payload(
    export_root: Path,
    staging_root: Path,
    specs: list[PayloadSpec],
) -> None:
    for directory in REQUIRED_ARCHIVE_DIRECTORIES:
        staging_root.joinpath(*directory.parts).mkdir(parents=True, exist_ok=True)

    for spec in sorted(specs, key=lambda item: item.source.as_posix()):
        source_path = _source_path(export_root, spec.source)
        destination: BinaryIO | None = None
        destination_path: Path | None = None
        digest = hashlib.sha256()
        byte_count = 0

        try:
            if spec.target is not None:
                destination_path = staging_root.joinpath(*spec.target.parts)
                destination_path.parent.mkdir(parents=True, exist_ok=True)
                destination = destination_path.open("xb")

            with _open_regular(
                source_path,
                spec.source.as_posix(),
                expected_size=spec.size,
            ) as source_file:
                while True:
                    chunk = source_file.read(COPY_CHUNK_BYTES)
                    if not chunk:
                        break
                    byte_count += len(chunk)
                    digest.update(chunk)
                    if destination is not None:
                        destination.write(chunk)
        finally:
            if destination is not None:
                destination.close()

        if byte_count != spec.size:
            if destination_path is not None:
                destination_path.unlink(missing_ok=True)
            raise SeedArchiveError(
                f"payload size mismatch for {spec.source.as_posix()}"
            )
        if digest.hexdigest() != spec.sha256:
            if destination_path is not None:
                destination_path.unlink(missing_ok=True)
            raise SeedArchiveError(
                f"payload SHA-256 mismatch for {spec.source.as_posix()}"
            )


def _sqlite_uri(path: Path) -> str:
    return f"{path.resolve().as_uri()}?mode=ro&immutable=1"


def _table_count(connection: sqlite3.Connection, table_name: str) -> int:
    exists = connection.execute(
        "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    if exists is None:
        return 0
    # All table names are constants in DATABASE_COUNTS, never manifest input.
    row = connection.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()
    if row is None or isinstance(row[0], bool) or not isinstance(row[0], int):
        raise SeedArchiveError("database returned an invalid table count")
    return row[0]


def _validate_database(
    database_path: Path,
    archive_path: PurePosixPath,
    table_counts: dict[str, str],
) -> dict[str, int]:
    try:
        connection = sqlite3.connect(
            _sqlite_uri(database_path),
            uri=True,
            timeout=1,
        )
        try:
            connection.execute("PRAGMA query_only = ON")
            integrity_rows = connection.execute("PRAGMA integrity_check").fetchall()
            if integrity_rows != [("ok",)]:
                raise SeedArchiveError(
                    f"SQLite integrity check failed for {archive_path.as_posix()}"
                )
            if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise SeedArchiveError(
                    f"SQLite foreign-key check failed for {archive_path.as_posix()}"
                )
            return {
                metadata_name: _table_count(connection, table_name)
                for metadata_name, table_name in table_counts.items()
            }
        finally:
            connection.close()
    except SeedArchiveError:
        raise
    except sqlite3.Error:
        raise SeedArchiveError(
            f"SQLite validation failed for {archive_path.as_posix()}"
        ) from None


def _validate_databases(staging_root: Path) -> dict[str, int]:
    counts = {
        "papers": 0,
        "users": 0,
        "auditEvents": 0,
        "paperFiles": 0,
        "checkpoints": 0,
        "writes": 0,
    }
    for archive_path, table_counts in DATABASE_COUNTS.items():
        database_path = staging_root.joinpath(*archive_path.parts)
        counts.update(
            _validate_database(database_path, archive_path, table_counts)
        )
    return counts


def _revoke_exported_sessions(staging_root: Path) -> int:
    """Remove all portable login sessions from the copied control database."""

    database_path = staging_root.joinpath(*CONTROL_DATABASE_TARGET.parts)
    try:
        connection = sqlite3.connect(database_path, timeout=5)
        try:
            connection.execute("PRAGMA foreign_keys = ON")
            exists = connection.execute(
                "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?",
                (SESSION_TABLE,),
            ).fetchone()
            if exists is None:
                return 0

            revoked = _table_count(connection, SESSION_TABLE)
            connection.execute("PRAGMA secure_delete = ON")
            connection.execute(f'DELETE FROM "{SESSION_TABLE}"')
            connection.commit()
            # Rebuild the copied database so deleted token hashes do not remain
            # recoverable from freelist pages in the installed seed.
            connection.execute("VACUUM")
            remaining = _table_count(connection, SESSION_TABLE)
            if remaining != 0:
                raise SeedArchiveError("failed to revoke exported user sessions")
            return revoked
        finally:
            connection.close()
    except SeedArchiveError:
        raise
    except sqlite3.Error:
        raise SeedArchiveError(
            "SQLite session revocation failed for control/control_plane.db"
        ) from None


def _refresh_mutated_target(
    staging_root: Path,
    specs: list[PayloadSpec],
    target: PurePosixPath,
) -> list[PayloadSpec]:
    """Refresh archive metadata after a deliberate staging-only mutation."""

    refreshed: list[PayloadSpec] = []
    found = False
    for spec in specs:
        if spec.target != target:
            refreshed.append(spec)
            continue

        found = True
        path = staging_root.joinpath(*target.parts)
        file_stat = os.lstat(path)
        _require_regular_stat(file_stat, target.as_posix())
        digest = hashlib.sha256()
        byte_count = 0
        with path.open("rb") as source:
            while True:
                chunk = source.read(COPY_CHUNK_BYTES)
                if not chunk:
                    break
                digest.update(chunk)
                byte_count += len(chunk)
        if byte_count != file_stat.st_size:
            raise SeedArchiveError(
                f"mutated archive file size changed while reading {target.as_posix()}"
            )
        refreshed.append(
            PayloadSpec(
                source=spec.source,
                target=spec.target,
                size=byte_count,
                sha256=digest.hexdigest(),
            )
        )

    if not found:
        raise SeedArchiveError(
            f"required mutable archive target is missing: {target.as_posix()}"
        )
    return refreshed


def _tar_info(path: PurePosixPath, *, directory: bool, size: int = 0) -> tarfile.TarInfo:
    info = tarfile.TarInfo(path.as_posix())
    info.type = tarfile.DIRTYPE if directory else tarfile.REGTYPE
    info.size = 0 if directory else size
    info.mode = 0o700 if directory else 0o600
    info.uid = 10001
    info.gid = 10001
    info.uname = ""
    info.gname = ""
    info.mtime = 0
    return info


def _archive_directories(specs: list[PayloadSpec]) -> set[PurePosixPath]:
    directories = set(REQUIRED_ARCHIVE_DIRECTORIES)
    for spec in specs:
        if spec.target is None:
            continue
        for parent in spec.target.parents:
            if parent.parts:
                directories.add(parent)
    return directories


def _write_archive(
    output: BinaryIO,
    staging_root: Path,
    specs: list[PayloadSpec],
) -> None:
    file_specs = {spec.target: spec for spec in specs if spec.target is not None}
    directories = _archive_directories(specs)
    entries = sorted(
        [(path, True) for path in directories]
        + [(path, False) for path in file_specs],
        key=lambda item: (item[0].as_posix(), not item[1]),
    )

    with gzip.GzipFile(
        filename="",
        mode="wb",
        compresslevel=9,
        fileobj=output,
        mtime=0,
    ) as compressed, tarfile.open(
        fileobj=compressed,
        mode="w|",
        format=tarfile.PAX_FORMAT,
    ) as archive:
        for archive_path, is_directory in entries:
            if is_directory:
                archive.addfile(_tar_info(archive_path, directory=True))
                continue
            spec = file_specs[archive_path]
            staged_path = staging_root.joinpath(*archive_path.parts)
            with staged_path.open("rb") as staged_file:
                archive.addfile(
                    _tar_info(archive_path, directory=False, size=spec.size),
                    fileobj=staged_file,
                )


def _archive_entries(specs: list[PayloadSpec]) -> list[dict[str, object]]:
    return [
        {
            "path": spec.target.as_posix(),
            "size": spec.size,
            "sha256": spec.sha256,
        }
        for spec in sorted(
            (item for item in specs if item.target is not None),
            key=lambda item: item.target.as_posix() if item.target else "",
        )
        if spec.target is not None
    ]


def _absolute_path(path: str | Path) -> Path:
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate
    return candidate


def _path_exists(path: Path) -> bool:
    return os.path.lexists(path)


def _prepare_output(path: Path, label: str) -> None:
    if _path_exists(path):
        raise FileExistsError(f"refusing to overwrite {label}: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    _require_directory(path.parent, f"{label} parent")


def _temporary_output(path: Path) -> tuple[int, Path]:
    descriptor, raw_path = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    return descriptor, Path(raw_path)


def _publish_without_overwrite(temporary: Path, destination: Path) -> None:
    """Publish with a hard link so a concurrent file is never overwritten."""

    try:
        os.link(temporary, destination)
    except FileExistsError:
        raise FileExistsError(f"refusing to overwrite output: {destination}") from None
    except OSError:
        # Some removable filesystems do not support hard links.  Reserve the
        # destination exclusively, then replace only that reservation.
        try:
            reservation = os.open(
                destination,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0),
                0o600,
            )
        except FileExistsError:
            raise FileExistsError(
                f"refusing to overwrite output: {destination}"
            ) from None
        os.close(reservation)
        try:
            os.replace(temporary, destination)
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        return
    temporary.unlink()


def build_seed_archive(
    export_root: str | Path,
    archive_path: str | Path,
    metadata_path: str | Path,
) -> dict[str, object]:
    """Validate *export_root* and create a deterministic seed plus metadata."""

    root = _absolute_path(export_root)
    archive = _absolute_path(archive_path)
    metadata_file = _absolute_path(metadata_path)
    _require_directory(root, "export root")
    if os.path.normcase(str(archive)) == os.path.normcase(str(metadata_file)):
        raise SeedArchiveError("archive and metadata outputs must be different")

    manifest = _load_manifest(root)
    source_created_at, specs = _parse_manifest(manifest)
    _validate_payload_tree(root, specs)
    _prepare_output(archive, "archive")
    _prepare_output(metadata_file, "metadata")

    archive_temporary: Path | None = None
    metadata_temporary: Path | None = None
    archive_published = False
    try:
        with tempfile.TemporaryDirectory(prefix="paper-tracker-seed-") as temporary:
            staging_root = Path(temporary) / "volume"
            staging_root.mkdir(mode=0o700)
            _copy_verified_payload(root, staging_root, specs)
            # Validate the source copy before making the intentional
            # installation-only change below.
            _validate_databases(staging_root)
            revoked_sessions = _revoke_exported_sessions(staging_root)
            archive_specs = _refresh_mutated_target(
                staging_root,
                specs,
                CONTROL_DATABASE_TARGET,
            )
            counts = _validate_databases(staging_root)
            metadata: dict[str, object] = {
                "schemaVersion": 1,
                "sourceFormat": SOURCE_FORMAT,
                # Keep generation reproducible: the source timestamp is the
                # artifact timestamp rather than the current wall clock.
                "createdAt": source_created_at,
                "sourceCreatedAt": source_created_at,
                "counts": counts,
                "security": {
                    "jwtRotationRequired": True,
                    "revokedSessions": revoked_sessions,
                    "remainingSessions": 0,
                },
                "archiveEntries": _archive_entries(archive_specs),
            }

            archive_descriptor, archive_temporary = _temporary_output(archive)
            with os.fdopen(archive_descriptor, "wb", closefd=True) as output:
                _write_archive(output, staging_root, archive_specs)

            metadata_descriptor, metadata_temporary = _temporary_output(metadata_file)
            with os.fdopen(
                metadata_descriptor,
                "w",
                encoding="utf-8",
                newline="\n",
                closefd=True,
            ) as output:
                json.dump(
                    metadata,
                    output,
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                )
                output.write("\n")

        _publish_without_overwrite(archive_temporary, archive)
        archive_temporary = None
        archive_published = True
        _publish_without_overwrite(metadata_temporary, metadata_file)
        metadata_temporary = None
        return metadata
    except Exception:
        if archive_published:
            archive.unlink(missing_ok=True)
        raise
    finally:
        if archive_temporary is not None:
            archive_temporary.unlink(missing_ok=True)
        if metadata_temporary is not None:
            metadata_temporary.unlink(missing_ok=True)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build a verified Paper Tracker Docker-volume seed archive."
    )
    parser.add_argument("--export-root", required=True)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--metadata", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        metadata = build_seed_archive(
            args.export_root,
            args.archive,
            args.metadata,
        )
    except (SeedArchiveError, FileExistsError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(
        f"Created seed archive with {len(metadata['archiveEntries'])} files.",
        file=sys.stdout,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Safely archive or restore the dedicated Paper Tracker data volume."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tarfile
import uuid
from pathlib import Path, PurePosixPath

ARCHIVE_ROOT = Path("/archive")
ALLOWED_ROOTS = {
    "backup": Path("/source"),
    "restore": Path("/target"),
}


def _assert_exact_path(path: Path, expected: Path, label: str) -> Path:
    resolved = path.resolve()
    if resolved != expected:
        raise ValueError(f"{label} must resolve exactly to {expected}, got {resolved}")
    return resolved


def _assert_archive_path(path: Path) -> Path:
    resolved = path.resolve()
    archive_root = ARCHIVE_ROOT.resolve()
    if resolved.parent != archive_root:
        raise ValueError(f"archive must be a direct child of {archive_root}")
    if not resolved.name or any(
        char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-"
        for char in resolved.name
    ):
        raise ValueError("archive filename contains unsupported characters")
    return resolved


def _safe_tar_info(info: tarfile.TarInfo) -> tarfile.TarInfo:
    member_path = PurePosixPath(info.name)
    if member_path.is_absolute() or ".." in member_path.parts:
        raise ValueError(f"unsafe archive member path: {info.name}")
    if info.issym() or info.islnk() or info.isdev() or info.isfifo():
        raise ValueError(f"unsupported archive member type: {info.name}")
    return info


def backup(source_arg: str, archive_arg: str) -> None:
    source = _assert_exact_path(Path(source_arg), ALLOWED_ROOTS["backup"], "source")
    archive = _assert_archive_path(Path(archive_arg))
    if archive.exists():
        raise FileExistsError(f"refusing to overwrite archive: {archive}")

    with tarfile.open(archive, mode="x:gz", format=tarfile.PAX_FORMAT) as output:
        for child in sorted(source.iterdir(), key=lambda item: item.name):
            output.add(child, arcname=child.name, recursive=True, filter=_safe_tar_info)


def _remove_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink(missing_ok=True)


def _validate_members(archive: tarfile.TarFile) -> list[tarfile.TarInfo]:
    members = archive.getmembers()
    for member in members:
        _safe_tar_info(member)
    return members


def restore(
    target_arg: str,
    archive_arg: str,
    *,
    owner_uid: int | None = None,
    owner_gid: int | None = None,
) -> None:
    if (owner_uid is None) != (owner_gid is None):
        raise ValueError("owner_uid and owner_gid must be provided together")
    if owner_uid is not None and (owner_uid < 1 or owner_gid is None or owner_gid < 1):
        raise ValueError("restore owner UID/GID must be positive integers")
    if owner_uid is not None and owner_gid is not None:
        geteuid = getattr(os, "geteuid", None)
        getegid = getattr(os, "getegid", None)
        if geteuid is None or getegid is None:
            raise RuntimeError("ownership-safe restore requires a POSIX runtime")
        if geteuid() != owner_uid or getegid() != owner_gid:
            raise PermissionError(
                "restore helper must run as the requested owner UID/GID "
                f"({owner_uid}:{owner_gid})"
            )

    target = _assert_exact_path(Path(target_arg), ALLOWED_ROOTS["restore"], "target")
    archive_path = _assert_archive_path(Path(archive_arg))
    if not archive_path.is_file():
        raise FileNotFoundError(f"archive not found: {archive_path}")

    operation_id = uuid.uuid4().hex
    staging = target / f".restore-staging-{operation_id}"
    rollback = target / f".restore-rollback-{operation_id}"
    staging.mkdir(mode=0o700)
    moved_originals: list[str] = []
    installed_replacements: list[str] = []
    committed = False

    try:
        with tarfile.open(archive_path, mode="r:gz") as archive:
            members = _validate_members(archive)
            archive.extractall(staging, members=members, filter="data")

        rollback.mkdir(mode=0o700)
        existing = sorted(
            [child for child in target.iterdir() if child not in {staging, rollback}],
            key=lambda item: item.name,
        )
        for child in existing:
            child.rename(rollback / child.name)
            moved_originals.append(child.name)

        for child in sorted(staging.iterdir(), key=lambda item: item.name):
            child.rename(target / child.name)
            installed_replacements.append(child.name)

        staging.rmdir()
        committed = True
        try:
            shutil.rmtree(rollback)
        except OSError as exc:
            # The new dataset is already active. A leftover hidden rollback is
            # safer than treating cleanup trouble as a failed replacement.
            print(
                f"warning: could not remove restore rollback directory: {exc}",
                file=sys.stderr,
            )
    except Exception:
        if not committed:
            # Remove only replacement entries that this operation installed.
            # Never sweep the target: entries not yet moved are original data.
            for name in reversed(installed_replacements):
                installed = target / name
                if installed.exists() or installed.is_symlink():
                    _remove_path(installed)

            if rollback.exists():
                # Restore only originals that were confirmed moved. Reversing
                # the list makes nested failure diagnostics deterministic.
                for name in reversed(moved_originals):
                    rolled_back = rollback / name
                    if rolled_back.exists() or rolled_back.is_symlink():
                        rolled_back.rename(target / name)
                if rollback.exists() and not any(rollback.iterdir()):
                    rollback.rmdir()
        raise
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("backup", "restore"))
    parser.add_argument("volume_path")
    parser.add_argument("archive_path")
    parser.add_argument("--owner-uid", type=int)
    parser.add_argument("--owner-gid", type=int)
    args = parser.parse_args()

    if args.mode == "backup":
        if args.owner_uid is not None or args.owner_gid is not None:
            parser.error("--owner-uid/--owner-gid apply only to restore")
        backup(args.volume_path, args.archive_path)
    else:
        if args.owner_uid is None or args.owner_gid is None:
            parser.error("restore requires --owner-uid and --owner-gid")
        restore(
            args.volume_path,
            args.archive_path,
            owner_uid=args.owner_uid,
            owner_gid=args.owner_gid,
        )


if __name__ == "__main__":
    main()

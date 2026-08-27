"""Fail-closed initialization for the persistent data directory."""

import os
import sys
from pathlib import Path


MARKER_NAME = ".footprint-data"
MARKER_CONTENT = "footprint-data-v1\n"
MANAGED_DIRECTORY_NAMES = ("db", "uploads", "tmp")
ALLOWED_ENTRY_NAMES = frozenset((*MANAGED_DIRECTORY_NAMES, MARKER_NAME))
DIRECTORY_MODE = 0o700
FILE_MODE = 0o600


class UnsafeDataDirectory(RuntimeError):
    pass


def _validate_data_root(data_root: Path) -> None:
    if data_root.is_symlink() or not data_root.is_dir():
        raise UnsafeDataDirectory(f"Data root is not a real directory: {data_root}")

    for entry in os.scandir(data_root):
        if entry.name not in ALLOWED_ENTRY_NAMES:
            raise UnsafeDataDirectory(
                f"Unexpected top-level entry in data root: {entry.name}"
            )
        if entry.name == MARKER_NAME:
            if not entry.is_file(follow_symlinks=False):
                raise UnsafeDataDirectory("Data directory marker is not a regular file")
            marker_content = Path(entry.path).read_text(encoding="ascii")
            if marker_content != MARKER_CONTENT:
                raise UnsafeDataDirectory("Data directory marker is invalid")
        elif not entry.is_dir(follow_symlinks=False):
            raise UnsafeDataDirectory(
                f"Managed data path is not a real directory: {entry.name}"
            )


def _chown_tree(root: Path, uid: int, gid: int) -> None:
    os.chown(root, uid, gid, follow_symlinks=False)
    os.chmod(root, DIRECTORY_MODE)
    for current_root, directory_names, file_names in os.walk(
        root, topdown=True, followlinks=False
    ):
        current = Path(current_root)
        safe_directories = []
        for name in directory_names:
            path = current / name
            if path.is_symlink():
                continue
            os.chown(path, uid, gid, follow_symlinks=False)
            os.chmod(path, DIRECTORY_MODE)
            safe_directories.append(name)
        directory_names[:] = safe_directories
        for name in file_names:
            path = current / name
            if not path.is_symlink() and path.is_file():
                os.chown(path, uid, gid, follow_symlinks=False)
                os.chmod(path, FILE_MODE)


def initialize_data_root(data_root: Path, uid: int, gid: int) -> None:
    if uid <= 0 or gid <= 0:
        raise UnsafeDataDirectory("PUID and PGID must be positive non-root IDs")

    _validate_data_root(data_root)

    managed_directories = []
    for name in MANAGED_DIRECTORY_NAMES:
        path = data_root / name
        path.mkdir(mode=DIRECTORY_MODE, exist_ok=True)
        managed_directories.append(path)

    marker = data_root / MARKER_NAME
    if not marker.exists():
        descriptor = os.open(
            marker,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            FILE_MODE,
        )
        with os.fdopen(descriptor, "w", encoding="ascii") as marker_file:
            marker_file.write(MARKER_CONTENT)
    os.chmod(marker, FILE_MODE)

    for path in managed_directories:
        _chown_tree(path, uid, gid)


def main() -> int:
    data_root = Path(os.environ.get("FOOTPRINT_DATA_ROOT", "/footprint-data"))
    try:
        uid = int(os.environ.get("PUID", "1000"))
        gid = int(os.environ.get("PGID", "1000"))
        if uid <= 0 or gid <= 0:
            raise ValueError("PUID and PGID must be positive non-root IDs")
        initialize_data_root(data_root, uid, gid)
    except (UnsafeDataDirectory, ValueError, OSError) as exc:
        print(f"Refusing to initialize persistent data directory: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

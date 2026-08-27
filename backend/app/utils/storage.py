import mimetypes
import os
import stat
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import BinaryIO, Iterator

from fastapi.responses import StreamingResponse


FILE_CHUNK_SIZE = 64 * 1024


class UnsafeStoredPath(ValueError):
    pass


class StoredFileUnavailable(OSError):
    pass


def validate_stored_path(value: str) -> str:
    """Validate and canonicalize a path stored relative to the upload root."""
    if not isinstance(value, str) or not value or "\x00" in value:
        raise UnsafeStoredPath("照片存储路径不能为空")

    posix_path = PurePosixPath(value)
    windows_path = PureWindowsPath(value)
    if (
        posix_path.is_absolute()
        or windows_path.is_absolute()
        or bool(windows_path.drive)
        or ".." in posix_path.parts
        or ".." in windows_path.parts
        or "\\" in value
    ):
        raise UnsafeStoredPath("照片存储路径必须是安全的相对路径")

    parts = posix_path.parts
    if not parts or any(part in ("", ".", "..") for part in parts):
        raise UnsafeStoredPath("照片存储路径必须是安全的相对路径")
    return posix_path.as_posix()


@dataclass
class OpenedStoredFile:
    stream: BinaryIO
    size: int
    media_type: str

    def iter_chunks(self) -> Iterator[bytes]:
        remaining = self.size
        try:
            while remaining > 0:
                chunk = self.stream.read(min(FILE_CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk
        finally:
            self.stream.close()


def _supports_secure_dir_fd() -> bool:
    return (
        os.name == "posix"
        and hasattr(os, "O_DIRECTORY")
        and hasattr(os, "O_NOFOLLOW")
        and os.open in os.supports_dir_fd
    )


def _open_posix_parent(root: Path, parts: tuple[str, ...]) -> int:
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
    try:
        current_fd = os.open(root, flags)
        for part in parts[:-1]:
            next_fd = os.open(part, flags, dir_fd=current_fd)
            os.close(current_fd)
            current_fd = next_fd
        return current_fd
    except (OSError, RuntimeError) as exc:
        if "current_fd" in locals():
            os.close(current_fd)
        raise StoredFileUnavailable("照片文件不可用") from exc


def _portable_root(root: Path) -> tuple[Path, os.stat_result]:
    try:
        root_stat = root.lstat()
        is_junction = getattr(root, "is_junction", lambda: False)()
        if (
            stat.S_ISLNK(root_stat.st_mode)
            or is_junction
            or not stat.S_ISDIR(root_stat.st_mode)
        ):
            raise StoredFileUnavailable("照片文件不可用")

        resolved_root = root.resolve(strict=True)
        resolved_stat = resolved_root.lstat()
        if (
            not stat.S_ISDIR(resolved_stat.st_mode)
            or (root_stat.st_dev, root_stat.st_ino)
            != (resolved_stat.st_dev, resolved_stat.st_ino)
        ):
            raise StoredFileUnavailable("照片文件不可用")
        return resolved_root, root_stat
    except (OSError, RuntimeError) as exc:
        if isinstance(exc, StoredFileUnavailable):
            raise
        raise StoredFileUnavailable("照片文件不可用") from exc


def _portable_candidate(root: Path, parts: tuple[str, ...]) -> tuple[Path, os.stat_result]:
    try:
        resolved_root, root_stat = _portable_root(root)
        current = resolved_root
        for index, part in enumerate(parts):
            current = current / part
            item_stat = current.lstat()
            is_junction = getattr(current, "is_junction", lambda: False)()
            if stat.S_ISLNK(item_stat.st_mode) or is_junction:
                raise StoredFileUnavailable("照片文件不可用")
            if index < len(parts) - 1 and not stat.S_ISDIR(item_stat.st_mode):
                raise StoredFileUnavailable("照片文件不可用")

        resolved_file = current.resolve(strict=True)
        if not resolved_file.is_relative_to(resolved_root):
            raise StoredFileUnavailable("照片文件不可用")
        if not stat.S_ISREG(item_stat.st_mode):
            raise StoredFileUnavailable("照片文件不可用")

        current_root_stat = root.lstat()
        is_junction = getattr(root, "is_junction", lambda: False)()
        if (
            stat.S_ISLNK(current_root_stat.st_mode)
            or is_junction
            or not stat.S_ISDIR(current_root_stat.st_mode)
            or (root_stat.st_dev, root_stat.st_ino)
            != (current_root_stat.st_dev, current_root_stat.st_ino)
        ):
            raise StoredFileUnavailable("照片文件不可用")
        return current, item_stat
    except (OSError, RuntimeError) as exc:
        if isinstance(exc, StoredFileUnavailable):
            raise
        raise StoredFileUnavailable("照片文件不可用") from exc


def open_stored_file(root: Path, stored_path: str) -> OpenedStoredFile:
    relative_path = validate_stored_path(stored_path)
    parts = PurePosixPath(relative_path).parts

    if _supports_secure_dir_fd():
        parent_fd = _open_posix_parent(root, parts)
        flags = os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
        file_fd = None
        try:
            file_fd = os.open(parts[-1], flags, dir_fd=parent_fd)
            file_stat = os.fstat(file_fd)
        except OSError as exc:
            if file_fd is not None:
                os.close(file_fd)
            raise StoredFileUnavailable("照片文件不可用") from exc
        finally:
            os.close(parent_fd)
        if not stat.S_ISREG(file_stat.st_mode):
            os.close(file_fd)
            raise StoredFileUnavailable("照片文件不可用")
        stream = os.fdopen(file_fd, "rb", closefd=True)
    else:
        candidate, path_stat = _portable_candidate(root, parts)
        stream = None
        try:
            stream = candidate.open("rb", buffering=0)
            file_stat = os.fstat(stream.fileno())
        except OSError as exc:
            if stream is not None:
                stream.close()
            raise StoredFileUnavailable("照片文件不可用") from exc
        if (
            not stat.S_ISREG(file_stat.st_mode)
            or (path_stat.st_dev, path_stat.st_ino)
            != (file_stat.st_dev, file_stat.st_ino)
        ):
            stream.close()
            raise StoredFileUnavailable("照片文件不可用")

    media_type = mimetypes.guess_type(relative_path)[0] or "application/octet-stream"
    return OpenedStoredFile(stream=stream, size=file_stat.st_size, media_type=media_type)


def stored_file_response(root: Path, stored_path: str) -> StreamingResponse:
    opened = open_stored_file(root, stored_path)
    return StreamingResponse(
        opened.iter_chunks(),
        media_type=opened.media_type,
        headers={
            "Content-Length": str(opened.size),
            "X-Content-Type-Options": "nosniff",
        },
    )


def delete_stored_file(root: Path, stored_path: str) -> None:
    relative_path = validate_stored_path(stored_path)
    parts = PurePosixPath(relative_path).parts

    if _supports_secure_dir_fd():
        parent_fd = _open_posix_parent(root, parts)
        flags = os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
        file_fd = None
        try:
            file_fd = os.open(parts[-1], flags, dir_fd=parent_fd)
            file_stat = os.fstat(file_fd)
            path_stat = os.stat(parts[-1], dir_fd=parent_fd, follow_symlinks=False)
            if (
                not stat.S_ISREG(file_stat.st_mode)
                or not stat.S_ISREG(path_stat.st_mode)
                or (file_stat.st_dev, file_stat.st_ino)
                != (path_stat.st_dev, path_stat.st_ino)
            ):
                raise StoredFileUnavailable("照片文件不可用")
            os.unlink(parts[-1], dir_fd=parent_fd)
        except OSError as exc:
            if isinstance(exc, StoredFileUnavailable):
                raise
            raise StoredFileUnavailable("照片文件不可用") from exc
        finally:
            if file_fd is not None:
                os.close(file_fd)
            os.close(parent_fd)
        return

    candidate, path_stat = _portable_candidate(root, parts)
    try:
        with candidate.open("rb", buffering=0) as stream:
            file_stat = os.fstat(stream.fileno())
            if (
                not stat.S_ISREG(file_stat.st_mode)
                or (path_stat.st_dev, path_stat.st_ino)
                != (file_stat.st_dev, file_stat.st_ino)
            ):
                raise StoredFileUnavailable("照片文件不可用")

        # Windows normally denies unlinking an open file. Re-check the path
        # identity after closing the verified handle before removing it.
        current_stat = candidate.lstat()
        is_junction = getattr(candidate, "is_junction", lambda: False)()
        if (
            stat.S_ISLNK(current_stat.st_mode)
            or is_junction
            or not stat.S_ISREG(current_stat.st_mode)
            or (current_stat.st_dev, current_stat.st_ino)
            != (file_stat.st_dev, file_stat.st_ino)
        ):
            raise StoredFileUnavailable("照片文件不可用")
        candidate.unlink()
    except OSError as exc:
        if isinstance(exc, StoredFileUnavailable):
            raise
        raise StoredFileUnavailable("照片文件不可用") from exc

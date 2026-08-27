from pathlib import Path

import pytest

from app.models.user import User  # noqa: F401
from app.models.trip import Trip  # noqa: F401
from app.models.location import Location  # noqa: F401
from app.models.photo import Photo
from app.models.share import Share  # noqa: F401
from app.utils.storage import (
    StoredFileUnavailable,
    delete_stored_file,
    open_stored_file,
)


def _photo_with_path(field: str, value: str) -> Photo:
    values = {
        "location_id": 1,
        "original_path": "original.jpg",
        "thumbnail_path": "thumbnail.jpg",
        "file_name": "photo.jpg",
        "file_size": 10,
    }
    values[field] = value
    return Photo(**values)


@pytest.mark.unit
@pytest.mark.parametrize("field", ["original_path", "thumbnail_path"])
@pytest.mark.parametrize(
    "unsafe_path",
    [
        "/etc/passwd",
        "../secret.jpg",
        "nested/../../secret.jpg",
        r"C:\Windows\system.ini",
        r"nested\..\secret.jpg",
    ],
)
def test_photo_model_rejects_unsafe_stored_paths(field, unsafe_path):
    with pytest.raises(ValueError, match="照片存储路径"):
        _photo_with_path(field, unsafe_path)


@pytest.mark.unit
def test_photo_model_accepts_safe_relative_stored_paths():
    photo = _photo_with_path("original_path", "legacy/photo.jpg")

    assert photo.original_path == "legacy/photo.jpg"


def _symlink_to_directory(link: Path, target: Path) -> None:
    try:
        link.symlink_to(target, target_is_directory=True)
    except (OSError, NotImplementedError) as exc:
        pytest.skip(f"当前平台不支持目录符号链接测试: {exc}")


@pytest.mark.unit
def test_open_rejects_symbolic_link_upload_root(tmp_path):
    outside_root = tmp_path / "outside"
    outside_root.mkdir()
    (outside_root / "photo.jpg").write_bytes(b"outside")
    linked_root = tmp_path / "uploads"
    _symlink_to_directory(linked_root, outside_root)

    with pytest.raises(StoredFileUnavailable, match="照片文件不可用"):
        open_stored_file(linked_root, "photo.jpg")


@pytest.mark.unit
def test_delete_rejects_symbolic_link_upload_root(tmp_path):
    outside_root = tmp_path / "outside"
    outside_root.mkdir()
    outside_photo = outside_root / "photo.jpg"
    outside_photo.write_bytes(b"keep me")
    linked_root = tmp_path / "uploads"
    _symlink_to_directory(linked_root, outside_root)

    with pytest.raises(StoredFileUnavailable, match="照片文件不可用"):
        delete_stored_file(linked_root, "photo.jpg")

    assert outside_photo.read_bytes() == b"keep me"

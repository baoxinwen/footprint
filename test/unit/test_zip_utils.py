import asyncio
import os
import time
import zipfile
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.utils.zip_utils import (
    add_photos_to_zip,
    cleanup_stale_temp_zips,
    new_temp_zip_path,
    remove_temp_file,
)


@pytest.mark.unit
def test_new_temp_zip_path_uses_configured_export_directory(tmp_path, monkeypatch):
    export_dir = tmp_path / "export-tmp"
    monkeypatch.setattr(settings, "EXPORT_TMP_DIR", export_dir, raising=False)

    temp_path = new_temp_zip_path()
    try:
        assert temp_path.parent == export_dir
        assert temp_path.exists()
    finally:
        remove_temp_file(temp_path)


@pytest.mark.unit
def test_cleanup_stale_temp_zips_only_removes_old_owned_regular_files(
    tmp_path, monkeypatch
):
    export_dir = tmp_path / "export-tmp"
    export_dir.mkdir()
    monkeypatch.setattr(settings, "EXPORT_TMP_DIR", export_dir, raising=False)
    monkeypatch.setattr(
        settings, "EXPORT_TMP_MAX_AGE_SECONDS", 60 * 60, raising=False
    )

    stale_owned = export_dir / "footprint-export-stale.zip"
    fresh_owned = export_dir / "footprint-export-fresh.zip"
    stale_other_prefix = export_dir / "other-export-stale.zip"
    stale_other_suffix = export_dir / "footprint-export-stale.txt"
    matching_directory = export_dir / "footprint-export-directory.zip"

    for path in (stale_owned, fresh_owned, stale_other_prefix, stale_other_suffix):
        path.write_bytes(b"zip")
    matching_directory.mkdir()

    old = time.time() - settings.EXPORT_TMP_MAX_AGE_SECONDS - 1
    for path in (stale_owned, stale_other_prefix, stale_other_suffix, matching_directory):
        os.utime(path, (old, old))

    protected_symlink = export_dir / "footprint-export-link.zip"
    symlink_created = False
    try:
        protected_symlink.symlink_to(stale_owned)
        os.utime(protected_symlink, (old, old), follow_symlinks=False)
        symlink_created = True
    except (OSError, NotImplementedError):
        pass

    removed = cleanup_stale_temp_zips(now=time.time())

    assert removed == 1
    assert not stale_owned.exists()
    assert fresh_owned.exists()
    assert stale_other_prefix.exists()
    assert stale_other_suffix.exists()
    assert matching_directory.exists()
    if symlink_created:
        assert protected_symlink.is_symlink()


@pytest.mark.unit
def test_lifespan_runs_export_temp_janitor(tmp_path, monkeypatch):
    import app.main as main_module

    export_dir = tmp_path / "export-tmp"
    export_dir.mkdir()
    stale_owned = export_dir / "footprint-export-abandoned.zip"
    stale_owned.write_bytes(b"zip")
    old = time.time() - 61
    os.utime(stale_owned, (old, old))

    monkeypatch.setattr(settings, "EXPORT_TMP_DIR", export_dir, raising=False)
    monkeypatch.setattr(settings, "EXPORT_TMP_MAX_AGE_SECONDS", 60, raising=False)
    monkeypatch.setattr(main_module, "run_startup_migrations", lambda: None)

    async def run_lifespan():
        async with main_module.lifespan(main_module.app):
            assert not stale_owned.exists()

    asyncio.run(run_lifespan())


@pytest.mark.unit
def test_add_photos_to_zip_skips_file_outside_upload_root(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    outside_file = tmp_path / "outside.jpg"
    outside_file.write_bytes(b"private")
    monkeypatch.setattr(settings, "UPLOAD_DIR", upload_dir)
    photo = SimpleNamespace(
        id=1,
        original_path=str(outside_file.resolve()),
        file_name="outside.jpg",
    )
    location = SimpleNamespace(name="地点", photos=[photo])
    archive_path = tmp_path / "export.zip"

    with zipfile.ZipFile(archive_path, "w") as archive:
        skipped = add_photos_to_zip(archive, [location], "旅行")

    with zipfile.ZipFile(archive_path) as archive:
        assert archive.namelist() == []
    assert skipped == 1


@pytest.mark.unit
def test_add_photos_to_zip_skips_non_regular_file(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    (upload_dir / "directory.jpg").mkdir()
    monkeypatch.setattr(settings, "UPLOAD_DIR", upload_dir)
    photo = SimpleNamespace(
        id=1,
        original_path="directory.jpg",
        file_name="directory.jpg",
    )
    location = SimpleNamespace(name="地点", photos=[photo])
    archive_path = tmp_path / "export.zip"

    with zipfile.ZipFile(archive_path, "w") as archive:
        skipped = add_photos_to_zip(archive, [location], "旅行")

    with zipfile.ZipFile(archive_path) as archive:
        assert archive.namelist() == []
    assert skipped == 1

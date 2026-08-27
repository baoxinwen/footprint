"""ZIP 导出工具函数，消除 account.py 和 export_import.py 的重复逻辑。"""
import zipfile
import logging
import os
import tempfile
import time
from pathlib import Path

from app.core.config import settings
from app.utils.storage import StoredFileUnavailable, UnsafeStoredPath, open_stored_file

logger = logging.getLogger(__name__)

EXPORT_TEMP_PREFIX = "footprint-export-"
EXPORT_TEMP_SUFFIX = ".zip"


def new_temp_zip_path() -> Path:
    export_tmp_dir = settings.EXPORT_TMP_DIR
    export_tmp_dir.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        prefix=EXPORT_TEMP_PREFIX,
        suffix=EXPORT_TEMP_SUFFIX,
        dir=export_tmp_dir,
        delete=False,
    )
    path = Path(handle.name)
    handle.close()
    return path


def remove_temp_file(path: Path) -> None:
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def cleanup_stale_temp_zips(*, now: float | None = None) -> int:
    """Remove abandoned export ZIPs without touching unrelated or active files."""
    cutoff = (
        (time.time() if now is None else now)
        - settings.EXPORT_TMP_MAX_AGE_SECONDS
    )
    removed = 0
    try:
        with os.scandir(settings.EXPORT_TMP_DIR) as iterator:
            entries = list(iterator)
    except FileNotFoundError:
        return 0
    except OSError as exc:
        logger.warning("Unable to scan export temporary directory: %s", exc)
        return 0

    for entry in entries:
        if not (
            entry.name.startswith(EXPORT_TEMP_PREFIX)
            and entry.name.endswith(EXPORT_TEMP_SUFFIX)
        ):
            continue
        try:
            if not entry.is_file(follow_symlinks=False):
                continue
            if entry.stat(follow_symlinks=False).st_mtime >= cutoff:
                continue
            os.unlink(entry.path)
            removed += 1
        except FileNotFoundError:
            continue
        except OSError as exc:
            logger.warning(
                "Unable to remove stale export temporary file %s: %s",
                entry.path,
                exc,
            )
    return removed


def add_photos_to_zip(
    zf: zipfile.ZipFile,
    locations: list,
    parent_name: str,
) -> int:
    """将地点照片添加到 ZIP 文件中。

    Args:
        zf: 目标 ZIP 文件
        locations: 地点列表（需含 photos 属性）
        parent_name: 父级名称（旅行标题），用于构建路径

    Returns:
        因大小限制跳过的照片数量
    """
    total_size = _get_zip_size(zf)
    skipped = 0
    for loc in locations:
        if not loc.photos:
            continue
        for photo in loc.photos:
            try:
                opened = open_stored_file(settings.UPLOAD_DIR, photo.original_path)
            except (StoredFileUnavailable, UnsafeStoredPath):
                skipped += 1
                logger.warning("跳过不安全或不存在的照片: %s", photo.file_name)
                continue
            file_size = opened.size
            estimated_entry_size = file_size + 128
            if total_size + estimated_entry_size > settings.MAX_ZIP_SIZE:
                opened.stream.close()
                skipped += 1
                logger.warning(f"导出大小超限，跳过照片: {photo.file_name}")
                continue
            try:
                with zf.open(photo_archive_path(parent_name, loc, photo), "w") as target:
                    for chunk in opened.iter_chunks():
                        target.write(chunk)
            finally:
                if not opened.stream.closed:
                    opened.stream.close()
            total_size += estimated_entry_size

    return skipped


def photo_archive_path(parent_name: str, location, photo) -> str:
    """Return the canonical, collision-resistant photo path in an export."""
    safe_parent = _sanitize(parent_name)
    safe_location = _sanitize(location.name)
    safe_file = _sanitize(photo.file_name)
    return f"photos/{safe_parent}/{safe_location}/{photo.id}_{safe_file}"


def build_export_headers(filename: str, skipped_photos: int = 0) -> dict:
    """构建导出文件的响应头。"""
    from urllib.parse import quote
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    if skipped_photos > 0:
        headers["X-Skipped-Photos"] = str(skipped_photos)
    return headers


def _sanitize(name: str) -> str:
    """清理文件名中的特殊字符。

    除路径分隔符外，还过滤 Windows 保留字符与控制字符，
    保证导出 ZIP 在各平台解压工具下的兼容性。
    """
    sanitized = name.replace("/", "_").replace("\\", "_").replace("..", "_")
    # Windows 保留字符（冒号会落入 NTFS ADS）与不可见控制字符
    for char in '<>:"|?*':
        sanitized = sanitized.replace(char, "_")
    sanitized = "".join("_" if ord(ch) < 32 else ch for ch in sanitized)
    return sanitized.strip() or "_"


def _get_zip_size(zf: zipfile.ZipFile) -> int:
    """获取 ZIP 文件当前大小。"""
    pos = zf.fp.tell()
    zf.fp.seek(0, 2)
    size = zf.fp.tell()
    zf.fp.seek(pos)
    return size

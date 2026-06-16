"""ZIP 导出工具函数，消除 account.py 和 export_import.py 的重复逻辑。"""
import io
import zipfile
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


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
    safe_parent = _sanitize(parent_name)

    for loc in locations:
        if not loc.photos:
            continue
        safe_loc = _sanitize(loc.name)
        for photo in loc.photos:
            photo_path = settings.UPLOAD_DIR / photo.original_path
            if not photo_path.exists():
                continue
            file_size = photo_path.stat().st_size
            estimated_entry_size = file_size + 128
            if total_size + estimated_entry_size > settings.MAX_ZIP_SIZE:
                skipped += 1
                logger.warning(f"导出大小超限，跳过照片: {photo.file_name}")
                continue
            safe_file = _sanitize(photo.file_name)
            zf.write(photo_path, f"photos/{safe_parent}/{safe_loc}/{safe_file}")
            total_size += estimated_entry_size

    return skipped


def build_export_headers(filename: str, skipped_photos: int = 0) -> dict:
    """构建导出文件的响应头。"""
    from urllib.parse import quote
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    if skipped_photos > 0:
        headers["X-Skipped-Photos"] = str(skipped_photos)
    return headers


def _sanitize(name: str) -> str:
    """清理文件名中的特殊字符。"""
    return name.replace("/", "_").replace("\\", "_").replace("..", "_")


def _get_zip_size(zf: zipfile.ZipFile) -> int:
    """获取 ZIP 文件当前大小。"""
    pos = zf.fp.tell()
    zf.fp.seek(0, 2)
    size = zf.fp.tell()
    zf.fp.seek(pos)
    return size

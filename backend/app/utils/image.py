import uuid
import logging

from PIL import Image, ImageOps

from app.core.config import settings
from app.utils.storage import StoredFileUnavailable, UnsafeStoredPath, delete_stored_file

Image.MAX_IMAGE_PIXELS = settings.MAX_IMAGE_PIXELS

logger = logging.getLogger(__name__)

# 扩展名 → Pillow 实际格式：内容与扩展名不符时拒绝（评审 M-11），
# 否则会以错误的 Content-Type 入库，TIFF 等浏览器不支持的格式原图打不开
_EXPECTED_FORMATS = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "gif": "GIF", "webp": "WEBP"}


def validate_image(file_bytes: bytes) -> bool:
    try:
        from io import BytesIO
        img = Image.open(BytesIO(file_bytes))
        img.verify()
        # Re-open after verify (verify invalidates the image)
        img = Image.open(BytesIO(file_bytes))
        if img.width * img.height > settings.MAX_IMAGE_PIXELS:
            return False
        return True
    except Exception:
        return False


def save_image(file_bytes: bytes, original_filename: str) -> dict:
    if len(file_bytes) > settings.MAX_FILE_SIZE:
        raise ValueError("文件大小超过限制")

    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "jpg"
    # 严格验证扩展名在允许列表中，不再自动推断
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的文件格式: {ext}，允许的格式: {', '.join(settings.ALLOWED_EXTENSIONS)}")
    expected_format = _EXPECTED_FORMATS[ext]

    file_id = uuid.uuid4().hex
    original_name = f"{file_id}.{ext}"
    thumbnail_name = f"{file_id}_thumb.jpg"

    upload_dir = settings.UPLOAD_DIR
    upload_dir.mkdir(parents=True, exist_ok=True)

    original_path = upload_dir / original_name
    thumbnail_path = upload_dir / thumbnail_name

    original_path.write_bytes(file_bytes)

    # Generate thumbnail
    try:
        from io import BytesIO
        img = Image.open(BytesIO(file_bytes))
        if (img.format or "") != expected_format:
            raise ValueError(
                f"文件内容与扩展名不符: 应为 {expected_format}，实际为 {img.format or '未知'}"
            )
        if hasattr(img, "n_frames") and img.n_frames > 1:
            img.seek(0)
        # 按 EXIF 方向标签摆正后再缩放（评审 I-5）：手机竖拍的原图按传感器
        # 方向存储，浏览器显示原图时会摆正，缩略图不摆正就会横置/倒置
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        width = settings.THUMBNAIL_WIDTH
        ratio = width / img.width
        # max(1,...) 兜底极端宽高比（如 600x1）：int 截断取 0 会让 resize 抛 ValueError
        height = max(1, int(img.height * ratio))
        thumb = img.resize((width, height), Image.LANCZOS)
    except ValueError:
        # 输入校验类失败（扩展名不符等）：清理半成品后按 400 透出
        _cleanup_partial_upload(original_path, thumbnail_path)
        raise
    except Exception as exc:
        # Pillow 能识别文件头但解码失败（截断/损坏，OSError）——
        # 属用户输入问题，映射为 400 而不是未捕获的 500（评审 M-9）
        _cleanup_partial_upload(original_path, thumbnail_path)
        raise ValueError("照片文件已损坏，无法解码") from exc

    try:
        thumb.save(thumbnail_path, "JPEG", quality=settings.THUMBNAIL_QUALITY)
    except Exception:
        # 缩略图写盘失败（磁盘满等基础设施错误）不是用户输入问题，
        # 清理半成品后按原样透出（500），日志里保留真实原因
        logger.exception("缩略图写盘失败")
        _cleanup_partial_upload(original_path, thumbnail_path)
        raise

    return {
        "original_path": original_name,
        "thumbnail_path": thumbnail_name,
    }


def _cleanup_partial_upload(original_path, thumbnail_path) -> None:
    """清理已落盘的原图与半成品缩略图，避免产生无法通过 API 清除的孤儿文件。"""
    for stale_path in (original_path, thumbnail_path):
        try:
            if stale_path.exists():
                stale_path.unlink()
        except OSError as cleanup_error:
            logger.warning(f"清理上传失败文件出错: {stale_path}, 错误: {cleanup_error}")


def delete_image_files(original_path: str, thumbnail_path: str):
    upload_dir = settings.UPLOAD_DIR
    for stored_path in [original_path, thumbnail_path]:
        try:
            delete_stored_file(upload_dir, stored_path)
        except (StoredFileUnavailable, UnsafeStoredPath) as e:
            logger.warning(f"拒绝删除不安全或不存在的照片文件 {stored_path}: {e}")

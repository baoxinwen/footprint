import uuid
import logging

from PIL import Image

from app.core.config import settings

Image.MAX_IMAGE_PIXELS = settings.MAX_IMAGE_PIXELS

logger = logging.getLogger(__name__)


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
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "jpg"
    # 严格验证扩展名在允许列表中，不再自动推断
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的文件格式: {ext}，允许的格式: {', '.join(settings.ALLOWED_EXTENSIONS)}")

    file_id = uuid.uuid4().hex
    original_name = f"{file_id}.{ext}"
    thumbnail_name = f"{file_id}_thumb.jpg"

    upload_dir = settings.UPLOAD_DIR
    upload_dir.mkdir(parents=True, exist_ok=True)

    original_path = upload_dir / original_name
    thumbnail_path = upload_dir / thumbnail_name

    original_path.write_bytes(file_bytes)

    # Generate thumbnail
    from io import BytesIO
    img = Image.open(BytesIO(file_bytes))
    if hasattr(img, "n_frames") and img.n_frames > 1:
        img.seek(0)
    img = img.convert("RGB")
    width = settings.THUMBNAIL_WIDTH
    ratio = width / img.width
    height = int(img.height * ratio)
    thumb = img.resize((width, height), Image.LANCZOS)
    thumb.save(thumbnail_path, "JPEG", quality=settings.THUMBNAIL_QUALITY)

    return {
        "original_path": original_name,
        "thumbnail_path": thumbnail_name,
    }


def delete_image_files(original_path: str, thumbnail_path: str):
    upload_dir = settings.UPLOAD_DIR
    for p in [upload_dir / original_path, upload_dir / thumbnail_path]:
        try:
            if p.exists():
                p.unlink()
        except Exception as e:
            logger.warning(f"删除文件失败 {p}: {e}")

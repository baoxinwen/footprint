import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.core.config import settings
from app.models.location import Location
from app.models.trip import Trip
from app.models.photo import Photo
from app.schemas.photo import PhotoResponse
from app.utils.image import validate_image, save_image, delete_image_files
from app.utils.upload import UploadSizeExceeded, read_upload_limited
from app.utils.storage import StoredFileUnavailable, UnsafeStoredPath, stored_file_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/photos", tags=["照片管理"])


def _photo_response(photo: Photo) -> PhotoResponse:
    return PhotoResponse(
        id=photo.id,
        location_id=photo.location_id,
        original_url=f"/api/photos/{photo.id}/original",
        thumbnail_url=f"/api/photos/{photo.id}/thumbnail",
        file_name=photo.file_name,
        file_size=photo.file_size,
        created_at=photo.created_at.isoformat(),
    )


@router.post("/upload/{location_id}", status_code=201)
async def upload_photo(
    location_id: int,
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # Verify location belongs to user
    location = db.query(Location).join(Trip).filter(
        Location.id == location_id,
        Trip.user_id == user_id,
    ).first()
    if not location:
        logger.warning(f"照片上传失败: 地点不存在 (location_id: {location_id}, user_id: {user_id})")
        raise HTTPException(status_code=404, detail="地点不存在")

    # Validate file size
    try:
        file_bytes = await read_upload_limited(file, settings.MAX_FILE_SIZE)
    except UploadSizeExceeded:
        logger.warning(f"照片上传失败: 文件超过限制 ({settings.MAX_FILE_SIZE} bytes)")
        raise HTTPException(status_code=400, detail="文件大小超过 10MB 限制")

    # Validate file type
    if not validate_image(file_bytes):
        logger.warning(f"照片上传失败: 非法图片格式 (filename: {file.filename})")
        raise HTTPException(status_code=400, detail="不是合法的图片文件")

    # Save
    paths = save_image(file_bytes, file.filename or "photo.jpg")

    photo = Photo(
        location_id=location_id,
        original_path=paths["original_path"],
        thumbnail_path=paths["thumbnail_path"],
        file_name=file.filename or "photo.jpg",
        file_size=len(file_bytes),
    )
    db.add(photo)
    try:
        db.flush()
        db.commit()
    except SQLAlchemyError:
        # 数据库写入失败时清理已落盘的文件，避免孤儿文件
        db.rollback()
        try:
            delete_image_files(paths["original_path"], paths["thumbnail_path"])
        except Exception as cleanup_error:
            logger.warning(
                f"回滚后清理照片文件失败: {paths['original_path']}, {paths['thumbnail_path']}, 错误: {cleanup_error}"
            )
        logger.exception("照片数据库记录写入失败")
        raise HTTPException(status_code=500, detail="照片保存失败，请稍后重试")
    db.refresh(photo)

    return _photo_response(photo)


@router.get("/{photo_id}/original")
def get_original(
    photo_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    photo = db.query(Photo).join(Location).join(Trip).filter(
        Photo.id == photo_id,
        Trip.user_id == user_id,
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")
    try:
        return stored_file_response(settings.UPLOAD_DIR, photo.original_path)
    except (StoredFileUnavailable, UnsafeStoredPath):
        raise HTTPException(status_code=404, detail="文件不存在")


@router.get("/{photo_id}/thumbnail")
def get_thumbnail(
    photo_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    photo = db.query(Photo).join(Location).join(Trip).filter(
        Photo.id == photo_id,
        Trip.user_id == user_id,
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")
    try:
        return stored_file_response(settings.UPLOAD_DIR, photo.thumbnail_path)
    except (StoredFileUnavailable, UnsafeStoredPath):
        raise HTTPException(status_code=404, detail="文件不存在")


@router.delete("/{photo_id}")
def delete_photo(
    photo_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    photo = db.query(Photo).join(Location).join(Trip).filter(
        Photo.id == photo_id,
        Trip.user_id == user_id,
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")

    # 先提交数据库删除，成功后再删物理文件：即使后续删文件失败，
    # 也只是留下无记录的孤儿文件（可清扫），不会出现指向缺失文件的活记录
    original_path = photo.original_path
    thumbnail_path = photo.thumbnail_path

    db.delete(photo)
    db.commit()

    try:
        delete_image_files(original_path, thumbnail_path)
    except Exception as e:
        logger.warning(f"删除照片文件失败: {original_path}, {thumbnail_path}, 错误: {e}")
    return {"message": "删除成功"}


@router.get("/location/{location_id}")
def list_photos(
    location_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    location = db.query(Location).join(Trip).filter(
        Location.id == location_id,
        Trip.user_id == user_id,
    ).first()
    if not location:
        raise HTTPException(status_code=404, detail="地点不存在")

    return [_photo_response(p) for p in location.photos]

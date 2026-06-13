from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.core.config import settings
from app.models.location import Location
from app.models.trip import Trip
from app.models.photo import Photo
from app.schemas.photo import PhotoResponse
from app.utils.image import validate_image, save_image, delete_image_files

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
        raise HTTPException(status_code=404, detail="地点不存在")

    # Validate file size
    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过 10MB 限制")

    # Validate file type
    if not validate_image(file_bytes):
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
    db.flush()
    db.commit()
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
    path = settings.UPLOAD_DIR / photo.original_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(path)


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
    path = settings.UPLOAD_DIR / photo.thumbnail_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(path)


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

    delete_image_files(photo.original_path, photo.thumbnail_path)
    db.delete(photo)
    db.commit()
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

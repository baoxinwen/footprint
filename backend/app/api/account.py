import json
import io
import zipfile
import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.core.config import settings
from app.models.user import User
from app.models.trip import Trip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["账号"])


@router.get("/info")
def get_account_info(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {
        "id": user.id,
        "username": user.username,
        "created_at": user.created_at.isoformat(),
    }


@router.get("/export/all")
def export_all(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trips = db.query(Trip).filter(Trip.user_id == user_id).order_by(Trip.start_date).all()

    trips_data = []
    for trip in trips:
        locations = sorted(trip.locations, key=lambda l: l.sort_order)
        trips_data.append({
            "title": trip.title,
            "description": trip.description,
            "startDate": trip.start_date.isoformat(),
            "endDate": trip.end_date.isoformat(),
            "locations": [
                {
                    "name": l.name,
                    "address": l.address,
                    "longitude": l.longitude,
                    "latitude": l.latitude,
                    "city": l.city,
                    "province": l.province,
                    "note": l.note,
                }
                for l in locations
            ],
        })

    content = json.dumps(trips_data, ensure_ascii=False, indent=2)
    filename = quote("足迹数据备份.json")
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.get("/export/all-with-photos")
def export_all_with_photos(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trips = db.query(Trip).filter(Trip.user_id == user_id).order_by(Trip.start_date).all()

    trips_data = []
    zip_buffer = io.BytesIO()

    # 添加大小限制，与 export_markdown 保持一致
    MAX_ZIP_SIZE = 500 * 1024 * 1024  # 500MB
    total_size = 0
    skipped_photos = 0

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for trip in trips:
            locations = sorted(trip.locations, key=lambda l: l.sort_order)
            trips_data.append({
                "title": trip.title,
                "description": trip.description,
                "startDate": trip.start_date.isoformat(),
                "endDate": trip.end_date.isoformat(),
                "locations": [
                    {
                        "name": l.name,
                        "address": l.address,
                        "longitude": l.longitude,
                        "latitude": l.latitude,
                        "city": l.city,
                        "province": l.province,
                        "note": l.note,
                    }
                    for l in locations
                ],
            })

            # Add photos to zip with size limit
            for loc in locations:
                if loc.photos:
                    safe_trip = trip.title.replace("/", "_").replace("\\", "_")
                    safe_loc = loc.name.replace("/", "_").replace("\\", "_")
                    for photo in loc.photos:
                        photo_path = settings.UPLOAD_DIR / photo.original_path
                        if photo_path.exists():
                            file_size = photo_path.stat().st_size
                            if total_size + file_size > MAX_ZIP_SIZE:
                                skipped_photos += 1
                                logger.warning(f"导出大小超限，跳过照片: {photo.file_name}")
                                continue
                            zf.write(photo_path, f"photos/{safe_trip}/{safe_loc}/{photo.file_name}")
                            total_size += file_size

        zf.writestr("data.json", json.dumps(trips_data, ensure_ascii=False, indent=2))

    zip_buffer.seek(0)
    filename = quote("足迹数据备份.zip")

    response_headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"}
    if skipped_photos > 0:
        response_headers["X-Skipped-Photos"] = str(skipped_photos)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers=response_headers,
    )

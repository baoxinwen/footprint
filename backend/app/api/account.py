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
from app.models.user import User
from app.models.trip import Trip
from app.utils.zip_utils import add_photos_to_zip, build_export_headers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["账号"])


def _trip_to_export_dict(trip: Trip) -> dict:
    """将旅行转换为导出用的字典。"""
    return {
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
            for l in sorted(trip.locations, key=lambda l: l.sort_order)
        ],
    }


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
    trips_data = [_trip_to_export_dict(t) for t in trips]

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
    total_skipped = 0

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for trip in trips:
            locations = sorted(trip.locations, key=lambda l: l.sort_order)
            trips_data.append(_trip_to_export_dict(trip))
            total_skipped += add_photos_to_zip(zf, locations, trip.title)

        zf.writestr("data.json", json.dumps(trips_data, ensure_ascii=False, indent=2))

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers=build_export_headers(quote("足迹数据备份.zip"), total_skipped),
    )

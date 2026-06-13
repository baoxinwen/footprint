from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.trip import Trip
from app.models.location import Location
from app.utils.escape import escape_like

router = APIRouter(prefix="/api/search", tags=["搜索"])


@router.get("")
def search(
    q: str = Query(..., min_length=1, max_length=100),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """全局搜索：匹配旅行标题/描述、地点名称/地址/城市。"""
    pattern = f"%{escape_like(q)}%"

    # Search trips
    trips = (
        db.query(Trip)
        .filter(
            Trip.user_id == user_id,
            or_(
                Trip.title.ilike(pattern, escape='\\'),
                Trip.description.ilike(pattern, escape='\\'),
            ),
        )
        .limit(20)
        .all()
    )

    # Search locations
    locations = (
        db.query(Location)
        .join(Trip)
        .filter(
            Trip.user_id == user_id,
            or_(
                Location.name.ilike(pattern, escape='\\'),
                Location.address.ilike(pattern, escape='\\'),
                Location.city.ilike(pattern, escape='\\'),
            ),
        )
        .limit(20)
        .all()
    )

    return {
        "trips": [
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "start_date": t.start_date.isoformat(),
                "end_date": t.end_date.isoformat(),
            }
            for t in trips
        ],
        "locations": [
            {
                "id": l.id,
                "name": l.name,
                "address": l.address,
                "city": l.city,
                "province": l.province,
                "trip_id": l.trip_id,
                "trip_title": l.trip.title,
            }
            for l in locations
        ],
    }

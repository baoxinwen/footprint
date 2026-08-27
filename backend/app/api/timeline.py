from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.trip import Trip
from app.utils.trip_view import cover_photo_ids, cover_photo_url, trip_cities

router = APIRouter(prefix="/api/timeline", tags=["时间线"])


@router.get("")
def get_timeline(
    limit: int | None = Query(default=None, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # 默认不分页：PRD 要求时间线展示全部旅行，分组必须基于完整集合，
    # 否则跨页的同一月份会被拆散、月度计数失真。limit 仅保留给未来按需加载。
    query = (
        db.query(Trip)
        .filter(Trip.user_id == user_id)
        .order_by(Trip.start_date.desc(), Trip.id.desc())
    )
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    trips = query.all()
    covers = cover_photo_ids(db, [trip.id for trip in trips])

    groups: dict[str, list[dict]] = defaultdict(list)
    for trip in trips:
        cover_photo_id = covers.get(trip.id)
        groups[f"{trip.start_date.year}-{trip.start_date.month:02d}"].append({
            "id": trip.id,
            "title": trip.title,
            "description": trip.description,
            "start_date": trip.start_date.isoformat(),
            "end_date": trip.end_date.isoformat(),
            "cities": trip_cities(trip),
            "cover_photo_id": cover_photo_id,
            "cover_photo_url": cover_photo_url(cover_photo_id),
        })

    result = []
    for key in sorted(groups.keys(), reverse=True):
        year, month = key.split("-")
        result.append({
            "year": int(year),
            "month": int(month),
            "label": f"{year}年{int(month)}月",
            "count": len(groups[key]),
            "trips": groups[key],
        })

    return result

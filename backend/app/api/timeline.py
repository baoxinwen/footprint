from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.trip import Trip

router = APIRouter(prefix="/api/timeline", tags=["时间线"])


@router.get("")
def get_timeline(
    limit: int = Query(50, ge=1),
    offset: int = Query(0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trips = (
        db.query(Trip)
        .filter(Trip.user_id == user_id)
        .order_by(Trip.start_date.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    groups: dict[str, list] = defaultdict(list)
    for trip in trips:
        key = f"{trip.start_date.year}-{trip.start_date.month:02d}"
        groups[key].append({
            "id": trip.id,
            "title": trip.title,
            "description": trip.description,
            "start_date": trip.start_date.isoformat(),
            "end_date": trip.end_date.isoformat(),
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

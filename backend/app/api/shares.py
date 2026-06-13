import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.core.config import settings
from app.models.share import Share
from app.models.trip import Trip
from app.schemas.share import ShareResponse

router = APIRouter(prefix="/api/shares", tags=["分享"])


@router.post("/{trip_id}", response_model=ShareResponse)
def create_share(
    trip_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    # Reuse existing valid share
    existing = db.query(Share).filter(
        Share.trip_id == trip_id,
        Share.expires_at > datetime.now(timezone.utc),
    ).first()
    if existing:
        return ShareResponse(
            token=existing.token,
            url=f"/share/{existing.token}",
            expires_at=existing.expires_at.isoformat(),
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.SHARE_EXPIRE_DAYS)

    share = Share(trip_id=trip_id, token=token, expires_at=expires_at)
    db.add(share)
    db.flush()
    db.commit()
    db.refresh(share)

    return ShareResponse(
        token=share.token,
        url=f"/share/{share.token}",
        expires_at=share.expires_at.isoformat(),
    )


@router.get("/view/{token}")
def view_share(token: str, db: Session = Depends(get_db)):
    share = db.query(Share).filter(Share.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="分享链接不存在")

    # SQLite 存储 naive datetime，统一使用 naive UTC 时间比较
    now_utc = datetime.now(timezone.utc)
    now = now_utc.replace(tzinfo=None) if share.expires_at.tzinfo is None else now_utc
    if share.expires_at < now:
        raise HTTPException(status_code=410, detail="分享链接已过期")

    trip = db.get(Trip, share.trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="旅行已被删除")

    from app.api.trips import _trip_to_response, _location_to_response
    from app.schemas.trip import TripDetailResponse

    locations = sorted(trip.locations, key=lambda l: l.sort_order)
    return TripDetailResponse(
        id=trip.id,
        title=trip.title,
        description=trip.description,
        start_date=trip.start_date,
        end_date=trip.end_date,
        created_at=trip.created_at.isoformat(),
        updated_at=trip.updated_at.isoformat(),
        locations=[_location_to_response(l) for l in locations],
    )

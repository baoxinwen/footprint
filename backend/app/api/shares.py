import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.core.config import settings
from app.models.share import Share
from app.models.trip import Trip
from app.models.location import Location
from app.models.photo import Photo
from app.schemas.photo import PhotoResponse
from app.schemas.share import ShareListResponse, ShareResponse
from app.utils.storage import StoredFileUnavailable, UnsafeStoredPath, stored_file_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/shares", tags=["分享"])


def _is_expired(share: Share) -> bool:
    now_utc = datetime.now(timezone.utc)
    now = now_utc.replace(tzinfo=None) if share.expires_at.tzinfo is None else now_utc
    return share.expires_at < now


def _get_valid_share(db: Session, token: str) -> Share:
    share = db.query(Share).filter(Share.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="分享链接不存在")
    if _is_expired(share):
        raise HTTPException(status_code=410, detail="分享链接已过期")
    return share


def _create_share_record(db: Session, trip_id: int) -> Share:
    share = Share(
        trip_id=trip_id,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.SHARE_EXPIRE_DAYS),
    )
    db.add(share)
    db.flush()
    return share


def _utc_isoformat(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat()


def _share_response(share: Share) -> ShareResponse:
    return ShareResponse(
        token=share.token,
        url=f"/share/{share.token}",
        expires_at=_utc_isoformat(share.expires_at),
    )


def _shared_photo_url(token: str, photo_id: int, variant: str) -> str:
    return f"/api/shares/view/{token}/photos/{photo_id}/{variant}"


def _shared_photo_response(photo: Photo, token: str) -> PhotoResponse:
    return PhotoResponse(
        id=photo.id,
        location_id=photo.location_id,
        original_url=_shared_photo_url(token, photo.id, "original"),
        thumbnail_url=_shared_photo_url(token, photo.id, "thumbnail"),
        file_name=photo.file_name,
        file_size=photo.file_size,
        created_at=photo.created_at.isoformat(),
    )


@router.get("", response_model=list[ShareListResponse])
def list_shares(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    shares = (
        db.query(Share)
        .join(Trip)
        .filter(Trip.user_id == user_id)
        .order_by(Share.created_at.desc())
        .all()
    )
    return [
        ShareListResponse(
            **_share_response(share).model_dump(),
            trip_id=share.trip_id,
            trip_title=share.trip.title,
            created_at=share.created_at.isoformat(),
        )
        for share in shares
    ]


@router.post("/{trip_id}", response_model=ShareResponse)
def create_share(
    trip_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        logger.warning(f"创建分享失败: 旅行不存在 (trip_id: {trip_id}, user_id: {user_id})")
        raise HTTPException(status_code=404, detail="旅行不存在")

    # Reuse existing valid share
    existing = db.query(Share).filter(
        Share.trip_id == trip_id,
        Share.expires_at > datetime.now(timezone.utc),
    ).first()
    if existing:
        return _share_response(existing)

    share = _create_share_record(db, trip_id)
    db.commit()
    db.refresh(share)
    return _share_response(share)


@router.post("/{trip_id}/rotate", response_model=ShareResponse)
def rotate_share(
    trip_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    db.query(Share).filter(Share.trip_id == trip_id).delete(synchronize_session=False)
    share = _create_share_record(db, trip_id)
    db.commit()
    db.refresh(share)
    return _share_response(share)


@router.delete("/{token}")
def revoke_share(
    token: str,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    share = (
        db.query(Share)
        .join(Trip)
        .filter(Share.token == token, Trip.user_id == user_id)
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="分享链接不存在")
    db.delete(share)
    db.commit()
    return {"message": "分享链接已撤销"}


@router.get("/view/{token}")
def view_share(token: str, db: Session = Depends(get_db)):
    share = _get_valid_share(db, token)

    trip = db.get(Trip, share.trip_id)
    if not trip:
        logger.warning(f"查看分享失败: 旅行已删除 (trip_id: {share.trip_id})")
        raise HTTPException(status_code=404, detail="旅行已被删除")

    from app.schemas.trip import ShareTripResponse
    from app.utils.trip_view import cover_photo_ids, location_to_response

    locations = sorted(trip.locations, key=lambda l: l.sort_order)
    covers = cover_photo_ids(db, [trip.id])
    cover_photo_id = covers.get(trip.id)
    # 分享页匿名可访问：封面改用无需鉴权的分享作用域图片 URL
    cover_url = (
        _shared_photo_url(token, cover_photo_id, "thumbnail")
        if cover_photo_id
        else None
    )
    return ShareTripResponse(
        id=trip.id,
        title=trip.title,
        description=trip.description,
        start_date=trip.start_date,
        end_date=trip.end_date,
        created_at=trip.created_at.isoformat(),
        updated_at=trip.updated_at.isoformat(),
        cover_photo_id=cover_photo_id,
        cover_photo_url=cover_url,
        expires_at=_utc_isoformat(share.expires_at),
        locations=[location_to_response(l) for l in locations],
    )


@router.get("/view/{token}/locations/{location_id}/photos", response_model=list[PhotoResponse])
def list_shared_photos(token: str, location_id: int, db: Session = Depends(get_db)):
    share = _get_valid_share(db, token)
    location = db.query(Location).filter(
        Location.id == location_id,
        Location.trip_id == share.trip_id,
    ).first()
    if not location:
        raise HTTPException(status_code=404, detail="地点不存在")
    return [_shared_photo_response(photo, token) for photo in location.photos]


def _shared_photo_file(token: str, photo_id: int, variant: str, db: Session):
    share = _get_valid_share(db, token)
    photo = (
        db.query(Photo)
        .join(Location)
        .filter(Photo.id == photo_id, Location.trip_id == share.trip_id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")
    relative_path = photo.original_path if variant == "original" else photo.thumbnail_path
    try:
        return stored_file_response(settings.UPLOAD_DIR, relative_path)
    except (StoredFileUnavailable, UnsafeStoredPath):
        raise HTTPException(status_code=404, detail="文件不存在")


@router.get("/view/{token}/photos/{photo_id}/original")
def get_shared_original(token: str, photo_id: int, db: Session = Depends(get_db)):
    return _shared_photo_file(token, photo_id, "original", db)


@router.get("/view/{token}/photos/{photo_id}/thumbnail")
def get_shared_thumbnail(token: str, photo_id: int, db: Session = Depends(get_db)):
    return _shared_photo_file(token, photo_id, "thumbnail", db)

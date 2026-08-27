"""旅行视图组装工具。

trips / timeline / shares 接口共用的封面查询、城市提取与地点序列化逻辑，
统一放在 utils 层，避免 API 模块之间相互导入。
"""
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.models.location import Location
from app.models.photo import Photo
from app.schemas.location import LocationResponse

if TYPE_CHECKING:
    from app.models.trip import Trip

AUTH_COVER_URL_TEMPLATE = "/api/photos/{photo_id}/thumbnail"


def cover_photo_url(photo_id: int | None) -> str | None:
    if not photo_id:
        return None
    return AUTH_COVER_URL_TEMPLATE.format(photo_id=photo_id)


def cover_photo_ids(db: Session, trip_ids: list[int]) -> dict[int, int]:
    """批量取每个旅行的封面照片：地点顺序优先，其次最早上传的照片。"""
    if not trip_ids:
        return {}
    rows = (
        db.query(Location.trip_id, Photo.id)
        .join(Photo, Photo.location_id == Location.id)
        .filter(Location.trip_id.in_(trip_ids))
        .order_by(Location.trip_id.asc(), Location.sort_order.asc(), Photo.id.asc())
        .all()
    )
    covers: dict[int, int] = {}
    for trip_id, photo_id in rows:
        if trip_id not in covers:
            covers[trip_id] = photo_id
    return covers


def trip_cities(trip: "Trip") -> list[str]:
    """旅行涉及的城市标签：按地点首次出现顺序去重，过滤空值。"""
    return list(dict.fromkeys(loc.city for loc in trip.locations if loc.city))


def location_to_response(loc: Location) -> LocationResponse:
    return LocationResponse(
        id=loc.id,
        name=loc.name,
        address=loc.address,
        longitude=loc.longitude,
        latitude=loc.latitude,
        city=loc.city,
        province=loc.province,
        note=loc.note,
        sort_order=loc.sort_order,
        photo_count=len(loc.photos),
    )

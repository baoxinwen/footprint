import datetime
import logging
import re
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.trip import Trip
from app.models.location import Location
from app.schemas.trip import TripCreate, TripUpdate, TripResponse, TripDetailResponse
from app.schemas.location import LocationCreate, LocationUpdate, LocationResponse, SortOrderUpdate
from app.utils.escape import escape_like
from app.utils.image import delete_image_files
from app.utils.trip_view import cover_photo_ids, cover_photo_url, location_to_response, trip_cities

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trips", tags=["旅行管理"])


def _trip_to_response(trip: Trip, cover_photo_id: int | None = None) -> TripResponse:
    cities = trip_cities(trip)
    return TripResponse(
        id=trip.id,
        title=trip.title,
        description=trip.description,
        start_date=trip.start_date,
        end_date=trip.end_date,
        created_at=trip.created_at.isoformat(),
        updated_at=trip.updated_at.isoformat(),
        location_count=len(trip.locations),
        cities=cities,
        cover_photo_id=cover_photo_id,
        cover_photo_url=cover_photo_url(cover_photo_id),
    )


def _apply_trip_filters(
    query,
    search: str,
    year: int | None,
    month: int | None,
    city: str,
    date_from: str,
    date_to: str,
):
    if search:
        escaped = escape_like(search)
        pattern = f"%{escaped}%"
        query = query.join(Location, isouter=True).filter(
            Trip.title.ilike(pattern, escape='\\')
            | Trip.description.ilike(pattern, escape='\\')
            | Location.city.ilike(pattern, escape='\\')
        ).distinct()

    if year:
        query = query.filter(func.strftime("%Y", Trip.start_date) == str(year))

    if month:
        query = query.filter(func.strftime("%m", Trip.start_date) == f"{month:02d}")

    if city:
        escaped_city = escape_like(city)
        query = query.join(Location, isouter=True).filter(
            Location.city.ilike(f"%{escaped_city}%", escape='\\')
        ).distinct()

    if date_from or date_to:
        date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
        for label, value in (("date_from", date_from), ("date_to", date_to)):
            if value and not date_pattern.match(value):
                raise HTTPException(
                    status_code=422,
                    detail=f"{label} 格式无效，应为 YYYY-MM-DD",
                )
        # SQLite 以 ISO 文本存储日期，仅允许规范格式参与字典序比较
        try:
            if date_from:
                datetime.date.fromisoformat(date_from)
            if date_to:
                datetime.date.fromisoformat(date_to)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="日期格式无效，应为 YYYY-MM-DD") from exc

    if date_from:
        query = query.filter(Trip.start_date >= date_from)

    if date_to:
        query = query.filter(Trip.end_date <= date_to)

    return query


def _sort_trips(query, sort_by: str, order: str):
    """排序统一追加 id 次级键，保证同键记录的翻页顺序稳定。"""
    if sort_by == "location_count":
        order_col = func.count(Location.id)
        query = query.outerjoin(Location).group_by(Trip.id)
    elif sort_by == "name":
        order_col = Trip.title
    else:  # date (default)
        order_col = Trip.start_date

    if order == "asc":
        return query.order_by(order_col.asc(), Trip.id.asc())
    return query.order_by(order_col.desc(), Trip.id.desc())


@router.get("")
def list_trips(
    sort_by: Literal["date", "name", "location_count"] = "date",
    order: Literal["asc", "desc"] = "desc",
    search: str = "",
    year: int = Query(None, description="按年份筛选"),
    month: int = Query(None, description="按月份筛选"),
    city: str = Query("", description="按城市筛选"),
    date_from: str = Query("", description="开始日期筛选"),
    date_to: str = Query("", description="结束日期筛选"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    query = db.query(Trip).filter(Trip.user_id == user_id)

    if search:
        escaped = escape_like(search)
        pattern = f"%{escaped}%"
        query = query.join(Location, isouter=True).filter(
            Trip.title.ilike(pattern, escape='\\')
            | Trip.description.ilike(pattern, escape='\\')
            | Location.city.ilike(pattern, escape='\\')
        ).distinct()

    if year:
        query = query.filter(func.strftime("%Y", Trip.start_date) == str(year))

    if month:
        query = query.filter(func.strftime("%m", Trip.start_date) == f"{month:02d}")

    if city:
        escaped_city = escape_like(city)
        query = query.join(Location, isouter=True).filter(
            Location.city.ilike(f"%{escaped_city}%", escape='\\')
        ).distinct()

    if date_from or date_to:
        date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
        for label, value in (("date_from", date_from), ("date_to", date_to)):
            if value and not date_pattern.match(value):
                raise HTTPException(
                    status_code=422,
                    detail=f"{label} 格式无效，应为 YYYY-MM-DD",
                )
        # SQLite 以 ISO 文本存储日期，仅允许规范格式参与字典序比较
        try:
            if date_from:
                datetime.date.fromisoformat(date_from)
            if date_to:
                datetime.date.fromisoformat(date_to)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="日期格式无效，应为 YYYY-MM-DD") from exc

    if date_from:
        query = query.filter(Trip.start_date >= date_from)

    if date_to:
        query = query.filter(Trip.end_date <= date_to)

    query = _sort_trips(query, sort_by, order)

    total = query.count()
    trips = query.offset((page - 1) * page_size).limit(page_size).all()
    covers = cover_photo_ids(db, [t.id for t in trips])

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_trip_to_response(t, covers.get(t.id)) for t in trips],
    }


@router.post("", status_code=201)
def create_trip(
    req: TripCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = Trip(
        user_id=user_id,
        title=req.title,
        description=req.description,
        start_date=req.start_date,
        end_date=req.end_date,
    )
    db.add(trip)
    db.flush()

    for i, loc in enumerate(req.locations):
        location = Location(
            trip_id=trip.id,
            name=loc.name,
            address=loc.address,
            longitude=loc.longitude,
            latitude=loc.latitude,
            city=loc.city,
            province=loc.province,
            note=loc.note,
            sort_order=i,
        )
        db.add(location)

    db.flush()
    db.commit()
    db.refresh(trip)
    return _trip_to_response(trip)


@router.get("/cities")
def get_cities(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """获取用户所有旅行涉及的城市列表，用于筛选下拉框。"""
    cities = (
        db.query(Location.city)
        .join(Trip)
        .filter(Trip.user_id == user_id, Location.city != "", Location.city.isnot(None))
        .distinct()
        .order_by(Location.city)
        .all()
    )
    return [c[0] for c in cities]


@router.get("/years")
def get_years(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """获取用户所有旅行涉及的年份列表，用于筛选下拉框。"""
    years = (
        db.query(func.strftime("%Y", Trip.start_date).label("year"))
        .filter(Trip.user_id == user_id)
        .distinct()
        .order_by(func.strftime("%Y", Trip.start_date).desc())
        .all()
    )
    return [int(y[0]) for y in years]


@router.get("/{trip_id}")
def get_trip(
    trip_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    locations = sorted(trip.locations, key=lambda l: l.sort_order)
    covers = cover_photo_ids(db, [trip.id])
    cover_id = covers.get(trip.id)
    return TripDetailResponse(
        id=trip.id,
        title=trip.title,
        description=trip.description,
        start_date=trip.start_date,
        end_date=trip.end_date,
        created_at=trip.created_at.isoformat(),
        updated_at=trip.updated_at.isoformat(),
        cover_photo_id=cover_id,
        cover_photo_url=cover_photo_url(cover_id),
        locations=[location_to_response(l) for l in locations],
    )


def _validate_location_sync(
    trip: Trip,
    req: TripUpdate,
    existing_locations: dict[int, Location],
    requested_location_ids: set[int],
) -> None:
    """校验地点同步契约：删除声明必须与全量 locations 一同提供，
    库中每个地点必须被请求显式覆盖（保留或声明删除）。"""
    if req.locations is None:
        # 契约：删除声明必须与全量 locations 一同提供，
        # 否则无法校验覆盖完整性——单独出现时显式拒绝而非静默忽略
        if req.removed_location_ids:
            raise HTTPException(
                status_code=422,
                detail="removed_location_ids 必须与 locations 一同提供",
            )
        return

    removed_ids = set(req.removed_location_ids or [])

    # 数据冲突保护优先于格式类错误：库中的每个地点必须被请求显式覆盖——
    # 要么在 locations 里保留，要么在 removed_location_ids 里声明删除。
    # 否则视为陈旧快照（如另一窗口已修改、草稿恢复旧数据），拒绝执行，
    # 杜绝"静默删除请求中缺失的地点及其照片"
    unaccounted = set(existing_locations) - requested_location_ids - removed_ids
    if unaccounted:
        raise HTTPException(
            status_code=409,
            detail="检测到其他修改，页面数据已过期，请刷新后重试",
        )

    unknown_location_ids = requested_location_ids - set(existing_locations)
    if unknown_location_ids:
        raise HTTPException(status_code=422, detail="地点不属于当前旅行")

    foreign_removed = removed_ids - set(existing_locations)
    if foreign_removed:
        raise HTTPException(status_code=422, detail="待删除地点不属于当前旅行")


def _apply_location_sync(
    db: Session,
    trip: Trip,
    req: TripUpdate,
    existing_locations: dict[int, Location],
) -> list[tuple[str, str]]:
    """应用地点全量同步，返回被删地点的照片文件路径供事务提交后清理。"""
    removed_photo_files: list[tuple[str, str]] = []
    if req.locations is None:
        return removed_photo_files

    removed_ids = set(req.removed_location_ids or [])
    for location_id, location in existing_locations.items():
        if location_id in removed_ids:
            removed_photo_files.extend(
                (photo.original_path, photo.thumbnail_path)
                for photo in location.photos
            )
            db.delete(location)

    for sort_order, item in enumerate(req.locations):
        if item.id is None:
            location = Location(trip_id=trip.id)
            db.add(location)
        else:
            location = existing_locations[item.id]

        location.name = item.name
        location.address = item.address
        location.longitude = item.longitude
        location.latitude = item.latitude
        location.city = item.city
        location.province = item.province
        location.note = item.note
        location.sort_order = sort_order

    return removed_photo_files


@router.put("/{trip_id}")
def update_trip(
    trip_id: int,
    req: TripUpdate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    next_start_date = (
        req.start_date if req.start_date is not None else trip.start_date
    )
    next_end_date = req.end_date if req.end_date is not None else trip.end_date
    if next_end_date < next_start_date:
        raise HTTPException(
            status_code=422,
            detail="结束日期须大于等于开始日期",
        )

    existing_locations = {location.id: location for location in trip.locations}
    requested_location_ids = {
        location.id
        for location in req.locations or []
        if location.id is not None
    }
    _validate_location_sync(trip, req, existing_locations, requested_location_ids)

    if req.title is not None:
        trip.title = req.title
    if req.description is not None:
        trip.description = req.description
    if req.start_date is not None:
        trip.start_date = req.start_date
    if req.end_date is not None:
        trip.end_date = req.end_date

    removed_photo_files = _apply_location_sync(db, trip, req, existing_locations)

    try:
        db.flush()
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    db.refresh(trip)

    for original_path, thumbnail_path in removed_photo_files:
        try:
            delete_image_files(original_path, thumbnail_path)
        except Exception as exc:
            logger.warning(
                "删除已移除地点的照片文件失败: %s, %s, 错误: %s",
                original_path,
                thumbnail_path,
                exc,
            )

    covers = cover_photo_ids(db, [trip.id])
    return _trip_to_response(trip, covers.get(trip.id))


@router.delete("/{trip_id}")
def delete_trip(
    trip_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    # 先收集文件路径，提交数据库后再删除物理文件（与 update_trip 保持一致的安全顺序）
    photo_files = []
    for loc in trip.locations:
        for photo in loc.photos:
            photo_files.append((photo.original_path, photo.thumbnail_path))

    # 删除数据库记录；提交成功前不动任何物理文件，
    # 避免提交失败时留下指向已删除文件的活记录
    db.delete(trip)
    db.commit()

    failed_files = []
    for orig, thumb in photo_files:
        try:
            delete_image_files(orig, thumb)
        except Exception as e:
            failed_files.append((orig, thumb, str(e)))
            logger.warning(f"删除照片文件失败: {orig}, {thumb}, 错误: {e}")

    if failed_files:
        logger.warning(f"旅行 {trip_id} 删除完成，但有 {len(failed_files)} 个文件删除失败")

    return {"message": "删除成功"}


@router.post("/{trip_id}/locations", status_code=201)
def add_location(
    trip_id: int,
    req: LocationCreate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    max_order = db.query(func.max(Location.sort_order)).filter(Location.trip_id == trip_id).scalar() or -1

    location = Location(
        trip_id=trip_id,
        name=req.name,
        address=req.address,
        longitude=req.longitude,
        latitude=req.latitude,
        city=req.city,
        province=req.province,
        note=req.note,
        sort_order=max_order + 1,
    )
    db.add(location)
    db.flush()
    db.commit()
    db.refresh(location)
    return location_to_response(location)


@router.put("/{trip_id}/locations/sort")
def update_sort_order(
    trip_id: int,
    orders: list[SortOrderUpdate] = Body(...),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    # 批量更新排序，使用事务保证一致性
    location_ids = {item.location_id for item in orders}
    locations = db.query(Location).filter(
        Location.id.in_(location_ids),
        Location.trip_id == trip_id,
    ).all()
    location_map = {loc.id: loc for loc in locations}

    for item in orders:
        location = location_map.get(item.location_id)
        if location:
            location.sort_order = item.sort_order

    # 规范化：按当前相对顺序重排为连续的 0..n-1，
    # 消除部分更新/并发写入可能产生的重复、负值或稀疏序号
    all_locations = (
        db.query(Location)
        .filter(Location.trip_id == trip_id)
        .order_by(Location.sort_order)
        .all()
    )
    for index, loc in enumerate(all_locations):
        loc.sort_order = index

    db.flush()
    db.commit()
    return {"message": "排序已保存"}


@router.put("/{trip_id}/locations/{location_id}")
def update_location(
    trip_id: int,
    location_id: int,
    req: LocationUpdate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    location = db.query(Location).filter(
        Location.id == location_id, Location.trip_id == trip_id
    ).first()
    if not location:
        raise HTTPException(status_code=404, detail="地点不存在")

    if req.name is not None:
        location.name = req.name
    if req.address is not None:
        location.address = req.address
    if req.longitude is not None:
        location.longitude = req.longitude
    if req.latitude is not None:
        location.latitude = req.latitude
    if req.city is not None:
        location.city = req.city
    if req.province is not None:
        location.province = req.province
    if req.note is not None:
        location.note = req.note

    db.flush()
    db.commit()
    db.refresh(location)
    return location_to_response(location)


@router.delete("/{trip_id}/locations/{location_id}")
def delete_location(
    trip_id: int,
    location_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    location = db.query(Location).filter(
        Location.id == location_id, Location.trip_id == trip_id
    ).first()
    if not location:
        raise HTTPException(status_code=404, detail="地点不存在")

    # 先收集文件路径，提交数据库后再删除物理文件（与 update_trip 保持一致的安全顺序）
    photo_files = [
        (photo.original_path, photo.thumbnail_path) for photo in location.photos
    ]

    db.delete(location)
    db.commit()

    for orig, thumb in photo_files:
        try:
            delete_image_files(orig, thumb)
        except Exception as e:
            logger.warning(f"删除照片文件失败: {orig}, {thumb}, 错误: {e}")

    return {"message": "删除成功"}

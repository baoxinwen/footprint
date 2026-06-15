import logging
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.trip import Trip
from app.models.location import Location
from app.schemas.trip import TripCreate, TripUpdate, TripResponse, TripDetailResponse
from app.schemas.location import LocationCreate, LocationUpdate, LocationResponse, SortOrderUpdate
from app.utils.escape import escape_like
from app.utils.image import delete_image_files

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trips", tags=["旅行管理"])


def _trip_to_response(trip: Trip) -> TripResponse:
    cities = list({loc.city for loc in trip.locations})
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
    )


def _location_to_response(loc: Location) -> LocationResponse:
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

    if date_from:
        query = query.filter(Trip.start_date >= date_from)

    if date_to:
        query = query.filter(Trip.end_date <= date_to)

    # Sorting
    if sort_by == "location_count":
        order_col = func.count(Location.id)
        query = query.outerjoin(Location).group_by(Trip.id)
    elif sort_by == "name":
        order_col = Trip.title
    else:  # date (default)
        order_col = Trip.start_date

    if order == "asc":
        query = query.order_by(order_col.asc())
    else:
        query = query.order_by(order_col.desc())

    total = query.count()
    trips = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_trip_to_response(t) for t in trips],
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

    if req.title is not None:
        trip.title = req.title
    if req.description is not None:
        trip.description = req.description
    if req.start_date is not None:
        trip.start_date = req.start_date
    if req.end_date is not None:
        trip.end_date = req.end_date

    db.flush()
    db.commit()
    db.refresh(trip)
    return _trip_to_response(trip)


@router.delete("/{trip_id}")
def delete_trip(
    trip_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    # 先收集文件路径，再删除文件，最后删除数据库记录
    photo_files = []
    for loc in trip.locations:
        for photo in loc.photos:
            photo_files.append((photo.original_path, photo.thumbnail_path))

    # 先删除文件（记录失败但不阻止数据库删除）
    failed_files = []
    for orig, thumb in photo_files:
        try:
            delete_image_files(orig, thumb)
        except Exception as e:
            failed_files.append((orig, thumb, str(e)))
            logger.warning(f"删除照片文件失败: {orig}, {thumb}, 错误: {e}")

    # 删除数据库记录
    db.delete(trip)
    db.commit()

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
    return _location_to_response(location)


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
    return _location_to_response(location)


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

    # 先删除文件
    for photo in location.photos:
        try:
            delete_image_files(photo.original_path, photo.thumbnail_path)
        except Exception as e:
            logger.warning(f"删除照片文件失败: photo_id={photo.id}, 错误: {e}")

    db.delete(location)
    db.commit()
    return {"message": "删除成功"}

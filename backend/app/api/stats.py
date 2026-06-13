from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.trip import Trip
from app.models.location import Location
from app.schemas.stats import (
    OverviewStats,
    YearlyStats,
    MonthlyStats,
    CityRank,
    MapStats,
    CityMarker,
    TripRoute,
    PhotoMapMarker,
)

router = APIRouter(prefix="/api/stats", tags=["统计分析"])

ROUTE_COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
    "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
]


@router.get("/overview", response_model=OverviewStats)
def get_overview(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # 使用 joinedload 一次查询 trips 和 locations，避免 N+1 问题
    trips = (
        db.query(Trip)
        .options(joinedload(Trip.locations))
        .filter(Trip.user_id == user_id)
        .all()
    )
    trip_count = len(trips)

    if trip_count == 0:
        return OverviewStats(trip_count=0, city_count=0, province_count=0, total_days=0)

    # 从已加载的 trips 中提取 locations，无需额外查询
    cities = set()
    provinces = set()
    for trip in trips:
        for loc in trip.locations:
            if loc.city:
                cities.add(loc.city)
            if loc.province:
                provinces.add(loc.province)

    total_days = sum((t.end_date - t.start_date).days + 1 for t in trips)

    return OverviewStats(
        trip_count=trip_count,
        city_count=len(cities),
        province_count=len(provinces),
        total_days=total_days,
    )


@router.get("/yearly", response_model=list[YearlyStats])
def get_yearly(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    year_expr = func.strftime("%Y", Trip.start_date).label("year")
    results = (
        db.query(year_expr, func.count())
        .filter(Trip.user_id == user_id)
        .group_by(year_expr)
        .order_by(year_expr.desc())
        .all()
    )
    return [YearlyStats(year=int(r[0]), count=r[1]) for r in results]


@router.get("/monthly", response_model=list[MonthlyStats])
def get_monthly(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    month_expr = func.strftime("%m", Trip.start_date).label("month")
    results = (
        db.query(month_expr, func.count())
        .filter(Trip.user_id == user_id)
        .group_by(month_expr)
        .order_by(month_expr)
        .all()
    )
    return [MonthlyStats(month=int(r[0]), count=r[1]) for r in results]


@router.get("/city-rank", response_model=list[CityRank])
def get_city_rank(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    results = (
        db.query(Location.city, func.count(func.distinct(Trip.id)))
        .join(Trip)
        .filter(Trip.user_id == user_id, Location.city != "", Location.city.isnot(None))
        .group_by(Location.city)
        .order_by(func.count(func.distinct(Trip.id)).desc())
        .limit(10)
        .all()
    )
    return [CityRank(city=r[0], count=r[1]) for r in results]


@router.get("/map/stats", response_model=MapStats)
def get_map_stats(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # 使用 joinedload 一次查询，避免两次查询
    trips = (
        db.query(Trip)
        .options(joinedload(Trip.locations))
        .filter(Trip.user_id == user_id)
        .all()
    )
    if not trips:
        return MapStats(trip_count=0, location_count=0, city_count=0, province_count=0)

    unique_places = set()
    cities = set()
    provinces = set()
    for trip in trips:
        for loc in trip.locations:
            if loc.name:
                unique_places.add((loc.name, loc.city))
            if loc.city:
                cities.add(loc.city)
            if loc.province:
                provinces.add(loc.province)

    return MapStats(
        trip_count=len(trips),
        location_count=len(unique_places),
        city_count=len(cities),
        province_count=len(provinces),
    )


@router.get("/map/cities", response_model=list[CityMarker])
def get_city_markers(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # 使用 joinedload 一次查询，避免两次查询
    trips = (
        db.query(Trip)
        .options(joinedload(Trip.locations))
        .filter(Trip.user_id == user_id)
        .all()
    )
    if not trips:
        return []

    city_data: dict[str, dict] = {}
    for trip in trips:
        for loc in trip.locations:
            if loc.city and loc.city not in city_data:
                city_data[loc.city] = {
                    "city": loc.city,
                    "province": loc.province,
                    "longitude": loc.longitude,
                    "latitude": loc.latitude,
                    "trip_ids": set(),
                }
            if loc.city:
                city_data[loc.city]["trip_ids"].add(loc.trip_id)

    return [
        CityMarker(
            city=d["city"],
            province=d["province"],
            longitude=d["longitude"],
            latitude=d["latitude"],
            count=len(d["trip_ids"]),
        )
        for d in city_data.values()
    ]


@router.get("/map/route/{trip_id}", response_model=TripRoute)
def get_trip_route(
    trip_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="旅行不存在")

    locations = sorted(trip.locations, key=lambda l: l.sort_order)

    # Generate a color based on trip_id
    color = ROUTE_COLORS[trip_id % len(ROUTE_COLORS)]

    return TripRoute(
        trip_id=trip.id,
        title=trip.title,
        color=color,
        locations=[
            {"name": l.name, "longitude": l.longitude, "latitude": l.latitude}
            for l in locations
        ],
    )


@router.get("/map/routes", response_model=list[TripRoute])
def get_all_routes(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trips = db.query(Trip).filter(Trip.user_id == user_id).all()

    routes = []
    for trip in trips:
        locations = sorted(trip.locations, key=lambda l: l.sort_order)
        if len(locations) < 2:
            continue
        color = ROUTE_COLORS[trip.id % len(ROUTE_COLORS)]
        routes.append(
            TripRoute(
                trip_id=trip.id,
                title=trip.title,
                color=color,
                locations=[
                    {"name": l.name, "longitude": l.longitude, "latitude": l.latitude}
                    for l in locations
                ],
            )
        )
    return routes


@router.get("/map/photos", response_model=list[PhotoMapMarker])
def get_photo_markers(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """获取所有照片的位置标记，用于照片地图模式。"""
    from app.models.photo import Photo
    photos = (
        db.query(Photo)
        .options(joinedload(Photo.location).joinedload(Location.trip))
        .join(Location)
        .join(Trip)
        .filter(Trip.user_id == user_id)
        .all()
    )
    return [
        PhotoMapMarker(
            photo_id=p.id,
            thumbnail_url=f"/api/photos/{p.id}/thumbnail",
            original_url=f"/api/photos/{p.id}/original",
            location_name=p.location.name,
            longitude=p.location.longitude,
            latitude=p.location.latitude,
            city=p.location.city,
            trip_id=p.location.trip_id,
            trip_title=p.location.trip.title,
        )
        for p in photos
    ]

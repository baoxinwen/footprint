from pydantic import BaseModel


class RouteLocation(BaseModel):
    name: str
    longitude: float
    latitude: float


class OverviewStats(BaseModel):
    trip_count: int
    city_count: int
    province_count: int
    total_days: int


class YearlyStats(BaseModel):
    year: int
    count: int


class MonthlyStats(BaseModel):
    month: int
    count: int


class CityRank(BaseModel):
    city: str
    count: int


class MapStats(BaseModel):
    trip_count: int
    location_count: int
    city_count: int
    province_count: int


class CityMarker(BaseModel):
    city: str
    province: str
    longitude: float
    latitude: float
    count: int


class TripRoute(BaseModel):
    trip_id: int
    title: str
    color: str
    locations: list[RouteLocation]


class PhotoMapMarker(BaseModel):
    photo_id: int
    thumbnail_url: str
    original_url: str
    location_name: str
    longitude: float
    latitude: float
    city: str
    trip_id: int
    trip_title: str

from pydantic import BaseModel, Field


class LocationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    address: str = Field(..., min_length=1, max_length=500)
    longitude: float = Field(..., ge=-180, le=180)
    latitude: float = Field(..., ge=-90, le=90)
    city: str = Field(..., min_length=1, max_length=50)
    province: str = Field(..., min_length=1, max_length=50)
    note: str | None = None


class LocationUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    longitude: float | None = None
    latitude: float | None = None
    city: str | None = None
    province: str | None = None
    note: str | None = None
    sort_order: int | None = None


class LocationResponse(BaseModel):
    id: int
    name: str
    address: str
    longitude: float
    latitude: float
    city: str
    province: str
    note: str | None
    sort_order: int
    photo_count: int = 0

    class Config:
        from_attributes = True


class SortOrderUpdate(BaseModel):
    location_id: int
    sort_order: int

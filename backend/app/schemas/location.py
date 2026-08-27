from pydantic import BaseModel, ConfigDict, Field, field_validator


class LocationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    address: str = Field(..., max_length=500)
    longitude: float = Field(..., ge=-180, le=180)
    latitude: float = Field(..., ge=-90, le=90)
    city: str = Field(..., max_length=50)
    province: str = Field(..., max_length=50)
    note: str | None = None

    @field_validator("name", "address", "city", "province", mode="before")
    @classmethod
    def trim_structured_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class LocationSync(LocationCreate):
    id: int | None = Field(default=None, gt=0)


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    city: str | None = Field(default=None, max_length=50)
    province: str | None = Field(default=None, max_length=50)
    note: str | None = None
    sort_order: int | None = None

    @field_validator("name", "address", "city", "province", mode="before")
    @classmethod
    def trim_structured_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class LocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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

class SortOrderUpdate(BaseModel):
    location_id: int
    sort_order: int

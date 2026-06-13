from datetime import date
from pydantic import BaseModel, Field, model_validator

from app.schemas.location import LocationCreate, LocationResponse


class TripCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    start_date: date
    end_date: date
    locations: list[LocationCreate] = []

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("结束日期须大于等于开始日期")
        return self


class TripUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date is not None and self.end_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("结束日期须大于等于开始日期")
        return self


class TripResponse(BaseModel):
    id: int
    title: str
    description: str | None
    start_date: date
    end_date: date
    created_at: str
    updated_at: str
    location_count: int = 0
    cities: list[str] = []

    class Config:
        from_attributes = True


class TripDetailResponse(BaseModel):
    id: int
    title: str
    description: str | None
    start_date: date
    end_date: date
    created_at: str
    updated_at: str
    locations: list[LocationResponse] = []

    class Config:
        from_attributes = True

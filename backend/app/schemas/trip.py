from datetime import date
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.location import LocationCreate, LocationResponse, LocationSync


class TripCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    start_date: date
    end_date: date
    locations: list[LocationCreate] = Field(default_factory=list)

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("结束日期须大于等于开始日期")
        return self


class TripUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    locations: list[LocationSync] | None = None
    # 需要删除的既有地点 ID。locations 数组必须覆盖其余全部地点，
    # 任何"既不在 locations 也不在 removed_location_ids 中"的库内地点
    # 都会被视为数据冲突而拒绝（防止陈旧快照静默删数据）。
    removed_location_ids: list[int] | None = None

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date is not None and self.end_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("结束日期须大于等于开始日期")
        if self.locations is not None:
            location_ids = [location.id for location in self.locations if location.id is not None]
            if len(location_ids) != len(set(location_ids)):
                raise ValueError("地点 ID 不能重复")
        if self.removed_location_ids is not None:
            if len(self.removed_location_ids) != len(set(self.removed_location_ids)):
                raise ValueError("待删除地点 ID 不能重复")
            kept_ids = {location.id for location in (self.locations or []) if location.id is not None}
            overlap = kept_ids & set(self.removed_location_ids)
            if overlap:
                raise ValueError("地点不能同时出现在 locations 和 removed_location_ids 中")
        return self


class TripResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    start_date: date
    end_date: date
    created_at: str
    updated_at: str
    location_count: int = 0
    cities: list[str] = []
    cover_photo_id: int | None = None
    cover_photo_url: str | None = None

class TripDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    start_date: date
    end_date: date
    created_at: str
    updated_at: str
    cover_photo_id: int | None = None
    cover_photo_url: str | None = None
    locations: list[LocationResponse] = Field(default_factory=list)


class ShareTripResponse(TripDetailResponse):
    """分享页视图：在旅行详情基础上附带链接有效期。"""

    expires_at: str | None = None

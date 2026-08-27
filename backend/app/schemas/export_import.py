from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ImportLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    address: str = Field(max_length=500)
    longitude: float = Field(strict=True, ge=-180, le=180)
    latitude: float = Field(strict=True, ge=-90, le=90)
    city: str = Field(max_length=50)
    province: str = Field(max_length=50)
    note: str | None = None

    @field_validator("name", "address", "city", "province", mode="before")
    @classmethod
    def trim_structured_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class ImportTrip(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )

    title: str = Field(default="未命名旅行", min_length=1, max_length=200)
    description: str | None = None
    start_date: date = Field(alias="startDate")
    end_date: date = Field(alias="endDate")
    locations: list[ImportLocation] = Field(default_factory=list)

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("结束日期须大于等于开始日期")
        return self

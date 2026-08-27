from pydantic import BaseModel, ConfigDict


class PhotoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    location_id: int
    original_url: str
    thumbnail_url: str
    file_name: str
    file_size: int
    created_at: str

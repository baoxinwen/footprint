from pydantic import BaseModel


class PhotoResponse(BaseModel):
    id: int
    location_id: int
    original_url: str
    thumbnail_url: str
    file_name: str
    file_size: int
    created_at: str

    class Config:
        from_attributes = True

from pydantic import BaseModel


class ShareResponse(BaseModel):
    token: str
    url: str
    expires_at: str


class ShareListResponse(ShareResponse):
    trip_id: int
    trip_title: str
    created_at: str

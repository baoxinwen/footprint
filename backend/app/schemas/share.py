from pydantic import BaseModel


class ShareResponse(BaseModel):
    token: str
    url: str
    expires_at: str

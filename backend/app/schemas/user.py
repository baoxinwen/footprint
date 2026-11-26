from pydantic import BaseModel, Field, field_validator

from app.core.security import (
    validate_password_byte_length,
    validate_utf8_encodable,
)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(..., min_length=6, max_length=128)

    _validate_password_bytes = field_validator("password")(
        validate_password_byte_length
    )
    _validate_password_encodable = field_validator("password")(validate_utf8_encodable)


class LoginRequest(BaseModel):
    username: str = Field(..., max_length=50)
    password: str = Field(..., max_length=128)

    _validate_password_encodable = field_validator("password")(validate_utf8_encodable)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)
    confirm_password: str = Field(..., max_length=128)

    _validate_new_password_bytes = field_validator(
        "new_password", "confirm_password"
    )(validate_password_byte_length)
    _validate_encodable = field_validator(
        "current_password", "new_password", "confirm_password"
    )(validate_utf8_encodable)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

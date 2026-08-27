from pydantic import BaseModel, Field, field_validator

from app.core.security import validate_password_byte_length


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(..., min_length=6, max_length=128)

    _validate_password_bytes = field_validator("password")(
        validate_password_byte_length
    )


class LoginRequest(BaseModel):
    username: str = Field(..., max_length=50)
    password: str = Field(..., max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)
    confirm_password: str = Field(..., max_length=128)

    _validate_new_password_bytes = field_validator(
        "new_password", "confirm_password"
    )(validate_password_byte_length)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

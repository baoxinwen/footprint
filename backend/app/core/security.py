from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

security_scheme = HTTPBearer()

MAX_BCRYPT_PASSWORD_BYTES = 72


def validate_password_byte_length(password: str) -> str:
    if len(password.encode("utf-8")) > MAX_BCRYPT_PASSWORD_BYTES:
        raise ValueError("密码的 UTF-8 编码不能超过 72 字节")
    return password


def validate_utf8_encodable(value: str) -> str:
    """拒绝无法 UTF-8 编码的字符串（评审 M-1）。

    含孤立 UTF-16 代理项的密码曾让 bcrypt/hash 链路抛 UnicodeEncodeError
    变成 500，且连 422 错误体都渲染不出来。
    """
    try:
        value.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise ValueError("包含无法编码的字符") from exc
    return value


def hash_password(password: str) -> str:
    validate_password_byte_length(password)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    # bcrypt historically truncated inputs after 72 bytes. Keep verification
    # compatible with hashes created before new passwords were length-limited.
    password_bytes = plain.encode("utf-8")[:MAX_BCRYPT_PASSWORD_BYTES]
    return bcrypt.checkpw(password_bytes, hashed.encode("utf-8"))


def create_access_token(user_id: int, auth_version: int = 1) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "ver": auth_version, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> int:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
        token_auth_version = int(payload.get("ver", 1))
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
        )
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )
    if token_auth_version != user.auth_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录状态已失效，请重新登录",
        )
    return user_id

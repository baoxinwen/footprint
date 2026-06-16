import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user_id,
)
from app.models.user import User
from app.schemas.user import (
    RegisterRequest,
    LoginRequest,
    ChangePasswordRequest,
    TokenResponse,
)
from app.utils.rate_limit import (
    check_login_rate,
    record_login_failure,
    clear_login_attempts,
    check_register_rate,
    record_register_attempt,
    check_password_change_cooldown,
    record_password_change,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["认证"])


@router.post("/register")
def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host
    check_register_rate(ip)

    if db.query(User).filter(User.username == req.username).first():
        logger.warning(f"注册失败: 用户名 '{req.username}' 已被占用 (IP: {ip})")
        raise HTTPException(status_code=400, detail="该用户名已被占用")

    user = User(username=req.username, password_hash=hash_password(req.password))
    db.add(user)
    db.flush()
    db.commit()

    record_register_attempt(ip)
    return {"message": "注册成功"}


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host
    check_login_rate(req.username, ip)

    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        record_login_failure(req.username, ip)
        logger.warning(f"登录失败: 用户名或密码错误 '{req.username}' (IP: {ip})")
        raise HTTPException(status_code=400, detail="用户名或密码错误")

    clear_login_attempts(req.username, ip)
    token = create_access_token(user.id)
    return TokenResponse(access_token=token)


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        logger.error(f"修改密码失败: 用户不存在 (user_id: {user_id})")
        raise HTTPException(status_code=404, detail="用户不存在")

    check_password_change_cooldown(user_id)

    if req.new_password != req.confirm_password:
        logger.warning(f"修改密码失败: 两次输入不一致 (user_id: {user_id})")
        raise HTTPException(status_code=400, detail="两次输入的新密码不一致")
    if not verify_password(req.current_password, user.password_hash):
        logger.warning(f"修改密码失败: 当前密码错误 (user_id: {user_id})")
        raise HTTPException(status_code=400, detail="当前密码错误")

    user.password_hash = hash_password(req.new_password)
    db.flush()
    db.commit()

    record_password_change(user_id)
    return {"message": "密码修改成功"}

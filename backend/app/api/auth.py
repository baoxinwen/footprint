import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
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
    check_password_failure_rate,
    record_password_failure,
    clear_password_failures,
)

logger = logging.getLogger(__name__)

# 导入期预生成一份随机口令的 bcrypt 哈希：登录遇到不存在的用户名时也执行
# 一次等价校验，抹平与「用户存在但密码错误」路径的响应时间差，
# 防止用计时法枚举用户名（评审 R1-5）
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(16))

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
    try:
        # INSERT 在 flush 时发出，UNIQUE 冲突在这里抛出：
        # flush 必须在 try 内，否则并发注册同名的兜底永远接不到（评审 I-2）
        db.flush()
        db.commit()
    except IntegrityError:
        # 并发注册同名用户的兜底：存在性检查与提交之间存在竞态窗口，
        # UNIQUE 约束是数据层的最终防线，这里把约束冲突翻译回 400（评审 R1-4）
        db.rollback()
        logger.warning(f"注册失败: 用户名 '{req.username}' 已被占用 (IP: {ip})")
        raise HTTPException(status_code=400, detail="该用户名已被占用")

    record_register_attempt(ip)
    return {"message": "注册成功"}


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host
    check_login_rate(req.username, ip)

    user = db.query(User).filter(User.username == req.username).first()
    if not user:
        # 不存在的用户名也做一次等价 bcrypt 校验（见 _DUMMY_PASSWORD_HASH），
        # 两条失败路径的耗时保持一致
        verify_password(req.password, _DUMMY_PASSWORD_HASH)
        record_login_failure(req.username, ip)
        logger.warning(f"登录失败: 用户名或密码错误 '{req.username}' (IP: {ip})")
        raise HTTPException(status_code=400, detail="用户名或密码错误")
    if not verify_password(req.password, user.password_hash):
        record_login_failure(req.username, ip)
        logger.warning(f"登录失败: 用户名或密码错误 '{req.username}' (IP: {ip})")
        raise HTTPException(status_code=400, detail="用户名或密码错误")

    clear_login_attempts(req.username, ip)
    token = create_access_token(user.id, user.auth_version)
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

    # 先校验当前密码与新密码一致性，再检查冷却：
    # 避免冷却期内的用户输错当前密码时得到误导性的 429，
    # 也避免仅凭 token 探测"该账号近期是否改过密码"
    if req.new_password != req.confirm_password:
        logger.warning(f"修改密码失败: 两次输入不一致 (user_id: {user_id})")
        raise HTTPException(status_code=400, detail="两次输入的新密码不一致")
    # 答错当前密码计入失败限流（评审 I-3）：持 token 不应能无限次试当前密码
    check_password_failure_rate(user_id)
    if not verify_password(req.current_password, user.password_hash):
        record_password_failure(user_id)
        logger.warning(f"修改密码失败: 当前密码错误 (user_id: {user_id})")
        raise HTTPException(status_code=400, detail="当前密码错误")
    clear_password_failures(user_id)

    check_password_change_cooldown(user_id)

    user.password_hash = hash_password(req.new_password)
    user.auth_version += 1
    db.flush()
    db.commit()

    record_password_change(user_id)
    return {"message": "密码修改成功"}

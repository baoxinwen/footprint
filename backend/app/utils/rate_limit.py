import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# In-memory stores
_login_attempts: dict[str, list[datetime]] = defaultdict(list)
_register_attempts: dict[str, list[datetime]] = defaultdict(list)
_password_changes: dict[int, datetime] = {}

# Cleanup interval in seconds
_CLEANUP_INTERVAL = 300  # 5 minutes


def _cleanup_expired_entries():
    """定期清理过期的频率限制记录，防止内存泄漏。"""
    now = datetime.now(timezone.utc)
    # 清理登录尝试记录（超过锁定时间的）
    login_cutoff = now - timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
    for key in list(_login_attempts.keys()):
        _login_attempts[key] = [t for t in _login_attempts[key] if t > login_cutoff]
        if not _login_attempts[key]:
            del _login_attempts[key]

    # 清理注册尝试记录（超过1小时的）
    register_cutoff = now - timedelta(hours=1)
    for key in list(_register_attempts.keys()):
        _register_attempts[key] = [t for t in _register_attempts[key] if t > register_cutoff]
        if not _register_attempts[key]:
            del _register_attempts[key]

    # 清理密码修改记录（超过冷却时间的）
    password_cutoff = now - timedelta(hours=settings.PASSWORD_CHANGE_COOLDOWN_HOURS)
    expired_users = [uid for uid, ts in _password_changes.items() if ts < password_cutoff]
    for uid in expired_users:
        del _password_changes[uid]


def _cleanup_worker():
    """后台清理线程，定期执行清理任务。"""
    while True:
        try:
            _cleanup_expired_entries()
        except Exception as e:
            logger.warning(f"频率限制清理任务异常: {e}")
        threading.Event().wait(_CLEANUP_INTERVAL)


# 仅在非测试环境中启动清理线程
if not os.environ.get("TESTING"):
    _cleanup_thread = threading.Thread(target=_cleanup_worker, daemon=True, name="rate-limit-cleanup")
    _cleanup_thread.start()


def check_login_rate(username: str, ip: str):
    now = datetime.now(timezone.utc)
    key = f"{username}:{ip}"
    cutoff = now - timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)

    _login_attempts[key] = [t for t in _login_attempts[key] if t > cutoff]

    if len(_login_attempts[key]) >= settings.LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"登录失败次数过多，请 {settings.LOGIN_LOCKOUT_MINUTES} 分钟后再试",
        )


def record_login_failure(username: str, ip: str):
    _login_attempts[f"{username}:{ip}"].append(datetime.now(timezone.utc))


def clear_login_attempts(username: str, ip: str):
    _login_attempts.pop(f"{username}:{ip}", None)


def check_register_rate(ip: str):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=1)

    _register_attempts[ip] = [t for t in _register_attempts[ip] if t > cutoff]

    if len(_register_attempts[ip]) >= settings.REGISTER_MAX_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="注册频率过高，请稍后再试",
        )


def record_register_attempt(ip: str):
    _register_attempts[ip].append(datetime.now(timezone.utc))


def check_password_change_cooldown(user_id: int):
    last_change = _password_changes.get(user_id)
    if last_change:
        cooldown_end = last_change + timedelta(hours=settings.PASSWORD_CHANGE_COOLDOWN_HOURS)
        if datetime.now(timezone.utc) < cooldown_end:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"修改密码后 {settings.PASSWORD_CHANGE_COOLDOWN_HOURS} 小时内不允许再次修改",
            )


def record_password_change(user_id: int):
    _password_changes[user_id] = datetime.now(timezone.utc)


def reset_all():
    """Clear all rate limiting state (for testing)."""
    _login_attempts.clear()
    _register_attempts.clear()
    _password_changes.clear()

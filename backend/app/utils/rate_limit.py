import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# In-memory stores
_login_attempts: dict[str, list[datetime]] = defaultdict(list)          # (username:ip) 维度
_login_attempts_global: dict[str, list[datetime]] = defaultdict(list)   # username 全局维度
_register_attempts: dict[str, list[datetime]] = defaultdict(list)
_password_changes: dict[int, datetime] = {}

# Cleanup interval in seconds
_CLEANUP_INTERVAL = 300  # 5 minutes


def _cleanup_expired_entries():
    """定期清理过期的频率限制记录，防止内存泄漏。"""
    now = datetime.now(timezone.utc)
    # 清理登录尝试记录（超过锁定时间的）
    login_cutoff = now - timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
    for store in (_login_attempts, _login_attempts_global):
        for key in list(store.keys()):
            store[key] = [t for t in store[key] if t > login_cutoff]
            if not store[key]:
                del store[key]

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


# 仅在测试环境（TESTING=1，由 conftest 在导入本模块前设置）跳过清理线程；
# 显式比较 "1" 而非真值判断，避免 TESTING=0/false 被误认为已开启测试模式
if os.environ.get("TESTING") != "1":
    _cleanup_thread = threading.Thread(target=_cleanup_worker, daemon=True, name="rate-limit-cleanup")
    _cleanup_thread.start()


def check_login_rate(username: str, ip: str):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)

    # 第一层：同一 (用户名, IP) 组合的失败上限
    key = f"{username}:{ip}"
    _login_attempts[key] = [t for t in _login_attempts[key] if t > cutoff]
    if len(_login_attempts[key]) >= settings.LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"登录失败次数过多，请 {settings.LOGIN_LOCKOUT_MINUTES} 分钟后再试",
        )

    # 第二层：同一用户名跨全部 IP 的全局失败上限——
    # 防止攻击者轮换 IP 绕过第一层对单一账号持续爆破
    _login_attempts_global[username] = [
        t for t in _login_attempts_global[username] if t > cutoff
    ]
    if len(_login_attempts_global[username]) >= settings.LOGIN_GLOBAL_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"该账号登录失败次数过多，请 {settings.LOGIN_LOCKOUT_MINUTES} 分钟后再试",
        )


def record_login_failure(username: str, ip: str):
    ts = datetime.now(timezone.utc)
    _login_attempts[f"{username}:{ip}"].append(ts)
    _login_attempts_global[username].append(ts)


def clear_login_attempts(username: str, ip: str):
    _login_attempts.pop(f"{username}:{ip}", None)
    _login_attempts_global.pop(username, None)


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
    _login_attempts_global.clear()
    _register_attempts.clear()
    _password_changes.clear()

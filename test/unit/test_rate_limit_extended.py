"""
单元测试 — 频率限制（扩展）
覆盖: 清理机制、密码修改冷却
"""
import pytest
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from app.utils.rate_limit import (
    check_login_rate,
    record_login_failure,
    clear_login_attempts,
    check_register_rate,
    record_register_attempt,
    check_password_change_cooldown,
    record_password_change,
    reset_all,
    _cleanup_expired_entries,
    _login_attempts,
    _register_attempts,
    _password_changes,
)


@pytest.mark.unit
class TestPasswordChangeCooldown:
    """密码修改冷却限制。"""

    def setup_method(self):
        reset_all()

    def test_no_cooldown_initially(self):
        """首次修改密码不应有冷却限制。"""
        check_password_change_cooldown(1)  # 不应抛异常

    def test_cooldown_active(self):
        """修改密码后应有冷却限制。"""
        record_password_change(1)
        with pytest.raises(HTTPException) as exc_info:
            check_password_change_cooldown(1)
        assert exc_info.value.status_code == 429

    def test_cooldown_expired(self):
        """冷却时间过后应恢复正常。"""
        # 手动设置过期的密码修改记录
        _password_changes[1] = datetime.now(timezone.utc) - timedelta(hours=2)
        check_password_change_cooldown(1)  # 不应抛异常

    def test_different_users_independent(self):
        """不同用户的冷却限制相互独立。"""
        record_password_change(1)
        check_password_change_cooldown(2)  # 用户2不应受影响


@pytest.mark.unit
class TestCleanupExpiredEntries:
    """清理过期记录。"""

    def setup_method(self):
        reset_all()

    def test_cleanup_login_attempts(self):
        """应清理过期的登录尝试记录。"""
        # 添加过期记录（超过锁定时间）和最近记录
        _login_attempts["user1:127.0.0.1"].append(
            datetime.now(timezone.utc) - timedelta(minutes=20)
        )
        _login_attempts["user1:127.0.0.1"].append(
            datetime.now(timezone.utc) - timedelta(minutes=1)
        )

        _cleanup_expired_entries()

        # 过期记录应被清理，最近记录应保留
        assert len(_login_attempts.get("user1:127.0.0.1", [])) == 1

    def test_cleanup_register_attempts(self):
        """应清理过期的注册尝试记录。"""
        _register_attempts["127.0.0.1"].append(
            datetime.now(timezone.utc) - timedelta(hours=2)
        )

        _cleanup_expired_entries()

        assert len(_register_attempts.get("127.0.0.1", [])) == 0

    def test_cleanup_password_changes(self):
        """应清理过期的密码修改记录。"""
        _password_changes[1] = datetime.now(timezone.utc) - timedelta(hours=2)

        _cleanup_expired_entries()

        assert 1 not in _password_changes

    def test_cleanup_preserves_recent_records(self):
        """应保留最近的记录。"""
        _login_attempts["user1:127.0.0.1"].append(
            datetime.now(timezone.utc) - timedelta(minutes=1)
        )

        _cleanup_expired_entries()

        assert len(_login_attempts["user1:127.0.0.1"]) == 1

    def test_cleanup_removes_empty_keys(self):
        """应移除空的键。"""
        _login_attempts["user1:127.0.0.1"].append(
            datetime.now(timezone.utc) - timedelta(minutes=20)
        )

        _cleanup_expired_entries()

        assert "user1:127.0.0.1" not in _login_attempts

"""
单元测试 — 频率限制
关联用例: TC-AUTH-008
"""
import pytest
from fastapi import HTTPException
from app.utils.rate_limit import (
    check_login_rate,
    record_login_failure,
    clear_login_attempts,
    check_register_rate,
    record_register_attempt,
    reset_all,
)


@pytest.mark.unit
class TestLoginRateLimit:
    """登录频率限制。"""

    def setup_method(self):
        """每个测试前清理状态。"""
        reset_all()

    def test_no_limit_under_threshold(self):
        """TC-AUTH-008: 未达阈值时应正常通过。"""
        for _ in range(4):
            record_login_failure("user1", "127.0.0.1")
        # 第 5 次仍应通过（阈值为 5）
        check_login_rate("user1", "127.0.0.1")

    def test_exceed_threshold_raises(self):
        """TC-AUTH-008: 达到阈值后应抛出 429。"""
        for _ in range(5):
            record_login_failure("user1", "127.0.0.1")
        with pytest.raises(HTTPException) as exc_info:
            check_login_rate("user1", "127.0.0.1")
        assert exc_info.value.status_code == 429

    def test_clear_resets_attempts(self):
        """清空记录后应恢复正常。"""
        for _ in range(5):
            record_login_failure("user1", "127.0.0.1")
        clear_login_attempts("user1", "127.0.0.1")
        check_login_rate("user1", "127.0.0.1")  # 应不抛异常

    def test_different_ips_independent(self):
        """不同 IP 的频率限制相互独立。"""
        for _ in range(5):
            record_login_failure("user1", "192.168.1.1")
        with pytest.raises(Exception):
            check_login_rate("user1", "192.168.1.1")
        # Different IP should not be affected
        check_login_rate("user1", "192.168.1.2")  # Should not raise


@pytest.mark.unit
class TestRegisterRateLimit:
    """注册频率限制。"""

    def test_no_limit_under_threshold(self):
        """未达阈值时应正常通过。"""
        for _ in range(2):
            record_register_attempt("127.0.0.1")
        check_register_rate("127.0.0.1")

    def test_exceed_threshold_raises(self):
        """达到阈值后应抛出 429。"""
        for _ in range(3):
            record_register_attempt("127.0.0.1")
        with pytest.raises(HTTPException) as exc_info:
            check_register_rate("127.0.0.1")
        assert exc_info.value.status_code == 429

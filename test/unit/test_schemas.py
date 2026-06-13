"""
单元测试 — Pydantic Schema 校验
关联用例: TC-TRIP-002, TC-TRIP-003, TC-AUTH-003, TC-AUTH-004
"""
import pytest
from pydantic import ValidationError

from app.schemas.user import RegisterRequest
from app.schemas.trip import TripCreate


@pytest.mark.unit
class TestRegisterSchema:
    """注册请求 Schema 校验。"""

    def test_valid_input(self):
        """正常输入应通过校验。"""
        req = RegisterRequest(username="test_user", password="123456")
        assert req.username == "test_user"

    def test_username_too_short(self):
        """TC-AUTH-003: 用户名少于 3 字符应校验失败。"""
        with pytest.raises(ValidationError):
            RegisterRequest(username="ab", password="123456")

    def test_username_too_long(self):
        """TC-AUTH-003: 用户名超过 50 字符应校验失败。"""
        with pytest.raises(ValidationError):
            RegisterRequest(username="a" * 51, password="123456")

    def test_username_with_special_chars(self):
        """TC-AUTH-003: 用户名含特殊字符应校验失败。"""
        with pytest.raises(ValidationError):
            RegisterRequest(username="user@name", password="123456")

    def test_username_with_chinese(self):
        """TC-AUTH-003: 用户名含中文应校验失败。"""
        with pytest.raises(ValidationError):
            RegisterRequest(username="用户名", password="123456")

    def test_password_too_short(self):
        """TC-AUTH-004: 密码少于 6 位应校验失败。"""
        with pytest.raises(ValidationError):
            RegisterRequest(username="testuser", password="12345")


@pytest.mark.unit
class TestTripCreateSchema:
    """旅行创建 Schema 校验。"""

    def test_valid_input(self):
        """正常输入应通过校验。"""
        trip = TripCreate(
            title="测试",
            start_date="2025-10-01",
            end_date="2025-10-03",
        )
        assert trip.title == "测试"

    def test_end_before_start(self):
        """TC-TRIP-003: 结束日期早于开始日期应校验失败。"""
        with pytest.raises(ValidationError):
            TripCreate(
                title="测试",
                start_date="2025-10-05",
                end_date="2025-10-01",
            )

    def test_missing_start_date(self):
        """缺少 start_date 应报错。"""
        with pytest.raises(Exception):
            TripCreate(title="Test", end_date="2025-01-02")

    def test_missing_end_date(self):
        """缺少 end_date 应报错。"""
        with pytest.raises(Exception):
            TripCreate(title="Test", start_date="2025-01-01")

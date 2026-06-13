"""单元测试 — LIKE 转义工具"""
import pytest
from app.utils.escape import escape_like


@pytest.mark.unit
class TestEscapeLike:
    def test_escape_percent(self):
        assert escape_like("test%") == "test\\%"

    def test_escape_underscore(self):
        assert escape_like("test_") == "test\\_"

    def test_escape_backslash(self):
        assert escape_like("test\\") == "test\\\\"

    def test_escape_combined(self):
        assert escape_like("%_\\") == "\\%\\_\\\\"

    def test_no_escape_needed(self):
        assert escape_like("normal text") == "normal text"

    def test_empty_string(self):
        assert escape_like("") == ""

    def test_unicode_passthrough(self):
        """Unicode 字符应原样通过。"""
        assert escape_like("故宫博物院") == "故宫博物院"
        assert escape_like("🏖️") == "🏖️"

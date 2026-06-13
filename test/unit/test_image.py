"""
单元测试 — 图片处理工具
关联用例: TC-PHOTO-001, TC-PHOTO-003, TC-PHOTO-004
"""
import pytest
from app.utils.image import validate_image
from PIL import Image
from io import BytesIO


@pytest.mark.unit
class TestValidateImage:
    """图片格式验证。"""

    def test_valid_jpeg(self):
        """TC-PHOTO-001: 合法 JPEG 应验证通过。"""
        img = Image.new("RGB", (10, 10))
        buf = BytesIO()
        img.save(buf, format="JPEG")
        assert validate_image(buf.getvalue()) is True

    def test_valid_png(self):
        """合法 PNG 应验证通过。"""
        img = Image.new("RGBA", (10, 10))
        buf = BytesIO()
        img.save(buf, format="PNG")
        assert validate_image(buf.getvalue()) is True

    def test_invalid_data(self):
        """TC-PHOTO-003: 非图片数据应验证失败。"""
        assert validate_image(b"not an image") is False

    def test_empty_data(self):
        """空数据应验证失败。"""
        assert validate_image(b"") is False

    def test_valid_gif(self):
        """TC-PHOTO-004: 合法 GIF 应验证通过。"""
        img = Image.new("RGB", (10, 10))
        buf = BytesIO()
        img.save(buf, format="GIF")
        assert validate_image(buf.getvalue()) is True

    def test_valid_webp(self, test_webp_bytes):
        """WebP 图片应通过验证。"""
        assert validate_image(test_webp_bytes) is True

    def test_truncated_jpeg_rejected(self):
        """截断的 JPEG 应被拒绝。"""
        img = Image.new("RGB", (100, 100), color="red")
        buf = BytesIO()
        img.save(buf, format="JPEG")
        truncated = buf.getvalue()[:50]  # Only first 50 bytes
        assert validate_image(truncated) is False

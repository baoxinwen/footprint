"""
单元测试 — 图片处理工具（扩展）
覆盖: save_image 严格扩展名验证、delete_image_files 异常处理
"""
import pytest
from unittest.mock import patch, MagicMock
from app.utils.image import validate_image, save_image, delete_image_files
from PIL import Image
from io import BytesIO


@pytest.mark.unit
class TestSaveImage:
    """save_image 扩展名验证。"""

    def setup_method(self):
        """每个测试前清理状态。"""
        pass

    def test_save_image_valid_jpeg(self, tmp_path):
        """合法 JPEG 文件应成功保存。"""
        img = Image.new("RGB", (100, 100), color="red")
        buf = BytesIO()
        img.save(buf, format="JPEG")
        file_bytes = buf.getvalue()

        with patch("app.utils.image.settings") as mock_settings:
            mock_settings.ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
            mock_settings.UPLOAD_DIR = tmp_path
            mock_settings.THUMBNAIL_WIDTH = 300

            result = save_image(file_bytes, "test.jpg")
            assert "original_path" in result
            assert "thumbnail_path" in result
            assert result["original_path"].endswith(".jpg")
            assert result["thumbnail_path"].endswith("_thumb.jpg")

    def test_save_image_valid_png(self, tmp_path):
        """合法 PNG 文件应成功保存。"""
        img = Image.new("RGBA", (100, 100), color="blue")
        buf = BytesIO()
        img.save(buf, format="PNG")
        file_bytes = buf.getvalue()

        with patch("app.utils.image.settings") as mock_settings:
            mock_settings.ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
            mock_settings.UPLOAD_DIR = tmp_path
            mock_settings.THUMBNAIL_WIDTH = 300

            result = save_image(file_bytes, "test.png")
            assert result["original_path"].endswith(".png")

    def test_save_image_invalid_extension_raises(self, tmp_path):
        """不在允许列表中的扩展名应抛出 ValueError。"""
        img = Image.new("RGB", (100, 100), color="red")
        buf = BytesIO()
        img.save(buf, format="JPEG")
        file_bytes = buf.getvalue()

        with patch("app.utils.image.settings") as mock_settings:
            mock_settings.ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}

            with pytest.raises(ValueError, match="不支持的文件格式"):
                save_image(file_bytes, "test.exe")

    def test_save_image_no_extension_defaults_to_jpg(self, tmp_path):
        """无扩展名的文件应默认使用 jpg。"""
        img = Image.new("RGB", (100, 100), color="red")
        buf = BytesIO()
        img.save(buf, format="JPEG")
        file_bytes = buf.getvalue()

        with patch("app.utils.image.settings") as mock_settings:
            mock_settings.ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
            mock_settings.UPLOAD_DIR = tmp_path
            mock_settings.THUMBNAIL_WIDTH = 300

            result = save_image(file_bytes, "photo")
            # 无扩展名时 ext 为 "jpg"（因为 "photo".rsplit(".", 1)[-1] == "photo"，不在允许列表中）
            # 应该抛出 ValueError
            # 实际上 "photo" 没有 "."，所以 ext = "jpg"（默认值）
            # 但 "jpg" 在允许列表中，所以应该成功
            assert result["original_path"].endswith(".jpg")

    def test_save_image_gif_creates_static_thumbnail(self, tmp_path):
        """GIF 文件应创建静态缩略图（第一帧）。"""
        frames = [Image.new("RGB", (100, 100), c) for c in ["red", "blue", "green"]]
        buf = BytesIO()
        frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
        file_bytes = buf.getvalue()

        with patch("app.utils.image.settings") as mock_settings:
            mock_settings.ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
            mock_settings.UPLOAD_DIR = tmp_path
            mock_settings.THUMBNAIL_WIDTH = 300

            result = save_image(file_bytes, "test.gif")
            assert result["original_path"].endswith(".gif")
            assert result["thumbnail_path"].endswith("_thumb.jpg")


@pytest.mark.unit
class TestDeleteImageFiles:
    """delete_image_files 异常处理。"""

    def test_delete_existing_files(self, tmp_path):
        """删除存在的文件应成功。"""
        orig = tmp_path / "test.jpg"
        thumb = tmp_path / "test_thumb.jpg"
        orig.write_bytes(b"fake image")
        thumb.write_bytes(b"fake thumb")

        with patch("app.utils.image.settings") as mock_settings:
            mock_settings.UPLOAD_DIR = tmp_path
            delete_image_files("test.jpg", "test_thumb.jpg")
            assert not orig.exists()
            assert not thumb.exists()

    def test_delete_nonexistent_files_no_error(self, tmp_path):
        """删除不存在的文件不应抛出异常。"""
        with patch("app.utils.image.settings") as mock_settings:
            mock_settings.UPLOAD_DIR = tmp_path
            # 不应抛出异常
            delete_image_files("nonexistent.jpg", "nonexistent_thumb.jpg")

    def test_delete_partial_files(self, tmp_path):
        """删除部分存在的文件不应抛出异常。"""
        orig = tmp_path / "test.jpg"
        orig.write_bytes(b"fake image")

        with patch("app.utils.image.settings") as mock_settings:
            mock_settings.UPLOAD_DIR = tmp_path
            # 原图存在，缩略图不存在
            delete_image_files("test.jpg", "nonexistent_thumb.jpg")
            assert not orig.exists()

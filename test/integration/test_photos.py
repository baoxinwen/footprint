"""
集成测试 — 照片管理
关联用例: TC-PHOTO-001 ~ TC-PHOTO-007
"""
import pytest
from PIL import Image
from io import BytesIO
from starlette.datastructures import UploadFile


@pytest.mark.integration
class TestUploadPhoto:
    """照片上传。"""

    def _create_trip_with_location(self, client, auth_headers, sample_trip_data):
        resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        detail = client.get(f"/api/trips/{resp.json()['id']}", headers=auth_headers).json()
        return resp.json()["id"], detail["locations"][0]["id"]

    def test_upload_jpg_success(self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir):
        """TC-PHOTO-001: 正常上传 JPG。"""
        _, loc_id = self._create_trip_with_location(client, auth_headers, sample_trip_data)

        resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("test.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["location_id"] == loc_id
        assert "original_url" in data
        assert "thumbnail_url" in data

    def test_upload_file_too_large(self, client, auth_headers, sample_trip_data, large_image_bytes, upload_dir):
        """TC-PHOTO-002: 文件过大。"""
        _, loc_id = self._create_trip_with_location(client, auth_headers, sample_trip_data)

        resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("big.bmp", large_image_bytes, "image/bmp")},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "10MB" in resp.json()["detail"]

    def test_upload_invalid_file(self, client, auth_headers, sample_trip_data, upload_dir):
        """TC-PHOTO-003: 非法文件格式。"""
        _, loc_id = self._create_trip_with_location(client, auth_headers, sample_trip_data)

        resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("fake.jpg", b"not an image content", "image/jpeg")},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "不是合法的图片文件" in resp.json()["detail"]

    def test_upload_gif_thumbnail(self, client, auth_headers, sample_trip_data, test_gif_bytes, upload_dir):
        """TC-PHOTO-004: GIF 生成静态缩略图。"""
        _, loc_id = self._create_trip_with_location(client, auth_headers, sample_trip_data)

        resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("test.gif", test_gif_bytes, "image/gif")},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        assert resp.json()["thumbnail_url"] is not None

    def test_oversized_upload_reads_only_up_to_limit_plus_one(
        self, client, auth_headers, sample_trip_data, upload_dir, monkeypatch
    ):
        from app.core.config import settings

        _, loc_id = self._create_trip_with_location(client, auth_headers, sample_trip_data)
        original_read = UploadFile.read
        requested_sizes = []

        async def tracking_read(upload, size=-1):
            requested_sizes.append(size)
            return await original_read(upload, size)

        monkeypatch.setattr(UploadFile, "read", tracking_read)
        monkeypatch.setattr(settings, "MAX_FILE_SIZE", 32)
        resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("large.jpg", b"x" * 100, "image/jpeg")},
            headers=auth_headers,
        )

        assert resp.status_code == 400
        assert requested_sizes
        assert all(0 < size <= 33 for size in requested_sizes)


@pytest.mark.integration
class TestListPhotos:
    """照片列表。"""

    def test_list_photos_by_location(self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir):
        """TC-PHOTO-005: 按地点获取照片列表。"""
        resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        detail = client.get(f"/api/trips/{resp.json()['id']}", headers=auth_headers).json()
        loc_id = detail["locations"][0]["id"]

        # 上传 3 张照片
        for i in range(3):
            client.post(
                f"/api/photos/upload/{loc_id}",
                files={"file": (f"photo{i}.jpg", test_image_bytes, "image/jpeg")},
                headers=auth_headers,
            )

        resp = client.get(f"/api/photos/location/{loc_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 3


@pytest.mark.integration
class TestDeletePhoto:
    """照片删除。"""

    def test_delete_photo(self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir):
        """TC-PHOTO-006: 删除照片。"""
        resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        detail = client.get(f"/api/trips/{resp.json()['id']}", headers=auth_headers).json()
        loc_id = detail["locations"][0]["id"]

        upload_resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("test.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        )
        photo_id = upload_resp.json()["id"]

        resp = client.delete(f"/api/photos/{photo_id}", headers=auth_headers)
        assert resp.status_code == 200

        # 验证照片列表为空
        resp = client.get(f"/api/photos/location/{loc_id}", headers=auth_headers)
        assert len(resp.json()) == 0


@pytest.mark.integration
class TestPhotoAccessControl:
    """照片访问控制。"""

    def test_cannot_access_other_users_photos(self, client, auth_headers, auth_headers_user_b, sample_trip_data, test_image_bytes, upload_dir):
        """TC-PHOTO-007: 不能访问他人照片。"""
        resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        detail = client.get(f"/api/trips/{resp.json()['id']}", headers=auth_headers).json()
        loc_id = detail["locations"][0]["id"]

        resp = client.get(f"/api/photos/location/{loc_id}", headers=auth_headers_user_b)
        assert resp.status_code == 404

    def test_cannot_fetch_other_users_photo_files(self, client, auth_headers, auth_headers_user_b, sample_trip_data, test_image_bytes, upload_dir):
        """用户 B 不能通过原图/缩略图端点读取用户 A 的照片字节流。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        detail = client.get(f"/api/trips/{create_resp.json()['id']}", headers=auth_headers).json()
        loc_id = detail["locations"][0]["id"]
        upload_resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("secret.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        )
        photo_id = upload_resp.json()["id"]

        for endpoint in (f"/api/photos/{photo_id}/original", f"/api/photos/{photo_id}/thumbnail"):
            resp = client.get(endpoint, headers=auth_headers_user_b)
            assert resp.status_code == 404
            # 不返回任何图片字节
            assert not resp.content or resp.headers.get("content-type", "").startswith("application/json")

        # 属主访问不受影响
        owner_resp = client.get(f"/api/photos/{photo_id}/original", headers=auth_headers)
        assert owner_resp.status_code == 200

    def test_private_photo_rejects_legacy_path_traversal(
        self,
        client,
        auth_headers,
        sample_trip_data,
        test_image_bytes,
        upload_dir,
        db_session,
    ):
        from sqlalchemy import text

        _, loc_id = TestUploadPhoto()._create_trip_with_location(
            client, auth_headers, sample_trip_data
        )
        photo_id = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("photo.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        ).json()["id"]
        outside_file = upload_dir.parent / "private-secret.txt"
        outside_file.write_bytes(b"must-not-be-served")
        db_session.execute(
            text("UPDATE photos SET original_path = :path WHERE id = :id"),
            {"path": "../private-secret.txt", "id": photo_id},
        )
        db_session.commit()
        db_session.expire_all()

        response = client.get(
            f"/api/photos/{photo_id}/original", headers=auth_headers
        )

        assert response.status_code == 404
        assert b"must-not-be-served" not in response.content


@pytest.mark.integration
class TestPhotoNegativeCases:
    """边界与异常情况。"""

    def test_upload_to_nonexistent_location(self, client, auth_headers, test_image_bytes):
        resp = client.post("/api/photos/upload/99999", headers=auth_headers, files={"file": ("test.jpg", test_image_bytes, "image/jpeg")})
        assert resp.status_code == 404

    def test_delete_nonexistent_photo(self, client, auth_headers):
        resp = client.delete("/api/photos/99999", headers=auth_headers)
        assert resp.status_code == 404


@pytest.mark.integration
class TestUploadEdgeCases:
    """上传校验与事件循环回归（评审 I2/I3）。"""

    def _create_trip_with_location(self, client, auth_headers, sample_trip_data):
        resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        detail = client.get(f"/api/trips/{resp.json()['id']}", headers=auth_headers).json()
        return resp.json()["id"], detail["locations"][0]["id"]

    def test_valid_magic_bytes_with_disallowed_extension_returns_400(
        self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir
    ):
        """I2 回归: 魔数合法但扩展名不在白名单 → 400（曾穿透 save_image 的 ValueError 变 500）。"""
        _, loc_id = self._create_trip_with_location(client, auth_headers, sample_trip_data)

        resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("photo.txt", test_image_bytes, "text/plain")},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "不支持的文件格式" in resp.json()["detail"]

    def test_extreme_aspect_ratio_image_uploads_successfully(
        self, client, auth_headers, sample_trip_data, upload_dir
    ):
        """I2 回归: 600x1 合法 JPEG 曾因缩略图高度取整为 0 抛 ValueError 变 500。"""
        buf = BytesIO()
        Image.new("RGB", (600, 1), color=(10, 200, 10)).save(buf, "JPEG")

        _, loc_id = self._create_trip_with_location(client, auth_headers, sample_trip_data)

        resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("thin.jpg", buf.getvalue(), "image/jpeg")},
            headers=auth_headers,
        )
        assert resp.status_code == 201

    def test_thumbnail_generation_does_not_block_event_loop(
        self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir, monkeypatch
    ):
        """I3 回归: PIL 重活必须离开事件循环执行（曾在 async 端点内同步运行，
        处理期间阻塞整个服务的全部并发请求）。"""
        import asyncio

        from app.api import photos as photos_mod

        _, loc_id = self._create_trip_with_location(client, auth_headers, sample_trip_data)

        original_save = photos_mod.save_image
        probe = {}

        def probing_save_image(*args, **kwargs):
            # 在端点的调用上下文中探测：事件循环线程上会拿到 running loop，
            # 线程池工作线程上则拿不到
            try:
                asyncio.get_running_loop()
                probe["on_event_loop"] = True
            except RuntimeError:
                probe["on_event_loop"] = False
            return original_save(*args, **kwargs)

        monkeypatch.setattr(photos_mod, "save_image", probing_save_image)

        resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("test.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        )

        assert resp.status_code == 201
        assert probe.get("on_event_loop") is False, (
            "save_image（PIL 解码/缩放）运行在事件循环线程上，会阻塞全部并发请求"
        )

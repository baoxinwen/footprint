"""
集成测试 — 照片管理
关联用例: TC-PHOTO-001 ~ TC-PHOTO-007
"""
import pytest
from io import BytesIO


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


@pytest.mark.integration
class TestPhotoNegativeCases:
    """边界与异常情况。"""

    def test_upload_to_nonexistent_location(self, client, auth_headers, test_image_bytes):
        resp = client.post("/api/photos/upload/99999", headers=auth_headers, files={"file": ("test.jpg", test_image_bytes, "image/jpeg")})
        assert resp.status_code == 404

    def test_delete_nonexistent_photo(self, client, auth_headers):
        resp = client.delete("/api/photos/99999", headers=auth_headers)
        assert resp.status_code == 404

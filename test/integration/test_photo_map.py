"""集成测试 — 照片地图标记"""
import pytest


@pytest.mark.integration
class TestPhotoMapMarkers:
    def _create_trip_with_photo(self, client, auth_headers, test_image_bytes):
        """创建旅行并上传照片。"""
        trip_data = {
            "title": "测试旅行",
            "start_date": "2025-01-01",
            "end_date": "2025-01-02",
            "locations": [
                {"name": "测试地点", "address": "测试地址", "longitude": 116.0, "latitude": 39.0, "city": "北京", "province": "北京"},
            ],
        }
        resp = client.post("/api/trips", json=trip_data, headers=auth_headers)
        trip = resp.json()
        # Fetch trip detail to get location IDs
        detail = client.get(f"/api/trips/{trip['id']}", headers=auth_headers)
        trip = detail.json()
        location_id = trip["locations"][0]["id"]

        client.post(
            f"/api/photos/upload/{location_id}",
            headers=auth_headers,
            files={"file": ("test.jpg", test_image_bytes, "image/jpeg")},
        )
        return trip

    def test_get_photo_markers(self, client, auth_headers, test_image_bytes):
        """获取照片标记列表。"""
        self._create_trip_with_photo(client, auth_headers, test_image_bytes)
        resp = client.get("/api/stats/map/photos", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        marker = data[0]
        assert "photo_id" in marker
        assert "thumbnail_url" in marker
        assert "original_url" in marker
        assert "longitude" in marker
        assert "latitude" in marker
        assert "location_name" in marker
        assert "trip_id" in marker
        assert "trip_title" in marker

    def test_photo_markers_empty(self, client, auth_headers):
        """无照片时返回空列表。"""
        resp = client.get("/api/stats/map/photos", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_photo_markers_unauthorized(self, client):
        """未登录返回 401。"""
        resp = client.get("/api/stats/map/photos")
        assert resp.status_code in (401, 403)

    def test_photo_markers_isolation(self, client, auth_headers, auth_headers_user_b, test_image_bytes):
        """照片标记只包含当前用户的数据。"""
        self._create_trip_with_photo(client, auth_headers, test_image_bytes)
        resp = client.get("/api/stats/map/photos", headers=auth_headers_user_b)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_photo_markers_coordinates(self, client, auth_headers, test_image_bytes):
        """照片标记包含正确的坐标。"""
        self._create_trip_with_photo(client, auth_headers, test_image_bytes)
        resp = client.get("/api/stats/map/photos", headers=auth_headers)
        marker = resp.json()[0]
        assert marker["longitude"] == 116.0
        assert marker["latitude"] == 39.0

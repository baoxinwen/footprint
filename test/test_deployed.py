"""
Docker 部署实例完整集成测试。
覆盖: 认证、旅行、照片、导入导出、统计、分享、时间线、搜索、账户
用法: pytest test_deployed.py -v
"""
import pytest
import requests
import json
import io

BASE_URL = "http://localhost:8002"


@pytest.fixture(scope="module")
def base_url():
    return BASE_URL


@pytest.fixture(scope="module")
def api(base_url):
    """带认证的 API 会话。"""
    s = requests.Session()
    username = "demo"
    password = "123456"

    # 登录（demo 用户应该已存在）
    resp = s.post(f"{base_url}/api/auth/login", json={
        "username": username, "password": password
    })
    if resp.status_code != 200:
        pytest.skip(f"登录失败: {resp.status_code} {resp.text}")

    token = resp.json().get("access_token")
    s.headers["Authorization"] = f"Bearer {token}"
    return s


@pytest.fixture(scope="module")
def api_user_b(base_url):
    """第二个用户的 API 会话（数据隔离测试）。"""
    s = requests.Session()
    username = "authtest"
    password = "123456"

    # 登录（authtest 用户应该已存在）
    resp = s.post(f"{base_url}/api/auth/login", json={
        "username": username, "password": password
    })
    if resp.status_code != 200:
        pytest.skip(f"登录失败: {resp.status_code} {resp.text}")

    token = resp.json().get("access_token")
    s.headers["Authorization"] = f"Bearer {token}"
    return s


SAMPLE_TRIP = {
    "title": "部署测试旅行",
    "description": "测试描述",
    "start_date": "2025-01-01",
    "end_date": "2025-01-03",
    "locations": [
        {
            "name": "天安门广场",
            "address": "北京市东城区东长安街",
            "longitude": 116.397128,
            "latitude": 39.916527,
            "city": "北京",
            "province": "北京"
        },
        {
            "name": "故宫博物院",
            "address": "北京市东城区景山前街4号",
            "longitude": 116.397026,
            "latitude": 39.918056,
            "city": "北京",
            "province": "北京"
        }
    ]
}


def create_test_image(width=100, height=100, color="red", fmt="JPEG"):
    """生成测试图片。"""
    from PIL import Image
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


# ==================== 健康检查 ====================

class TestHealth:
    def test_backend_health(self, base_url):
        resp = requests.get(f"{base_url}/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_frontend_page(self):
        resp = requests.get("http://localhost:8001/")
        assert resp.status_code == 200

    def test_api_proxy(self):
        resp = requests.get("http://localhost:8001/api/health")
        assert resp.status_code == 200

    def test_csp_header(self):
        resp = requests.get("http://localhost:8001/")
        csp = resp.headers.get("Content-Security-Policy", "")
        assert "*.amap.com" in csp
        assert "*.autonavi.com" in csp


# ==================== 认证系统 ====================

class TestAuth:
    def test_register_success(self, base_url):
        import time
        resp = requests.post(f"{base_url}/api/auth/register", json={
            "username": f"newuser_{int(time.time())}", "password": "123456"
        })
        assert resp.status_code in (200, 400, 429)  # 400 = exists, 429 = rate limit

    def test_register_duplicate(self, base_url):
        import time
        username = f"dupuser_{int(time.time())}"
        requests.post(f"{base_url}/api/auth/register", json={
            "username": username, "password": "123456"
        })
        resp = requests.post(f"{base_url}/api/auth/register", json={
            "username": username, "password": "654321"
        })
        assert resp.status_code in (400, 429)

    def test_register_short_username(self, base_url):
        resp = requests.post(f"{base_url}/api/auth/register", json={
            "username": "ab", "password": "123456"
        })
        assert resp.status_code == 422

    def test_register_short_password(self, base_url):
        resp = requests.post(f"{base_url}/api/auth/register", json={
            "username": "testuser", "password": "12345"
        })
        assert resp.status_code == 422

    def test_login_success(self, base_url):
        requests.post(f"{base_url}/api/auth/register", json={
            "username": "logintest", "password": "123456"
        })
        resp = requests.post(f"{base_url}/api/auth/login", json={
            "username": "logintest", "password": "123456"
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, base_url):
        requests.post(f"{base_url}/api/auth/register", json={
            "username": "logintest2", "password": "123456"
        })
        resp = requests.post(f"{base_url}/api/auth/login", json={
            "username": "logintest2", "password": "wrong"
        })
        assert resp.status_code == 400

    def test_login_nonexistent_user(self, base_url):
        resp = requests.post(f"{base_url}/api/auth/login", json={
            "username": "ghost_user_xyz", "password": "123456"
        })
        assert resp.status_code == 400

    def test_no_token_rejected(self, base_url):
        resp = requests.get(f"{base_url}/api/trips")
        assert resp.status_code in (401, 403)

    def test_invalid_token_rejected(self, base_url):
        resp = requests.get(f"{base_url}/api/trips", headers={
            "Authorization": "Bearer fake-token-123"
        })
        assert resp.status_code == 401

    def test_change_password(self, base_url):
        import time
        s = requests.Session()
        username = f"changepwd_{int(time.time())}"
        password = "Test@123456"

        resp = s.post(f"{base_url}/api/auth/register", json={
            "username": username, "password": password
        })
        if resp.status_code not in (200, 400):
            pytest.skip(f"注册失败: {resp.status_code}")

        resp = s.post(f"{base_url}/api/auth/login", json={
            "username": username, "password": password
        })
        if resp.status_code != 200:
            pytest.skip(f"登录失败: {resp.status_code}")

        token = resp.json().get("access_token")
        s.headers["Authorization"] = f"Bearer {token}"

        resp = s.post(f"{base_url}/api/auth/change-password", json={
            "current_password": password,
            "new_password": "NewPass123",
            "confirm_password": "NewPass123"
        })
        assert resp.status_code == 200


# ==================== 旅行管理 ====================

class TestTrips:
    def test_create_trip(self, api, base_url):
        resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["title"] == SAMPLE_TRIP["title"]

    def test_create_trip_missing_dates(self, api, base_url):
        resp = api.post(f"{base_url}/api/trips", json={"title": "测试"})
        assert resp.status_code == 422

    def test_list_trips(self, api, base_url):
        resp = api.get(f"{base_url}/api/trips")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_list_trips_pagination(self, api, base_url):
        resp = api.get(f"{base_url}/api/trips?page=1&page_size=5")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) <= 5

    def test_get_trip_detail(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]

        resp = api.get(f"{base_url}/api/trips/{trip_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["locations"]) == 2

    def test_get_trip_not_found(self, api, base_url):
        resp = api.get(f"{base_url}/api/trips/99999")
        assert resp.status_code == 404

    def test_update_trip(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]

        resp = api.put(f"{base_url}/api/trips/{trip_id}", json={
            "title": "更新后的标题"
        })
        assert resp.status_code == 200
        assert resp.json()["title"] == "更新后的标题"

    def test_delete_trip(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]

        resp = api.delete(f"{base_url}/api/trips/{trip_id}")
        assert resp.status_code == 200

        resp = api.get(f"{base_url}/api/trips/{trip_id}")
        assert resp.status_code == 404

    def test_data_isolation(self, api, api_user_b, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]

        resp = api_user_b.get(f"{base_url}/api/trips/{trip_id}")
        assert resp.status_code == 404


# ==================== 地点管理 ====================

class TestLocations:
    def test_add_location(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]

        resp = api.post(f"{base_url}/api/trips/{trip_id}/locations", json={
            "name": "天坛",
            "address": "北京市东城区天坛东里",
            "longitude": 116.407,
            "latitude": 39.882,
            "city": "北京",
            "province": "北京"
        })
        assert resp.status_code in (200, 201)

    def test_delete_location(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]
        detail = api.get(f"{base_url}/api/trips/{trip_id}").json()
        loc_id = detail["locations"][0]["id"]

        resp = api.delete(f"{base_url}/api/trips/{trip_id}/locations/{loc_id}")
        assert resp.status_code == 200


# ==================== 照片管理 ====================

class TestPhotos:
    def _create_trip_with_location(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]
        detail = api.get(f"{base_url}/api/trips/{trip_id}").json()
        loc_id = detail["locations"][0]["id"]
        return trip_id, loc_id

    def test_upload_jpg(self, api, base_url):
        _, loc_id = self._create_trip_with_location(api, base_url)
        image_data = create_test_image()

        resp = api.post(
            f"{base_url}/api/photos/upload/{loc_id}",
            files={"file": ("test.jpg", image_data, "image/jpeg")}
        )
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert "original_url" in data
        assert "thumbnail_url" in data

    def test_upload_invalid_file(self, api, base_url):
        _, loc_id = self._create_trip_with_location(api, base_url)

        resp = api.post(
            f"{base_url}/api/photos/upload/{loc_id}",
            files={"file": ("fake.jpg", b"not an image", "image/jpeg")}
        )
        assert resp.status_code == 400

    def test_list_photos(self, api, base_url):
        _, loc_id = self._create_trip_with_location(api, base_url)
        image_data = create_test_image()

        for i in range(2):
            api.post(
                f"{base_url}/api/photos/upload/{loc_id}",
                files={"file": (f"photo{i}.jpg", image_data, "image/jpeg")}
            )

        resp = api.get(f"{base_url}/api/photos/location/{loc_id}")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_delete_photo(self, api, base_url):
        _, loc_id = self._create_trip_with_location(api, base_url)
        image_data = create_test_image()

        upload_resp = api.post(
            f"{base_url}/api/photos/upload/{loc_id}",
            files={"file": ("test.jpg", image_data, "image/jpeg")}
        )
        photo_id = upload_resp.json()["id"]

        resp = api.delete(f"{base_url}/api/photos/{photo_id}")
        assert resp.status_code == 200


# ==================== 导入导出 ====================

class TestExportImport:
    def test_export_json(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]

        resp = api.get(f"{base_url}/api/trips/{trip_id}/export/json")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == SAMPLE_TRIP["title"]
        assert len(data["locations"]) == 2

    def test_export_markdown(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]

        resp = api.get(f"{base_url}/api/trips/{trip_id}/export/markdown")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"

    def test_import_json(self, api, base_url):
        import_data = {
            "title": "导入测试旅行",
            "description": "通过导入创建",
            "startDate": "2025-03-01",
            "endDate": "2025-03-03",
            "locations": [
                {
                    "name": "西湖",
                    "address": "杭州市西湖区",
                    "longitude": 120.148,
                    "latitude": 30.242,
                    "city": "杭州",
                    "province": "浙江"
                }
            ]
        }
        json_bytes = json.dumps(import_data).encode("utf-8")

        resp = api.post(
            f"{base_url}/api/trips/import",
            files={"file": ("trip.json", io.BytesIO(json_bytes), "application/json")}
        )
        assert resp.status_code == 200
        assert "成功导入" in resp.json()["message"]

    def test_import_invalid_json(self, api, base_url):
        resp = api.post(
            f"{base_url}/api/trips/import",
            files={"file": ("trip.json", b"not json", "application/json")}
        )
        assert resp.status_code == 400

    def test_import_non_json_file(self, api, base_url):
        resp = api.post(
            f"{base_url}/api/trips/import",
            files={"file": ("data.txt", b"hello", "text/plain")}
        )
        assert resp.status_code == 400

    def test_import_array(self, api, base_url):
        import_data = [
            {
                "title": "批量导入1",
                "startDate": "2025-04-01",
                "endDate": "2025-04-02",
                "locations": [
                    {"name": "地点A", "address": "地址A", "longitude": 116.0, "latitude": 39.0, "city": "北京", "province": "北京"}
                ]
            },
            {
                "title": "批量导入2",
                "startDate": "2025-04-03",
                "endDate": "2025-04-04",
                "locations": [
                    {"name": "地点B", "address": "地址B", "longitude": 121.0, "latitude": 31.0, "city": "上海", "province": "上海"}
                ]
            }
        ]
        json_bytes = json.dumps(import_data).encode("utf-8")

        resp = api.post(
            f"{base_url}/api/trips/import",
            files={"file": ("trips.json", io.BytesIO(json_bytes), "application/json")}
        )
        assert resp.status_code == 200
        assert "成功导入 2 条" in resp.json()["message"]


# ==================== 统计分析 ====================

class TestStats:
    def test_overview(self, api, base_url):
        resp = api.get(f"{base_url}/api/stats/overview")
        assert resp.status_code == 200
        data = resp.json()
        assert "trip_count" in data
        assert "city_count" in data
        assert "total_days" in data

    def test_city_rank(self, api, base_url):
        resp = api.get(f"{base_url}/api/stats/city-rank")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_city_markers(self, api, base_url):
        resp = api.get(f"{base_url}/api/stats/map/cities")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_routes(self, api, base_url):
        resp = api.get(f"{base_url}/api/stats/map/routes")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_yearly_stats(self, api, base_url):
        resp = api.get(f"{base_url}/api/stats/yearly")
        assert resp.status_code == 200

    def test_monthly_stats(self, api, base_url):
        resp = api.get(f"{base_url}/api/stats/monthly")
        assert resp.status_code == 200


# ==================== 时间线 ====================

class TestTimeline:
    def test_timeline(self, api, base_url):
        resp = api.get(f"{base_url}/api/timeline")
        assert resp.status_code == 200

    def test_timeline_with_year_filter(self, api, base_url):
        resp = api.get(f"{base_url}/api/timeline?year=2025")
        assert resp.status_code == 200


# ==================== 分享功能 ====================

class TestShares:
    def test_create_share(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]

        resp = api.post(f"{base_url}/api/shares/{trip_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "expires_at" in data

    def test_view_share(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]

        share_resp = api.post(f"{base_url}/api/shares/{trip_id}")
        token = share_resp.json()["token"]

        resp = requests.get(f"{base_url}/api/shares/view/{token}")
        assert resp.status_code == 200
        assert "title" in resp.json()

    def test_view_share_not_found(self, base_url):
        resp = requests.get(f"{base_url}/api/shares/view/nonexistent-token-123")
        assert resp.status_code == 404

    def test_create_share_reuse(self, api, base_url):
        create_resp = api.post(f"{base_url}/api/trips", json=SAMPLE_TRIP)
        trip_id = create_resp.json()["id"]

        resp1 = api.post(f"{base_url}/api/shares/{trip_id}")
        resp2 = api.post(f"{base_url}/api/shares/{trip_id}")
        assert resp1.json()["token"] == resp2.json()["token"]


# ==================== 搜索功能 ====================

class TestSearch:
    def test_search_trips(self, api, base_url):
        resp = api.get(f"{base_url}/api/search?q=北京")
        assert resp.status_code == 200

    def test_search_empty(self, api, base_url):
        resp = api.get(f"{base_url}/api/search?q=")
        assert resp.status_code in (200, 422)


# ==================== 账户管理 ====================

class TestAccount:
    def test_get_account_info(self, api, base_url):
        resp = api.get(f"{base_url}/api/account/info")
        assert resp.status_code == 200
        data = resp.json()
        assert "username" in data

    def test_get_account_unauthenticated(self, base_url):
        resp = requests.get(f"{base_url}/api/account/info")
        assert resp.status_code in (401, 403)

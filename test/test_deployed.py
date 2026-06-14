"""
针对已部署实例的 HTTP 集成测试。
用法: pytest test_deployed.py --base-url=http://192.168.31.254:8002
"""
import pytest
import requests

BASE_URL = "http://localhost:8002"


@pytest.fixture(scope="module")
def base_url(request):
    return request.config.getoption("--base-url", default=BASE_URL)


@pytest.fixture(scope="module")
def api(base_url):
    """带认证的 API 会话。"""
    s = requests.Session()

    # 注册
    s.post(f"{base_url}/api/auth/register", json={
        "username": "deploytest",
        "password": "Test@123456"
    })

    # 登录
    resp = s.post(f"{base_url}/api/auth/login", json={
        "username": "deploytest",
        "password": "Test@123456"
    })
    token = resp.json().get("access_token")
    s.headers["Authorization"] = f"Bearer {token}"
    return s


class TestHealth:
    def test_backend_health(self, base_url):
        resp = requests.get(f"{base_url}/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_frontend_health(self):
        resp = requests.get("http://localhost:8001/")
        assert resp.status_code == 200

    def test_api_proxy(self):
        resp = requests.get("http://localhost:8001/api/health")
        assert resp.status_code == 200


class TestAuth:
    def test_register_and_login(self, base_url):
        s = requests.Session()
        resp = s.post(f"{base_url}/api/auth/register", json={
            "username": "authtest",
            "password": "Test@123456"
        })
        assert resp.status_code in (200, 201, 400)  # 400 = already exists

        resp = s.post(f"{base_url}/api/auth/login", json={
            "username": "authtest",
            "password": "Test@123456"
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_protected_endpoint_without_token(self, base_url):
        resp = requests.get(f"{base_url}/api/trips")
        assert resp.status_code in (401, 403)


class TestTrips:
    def test_create_trip(self, api, base_url):
        resp = api.post(f"{base_url}/api/trips", json={
            "title": "部署测试旅行",
            "description": "测试描述",
            "start_date": "2025-01-01",
            "end_date": "2025-01-03",
            "locations": [
                {
                    "name": "测试地点",
                    "address": "测试地址",
                    "longitude": 116.397,
                    "latitude": 39.916,
                    "city": "北京",
                    "province": "北京"
                }
            ]
        })
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["title"] == "部署测试旅行"

    def test_list_trips(self, api, base_url):
        resp = api.get(f"{base_url}/api/trips")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data

    def test_import_trips(self, api, base_url):
        import json
        import io

        import_data = {
            "title": "导入测试",
            "description": "通过导入创建",
            "startDate": "2025-02-01",
            "endDate": "2025-02-03",
            "locations": [
                {
                    "name": "导入地点",
                    "address": "导入地址",
                    "longitude": 121.473,
                    "latitude": 31.230,
                    "city": "上海",
                    "province": "上海"
                }
            ]
        }

        json_bytes = json.dumps(import_data).encode('utf-8')
        resp = api.post(
            f"{base_url}/api/trips/import",
            files={"file": ("test.json", io.BytesIO(json_bytes), "application/json")}
        )

        assert resp.status_code == 200
        assert "成功导入" in resp.json()["message"]


class TestStats:
    def test_overview_stats(self, api, base_url):
        resp = api.get(f"{base_url}/api/stats/overview")
        assert resp.status_code == 200

    def test_timeline(self, api, base_url):
        resp = api.get(f"{base_url}/api/timeline")
        assert resp.status_code == 200


class TestAccount:
    def test_get_account(self, api, base_url):
        resp = api.get(f"{base_url}/api/account")
        assert resp.status_code in (200, 404)  # 404 if endpoint doesn't exist


def pytest_addoption(parser):
    parser.addoption("--base-url", action="store", default=BASE_URL)

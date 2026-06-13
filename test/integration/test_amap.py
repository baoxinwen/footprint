"""集成测试 — 高德地图 POI 搜索（mock 外部请求）"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
import app.api.amap as amap_module


@pytest.mark.integration
class TestAmapPoiSearch:
    def _make_mock_client(self, response_data):
        """创建 mock HTTP 客户端。"""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = response_data
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.is_closed = False
        return mock_client

    def test_search_poi_success(self, client, auth_headers):
        mock_client = self._make_mock_client({
            "status": "1",
            "pois": [
                {"name": "故宫博物院", "address": "景山前街4号", "location": "116.397128,39.916527", "cityname": "北京", "pname": "北京市"},
            ]
        })
        amap_module._http_client = mock_client
        try:
            resp = client.get("/api/amap/poi/search", params={"keywords": "故宫"}, headers=auth_headers)
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["name"] == "故宫博物院"
        finally:
            amap_module._http_client = None

    def test_search_poi_unauthorized(self, client):
        resp = client.get("/api/amap/poi/search", params={"keywords": "test"})
        assert resp.status_code in (401, 403)

    def test_search_poi_empty_result(self, client, auth_headers):
        mock_client = self._make_mock_client({"status": "1", "pois": []})
        amap_module._http_client = mock_client
        try:
            resp = client.get("/api/amap/poi/search", params={"keywords": "不存在的地点xyz"}, headers=auth_headers)
            assert resp.status_code == 200
            assert resp.json() == []
        finally:
            amap_module._http_client = None

"""集成测试 — 全局搜索"""
import pytest


@pytest.mark.integration
class TestSearch:
    def test_search_trips_by_title(self, client, auth_headers, sample_trip_data):
        """搜索旅行标题。"""
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        resp = client.get("/api/search", params={"q": "北京"}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["trips"]) >= 1
        assert any("北京" in t["title"] for t in data["trips"])

    def test_search_locations_by_name(self, client, auth_headers, sample_trip_data):
        """搜索地点名称。"""
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        resp = client.get("/api/search", params={"q": "故宫"}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["locations"]) >= 1
        assert any("故宫" in l["name"] for l in data["locations"])

    def test_search_locations_by_city(self, client, auth_headers, sample_trip_data):
        """搜索城市名。"""
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        resp = client.get("/api/search", params={"q": "北京"}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["locations"]) >= 1

    def test_search_empty_query(self, client, auth_headers):
        """空查询返回 422。"""
        resp = client.get("/api/search", params={"q": ""}, headers=auth_headers)
        assert resp.status_code == 422

    def test_search_no_results(self, client, auth_headers):
        """无匹配结果返回空列表。"""
        resp = client.get("/api/search", params={"q": "不存在的地点xyz"}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["trips"] == []
        assert data["locations"] == []

    def test_search_unauthorized(self, client):
        """未登录返回 401。"""
        resp = client.get("/api/search", params={"q": "test"})
        assert resp.status_code in (401, 403)

    def test_search_isolation(self, client, auth_headers, auth_headers_user_b, sample_trip_data):
        """搜索结果只包含当前用户的数据。"""
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        resp = client.get("/api/search", params={"q": "北京"}, headers=auth_headers_user_b)
        assert resp.status_code == 200
        data = resp.json()
        assert data["trips"] == []
        assert data["locations"] == []

    def test_search_special_characters(self, client, auth_headers):
        """特殊字符不导致错误，且能精确匹配含特殊字符的地点。"""
        # Create a trip with a location named literally "%_test"
        trip_data = {
            "title": "特殊字符测试",
            "start_date": "2025-01-01",
            "end_date": "2025-01-02",
            "locations": [
                {"name": "%_test", "address": "测试地址", "longitude": 116.0, "latitude": 39.0, "city": "北京", "province": "北京"},
            ],
        }
        client.post("/api/trips", json=trip_data, headers=auth_headers)
        resp = client.get("/api/search", params={"q": "%_test"}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["locations"]) == 1
        assert data["locations"][0]["name"] == "%_test"

    def test_search_results_contain_trip_info(self, client, auth_headers, sample_trip_data):
        """地点搜索结果包含关联旅行信息。"""
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        resp = client.get("/api/search", params={"q": "故宫"}, headers=auth_headers)
        data = resp.json()
        assert len(data["locations"]) >= 1
        loc = data["locations"][0]
        assert "trip_id" in loc
        assert "trip_title" in loc
        assert "city" in loc

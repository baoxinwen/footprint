"""
集成测试 — 统计分析
关联用例: TC-STATS-001 ~ TC-STATS-006
"""
import pytest


@pytest.mark.integration
class TestOverviewStats:
    """数据概览。"""

    def test_overview_empty(self, client, auth_headers):
        """TC-STATS-001: 无数据时返回全零。"""
        resp = client.get("/api/stats/overview", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["trip_count"] == 0
        assert data["city_count"] == 0
        assert data["total_days"] == 0

    def test_overview_with_data(self, client, auth_headers, sample_trip_data):
        """TC-STATS-002: 有数据时统计正确。"""
        # 创建 2 次旅行
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        client.post("/api/trips", json={
            **sample_trip_data,
            "title": "上海之旅",
            "start_date": "2025-11-01",
            "end_date": "2025-11-02",
            "locations": [{
                "name": "外滩",
                "address": "上海市黄浦区",
                "longitude": 121.490,
                "latitude": 31.240,
                "city": "上海",
                "province": "上海",
            }],
        }, headers=auth_headers)

        resp = client.get("/api/stats/overview", headers=auth_headers)
        data = resp.json()
        assert data["trip_count"] == 2
        assert data["city_count"] == 2  # 北京、上海
        assert data["province_count"] == 2
        assert data["total_days"] == 5  # 3天 + 2天


@pytest.mark.integration
class TestCityRank:
    """城市排行榜。"""

    def test_city_rank(self, client, auth_headers, sample_trip_data):
        """TC-STATS-003: 城市排行按次数排序。"""
        # 北京 3 次
        for _ in range(3):
            client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        # 上海 1 次
        client.post("/api/trips", json={
            **sample_trip_data,
            "title": "上海游",
            "locations": [{
                "name": "外滩", "address": "上海", "longitude": 121.49,
                "latitude": 31.24, "city": "上海", "province": "上海",
            }],
        }, headers=auth_headers)

        resp = client.get("/api/stats/city-rank", headers=auth_headers)
        ranks = resp.json()
        assert ranks[0]["city"] == "北京"
        assert ranks[0]["count"] == 3


@pytest.mark.integration
class TestMapStats:
    """地图统计。"""

    def test_city_markers(self, client, auth_headers, sample_trip_data):
        """TC-STATS-004: 城市标记数据。"""
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)

        resp = client.get("/api/stats/map/cities", headers=auth_headers)
        markers = resp.json()
        assert len(markers) >= 1
        assert all("city" in m and "longitude" in m and "count" in m for m in markers)

    def test_trip_route(self, client, auth_headers, sample_trip_data):
        """TC-STATS-005: 单次旅行路线。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp = client.get(f"/api/stats/map/route/{trip_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["locations"]) == 2
        assert "color" in data

    def test_routes_exclude_single_location(self, client, auth_headers, sample_trip_data):
        """TC-STATS-006: 单地点旅行不生成路线。"""
        # 创建一个只有单地点的旅行
        single_resp = client.post("/api/trips", json={
            "title": "单地点", "start_date": "2025-10-01", "end_date": "2025-10-01",
            "locations": [{
                "name": "故宫", "address": "北京", "longitude": 116.397,
                "latitude": 39.916, "city": "北京", "province": "北京",
            }],
        }, headers=auth_headers)
        single_trip_id = single_resp.json()["id"]

        # 创建一个有多地点的旅行
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)

        resp = client.get("/api/stats/map/routes", headers=auth_headers)
        routes = resp.json()
        # 单地点旅行不应出现在路线中
        assert all(r["trip_id"] != single_trip_id for r in routes)


@pytest.mark.integration
class TestYearlyMonthly:
    """年度/月度统计。"""

    def test_yearly_stats(self, client, auth_headers, sample_trip_data):
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        resp = client.get("/api/stats/yearly", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_monthly_stats(self, client, auth_headers, sample_trip_data):
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        resp = client.get("/api/stats/monthly", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


@pytest.mark.integration
class TestStatsIsolation:
    """统计数据隔离。"""

    def test_stats_isolation(self, client, auth_headers, auth_headers_user_b, sample_trip_data):
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        resp_a = client.get("/api/stats/overview", headers=auth_headers)
        resp_b = client.get("/api/stats/overview", headers=auth_headers_user_b)
        assert resp_a.json()["trip_count"] == 1
        assert resp_b.json()["trip_count"] == 0

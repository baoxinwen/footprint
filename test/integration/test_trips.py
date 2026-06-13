"""
集成测试 — 旅行管理
关联用例: TC-TRIP-001 ~ TC-TRIP-014
"""
import pytest


@pytest.mark.integration
class TestCreateTrip:
    """创建旅行。"""

    def test_create_trip_success(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-001: 正常创建旅行含地点。"""
        resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "北京三日游"
        assert data["location_count"] == 2
        assert "北京" in data["cities"]

    def test_create_trip_missing_dates(self, client, auth_headers):
        """TC-TRIP-002: 缺少日期。"""
        resp = client.post("/api/trips", json={
            "title": "测试"
        }, headers=auth_headers)
        assert resp.status_code == 422

    def test_create_trip_end_before_start(self, client, auth_headers):
        """TC-TRIP-003: 结束日期早于开始日期。"""
        resp = client.post("/api/trips", json={
            "title": "测试", "start_date": "2025-10-05", "end_date": "2025-10-01"
        }, headers=auth_headers)
        assert resp.status_code == 422


@pytest.mark.integration
class TestListTrips:
    """旅行列表。"""

    def test_list_trips_pagination(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-004: 分页查询。"""
        # 创建 25 条记录
        for i in range(25):
            data = {**sample_trip_data, "title": f"旅行{i:02d}"}
            client.post("/api/trips", json=data, headers=auth_headers)

        resp = client.get("/api/trips?page=1&page_size=20", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 25
        assert len(body["items"]) == 20

    def test_list_trips_search(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-005: 搜索。"""
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        client.post("/api/trips", json={
            **sample_trip_data, "title": "上海之旅"
        }, headers=auth_headers)

        resp = client.get("/api/trips?search=北京", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 1
        assert all("北京" in item["title"] or "北京" in str(item.get("cities", [])) for item in body["items"])

    def test_list_trips_sort_by_name(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-006: 按名称排序。"""
        client.post("/api/trips", json={**sample_trip_data, "title": "B旅行"}, headers=auth_headers)
        client.post("/api/trips", json={**sample_trip_data, "title": "A旅行"}, headers=auth_headers)

        resp = client.get("/api/trips?sort_by=name&order=asc", headers=auth_headers)
        items = resp.json()["items"]
        assert items[0]["title"] <= items[1]["title"]


@pytest.mark.integration
class TestGetTrip:
    """获取旅行详情。"""

    def test_get_trip_detail(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-007: 获取含地点的旅行详情。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp = client.get(f"/api/trips/{trip_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["locations"]) == 2
        assert data["locations"][0]["sort_order"] == 0

    def test_get_trip_not_found(self, client, auth_headers):
        """TC-TRIP-008: 旅行不存在。"""
        resp = client.get("/api/trips/99999", headers=auth_headers)
        assert resp.status_code == 404


@pytest.mark.integration
class TestUpdateTrip:
    """更新旅行。"""

    def test_update_trip_title(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-009: 修改旅行标题。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp = client.put(f"/api/trips/{trip_id}", json={"title": "新标题"}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["title"] == "新标题"


@pytest.mark.integration
class TestDeleteTrip:
    """删除旅行。"""

    def test_delete_trip(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-010: 删除旅行。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp = client.delete(f"/api/trips/{trip_id}", headers=auth_headers)
        assert resp.status_code == 200

        # 验证已删除
        resp = client.get(f"/api/trips/{trip_id}", headers=auth_headers)
        assert resp.status_code == 404


@pytest.mark.integration
class TestLocations:
    """地点管理。"""

    def test_add_location(self, client, auth_headers, sample_trip_data, sample_location_data):
        """TC-TRIP-011: 添加地点。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp = client.post(f"/api/trips/{trip_id}/locations", json=sample_location_data, headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "天坛"
        assert data["sort_order"] == 2  # 已有 2 个地点，新地点排第 3

    def test_delete_location(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-012: 删除地点。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]
        loc_id = create_resp.json()["locations"][0]["id"] if "locations" in create_resp.json() else None

        # 获取详情拿 location id
        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        loc_id = detail["locations"][0]["id"]

        resp = client.delete(f"/api/trips/{trip_id}/locations/{loc_id}", headers=auth_headers)
        assert resp.status_code == 200

    def test_update_sort_order(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-013: 更新排序。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]
        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        locs = detail["locations"]

        # 反转顺序
        orders = [{"location_id": locs[1]["id"], "sort_order": 0}, {"location_id": locs[0]["id"], "sort_order": 1}]
        resp = client.put(f"/api/trips/{trip_id}/locations/sort", json=orders, headers=auth_headers)
        assert resp.status_code == 200

        # 验证顺序已更新
        detail2 = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        assert detail2["locations"][0]["id"] == locs[1]["id"]


@pytest.mark.integration
class TestDataIsolation:
    """数据隔离。"""

    def test_cannot_access_other_users_trip(self, client, auth_headers, auth_headers_user_b, sample_trip_data):
        """TC-TRIP-014: 用户不能访问他人的旅行。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp = client.get(f"/api/trips/{trip_id}", headers=auth_headers_user_b)
        assert resp.status_code == 404


@pytest.mark.integration
class TestTripNegativeCases:
    """边界与异常情况。"""

    def test_get_nonexistent_trip(self, client, auth_headers):
        resp = client.get("/api/trips/99999", headers=auth_headers)
        assert resp.status_code == 404

    def test_update_nonexistent_trip(self, client, auth_headers):
        resp = client.put("/api/trips/99999", json={"title": "test", "start_date": "2025-01-01", "end_date": "2025-01-02"}, headers=auth_headers)
        assert resp.status_code == 404

    def test_delete_nonexistent_trip(self, client, auth_headers):
        resp = client.delete("/api/trips/99999", headers=auth_headers)
        assert resp.status_code == 404

    def test_update_trip_end_before_start(self, client, auth_headers, sample_trip_data):
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]
        resp = client.put(f"/api/trips/{trip_id}", json={"title": "test", "start_date": "2025-10-05", "end_date": "2025-10-01"}, headers=auth_headers)
        assert resp.status_code == 422

"""
集成测试 — 旅行管理
关联用例: TC-TRIP-001 ~ TC-TRIP-014
"""
import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker


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

    def test_list_trips_search_with_location_count_sort(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-004b: search/city 筛选与按地点数排序组合（回归：曾因 Location 双 JOIN 报 500）。"""
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        client.post("/api/trips", json={**sample_trip_data, "title": "上海之旅"}, headers=auth_headers)

        resp = client.get("/api/trips?search=北京&sort_by=location_count&order=desc", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

        resp = client.get("/api/trips?city=北京&sort_by=location_count&order=desc", headers=auth_headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert items[0]["location_count"] >= items[-1]["location_count"]

    def test_list_trips_search_combined_with_city(self, client, auth_headers, sample_trip_data):
        """回归（评审 I-1）：search 与 city 筛选叠加不得因 Location 双 JOIN 报 500。"""
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        client.post("/api/trips", json={**sample_trip_data, "title": "上海之旅", "locations": [
            {**sample_trip_data["locations"][0], "city": "上海", "province": "上海"},
            sample_trip_data["locations"][1],
        ]}, headers=auth_headers)

        resp = client.get("/api/trips?search=北京&city=北京", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] >= 1
        assert all("北京" in item["cities"] for item in body["items"])

        # 与排序叠加的组合同样可用（沿用 2026-09-04 C2 的既有回归路径）
        resp = client.get("/api/trips?search=北京&city=北京&sort_by=location_count", headers=auth_headers)
        assert resp.status_code == 200, resp.text

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

    def test_update_start_date_only_cannot_move_after_existing_end_date(
        self, client, auth_headers, sample_trip_data
    ):
        create_resp = client.post(
            "/api/trips", json=sample_trip_data, headers=auth_headers
        )
        trip_id = create_resp.json()["id"]

        resp = client.put(
            f"/api/trips/{trip_id}",
            json={"start_date": "2025-10-04"},
            headers=auth_headers,
        )

        assert resp.status_code == 422
        assert resp.json()["detail"] == "结束日期须大于等于开始日期"
        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        assert detail["start_date"] == "2025-10-01"
        assert detail["end_date"] == "2025-10-03"

    def test_update_end_date_only_cannot_move_before_existing_start_date(
        self, client, auth_headers, sample_trip_data
    ):
        create_resp = client.post(
            "/api/trips", json=sample_trip_data, headers=auth_headers
        )
        trip_id = create_resp.json()["id"]

        resp = client.put(
            f"/api/trips/{trip_id}",
            json={"end_date": "2025-09-30"},
            headers=auth_headers,
        )

        assert resp.status_code == 422
        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        assert detail["start_date"] == "2025-10-01"
        assert detail["end_date"] == "2025-10-03"

    def test_update_trip_replaces_locations_in_one_request(
        self, client, auth_headers, sample_trip_data, sample_location_data
    ):
        create_resp = client.post(
            "/api/trips", json=sample_trip_data, headers=auth_headers
        )
        trip_id = create_resp.json()["id"]
        original = client.get(
            f"/api/trips/{trip_id}", headers=auth_headers
        ).json()
        dropped_location = original["locations"][0]
        kept_location = original["locations"][1]

        response = client.put(
            f"/api/trips/{trip_id}",
            json={
                "title": "北京深度游",
                "locations": [
                    {
                        **kept_location,
                        "note": "更新后的游记",
                    },
                    sample_location_data,
                ],
                # 新契约：被丢弃的既有地点必须显式声明删除
                "removed_location_ids": [dropped_location["id"]],
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        assert detail["title"] == "北京深度游"
        assert [location["name"] for location in detail["locations"]] == [
            kept_location["name"],
            sample_location_data["name"],
        ]
        assert detail["locations"][0]["id"] == kept_location["id"]
        assert detail["locations"][0]["note"] == "更新后的游记"
        assert [location["sort_order"] for location in detail["locations"]] == [0, 1]

    def test_invalid_location_rolls_back_the_whole_trip_update(
        self, client, auth_headers, sample_trip_data
    ):
        create_resp = client.post(
            "/api/trips", json=sample_trip_data, headers=auth_headers
        )
        trip_id = create_resp.json()["id"]
        original = client.get(
            f"/api/trips/{trip_id}", headers=auth_headers
        ).json()

        response = client.put(
            f"/api/trips/{trip_id}",
            json={
                "title": "不应保存的标题",
                "locations": [
                    {
                        **original["locations"][0],
                        "longitude": 999,
                    }
                ],
            },
            headers=auth_headers,
        )

        assert response.status_code == 422
        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        assert detail["title"] == original["title"]
        assert detail["locations"] == original["locations"]

    def test_update_trip_rejects_location_from_another_trip(
        self, client, auth_headers, auth_headers_user_b, sample_trip_data
    ):
        trip_a = client.post(
            "/api/trips", json=sample_trip_data, headers=auth_headers
        ).json()
        trip_b = client.post(
            "/api/trips", json=sample_trip_data, headers=auth_headers_user_b
        ).json()
        foreign_location = client.get(
            f"/api/trips/{trip_b['id']}", headers=auth_headers_user_b
        ).json()["locations"][0]
        # 携带本旅行全部既有地点 + 一个外来 id，
        # 隔离验证"外来 id"这一种错误（不与陈旧快照的 409 混淆）
        own_locations = client.get(
            f"/api/trips/{trip_a['id']}", headers=auth_headers
        ).json()["locations"]

        response = client.put(
            f"/api/trips/{trip_a['id']}",
            json={"locations": [{**location} for location in own_locations] + [{**foreign_location}]},
            headers=auth_headers,
        )

        assert response.status_code == 422
        detail = client.get(
            f"/api/trips/{trip_a['id']}", headers=auth_headers
        ).json()
        assert len(detail["locations"]) == 2


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

    def test_add_location_sort_order_with_single_existing(self, client, auth_headers, sample_trip_data, sample_location_data):
        """回归（评审 M-12）：仅 1 个既有地点时，新地点 sort_order 应为 1 而非 0。"""
        single = {**sample_trip_data, "locations": [sample_trip_data["locations"][0]]}
        create_resp = client.post("/api/trips", json=single, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp = client.post(f"/api/trips/{trip_id}/locations", json=sample_location_data, headers=auth_headers)
        assert resp.status_code == 201
        assert resp.json()["sort_order"] == 1

    def test_delete_location(self, client, auth_headers, sample_trip_data):
        """TC-TRIP-012: 删除地点。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

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

    def test_update_sort_order_persists_under_production_autoflush(
        self, client, auth_headers, sample_trip_data
    ):
        """回归（评审 C1）：生产会话 autoflush=False 时排序必须真正落库。

        仓库夹具的 TestSession 用默认 autoflush=True 并在请求后替端点 commit，
        与生产 sessionmaker(autoflush=False) 不一致，曾掩盖「排序接口返回成功
        但规范化查询把新顺序覆盖回旧顺序」的空操作。本用例用与生产同配置的
        会话工厂替换 get_db，并直接读数据库已提交状态。
        """
        from test.conftest import _shared_session  # noqa: PLC0415 夹具内部模块
        from app.core.database import get_db

        # 先用默认夹具会话创建旅行（首个请求后共享会话才就位），再取同一个引擎
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]
        engine = _shared_session[0].get_bind()
        ProdSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)

        def _production_db():
            db = ProdSession()
            try:
                yield db
            finally:
                db.close()

        client.app.dependency_overrides[get_db] = _production_db
        try:
            detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
            locs = detail["locations"]

            orders = [
                {"location_id": locs[1]["id"], "sort_order": 0},
                {"location_id": locs[0]["id"], "sort_order": 1},
            ]
            resp = client.put(f"/api/trips/{trip_id}/locations/sort", json=orders, headers=auth_headers)
            assert resp.status_code == 200

            # 直接读数据库的已提交状态，不经过任何会话缓存
            check = ProdSession()
            try:
                rows = check.execute(
                    text("SELECT id, sort_order FROM locations WHERE trip_id = :t ORDER BY id"),
                    {"t": trip_id},
                ).all()
            finally:
                check.close()
            assert dict(rows) == {locs[0]["id"]: 1, locs[1]["id"]: 0}
        finally:
            client.app.dependency_overrides.pop(get_db, None)


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

    def test_nan_coordinates_return_422(self, client, auth_headers, sample_trip_data):
        """回归（评审 M-10）：NaN 经纬度校验失败应回 422，而不是错误体序列化 500。"""
        from fastapi.testclient import TestClient

        body = {
            **sample_trip_data,
            "locations": [{**sample_trip_data["locations"][0], "longitude": float("nan")}],
        }
        quiet = TestClient(client.app, raise_server_exceptions=False)
        resp = quiet.post("/api/trips", json=body, headers=auth_headers)
        assert resp.status_code == 422, resp.text

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


@pytest.mark.integration
class TestUpdateLocationsContract:
    """locations 全量同步契约：显式删除 + 数据冲突保护。"""

    @staticmethod
    def _sync_payload(location: dict) -> dict:
        return {
            "id": location["id"],
            "name": location["name"],
            "address": location["address"],
            "longitude": location["longitude"],
            "latitude": location["latitude"],
            "city": location["city"],
            "province": location["province"],
            "note": location["note"],
        }

    def _create_trip_with_locations(self, client, auth_headers, sample_trip_data):
        resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        assert resp.status_code == 201
        trip_id = resp.json()["id"]
        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        return trip_id, detail["locations"]

    def test_explicit_removal_deletes_only_listed_location(
        self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir, db_session
    ):
        """显式 removed_location_ids 删除目标地点，其余保留且照片文件被清理。"""
        trip_id, locs = self._create_trip_with_locations(client, auth_headers, sample_trip_data)
        keep_loc, remove_loc = locs[0], locs[1]

        upload_resp = client.post(
            f"/api/photos/upload/{remove_loc['id']}",
            files={"file": ("gone.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        )
        assert upload_resp.status_code == 201
        stored_path = db_session.execute(
            text("SELECT original_path FROM photos WHERE id = :id"),
            {"id": upload_resp.json()["id"]},
        ).scalar_one()
        stored_file = upload_dir / stored_path
        assert stored_file.exists()

        payload = {
            "title": "编辑后",
            "locations": [self._sync_payload(keep_loc)],
            "removed_location_ids": [remove_loc["id"]],
        }
        resp = client.put(f"/api/trips/{trip_id}", json=payload, headers=auth_headers)
        assert resp.status_code == 200

        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        assert [loc["id"] for loc in detail["locations"]] == [keep_loc["id"]]
        assert not stored_file.exists(), "被删地点的照片文件应一并清理"

    def test_stale_snapshot_without_removed_ids_is_rejected(
        self, client, auth_headers, sample_trip_data
    ):
        """陈旧快照（缺失地点又未声明删除）必须 409，且数据不受损。"""
        trip_id, locs = self._create_trip_with_locations(client, auth_headers, sample_trip_data)

        payload = {
            "title": "陈旧快照保存",
            "locations": [self._sync_payload(locs[0])],
        }
        resp = client.put(f"/api/trips/{trip_id}", json=payload, headers=auth_headers)
        assert resp.status_code == 409

        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        assert sorted(loc["id"] for loc in detail["locations"]) == sorted(
            loc["id"] for loc in locs
        ), "冲突拒绝后两个地点都必须完好"

    def test_foreign_removed_location_id_rejected(
        self, client, auth_headers, sample_trip_data
    ):
        """removed_location_ids 携带不属于本旅行的 ID → 422。"""
        trip_id, locs = self._create_trip_with_locations(client, auth_headers, sample_trip_data)

        payload = {
            "title": "t",
            "locations": [self._sync_payload(loc) for loc in locs],
            "removed_location_ids": [99999],
        }
        resp = client.put(f"/api/trips/{trip_id}", json=payload, headers=auth_headers)
        assert resp.status_code == 422

    def test_partial_update_without_locations_keeps_all(
        self, client, auth_headers, sample_trip_data
    ):
        """不带 locations 键的部分更新（仅标题）不触发地点契约，全部保留。"""
        trip_id, locs = self._create_trip_with_locations(client, auth_headers, sample_trip_data)

        resp = client.put(
            f"/api/trips/{trip_id}", json={"title": "只改标题"}, headers=auth_headers
        )
        assert resp.status_code == 200

        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        assert len(detail["locations"]) == len(locs)

    def test_removed_ids_without_locations_rejected(self, client, auth_headers, sample_trip_data):
        """契约：removed_location_ids 单独出现（无 locations）必须 422，不得静默忽略。"""
        trip_id, locs = self._create_trip_with_locations(client, auth_headers, sample_trip_data)

        resp = client.put(f"/api/trips/{trip_id}", json={
            "title": "只带删除声明",
            "removed_location_ids": [locs[0]["id"]],
        }, headers=auth_headers)
        assert resp.status_code == 422
        assert "locations" in resp.json()["detail"]

        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        assert len(detail["locations"]) == len(locs), "地点不得被删除"


@pytest.mark.integration
class TestTripCoverPhoto:
    """旅行列表封面照片字段（UI 2.0 新增）。"""

    def _upload(self, client, headers, loc_id, name, image_bytes):
        resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": (name, image_bytes, "image/jpeg")},
            headers=headers,
        )
        assert resp.status_code == 201
        return resp.json()["id"]

    def test_cover_none_without_photos(self, client, auth_headers, sample_trip_data):
        """无照片的旅行封面字段为 None。"""
        trip_id = client.post("/api/trips", json=sample_trip_data, headers=auth_headers).json()["id"]

        body = client.get("/api/trips", headers=auth_headers).json()
        item = next(i for i in body["items"] if i["id"] == trip_id)
        assert item["cover_photo_id"] is None
        assert item["cover_photo_url"] is None

    def test_cover_prefers_first_location_order(
        self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir
    ):
        """封面优先取排序靠前地点的照片，而非上传时间更早的照片。"""
        trip_id = client.post("/api/trips", json=sample_trip_data, headers=auth_headers).json()["id"]
        locations = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()["locations"]
        first_loc, second_loc = locations[0], locations[1]

        # 先给第二个地点上传（时间更早），再给第一个地点上传
        self._upload(client, auth_headers, second_loc["id"], "second.jpg", test_image_bytes)
        first_photo_id = self._upload(client, auth_headers, first_loc["id"], "first.jpg", test_image_bytes)

        body = client.get("/api/trips", headers=auth_headers).json()
        item = next(i for i in body["items"] if i["id"] == trip_id)
        assert item["cover_photo_id"] == first_photo_id
        assert item["cover_photo_url"] == f"/api/photos/{first_photo_id}/thumbnail"

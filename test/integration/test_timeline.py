"""
集成测试 — 时间线
关联用例: TC-TIME-001, TC-TIME-002
"""
import pytest


@pytest.mark.integration
class TestTimeline:
    """时间线接口。"""

    def test_timeline_empty(self, client, auth_headers):
        """TC-TIME-002: 无数据返回空数组。"""
        resp = client.get("/api/timeline", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_timeline_grouping(self, client, auth_headers, sample_trip_data):
        """TC-TIME-001: 按年月正确分组。"""
        # 2025年10月 2 条
        client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        client.post("/api/trips", json={**sample_trip_data, "title": "第二次北京"}, headers=auth_headers)
        # 2025年9月 1 条
        client.post("/api/trips", json={
            **sample_trip_data, "title": "九月旅行",
            "start_date": "2025-09-01", "end_date": "2025-09-03",
        }, headers=auth_headers)

        resp = client.get("/api/timeline", headers=auth_headers)
        assert resp.status_code == 200
        groups = resp.json()
        assert len(groups) == 2
        # 最新月份在前
        assert groups[0]["label"] == "2025年10月"
        assert groups[0]["count"] == 2
        assert groups[1]["label"] == "2025年9月"
        assert groups[1]["count"] == 1

    def test_timeline_returns_all_trips_beyond_legacy_limit(
        self, client, auth_headers, sample_trip_data
    ):
        """回归：超过旧默认截断值（50）的旅行必须全部返回，月份计数完整。"""
        total = 60
        for i in range(total):
            month = "10" if i % 2 == 0 else "09"
            client.post("/api/trips", json={
                **sample_trip_data,
                "title": f"旅行 {i}",
                "start_date": f"2025-{month}-01",
                "end_date": f"2025-{month}-02",
            }, headers=auth_headers)

        resp = client.get("/api/timeline", headers=auth_headers)
        assert resp.status_code == 200
        groups = resp.json()
        assert len(groups) == 2
        counts = {g["label"]: g["count"] for g in groups}
        assert sum(counts.values()) == total, "所有旅行都必须出现在时间线中"
        assert counts["2025年10月"] == 30
        assert counts["2025年9月"] == 30


@pytest.mark.integration
class TestTimelineCover:
    """时间线条目的封面与城市字段（UI 2.0 新增）。"""

    def test_timeline_trip_includes_cover_and_cities(
        self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir
    ):
        resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = resp.json()["id"]
        locations = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()["locations"]
        upload = client.post(
            f"/api/photos/upload/{locations[0]['id']}",
            files={"file": ("cover.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        )
        assert upload.status_code == 201
        photo_id = upload.json()["id"]

        groups = client.get("/api/timeline", headers=auth_headers).json()
        trip = next(t for g in groups for t in g["trips"] if t["id"] == trip_id)
        assert trip["cover_photo_id"] == photo_id
        assert trip["cover_photo_url"] == f"/api/photos/{photo_id}/thumbnail"
        assert "北京" in trip["cities"]

    def test_timeline_trip_without_cover(self, client, auth_headers, sample_trip_data):
        trip_id = client.post("/api/trips", json=sample_trip_data, headers=auth_headers).json()["id"]

        groups = client.get("/api/timeline", headers=auth_headers).json()
        trip = next(t for g in groups for t in g["trips"] if t["id"] == trip_id)
        assert trip["cover_photo_id"] is None
        assert trip["cover_photo_url"] is None

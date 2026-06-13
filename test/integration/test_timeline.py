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

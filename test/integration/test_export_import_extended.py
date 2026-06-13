"""
集成测试 — 导入导出（扩展）
覆盖: 导入数据验证、边界情况
"""
import json
import pytest


@pytest.mark.integration
class TestImportValidation:
    """导入数据验证。"""

    def test_import_empty_location_name_rejected(self, client, auth_headers):
        """空地点名称应被拒绝。"""
        data = {
            "title": "测试旅行",
            "startDate": "2025-06-01",
            "endDate": "2025-06-03",
            "locations": [
                {
                    "name": "",
                    "address": "测试地址",
                    "longitude": 116.0,
                    "latitude": 39.0,
                    "city": "北京",
                    "province": "北京",
                }
            ],
        }
        resp = client.post(
            "/api/trips/import",
            files={"file": ("trip.json", json.dumps(data).encode(), "application/json")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        result = resp.json()
        assert "errors" in result
        assert "名称不能为空" in result["errors"][0]

    def test_import_invalid_longitude_rejected(self, client, auth_headers):
        """无效经度应被拒绝。"""
        data = {
            "title": "测试旅行",
            "startDate": "2025-06-01",
            "endDate": "2025-06-03",
            "locations": [
                {
                    "name": "测试地点",
                    "address": "测试地址",
                    "longitude": 200.0,
                    "latitude": 39.0,
                    "city": "北京",
                    "province": "北京",
                }
            ],
        }
        resp = client.post(
            "/api/trips/import",
            files={"file": ("trip.json", json.dumps(data).encode(), "application/json")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        result = resp.json()
        assert "errors" in result
        assert "经纬度范围无效" in result["errors"][0]

    def test_import_invalid_latitude_rejected(self, client, auth_headers):
        """无效纬度应被拒绝。"""
        data = {
            "title": "测试旅行",
            "startDate": "2025-06-01",
            "endDate": "2025-06-03",
            "locations": [
                {
                    "name": "测试地点",
                    "address": "测试地址",
                    "longitude": 116.0,
                    "latitude": 100.0,
                    "city": "北京",
                    "province": "北京",
                }
            ],
        }
        resp = client.post(
            "/api/trips/import",
            files={"file": ("trip.json", json.dumps(data).encode(), "application/json")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        result = resp.json()
        assert "errors" in result
        assert "经纬度范围无效" in result["errors"][0]

    def test_import_array_of_trips(self, client, auth_headers):
        """导入多条旅行记录。"""
        data = [
            {
                "title": "旅行1",
                "startDate": "2025-06-01",
                "endDate": "2025-06-03",
                "locations": [],
            },
            {
                "title": "旅行2",
                "startDate": "2025-07-01",
                "endDate": "2025-07-03",
                "locations": [],
            },
        ]
        resp = client.post(
            "/api/trips/import",
            files={"file": ("trips.json", json.dumps(data).encode(), "application/json")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "成功导入 2 条" in resp.json()["message"]

    def test_import_file_too_large(self, client, auth_headers):
        """超大文件应被拒绝。"""
        large_data = {"title": "x" * (2 * 1024 * 1024)}  # 2MB
        resp = client.post(
            "/api/trips/import",
            files={"file": ("trip.json", json.dumps(large_data).encode(), "application/json")},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "文件大小超过" in resp.json()["detail"]

    def test_import_missing_dates_rejected(self, client, auth_headers):
        """缺少日期应被拒绝。"""
        data = {
            "title": "测试旅行",
            "locations": [],
        }
        resp = client.post(
            "/api/trips/import",
            files={"file": ("trip.json", json.dumps(data).encode(), "application/json")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        result = resp.json()
        assert "errors" in result
        assert "startDate" in result["errors"][0]


@pytest.mark.integration
class TestExportMarkdownExtended:
    """Markdown 导出扩展测试。"""

    def test_export_markdown_not_found(self, client, auth_headers):
        """导出不存在的旅行。"""
        resp = client.get("/api/trips/99999/export/markdown", headers=auth_headers)
        assert resp.status_code == 404

    def test_export_markdown_content_structure(self, client, auth_headers, sample_trip_data):
        """验证 Markdown 内容结构。"""
        import zipfile
        import io

        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp = client.get(f"/api/trips/{trip_id}/export/markdown", headers=auth_headers)
        assert resp.status_code == 200

        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        md_files = [n for n in zf.namelist() if n.endswith(".md")]
        assert len(md_files) == 1

        md_content = zf.read(md_files[0]).decode("utf-8")
        assert "# 北京三日游" in md_content
        assert "故宫博物院" in md_content
        assert "长城" in md_content

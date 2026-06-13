"""
集成测试 — 导入导出
关联用例: TC-EXP-001 ~ TC-EXP-005
"""
import json
import zipfile
import io
import pytest


@pytest.mark.integration
class TestExportJSON:
    """JSON 导出。"""

    def test_export_json(self, client, auth_headers, sample_trip_data):
        """TC-EXP-001: 正常导出 JSON。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp = client.get(f"/api/trips/{trip_id}/export/json", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/json"

        data = json.loads(resp.content)
        assert data["title"] == "北京三日游"
        assert len(data["locations"]) == 2

    def test_export_json_not_found(self, client, auth_headers):
        """导出不存在的旅行。"""
        resp = client.get("/api/trips/99999/export/json", headers=auth_headers)
        assert resp.status_code == 404


@pytest.mark.integration
class TestExportMarkdown:
    """Markdown 导出。"""

    def test_export_markdown_zip(self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir):
        """TC-EXP-002: 正常导出 Markdown ZIP。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        # 上传一张照片
        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        loc_id = detail["locations"][0]["id"]
        client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("test.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        )

        resp = client.get(f"/api/trips/{trip_id}/export/markdown", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"

        # 验证 ZIP 内容
        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        names = zf.namelist()
        assert any(n.endswith(".md") for n in names)
        assert any("photos/" in n for n in names)


@pytest.mark.integration
class TestImportJSON:
    """JSON 导入。"""

    def test_import_json_success(self, client, auth_headers, sample_import_json):
        """TC-EXP-003: 正常导入 JSON。"""
        json_bytes = json.dumps(sample_import_json, ensure_ascii=False).encode("utf-8")

        resp = client.post(
            "/api/trips/import",
            files={"file": ("trip.json", json_bytes, "application/json")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "成功导入 1 条" in resp.json()["message"]

    def test_import_invalid_json(self, client, auth_headers):
        """TC-EXP-004: JSON 格式错误。"""
        resp = client.post(
            "/api/trips/import",
            files={"file": ("trip.json", b"not json", "application/json")},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "JSON 格式错误" in resp.json()["detail"]

    def test_import_non_json_file(self, client, auth_headers):
        """TC-EXP-005: 非 JSON 文件。"""
        resp = client.post(
            "/api/trips/import",
            files={"file": ("data.txt", b"hello", "text/plain")},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "请上传 JSON 文件" in resp.json()["detail"]

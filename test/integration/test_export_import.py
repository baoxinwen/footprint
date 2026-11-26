"""
集成测试 — 导入导出
关联用例: TC-EXP-001 ~ TC-EXP-005
"""
import json
import re
import zipfile
import io
import pytest
from pathlib import Path


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

    def test_markdown_image_links_survive_spaces_in_names(
        self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir
    ):
        """回归（评审 I-4）：标题/地点/文件名含空格时图片链接必须仍是可解析的 Markdown。"""
        trip = {**sample_trip_data, "title": "北京 三日游"}
        create_resp = client.post("/api/trips", json=trip, headers=auth_headers)
        trip_id = create_resp.json()["id"]
        location_id = client.get(
            f"/api/trips/{trip_id}", headers=auth_headers
        ).json()["locations"][0]["id"]
        upload = client.post(
            f"/api/photos/upload/{location_id}",
            files={"file": ("屏幕截图 2024 01 01.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        )
        assert upload.status_code == 201

        resp = client.get(f"/api/trips/{trip_id}/export/markdown", headers=auth_headers)
        assert resp.status_code == 200
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            entries = set(zf.namelist())
            markdown = zf.read(next(n for n in entries if n.endswith(".md"))).decode("utf-8")

        # 目标一律包在尖括号里（CommonMark 允许其中出现空格），且每个目标都在包内
        links = re.findall(r"!\[[^\]]*\]\(<([^>]+)>\)", markdown)
        assert links, markdown
        for target in links:
            assert target in entries, target
        # 旧格式（目标裸露、内含空格）不允许再出现
        assert not re.search(r"\]\(photos/", markdown), markdown

    def test_markdown_photo_paths_match_unique_archive_entries(
        self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir
    ):
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]
        location_id = client.get(
            f"/api/trips/{trip_id}", headers=auth_headers
        ).json()["locations"][0]["id"]
        for _ in range(2):
            upload_resp = client.post(
                f"/api/photos/upload/{location_id}",
                files={"file": ("same.jpg", test_image_bytes, "image/jpeg")},
                headers=auth_headers,
            )
            assert upload_resp.status_code == 201

        resp = client.get(f"/api/trips/{trip_id}/export/markdown", headers=auth_headers)
        assert resp.status_code == 200
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            names = zf.namelist()
            assert len(names) == len(set(names))
            markdown_name = next(name for name in names if name.endswith(".md"))
            markdown = zf.read(markdown_name).decode("utf-8")
            photo_names = [name for name in names if name.startswith("photos/")]
            assert len(photo_names) == 2
            for photo_name in photo_names:
                # 评审 I-4 起目标包进尖括号（名称可含空格）
                assert f"](<{photo_name}>)" in markdown

    def test_markdown_rewrites_note_photo_references(
        self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir
    ):
        """回归（评审 M-6/PRD 5.7）：游记里的站内照片引用导出时改写为包内相对路径。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]
        detail = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()
        loc0 = detail["locations"][0]
        upload = client.post(
            f"/api/photos/upload/{loc0['id']}",
            files={"file": ("gate.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        )
        photo_id = upload.json()["id"]

        note = f"大门在此：\n\n![大门](/api/photos/{photo_id}/original)\n\n完。"
        update = client.put(
            f"/api/trips/{trip_id}",
            json={
                "title": sample_trip_data["title"],
                "description": sample_trip_data["description"],
                "start_date": sample_trip_data["start_date"],
                "end_date": sample_trip_data["end_date"],
                "locations": [
                    {**{k: loc0[k] for k in ("id", "name", "address", "longitude", "latitude", "city", "province")}, "note": note},
                    *[
                        {k: l[k] for k in ("id", "name", "address", "longitude", "latitude", "city", "province")}
                        for l in detail["locations"][1:]
                    ],
                ],
                "removed_location_ids": [],
            },
            headers=auth_headers,
        )
        assert update.status_code == 200, update.text

        resp = client.get(f"/api/trips/{trip_id}/export/markdown", headers=auth_headers)
        assert resp.status_code == 200
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            entries = set(zf.namelist())
            markdown = zf.read(next(n for n in entries if n.endswith(".md"))).decode("utf-8")

        # 游记正文里不再有需要登录的站内地址，且改写后的目标都在包内
        assert "/api/photos/" not in markdown, markdown
        for target in re.findall(r"\]\(<([^>]+)>\)", markdown):
            assert target in entries, target

    def test_markdown_zip_uses_and_cleans_a_temporary_file(
        self, client, auth_headers, sample_trip_data, monkeypatch
    ):
        import app.api.export_import as export_module

        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]
        real_zip_file = zipfile.ZipFile
        write_targets = []

        def tracking_zip_file(file, mode="r", *args, **kwargs):
            if mode == "w":
                write_targets.append(file)
            return real_zip_file(file, mode, *args, **kwargs)

        monkeypatch.setattr(export_module.zipfile, "ZipFile", tracking_zip_file)
        resp = client.get(f"/api/trips/{trip_id}/export/markdown", headers=auth_headers)

        assert resp.status_code == 200
        assert len(write_targets) == 1
        assert isinstance(write_targets[0], (str, Path))
        assert not Path(write_targets[0]).exists()


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

    def test_import_uppercase_extension_accepted(self, client, auth_headers, sample_import_json):
        """回归（评审 M-14）：扩展名判断不区分大小写（trips.JSON 是合法 JSON 文件）。"""
        json_bytes = json.dumps(sample_import_json, ensure_ascii=False).encode("utf-8")
        resp = client.post(
            "/api/trips/import",
            files={"file": ("trips.JSON", json_bytes, "application/json")},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text

    def test_import_empty_array_rejected(self, client, auth_headers):
        """回归（评审 M-14）：导入空数组应 400，而不是「成功导入 0 条」。"""
        resp = client.post(
            "/api/trips/import",
            files={"file": ("trip.json", b"[]", "application/json")},
            headers=auth_headers,
        )
        assert resp.status_code == 400

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

"""集成测试 — 账号模块 (M01 补充)"""
import pytest
from pathlib import Path
import zipfile


@pytest.mark.integration
class TestAccountInfo:
    def test_get_account_info(self, client, auth_headers):
        resp = client.get("/api/account/info", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "username" in data
        assert "created_at" in data

    def test_get_account_info_unauthorized(self, client):
        resp = client.get("/api/account/info")
        assert resp.status_code in (401, 403)


@pytest.mark.integration
class TestAccountExport:
    def test_export_all_json(self, client, auth_headers):
        resp = client.get("/api/account/export/all", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/json"

    def test_export_all_with_photos(self, client, auth_headers):
        resp = client.get("/api/account/export/all-with-photos", headers=auth_headers)
        assert resp.status_code == 200

    def test_export_all_with_photos_cleans_temporary_zip(
        self, client, auth_headers, monkeypatch
    ):
        import app.api.account as account_module

        real_zip_file = zipfile.ZipFile
        write_targets = []

        def tracking_zip_file(file, mode="r", *args, **kwargs):
            if mode == "w":
                write_targets.append(file)
            return real_zip_file(file, mode, *args, **kwargs)

        monkeypatch.setattr(account_module.zipfile, "ZipFile", tracking_zip_file)
        resp = client.get("/api/account/export/all-with-photos", headers=auth_headers)

        assert resp.status_code == 200
        assert len(write_targets) == 1
        assert isinstance(write_targets[0], (str, Path))
        assert not Path(write_targets[0]).exists()

    def test_export_unauthorized(self, client):
        resp = client.get("/api/account/export/all")
        assert resp.status_code in (401, 403)

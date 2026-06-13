"""集成测试 — 账号模块 (M01 补充)"""
import pytest


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

    def test_export_unauthorized(self, client):
        resp = client.get("/api/account/export/all")
        assert resp.status_code in (401, 403)

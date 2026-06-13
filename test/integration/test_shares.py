"""
集成测试 — 分享功能
关联用例: TC-SHARE-001 ~ TC-SHARE-005
"""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch


@pytest.mark.integration
class TestCreateShare:
    """创建分享链接。"""

    def test_create_share_success(self, client, auth_headers, sample_trip_data):
        """TC-SHARE-001: 正常创建分享。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp = client.post(f"/api/shares/{trip_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "expires_at" in data

    def test_create_share_reuse_existing(self, client, auth_headers, sample_trip_data):
        """TC-SHARE-002: 重复创建复用已有链接。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp1 = client.post(f"/api/shares/{trip_id}", headers=auth_headers)
        resp2 = client.post(f"/api/shares/{trip_id}", headers=auth_headers)
        assert resp1.json()["token"] == resp2.json()["token"]


@pytest.mark.integration
class TestViewShare:
    """查看分享。"""

    def test_view_share_success(self, client, auth_headers, sample_trip_data):
        """TC-SHARE-003: 正常查看分享。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        share_resp = client.post(f"/api/shares/{trip_id}", headers=auth_headers)
        token = share_resp.json()["token"]

        resp = client.get(f"/api/shares/view/{token}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "北京三日游"

    def test_view_share_expired(self, client, auth_headers, sample_trip_data, db_session):
        """TC-SHARE-004: 过期链接。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        share_resp = client.post(f"/api/shares/{trip_id}", headers=auth_headers)
        token = share_resp.json()["token"]

        # 直接修改数据库中的过期时间为过去
        from app.models.share import Share
        share = db_session.query(Share).filter(Share.token == token).first()
        if share:
            share.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
            db_session.commit()

        resp = client.get(f"/api/shares/view/{token}")
        assert resp.status_code == 410

    def test_view_share_not_found(self, client):
        """TC-SHARE-005: token 不存在。"""
        resp = client.get("/api/shares/view/nonexistent-token")
        assert resp.status_code == 404

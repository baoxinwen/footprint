"""
集成测试 — 分享功能
关联用例: TC-SHARE-001 ~ TC-SHARE-005
"""
import pytest
from datetime import datetime, timedelta, timezone


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

    def test_share_expiration_preserves_utc_semantics_across_timezones(
        self, client, auth_headers, sample_trip_data, db_session
    ):
        create_resp = client.post(
            "/api/trips", json=sample_trip_data, headers=auth_headers
        )
        trip_id = create_resp.json()["id"]
        share_resp = client.post(f"/api/shares/{trip_id}", headers=auth_headers)

        from app.models.share import Share

        share = db_session.query(Share).filter(
            Share.token == share_resp.json()["token"]
        ).one()
        share.expires_at = datetime(2030, 1, 1, 0, 30)
        db_session.commit()

        listed = client.get("/api/shares", headers=auth_headers).json()[0]
        expires_at = datetime.fromisoformat(listed["expires_at"])

        assert expires_at.utcoffset() == timedelta(0)
        shanghai = timezone(timedelta(hours=8))
        assert expires_at.astimezone(shanghai) == datetime(
            2030, 1, 1, 8, 30, tzinfo=shanghai
        )

    def test_create_share_reuse_existing(self, client, auth_headers, sample_trip_data):
        """TC-SHARE-002: 重复创建复用已有链接。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]

        resp1 = client.post(f"/api/shares/{trip_id}", headers=auth_headers)
        resp2 = client.post(f"/api/shares/{trip_id}", headers=auth_headers)
        assert resp1.json()["token"] == resp2.json()["token"]

    def test_list_revoke_and_rotate_shares(self, client, auth_headers, sample_trip_data):
        """所有者可列出、轮换并撤销自己的分享链接。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]
        original = client.post(f"/api/shares/{trip_id}", headers=auth_headers).json()

        list_resp = client.get("/api/shares", headers=auth_headers)
        assert list_resp.status_code == 200
        assert [share["token"] for share in list_resp.json()] == [original["token"]]

        rotate_resp = client.post(f"/api/shares/{trip_id}/rotate", headers=auth_headers)
        assert rotate_resp.status_code == 200
        replacement = rotate_resp.json()
        assert replacement["token"] != original["token"]
        assert client.get(f"/api/shares/view/{original['token']}").status_code == 404
        assert client.get(f"/api/shares/view/{replacement['token']}").status_code == 200

        revoke_resp = client.delete(f"/api/shares/{replacement['token']}", headers=auth_headers)
        assert revoke_resp.status_code == 200
        assert client.get(f"/api/shares/view/{replacement['token']}").status_code == 404

    def test_cannot_revoke_another_users_share(
        self, client, auth_headers, auth_headers_user_b, sample_trip_data
    ):
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        token = client.post(
            f"/api/shares/{create_resp.json()['id']}", headers=auth_headers
        ).json()["token"]

        resp = client.delete(f"/api/shares/{token}", headers=auth_headers_user_b)
        assert resp.status_code == 404
        assert client.get(f"/api/shares/view/{token}").status_code == 200


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

    def test_share_token_can_list_and_read_only_its_trip_photos(
        self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir
    ):
        first_trip = client.post("/api/trips", json=sample_trip_data, headers=auth_headers).json()
        first_location = client.get(
            f"/api/trips/{first_trip['id']}", headers=auth_headers
        ).json()["locations"][0]
        first_photo = client.post(
            f"/api/photos/upload/{first_location['id']}",
            files={"file": ("first.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        ).json()

        second_data = {**sample_trip_data, "title": "另一段旅行"}
        second_trip = client.post("/api/trips", json=second_data, headers=auth_headers).json()
        second_location = client.get(
            f"/api/trips/{second_trip['id']}", headers=auth_headers
        ).json()["locations"][0]
        second_photo = client.post(
            f"/api/photos/upload/{second_location['id']}",
            files={"file": ("second.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        ).json()
        token = client.post(
            f"/api/shares/{first_trip['id']}", headers=auth_headers
        ).json()["token"]

        list_resp = client.get(
            f"/api/shares/view/{token}/locations/{first_location['id']}/photos"
        )
        assert list_resp.status_code == 200
        assert [photo["id"] for photo in list_resp.json()] == [first_photo["id"]]
        assert token in list_resp.json()[0]["original_url"]

        assert client.get(list_resp.json()[0]["original_url"]).status_code == 200
        assert client.get(list_resp.json()[0]["thumbnail_url"]).status_code == 200
        assert client.get(
            f"/api/shares/view/{token}/photos/{second_photo['id']}/original"
        ).status_code == 404
        assert client.get(
            f"/api/shares/view/invalid-token/photos/{first_photo['id']}/original"
        ).status_code == 404
        assert client.get(f"/api/photos/{first_photo['id']}/original").status_code in (401, 403)

    def test_shared_photo_rejects_symlink_target_outside_upload_root(
        self,
        client,
        auth_headers,
        sample_trip_data,
        test_image_bytes,
        upload_dir,
        db_session,
    ):
        from app.models.photo import Photo

        trip = client.post(
            "/api/trips", json=sample_trip_data, headers=auth_headers
        ).json()
        location = client.get(
            f"/api/trips/{trip['id']}", headers=auth_headers
        ).json()["locations"][0]
        photo_data = client.post(
            f"/api/photos/upload/{location['id']}",
            files={"file": ("photo.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        ).json()
        photo = db_session.get(Photo, photo_data["id"])
        stored_file = upload_dir / photo.original_path
        stored_file.unlink()
        outside_file = upload_dir.parent / "shared-secret.txt"
        outside_file.write_bytes(b"must-not-be-shared")
        try:
            stored_file.symlink_to(outside_file)
        except (OSError, NotImplementedError) as exc:
            pytest.skip(f"当前平台不支持测试符号链接: {exc}")

        token = client.post(
            f"/api/shares/{trip['id']}", headers=auth_headers
        ).json()["token"]
        response = client.get(
            f"/api/shares/view/{token}/photos/{photo_data['id']}/original"
        )

        assert response.status_code == 404
        assert b"must-not-be-shared" not in response.content


@pytest.mark.integration
class TestViewShareCover:
    """分享页封面字段（UI 2.0 新增）。"""

    def test_share_cover_uses_public_share_scoped_url(
        self, client, auth_headers, sample_trip_data, test_image_bytes, upload_dir
    ):
        """匿名分享页的封面必须是无需鉴权的分享作用域 URL。"""
        create_resp = client.post("/api/trips", json=sample_trip_data, headers=auth_headers)
        trip_id = create_resp.json()["id"]
        locations = client.get(f"/api/trips/{trip_id}", headers=auth_headers).json()["locations"]
        upload = client.post(
            f"/api/photos/upload/{locations[0]['id']}",
            files={"file": ("cover.jpg", test_image_bytes, "image/jpeg")},
            headers=auth_headers,
        )
        assert upload.status_code == 201
        photo_id = upload.json()["id"]

        token = client.post(f"/api/shares/{trip_id}", headers=auth_headers).json()["token"]

        resp = client.get(f"/api/shares/view/{token}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["cover_photo_id"] == photo_id
        assert data["cover_photo_url"] == f"/api/shares/view/{token}/photos/{photo_id}/thumbnail"
        # 匿名 GET 该封面 URL 应可访问（不携带 Authorization）
        cover_resp = client.get(data["cover_photo_url"])
        assert cover_resp.status_code == 200

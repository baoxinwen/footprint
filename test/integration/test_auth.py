"""
集成测试 — 账号系统
关联用例: TC-AUTH-001 ~ TC-AUTH-011, TC-SEC-001, TC-SEC-002
"""
import pytest
import bcrypt

from app.models.user import User


@pytest.mark.integration
class TestPasswordByteLimit:
    def test_register_rejects_password_over_bcrypt_byte_limit(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"username": "longpassword", "password": "密" * 25},
        )
        assert resp.status_code == 422
        assert "72" in str(resp.json())

    def test_legacy_long_password_can_login_and_migrate(self, client):
        import app.core.database as db_module

        password = "密" * 25
        legacy_hash = bcrypt.hashpw(
            password.encode("utf-8")[:72],
            bcrypt.gensalt(),
        ).decode("utf-8")
        session = db_module.SessionLocal()
        try:
            session.add(
                User(username="legacy_long_password", password_hash=legacy_hash)
            )
            session.commit()
        finally:
            session.close()

        resp = client.post(
            "/api/auth/login",
            json={"username": "legacy_long_password", "password": password},
        )
        assert resp.status_code == 200

        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        change_resp = client.post(
            "/api/auth/change-password",
            json={
                "current_password": password,
                "new_password": "MigratedPassword123",
                "confirm_password": "MigratedPassword123",
            },
            headers=headers,
        )
        assert change_resp.status_code == 200

    @pytest.mark.parametrize("field", ["new_password", "confirm_password"])
    def test_change_password_rejects_password_over_bcrypt_byte_limit(
        self, client, auth_headers, field
    ):
        payload = {
            "current_password": "Test@123456",
            "new_password": "NewPassword123",
            "confirm_password": "NewPassword123",
        }
        payload[field] = "密" * 25
        resp = client.post(
            "/api/auth/change-password",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "72" in str(resp.json())


@pytest.mark.integration
def test_change_password_invalidates_old_token_and_new_login_works(
    client, auth_headers
):
    resp = client.post(
        "/api/auth/change-password",
        json={
            "current_password": "Test@123456",
            "new_password": "NewPassword123",
            "confirm_password": "NewPassword123",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200

    assert client.get("/api/account/info", headers=auth_headers).status_code == 401

    login_resp = client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "NewPassword123"},
    )
    assert login_resp.status_code == 200
    new_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}
    assert client.get("/api/account/info", headers=new_headers).status_code == 200


@pytest.mark.integration
class TestRegister:
    """注册接口。"""

    def test_register_success(self, client):
        """TC-AUTH-001: 正常注册。"""
        resp = client.post("/api/auth/register", json={"username": "newuser", "password": "123456"})
        assert resp.status_code == 200
        assert resp.json()["message"] == "注册成功"

    def test_register_duplicate_username(self, client):
        """TC-AUTH-002: 重复用户名。"""
        client.post("/api/auth/register", json={"username": "dupuser", "password": "123456"})
        resp = client.post("/api/auth/register", json={"username": "dupuser", "password": "654321"})
        assert resp.status_code == 400
        assert "已被占用" in resp.json()["detail"]

    def test_register_short_username(self, client):
        """TC-AUTH-003: 用户名过短。"""
        resp = client.post("/api/auth/register", json={"username": "ab", "password": "123456"})
        assert resp.status_code == 422

    def test_register_short_password(self, client):
        """TC-AUTH-004: 密码过短。"""
        resp = client.post("/api/auth/register", json={"username": "testuser", "password": "12345"})
        assert resp.status_code == 422


@pytest.mark.integration
class TestLogin:
    """登录接口。"""

    def test_login_success(self, client):
        """TC-AUTH-005: 正常登录。"""
        client.post("/api/auth/register", json={"username": "logintest", "password": "123456"})
        resp = client.post("/api/auth/login", json={"username": "logintest", "password": "123456"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, client):
        """TC-AUTH-006: 密码错误。"""
        client.post("/api/auth/register", json={"username": "logintest2", "password": "123456"})
        resp = client.post("/api/auth/login", json={"username": "logintest2", "password": "wrong"})
        assert resp.status_code == 400
        assert "用户名或密码错误" in resp.json()["detail"]

    def test_login_nonexistent_user(self, client):
        """TC-AUTH-007: 用户不存在。"""
        resp = client.post("/api/auth/login", json={"username": "ghost", "password": "123456"})
        assert resp.status_code == 400

    def test_login_rate_limit(self, client):
        """TC-AUTH-008: 连续失败后锁定。"""
        client.post("/api/auth/register", json={"username": "ratetest", "password": "123456"})
        for _ in range(5):
            client.post("/api/auth/login", json={"username": "ratetest", "password": "wrong"})
        resp = client.post("/api/auth/login", json={"username": "ratetest", "password": "123456"})
        assert resp.status_code == 429

    def test_register_rate_limit_wiring(self, client):
        """同一 IP 第 4 次注册应 429——验证 API 层真实调用了注册限流。"""
        for i in range(3):
            resp = client.post(
                "/api/auth/register", json={"username": f"regwire{i}", "password": "123456"}
            )
            assert resp.status_code == 200, f"第 {i + 1} 次注册应成功"

        fourth = client.post("/api/auth/register", json={"username": "regwire4", "password": "123456"})
        assert fourth.status_code == 429
        assert "频率" in fourth.json()["detail"]


@pytest.mark.integration
class TestChangePassword:
    """修改密码接口。"""

    def test_change_password_success(self, client, auth_headers):
        """TC-AUTH-009: 正常修改密码。"""
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": "Test@123456", "new_password": "654321", "confirm_password": "654321"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    def test_change_password_wrong_current(self, client, auth_headers):
        """TC-AUTH-010: 当前密码错误。"""
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": "wrong", "new_password": "654321", "confirm_password": "654321"},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "当前密码错误" in resp.json()["detail"]

    def test_change_password_mismatch(self, client, auth_headers):
        """TC-AUTH-011: 新密码不一致。"""
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": "Test@123456", "new_password": "111111", "confirm_password": "222222"},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "不一致" in resp.json()["detail"]

    def test_change_password_cooldown_wiring(self, client, auth_headers):
        """改密成功后的冷却期内再次修改应 429——验证 API 层真实调用了冷却检查。"""
        first = client.post(
            "/api/auth/change-password",
            json={"current_password": "Test@123456", "new_password": "654321", "confirm_password": "654321"},
            headers=auth_headers,
        )
        assert first.status_code == 200

        # 改密成功后旧 token 立即失效（auth_version 机制），重新登录获取新 token
        login_resp = client.post(
            "/api/auth/login", json={"username": "testuser", "password": "654321"}
        )
        assert login_resp.status_code == 200
        fresh_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        second = client.post(
            "/api/auth/change-password",
            json={"current_password": "654321", "new_password": "777777", "confirm_password": "777777"},
            headers=fresh_headers,
        )
        assert second.status_code == 429


@pytest.mark.integration
class TestAuthSecurity:
    """认证安全。"""

    def test_no_token_returns_error(self, client):
        """TC-SEC-001: 无 token 访问受保护接口。"""
        resp = client.get("/api/trips")
        assert resp.status_code in (401, 403)

    def test_invalid_token_returns_401(self, client):
        """TC-SEC-002: 伪造 token。"""
        resp = client.get("/api/trips", headers={"Authorization": "Bearer fake-token"})
        assert resp.status_code == 401

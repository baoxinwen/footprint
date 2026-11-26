"""
集成测试 — 账号系统
关联用例: TC-AUTH-001 ~ TC-AUTH-011, TC-SEC-001, TC-SEC-002
"""
import pytest

from ..password_fixtures import PW_A, PW_B, PW_C, PW_WRONG
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

    def test_unencodable_password_returns_422(self, client):
        """回归（评审 M-1）：密码含孤立 UTF-16 代理项应 422 而非 500。"""
        from fastapi.testclient import TestClient

        quiet = TestClient(client.app, raise_server_exceptions=False)
        login = quiet.post(
            "/api/auth/login", json={"username": "nobody", "password": "\ud800"}
        )
        assert login.status_code == 422, login.text
        register = quiet.post(
            "/api/auth/register",
            json={"username": "surrogateuser", "password": "\ud800"},
        )
        assert register.status_code == 422, register.text

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
                "new_password": PW_B,
                "confirm_password": PW_B,
            },
            headers=headers,
        )
        assert change_resp.status_code == 200

    @pytest.mark.parametrize("field", ["new_password", "confirm_password"])
    def test_change_password_rejects_password_over_bcrypt_byte_limit(
        self, client, auth_headers, field
    ):
        payload = {
            "current_password": PW_A,
            "new_password": PW_B,
            "confirm_password": PW_B,
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
            "current_password": PW_A,
            "new_password": PW_B,
            "confirm_password": PW_B,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200

    assert client.get("/api/account/info", headers=auth_headers).status_code == 401

    login_resp = client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": PW_B},
    )
    assert login_resp.status_code == 200
    new_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}
    assert client.get("/api/account/info", headers=new_headers).status_code == 200


@pytest.mark.integration
class TestRegister:
    """注册接口。"""

    def test_register_success(self, client):
        """TC-AUTH-001: 正常注册。"""
        resp = client.post("/api/auth/register", json={"username": "newuser", "password": PW_A})
        assert resp.status_code == 200
        assert resp.json()["message"] == "注册成功"

    def test_register_duplicate_username(self, client):
        """TC-AUTH-002: 重复用户名。"""
        client.post("/api/auth/register", json={"username": "dupuser", "password": PW_A})
        resp = client.post("/api/auth/register", json={"username": "dupuser", "password": PW_B})
        assert resp.status_code == 400
        assert "已被占用" in resp.json()["detail"]

    def test_register_short_username(self, client):
        """TC-AUTH-003: 用户名过短。"""
        resp = client.post("/api/auth/register", json={"username": "ab", "password": PW_A})
        assert resp.status_code == 422

    def test_register_short_password(self, client):
        """TC-AUTH-004: 密码过短。"""
        resp = client.post("/api/auth/register", json={"username": "testuser", "password": PW_A[:5]})
        assert resp.status_code == 422


@pytest.mark.integration
class TestLogin:
    """登录接口。"""

    def test_login_success(self, client):
        """TC-AUTH-005: 正常登录。"""
        client.post("/api/auth/register", json={"username": "logintest", "password": PW_A})
        resp = client.post("/api/auth/login", json={"username": "logintest", "password": PW_A})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, client):
        """TC-AUTH-006: 密码错误。"""
        client.post("/api/auth/register", json={"username": "logintest2", "password": PW_A})
        resp = client.post("/api/auth/login", json={"username": "logintest2", "password": PW_WRONG})
        assert resp.status_code == 400
        assert "用户名或密码错误" in resp.json()["detail"]

    def test_login_nonexistent_user(self, client):
        """TC-AUTH-007: 用户不存在。"""
        resp = client.post("/api/auth/login", json={"username": "ghost", "password": PW_A})
        assert resp.status_code == 400

    def test_login_rate_limit(self, client):
        """TC-AUTH-008: 连续失败后锁定。"""
        client.post("/api/auth/register", json={"username": "ratetest", "password": PW_A})
        for _ in range(5):
            client.post("/api/auth/login", json={"username": "ratetest", "password": PW_WRONG})
        resp = client.post("/api/auth/login", json={"username": "ratetest", "password": PW_A})
        assert resp.status_code == 429

    def test_register_rate_limit_wiring(self, client):
        """同一 IP 第 4 次注册应 429——验证 API 层真实调用了注册限流。"""
        for i in range(3):
            resp = client.post(
                "/api/auth/register", json={"username": f"regwire{i}", "password": PW_A}
            )
            assert resp.status_code == 200, f"第 {i + 1} 次注册应成功"

        fourth = client.post("/api/auth/register", json={"username": "regwire4", "password": PW_A})
        assert fourth.status_code == 429
        assert "频率" in fourth.json()["detail"]


@pytest.mark.integration
class TestChangePassword:
    """修改密码接口。"""

    def test_change_password_success(self, client, auth_headers):
        """TC-AUTH-009: 正常修改密码。"""
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": PW_A, "new_password": PW_B, "confirm_password": PW_B},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    def test_change_password_wrong_current(self, client, auth_headers):
        """TC-AUTH-010: 当前密码错误。"""
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": PW_WRONG, "new_password": PW_B, "confirm_password": PW_B},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "当前密码错误" in resp.json()["detail"]

    def test_change_password_wrong_current_is_rate_limited(self, client, auth_headers):
        """回归（评审 I-3）：连续答错当前密码必须触发限流，防止持 token 在线爆破。"""
        from app.core.config import settings
        from app.utils.rate_limit import reset_all

        reset_all()
        codes = []
        for _ in range(settings.LOGIN_MAX_ATTEMPTS + 1):
            resp = client.post(
                "/api/auth/change-password",
                json={"current_password": PW_WRONG, "new_password": PW_B, "confirm_password": PW_B},
                headers=auth_headers,
            )
            codes.append(resp.status_code)
        assert codes[: settings.LOGIN_MAX_ATTEMPTS] == [400] * settings.LOGIN_MAX_ATTEMPTS
        assert codes[-1] == 429, codes

        # 锁定期内即使提交正确当前密码也拒绝
        locked = client.post(
            "/api/auth/change-password",
            json={"current_password": PW_A, "new_password": PW_B, "confirm_password": PW_B},
            headers=auth_headers,
        )
        assert locked.status_code == 429

    def test_change_password_success_clears_failure_counter(self, client, auth_headers):
        """答对当前密码后计数清零：此前 2 次失败不应影响下一次正常改密。"""
        from app.utils.rate_limit import reset_all

        reset_all()
        for _ in range(2):
            client.post(
                "/api/auth/change-password",
                json={"current_password": PW_WRONG, "new_password": PW_B, "confirm_password": PW_B},
                headers=auth_headers,
            )
        ok = client.post(
            "/api/auth/change-password",
            json={"current_password": PW_A, "new_password": PW_B, "confirm_password": PW_B},
            headers=auth_headers,
        )
        assert ok.status_code == 200

        # 改密成功后旧 token 失效（auth_version +1），重新登录再验证计数已清零
        login = client.post("/api/auth/login", json={"username": "testuser", "password": PW_B})
        assert login.status_code == 200
        fresh_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        after = client.post(
            "/api/auth/change-password",
            json={"current_password": PW_WRONG, "new_password": PW_C, "confirm_password": PW_C},
            headers=fresh_headers,
        )
        assert after.status_code == 400

    def test_change_password_mismatch(self, client, auth_headers):
        """TC-AUTH-011: 新密码不一致。"""
        resp = client.post(
            "/api/auth/change-password",
            json={"current_password": PW_A, "new_password": PW_B, "confirm_password": PW_C},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "不一致" in resp.json()["detail"]

    def test_change_password_cooldown_wiring(self, client, auth_headers):
        """改密成功后的冷却期内再次修改应 429——验证 API 层真实调用了冷却检查。"""
        first = client.post(
            "/api/auth/change-password",
            json={"current_password": PW_A, "new_password": PW_B, "confirm_password": PW_B},
            headers=auth_headers,
        )
        assert first.status_code == 200

        # 改密成功后旧 token 立即失效（auth_version 机制），重新登录获取新 token
        login_resp = client.post(
            "/api/auth/login", json={"username": "testuser", "password": PW_B}
        )
        assert login_resp.status_code == 200
        fresh_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        second = client.post(
            "/api/auth/change-password",
            json={"current_password": PW_B, "new_password": PW_C, "confirm_password": PW_C},
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


@pytest.mark.integration
class TestRegisterRaceAndLoginTiming:
    """评审 R1-4/R1-5 回归。"""

    def test_register_unique_violation_maps_to_400(self, client, monkeypatch):
        """R1-4 回归（评审 I-2）：并发注册同名用户时返回 400 而非 500。

        INSERT 在 db.flush() 时发出，UNIQUE 冲突在那里抛出——本用例在
        「存在性检查之后、INSERT 之前」的竞态窗口里经另一会话抢先写入
        同名用户，复现真实路径；旧版打桩 Session.commit 的写法测不到它。
        """
        from sqlalchemy import text
        from fastapi.testclient import TestClient

        import app.api.auth as auth_module
        from app.utils.rate_limit import reset_all

        from test.conftest import _shared_session  # noqa: PLC0415 夹具内部模块

        reset_all()

        # 用一次真实落库的注册让夹具的共享会话就位（/api/health 不走 get_db）
        client.post("/api/auth/register", json={"username": "racewarmup", "password": PW_A})
        shared_db = _shared_session[0]
        username = "raceuser"
        real_hash = auth_module.hash_password

        def racing_hash(password):
            shared_db.execute(
                text(
                    "INSERT INTO users (username, password_hash, auth_version, created_at) "
                    "VALUES (:u, 'x', 1, '2026-01-01 00:00:00')"
                ),
                {"u": username},
            )
            shared_db.commit()
            return real_hash(password)

        monkeypatch.setattr(auth_module, "hash_password", racing_hash)
        quiet = TestClient(client.app, raise_server_exceptions=False)
        resp = quiet.post("/api/auth/register", json={"username": username, "password": PW_A})
        assert resp.status_code == 400, resp.text
        assert "已被占用" in resp.json()["detail"]

    def test_login_unknown_username_still_runs_password_verify(self, client, monkeypatch):
        """R1-5: 用户不存在时也执行一次等价 bcrypt 校验，抹平可枚举用户名的时序差。"""
        from app.core import security

        calls = []
        original = security.verify_password

        def spy(password, hashed):
            calls.append(1)
            return original(password, hashed)

        monkeypatch.setattr("app.api.auth.verify_password", spy)
        resp = client.post(
            "/api/auth/login", json={"username": "ghost-user-no-exist", "password": PW_WRONG}
        )
        assert resp.status_code == 400
        assert len(calls) == 1, "用户不存在时跳过了密码校验，存在计时侧信道"

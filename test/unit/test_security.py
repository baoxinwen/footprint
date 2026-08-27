"""
单元测试 — 认证与安全模块
关联用例: TC-AUTH-005, TC-AUTH-006, TC-SEC-003
"""
import pytest
import bcrypt
from datetime import datetime, timedelta, timezone
from app.core.security import hash_password, verify_password, create_access_token
import jwt
from app.core.config import settings


@pytest.mark.unit
class TestPasswordByteLimit:
    def test_hash_password_accepts_exact_bcrypt_byte_limit(self):
        password = "密" * 24
        assert verify_password(password, hash_password(password))

    def test_hash_password_rejects_password_over_bcrypt_byte_limit(self):
        with pytest.raises(ValueError, match="72"):
            hash_password("密" * 25)

    def test_verify_password_supports_legacy_truncated_hash(self):
        password = "密" * 25
        legacy_hash = bcrypt.hashpw(
            password.encode("utf-8")[:72],
            bcrypt.gensalt(),
        ).decode("utf-8")
        assert verify_password(password, legacy_hash)


@pytest.mark.unit
def test_token_contains_auth_version():
    token = create_access_token(42, auth_version=3)
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    assert payload["ver"] == 3


@pytest.mark.unit
class TestPasswordHashing:
    """密码加密与验证。"""

    def test_hash_password_returns_bcrypt(self):
        """TC-SEC-003: 密码应使用 bcrypt 加密存储。"""
        hashed = hash_password("123456")
        assert hashed.startswith("$2b$"), "密码应以 $2b$ 开头（bcrypt 格式）"
        assert hashed != "123456", "密码不应以明文存储"

    def test_verify_correct_password(self):
        """TC-AUTH-005: 正确密码应验证通过。"""
        hashed = hash_password("123456")
        assert verify_password("123456", hashed) is True

    def test_verify_wrong_password(self):
        """TC-AUTH-006: 错误密码应验证失败。"""
        hashed = hash_password("123456")
        assert verify_password("wrongpass", hashed) is False

    def test_different_hashes_for_same_password(self):
        """相同密码每次加密结果应不同（salt 不同）。"""
        h1 = hash_password("123456")
        h2 = hash_password("123456")
        assert h1 != h2


@pytest.mark.unit
class TestJWTToken:
    """JWT 生成与解析。"""

    def test_create_and_decode_token(self):
        """token 应能正确编码和解码用户 ID。"""
        token = create_access_token(42)
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        assert payload["sub"] == "42"

    def test_token_contains_expiry(self):
        """token 应包含过期时间。"""
        token = create_access_token(1)
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        assert "exp" in payload

    def test_expired_token_is_rejected(self):
        """过期 token 应被拒绝。"""
        expire = datetime.now(timezone.utc) - timedelta(hours=1)
        payload = {"sub": "1", "exp": expire}
        expired_token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        with pytest.raises(jwt.ExpiredSignatureError):
            jwt.decode(expired_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])

    def test_wrong_algorithm_token_is_rejected(self):
        """错误算法的 token 应被拒绝。"""
        payload = {"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
        token_hs512 = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS512")
        with pytest.raises(jwt.InvalidAlgorithmError):
            jwt.decode(token_hs512, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])

    def test_empty_password_hash(self):
        """空密码哈希应正常工作（bcrypt 接受空字符串）。"""
        hashed = hash_password("")
        assert hashed
        assert verify_password("", hashed)

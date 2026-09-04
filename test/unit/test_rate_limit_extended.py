"""
单元测试 — 频率限制（扩展）
覆盖: 清理机制、密码修改冷却
"""
import pytest
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from app.utils.rate_limit import (
    check_login_rate,
    record_login_failure,
    clear_login_attempts,
    check_register_rate,
    record_register_attempt,
    check_password_change_cooldown,
    record_password_change,
    reset_all,
    _cleanup_expired_entries,
    _login_attempts,
    _register_attempts,
    _password_changes,
)


@pytest.mark.unit
class TestPasswordChangeCooldown:
    """密码修改冷却限制。"""

    def setup_method(self):
        reset_all()

    def test_no_cooldown_initially(self):
        """首次修改密码不应有冷却限制。"""
        check_password_change_cooldown(1)  # 不应抛异常

    def test_cooldown_active(self):
        """修改密码后应有冷却限制。"""
        record_password_change(1)
        with pytest.raises(HTTPException) as exc_info:
            check_password_change_cooldown(1)
        assert exc_info.value.status_code == 429

    def test_cooldown_expired(self):
        """冷却时间过后应恢复正常。"""
        # 手动设置过期的密码修改记录
        _password_changes[1] = datetime.now(timezone.utc) - timedelta(hours=2)
        check_password_change_cooldown(1)  # 不应抛异常

    def test_different_users_independent(self):
        """不同用户的冷却限制相互独立。"""
        record_password_change(1)
        check_password_change_cooldown(2)  # 用户2不应受影响


@pytest.mark.unit
class TestCleanupExpiredEntries:
    """清理过期记录。"""

    def setup_method(self):
        reset_all()

    def test_cleanup_login_attempts(self):
        """应清理过期的登录尝试记录。"""
        # 添加过期记录（超过锁定时间）和最近记录
        _login_attempts["user1:127.0.0.1"].append(
            datetime.now(timezone.utc) - timedelta(minutes=20)
        )
        _login_attempts["user1:127.0.0.1"].append(
            datetime.now(timezone.utc) - timedelta(minutes=1)
        )

        _cleanup_expired_entries()

        # 过期记录应被清理，最近记录应保留
        assert len(_login_attempts.get("user1:127.0.0.1", [])) == 1

    def test_cleanup_register_attempts(self):
        """应清理过期的注册尝试记录。"""
        _register_attempts["127.0.0.1"].append(
            datetime.now(timezone.utc) - timedelta(hours=2)
        )

        _cleanup_expired_entries()

        assert len(_register_attempts.get("127.0.0.1", [])) == 0

    def test_cleanup_password_changes(self):
        """应清理过期的密码修改记录。"""
        _password_changes[1] = datetime.now(timezone.utc) - timedelta(hours=2)

        _cleanup_expired_entries()

        assert 1 not in _password_changes

    def test_cleanup_preserves_recent_records(self):
        """应保留最近的记录。"""
        _login_attempts["user1:127.0.0.1"].append(
            datetime.now(timezone.utc) - timedelta(minutes=1)
        )

        _cleanup_expired_entries()

        assert len(_login_attempts["user1:127.0.0.1"]) == 1

    def test_cleanup_removes_empty_keys(self):
        """应移除空的键。"""
        _login_attempts["user1:127.0.0.1"].append(
            datetime.now(timezone.utc) - timedelta(minutes=20)
        )

        _cleanup_expired_entries()

        assert "user1:127.0.0.1" not in _login_attempts


@pytest.mark.unit
class TestLoginGlobalLayer:
    """登录限流第二层：同一用户名跨 IP 的全局失败上限（防轮换爆破）。"""

    def setup_method(self):
        reset_all()

    def teardown_method(self):
        reset_all()

    def test_global_threshold_blocks_rotation_across_ips(self, monkeypatch):
        """每个 IP 各失败 1 次、单 IP 远未触顶，但全局累计达阈值后，
        全新 IP 也必须被拦截。"""
        from app.core.config import settings

        limit = settings.LOGIN_GLOBAL_MAX_ATTEMPTS
        for i in range(limit):
            ip = f"10.0.{i // 255}.{i % 255}"
            check_login_rate("victim", ip)   # 此刻不应抛异常
            record_login_failure("victim", ip)

        with pytest.raises(HTTPException) as exc_info:
            check_login_rate("victim", "10.99.99.99")  # 全新 IP
        assert exc_info.value.status_code == 429

    def test_below_global_threshold_passes(self):
        """全局阈值之下（差 1 次）不应拦截正常尝试。"""
        from app.core.config import settings

        for i in range(settings.LOGIN_GLOBAL_MAX_ATTEMPTS - 1):
            ip = f"10.1.{i // 255}.{i % 255}"
            check_login_rate("victim2", ip)
            record_login_failure("victim2", ip)

        check_login_rate("victim2", "10.200.200.200")  # 不应抛异常

    def test_successful_login_clears_global_counter(self, client=None):
        """登录成功应同时清空 (username,ip) 与全局计数。"""
        from app.utils import rate_limit as rl

        rl.record_login_failure("clearme", "10.5.5.5")
        assert rl._login_attempts_global["clearme"]

        rl.clear_login_attempts("clearme", "10.5.5.5")
        assert "clearme" not in rl._login_attempts_global
        assert "clearme:10.5.5.5" not in rl._login_attempts


@pytest.mark.unit
class TestConcurrentAccess:
    """并发正确性（回归：评审 I1——共享结构曾为无锁读-改-写）。

    check→record 之间隔着 bcrypt 的 TOCTOU 窗口属既定语义（方案 A：仅加锁）；
    本测试锁定的是另一个真 bug：清理线程的「读-过滤-回写」覆盖并发 append
    导致的丢失更新。锁存在时，任何交错下记录都不能丢。
    """

    def test_concurrent_records_survive_concurrent_cleanup(self):
        import threading
        import time as time_mod

        from app.utils import rate_limit as rl

        # 多写入线程持续 append，同时清理线程反复做「读-过滤-回写」。
        # 锁存在时任何交错都不丢记录；该断言是 I1 修复后的守护。
        for round_num in range(6):
            rl.reset_all()
            stale = datetime.now(timezone.utc) - timedelta(minutes=20)
            rl._login_attempts["burst:127.0.0.1"] = [stale] * 300

            deadline = time_mod.monotonic() + 0.3

            def cleaner():
                while time_mod.monotonic() < deadline:
                    rl._cleanup_expired_entries()

            start = threading.Barrier(4)
            THREAD_RECORDS = 100

            def recorder():
                start.wait(timeout=5)
                for _ in range(THREAD_RECORDS):
                    rl.record_login_failure("burst", "127.0.0.1")

            cleaner_thread = threading.Thread(target=cleaner, daemon=True)
            recorder_threads = [
                threading.Thread(target=recorder, daemon=True) for _ in range(4)
            ]
            cleaner_thread.start()
            for thread in recorder_threads:
                thread.start()
            for thread in recorder_threads:
                thread.join(timeout=10)
            cleaner_thread.join(timeout=5)

            survived = len(rl._login_attempts.get("burst:127.0.0.1", []))
            total = 4 * THREAD_RECORDS
            # 并发写入的记录必须全部幸存（过期预置记录被清掉属正常）
            assert survived == total, (
                f"第 {round_num} 轮丢失更新：仅剩 {survived}/{total} 条记录"
            )

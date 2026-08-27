import asyncio

import pytest

import app.core.config as config_module
from app.core.config import settings


@pytest.mark.unit
@pytest.mark.parametrize(
    "secret",
    [
        "",
        "change-me-to-a-random-string",
        "a" * 31,
        "旅行足迹安全密钥",
    ],
)
def test_validate_jwt_secret_rejects_missing_placeholder_and_short_values(secret):
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        config_module.validate_jwt_secret(secret)


@pytest.mark.unit
@pytest.mark.parametrize("secret", ["a" * 32, "密" * 11])
def test_validate_jwt_secret_accepts_at_least_32_utf8_bytes(secret):
    config_module.validate_jwt_secret(secret)


@pytest.mark.unit
def test_lifespan_rejects_insecure_jwt_secret_before_initializing_database(
    monkeypatch,
):
    import app.main as main_module

    init_called = False

    def record_init():
        nonlocal init_called
        init_called = True

    monkeypatch.setattr(settings, "JWT_SECRET", "change-me-to-a-random-string")
    monkeypatch.setattr(main_module, "run_startup_migrations", record_init)

    async def run_lifespan():
        async with main_module.lifespan(main_module.app):
            pass

    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        asyncio.run(run_lifespan())
    assert not init_called

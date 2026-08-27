import pytest

from app.core.config import settings


@pytest.mark.integration
def test_public_map_config_includes_security_code(client, monkeypatch):
    monkeypatch.setattr(settings, "AMAP_KEY", "test-map-key")

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json() == {
        "amap_key": "test-map-key",
        "amap_security_code": "",
    }


@pytest.mark.integration
def test_production_api_does_not_allow_arbitrary_cross_origin_requests(client):
    response = client.options(
        "/api/auth/login",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert "access-control-allow-origin" not in response.headers

"""
全局 pytest fixtures — 提供测试数据库、HTTP 客户端、认证辅助函数。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

# Set test JWT secret BEFORE importing app modules
import os
os.environ["JWT_SECRET"] = "test-secret-key-for-testing-only"
os.environ["AMAP_KEY"] = "test-amap-key"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.core.database as db_module
from app.core.database import Base, get_db
from app.core.config import settings
import app.utils.rate_limit as rate_limit_module

_shared_session = []


def _create_test_app():
    """创建带测试数据库的 FastAPI 应用。"""
    from app.main import app as fastapi_app
    from app.models import user, trip, location, photo, share  # noqa: F401

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    db_module.engine = engine
    db_module.SessionLocal = TestSession

    def _override():
        db = TestSession()
        _shared_session.clear()
        _shared_session.append(db)
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            pass  # Don't close - db_session may still need it

    fastapi_app.dependency_overrides[get_db] = _override
    if fastapi_app.router.on_startup:
        fastapi_app.router.on_startup.clear()

    return fastapi_app, engine, TestSession


@pytest.fixture()
def client():
    """每个测试创建全新的内存数据库和 TestClient。"""
    from fastapi.testclient import TestClient

    fastapi_app, engine, TestSession = _create_test_app()

    with TestClient(fastapi_app) as c:
        yield c

    fastapi_app.dependency_overrides.pop(get_db, None)
    _shared_session.clear()
    rate_limit_module.reset_all()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db_session(client):
    """提供与 TestClient 共享的数据库会话。"""
    if _shared_session:
        return _shared_session[0]
    return None


@pytest.fixture()
def upload_dir(tmp_path):
    """临时上传目录。"""
    original = settings.UPLOAD_DIR
    settings.UPLOAD_DIR = tmp_path
    yield tmp_path
    settings.UPLOAD_DIR = original


@pytest.fixture()
def auth_headers(client):
    """注册并登录用户，返回带 token 的请求头。"""
    client.post("/api/auth/register", json={"username": "testuser", "password": "Test@123456"})
    resp = client.post("/api/auth/login", json={"username": "testuser", "password": "Test@123456"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def auth_headers_user_b(client):
    """注册并登录第二个用户。"""
    client.post("/api/auth/register", json={"username": "userb", "password": "Test@123456"})
    resp = client.post("/api/auth/login", json={"username": "userb", "password": "Test@123456"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def sample_trip_data():
    return {
        "title": "北京三日游",
        "description": "国庆假期北京之旅",
        "start_date": "2025-10-01",
        "end_date": "2025-10-03",
        "locations": [
            {"name": "故宫博物院", "address": "北京市东城区景山前街4号", "longitude": 116.397128, "latitude": 39.916527, "city": "北京", "province": "北京"},
            {"name": "长城", "address": "北京市延庆区", "longitude": 116.001, "latitude": 40.431, "city": "北京", "province": "北京"},
        ],
    }


@pytest.fixture()
def sample_location_data():
    return {"name": "天坛", "address": "北京市东城区天坛东里", "longitude": 116.407, "latitude": 39.882, "city": "北京", "province": "北京"}


@pytest.fixture()
def sample_import_json():
    return {
        "title": "导入旅行",
        "description": "导入测试",
        "startDate": "2025-06-01",
        "endDate": "2025-06-03",
        "locations": [{"name": "西湖", "address": "杭州市西湖区", "longitude": 120.148, "latitude": 30.242, "city": "杭州", "province": "浙江", "note": "## 西湖游记\n\n西湖真的很美！"}],
    }


@pytest.fixture()
def test_image_bytes():
    from PIL import Image
    from io import BytesIO
    img = Image.new("RGB", (100, 100), color="red")
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture()
def test_webp_bytes():
    from PIL import Image
    from io import BytesIO
    img = Image.new("RGB", (100, 100), color="blue")
    buf = BytesIO()
    img.save(buf, format="WEBP")
    return buf.getvalue()


@pytest.fixture()
def test_gif_bytes():
    from PIL import Image
    from io import BytesIO
    frames = [Image.new("RGB", (100, 100), c) for c in ["red", "blue"]]
    buf = BytesIO()
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
    return buf.getvalue()


@pytest.fixture()
def large_image_bytes():
    from PIL import Image
    from io import BytesIO
    img = Image.new("RGB", (4000, 4000), color="green")
    buf = BytesIO()
    img.save(buf, format="BMP")
    return buf.getvalue()

from sqlalchemy import create_engine, inspect, text
import pytest

import app.core.database as database
from app.core.database import Base
from app.core.migrations import run_startup_migrations
from app.models import location, photo, share, trip, user  # noqa: F401

BASELINE_REVISION = "0001_baseline"


def _build_legacy_engine(tmp_path, name, request, with_auth_version=True):
    """构造一个"旧版 create_all 时代"的存量库（无 alembic_version 表）。"""
    engine = create_engine(f"sqlite:///{tmp_path / name}")
    request.addfinalizer(engine.dispose)
    Base.metadata.create_all(bind=engine)
    if not with_auth_version:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users DROP COLUMN auth_version"))
    return engine


@pytest.mark.unit
def test_fresh_database_upgrades_to_full_schema_and_is_idempotent(tmp_path):
    """全新空库：upgrade head 建全表，重复执行幂等。"""
    engine = create_engine(f"sqlite:///{tmp_path / 'fresh.db'}")

    run_startup_migrations(engine)
    run_startup_migrations(engine)

    tables = set(inspect(engine).get_table_names())
    assert {"users", "trips", "locations", "photos", "shares", "alembic_version"} <= tables
    version = engine.connect().execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert version == BASELINE_REVISION


@pytest.mark.unit
def test_legacy_db_with_auth_version_is_stamped_without_data_loss(tmp_path, request):
    """存量库已含 auth_version：直接登记基线，数据原样保留。"""
    engine = _build_legacy_engine(tmp_path, "legacy-current.db", request)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (username, password_hash, auth_version, created_at) "
                "VALUES ('keeper', 'hash', 1, '2026-01-01')"
            )
        )

    run_startup_migrations(engine)

    version = engine.connect().execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert version == BASELINE_REVISION
    kept = engine.connect().execute(
        text("SELECT username FROM users WHERE username = 'keeper'")
    ).scalar_one()
    assert kept == "keeper"


@pytest.mark.unit
def test_oldest_legacy_db_gets_auth_version_then_stamped(tmp_path, request):
    """最老的存量库缺 auth_version 列：先补列再登记基线。"""
    engine = _build_legacy_engine(tmp_path, "legacy-old.db", request, with_auth_version=False)

    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    assert "auth_version" not in columns

    run_startup_migrations(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    assert "auth_version" in columns
    version = engine.connect().execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert version == BASELINE_REVISION


@pytest.mark.unit
def test_sqlite_pragmas_enforce_integrity_and_busy_timeout(tmp_path, request):
    """_apply_sqlite_pragmas 应开启外键约束并设置 busy_timeout。"""
    import sqlite3

    connection = sqlite3.connect(f"{tmp_path / 'pragma.db'}")
    request.addfinalizer(connection.close)

    database._apply_sqlite_pragmas(connection)

    assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    assert connection.execute("PRAGMA busy_timeout").fetchone()[0] == 5000


@pytest.mark.unit
def test_sqlite_pragmas_reject_orphan_rows(tmp_path, request):
    """启用 foreign_keys 后，孤儿行（引用不存在地点的照片）必须被数据库拒绝。"""
    import sqlite3

    connection = sqlite3.connect(f"{tmp_path / 'fk.db'}")
    request.addfinalizer(connection.close)
    connection.execute(
        "CREATE TABLE locations (id INTEGER PRIMARY KEY)"
    )
    connection.execute(
        "CREATE TABLE photos ("
        "id INTEGER PRIMARY KEY, "
        "location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE"
        ")"
    )

    database._apply_sqlite_pragmas(connection)

    connection.execute("INSERT INTO locations (id) VALUES (1)")
    connection.commit()
    try:
        connection.execute("INSERT INTO photos (id, location_id) VALUES (1, 999)")
        raised = False
    except sqlite3.IntegrityError:
        raised = True
    assert raised, "外键约束未生效：孤儿照片行被静默写入"


@pytest.mark.unit
def test_pragma_listener_survives_sqlalchemy_connect_dispatch(tmp_path, request):
    """回归测试：监听器必须兼容 SQLAlchemy connect 事件的
    双参数签名（dbapi_connection, connection_record）——
    此前因签名不匹配导致应用启动即崩溃且测试未能覆盖该路径。"""
    engine = create_engine(f"sqlite:///{tmp_path / 'listener.db'}")
    request.addfinalizer(engine.dispose)

    database.register_sqlite_pragma_listener(engine)

    # 真实走一次引擎连接，触发事件派发；签名不匹配会在此抛 TypeError
    with engine.connect() as connection:
        foreign_keys = connection.exec_driver_sql("PRAGMA foreign_keys").scalar()
        busy_timeout = connection.exec_driver_sql("PRAGMA busy_timeout").scalar()
    assert foreign_keys == 1
    assert busy_timeout == 5000

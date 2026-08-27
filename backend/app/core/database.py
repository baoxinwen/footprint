from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,
)


def _apply_sqlite_pragmas(dbapi_connection, connection_record=None) -> None:
    """为 SQLite 连接应用完整性/并发相关 PRAGMA。

    - foreign_keys=ON: 数据库层兜底引用完整性（ORM cascade 之外的防线）
    - busy_timeout=5000: 写争用时等待锁而非立即抛 database is locked
    - journal_mode=WAL + synchronous=NORMAL: 读写不互斥、崩溃恢复更稳
      （内存库不支持 WAL，PRAGMA 返回 memory，无副作用）

    第二个参数是 SQLAlchemy connect 事件自动传入的 ConnectionRecord，
    本函数不使用它，但签名必须兼容事件派发。
    """
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
    finally:
        cursor.close()


def register_sqlite_pragma_listener(target_engine) -> None:
    """把 PRAGMA 应用挂到引擎的 connect 事件上（非 SQLite 引擎为空操作）。"""
    if target_engine.dialect.name == "sqlite":
        event.listen(target_engine, "connect", _apply_sqlite_pragmas)


register_sqlite_pragma_listener(engine)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


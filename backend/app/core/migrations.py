"""应用启动时的数据库迁移入口。

三种库状态统一收敛到最新版本：

1. 全新空库（无 users 表）              -> upgrade head（baseline 建全表）
2. 存量库、无 alembic_version 表        -> 必要时补 auth_version 列，然后 stamp head
3. 已有 alembic_version 表             -> upgrade head（应用后续增量迁移）

设计动机：旧实现只有 create_all + 一段手写 ALTER，任何新的模型变更
对既有库都会静默失效。引入 Alembic 后，未来 schema 演进必须以新版本
文件形式追加，启动时自动应用。
"""
import logging
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

logger = logging.getLogger(__name__)

# backend/ 目录（alembic.ini 与脚本目录的锚点）
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def _alembic_config(database_url: str) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(_BACKEND_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    return cfg


def run_startup_migrations(engine=None) -> None:
    """把目标数据库迁移到最新版本。engine 供测试注入。"""
    from alembic import command

    from app.core import database

    target = engine if engine is not None else database.engine
    inspector = sa.inspect(target)
    tables = set(inspector.get_table_names())
    # 以真实引擎的 URL 为准，保证操作落在调用方指定的库上（测试可注入）
    cfg = _alembic_config(str(target.url))

    if "users" not in tables:
        logger.info("空白数据库，执行完整迁移到最新版本")
        command.upgrade(cfg, "head")
        return

    if "alembic_version" in tables:
        logger.info("检测到版本表，执行增量迁移到最新版本")
        command.upgrade(cfg, "head")
        return

    # 存量库且无版本表：先确保最老的一次性变更已应用，再登记基线版本
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "auth_version" not in user_columns:
        logger.info("旧库缺少 auth_version 列，执行一次性 ALTER 补齐")
        with target.begin() as connection:
            connection.execute(
                sa.text(
                    "ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1"
                )
            )
    logger.info("存量库登记 Alembic 基线版本")
    command.stamp(cfg, "head")

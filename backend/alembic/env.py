"""Alembic 迁移环境。

URL 以运行时注入为准（alembic.ini 中留空）：命令行使用时可通过
`-x db_url=...` 或先导出 DATABASE_URL；应用启动路径由
app.core.migrations 统一构造配置。
"""

import sys
from pathlib import Path

from sqlalchemy import create_engine

# 保证以任意工作目录调用时都能导入 app 包（backend/ 为包根）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from alembic import context  # noqa: E402

from app.core.database import Base  # noqa: E402
from app.models import location, photo, share, trip, user  # noqa: E402,F401

target_metadata = Base.metadata

config = context.config


def _database_url() -> str:
    url = config.get_main_option("sqlalchemy.url")
    if url:
        return url
    from app.core.config import settings  # noqa: E402

    return settings.DATABASE_URL


def run_migrations_online() -> None:
    connectable = create_engine(_database_url())
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    raise SystemExit("本项目不支持 alembic offline SQL 模式")
else:
    run_migrations_online()

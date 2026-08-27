"""基线：完整业务 schema（users/trips/locations/photos/shares）。

采用 Base.metadata.create_all 作为基线操作，保证与 SQLAlchemy 模型零漂移；
此后所有 schema 变更一律追加新的 op.* 版本，不再修改本文件。
存量库（由旧版 init_db/create_all 建立）通过 stamp 对齐到本版本，
不会重复执行本文件。

Revision ID: 0001_baseline
Revises:
Create Date: 2026-08-25
"""
from alembic import op

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    from app.core.database import Base
    from app.models import location, photo, share, trip, user  # noqa: F401

    Base.metadata.create_all(bind=op.get_bind())


def downgrade():
    """⚠️ 危险操作：drop_all 将清空全部业务数据（用户/旅行/地点/照片/分享）。

    仅限开发环境重建 schema 使用，生产库严禁执行。
    """
    from app.core.database import Base
    from app.models import location, photo, share, trip, user  # noqa: F401

    Base.metadata.drop_all(bind=op.get_bind())

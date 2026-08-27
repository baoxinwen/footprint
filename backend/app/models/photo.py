from datetime import datetime, timezone
from sqlalchemy import Integer, String, BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.core.database import Base
from app.utils.storage import validate_stored_path


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    location_id: Mapped[int] = mapped_column(Integer, ForeignKey("locations.id"), nullable=False, index=True)
    original_path: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    location: Mapped["Location"] = relationship("Location", back_populates="photos")  # noqa: F821

    @validates("original_path", "thumbnail_path")
    def validate_file_path(self, _key: str, value: str) -> str:
        return validate_stored_path(value)

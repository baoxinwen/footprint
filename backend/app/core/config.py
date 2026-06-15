from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "旅行足迹地图"
    DEBUG: bool = False

    # JWT
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    # Database
    DATABASE_URL: str = "sqlite:///./data/footprint.db"

    # Upload
    UPLOAD_DIR: Path = Path("uploads")
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    MAX_IMPORT_SIZE: int = 1 * 1024 * 1024  # 1MB
    THUMBNAIL_WIDTH: int = 300
    THUMBNAIL_QUALITY: int = 85
    MAX_IMAGE_PIXELS: int = 100_000_000
    MAX_ZIP_SIZE: int = 500 * 1024 * 1024  # 500MB
    ALLOWED_EXTENSIONS: set = {"jpg", "jpeg", "png", "gif", "webp"}

    # Amap
    AMAP_KEY: str = ""

    # Rate limiting
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    REGISTER_MAX_PER_HOUR: int = 3
    PASSWORD_CHANGE_COOLDOWN_HOURS: int = 1

    # Share
    SHARE_EXPIRE_DAYS: int = 30

    class Config:
        env_file = ".env"


settings = Settings()

from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


MIN_JWT_SECRET_BYTES = 32
INSECURE_JWT_SECRETS = frozenset({"change-me-to-a-random-string"})


def validate_jwt_secret(secret: str) -> None:
    normalized = secret.strip()
    if not normalized or normalized.lower() in INSECURE_JWT_SECRETS:
        raise RuntimeError("JWT_SECRET must not be empty or use a known placeholder")
    if len(secret.encode("utf-8")) < MIN_JWT_SECRET_BYTES:
        raise RuntimeError("JWT_SECRET must be at least 32 UTF-8 bytes")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

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
    EXPORT_TMP_DIR: Path = Path("data/tmp")
    EXPORT_TMP_MAX_AGE_SECONDS: int = 24 * 60 * 60
    ALLOWED_EXTENSIONS: set = {"jpg", "jpeg", "png", "gif", "webp"}

    # Amap
    AMAP_KEY: str = ""
    AMAP_SECURITY_CODE: str = ""

    # Rate limiting
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_GLOBAL_MAX_ATTEMPTS: int = 20  # 同一用户名跨全部 IP 的失败上限（防轮换爆破）
    LOGIN_LOCKOUT_MINUTES: int = 15
    REGISTER_MAX_PER_HOUR: int = 3
    PASSWORD_CHANGE_COOLDOWN_HOURS: int = 1

    # Share
    SHARE_EXPIRE_DAYS: int = 30

settings = Settings()

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings, validate_jwt_secret
from app.core.migrations import run_startup_migrations
from app.utils.zip_utils import cleanup_stale_temp_zips
from app.api import auth, trips, photos, shares, stats, timeline, export_import, amap, account, search


@asynccontextmanager
async def lifespan(app):
    validate_jwt_secret(settings.JWT_SECRET)
    run_startup_migrations()
    cleanup_stale_temp_zips()
    yield
    # 关闭 HTTP 客户端，释放连接资源
    from app.api.amap import close_http_client
    await close_http_client()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

# Mount uploads for static serving
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Register routers
app.include_router(auth.router)
app.include_router(trips.router)
app.include_router(photos.router)
app.include_router(shares.router)
app.include_router(stats.router)
app.include_router(timeline.router)
app.include_router(export_import.router)
app.include_router(amap.router)
app.include_router(account.router)
app.include_router(search.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def get_config():
    """Return the public browser-side AMap configuration."""
    return {
        "amap_key": settings.AMAP_KEY,
        "amap_security_code": settings.AMAP_SECURITY_CODE,
    }

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import init_db
from app.core.config import settings
from app.api import auth, trips, photos, shares, stats, timeline, export_import, amap, account, search


@asynccontextmanager
async def lifespan(app):
    if not settings.JWT_SECRET:
        raise RuntimeError("JWT_SECRET must be set in environment")
    init_db()
    yield
    # 关闭 HTTP 客户端，释放连接资源
    from app.api.amap import close_http_client
    await close_http_client()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

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
    """前端需要 AMAP_KEY 初始化地图（公开 key，非敏感信息）。"""
    return {
        "amap_key": settings.AMAP_KEY,
    }

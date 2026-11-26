import math
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.config import settings, validate_jwt_secret
from app.core.migrations import run_startup_migrations
from app.utils.zip_utils import cleanup_stale_temp_zips
from app.api import auth, trips, photos, shares, stats, timeline, export_import, amap, account, search


def _sanitize_error_value(value):
    """清洗校验错误详情里无法 JSON 序列化的内容（评审 M-1/M-10）。

    三类来源：孤立代理项字符串、非有限浮点（NaN/Infinity）、
    ctx 里挂着的原始异常对象（如 ValueError）。
    """
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        try:
            value.encode("utf-8")
            return value
        except UnicodeEncodeError:
            return value.encode("utf-8", "replace").decode("utf-8")
    if isinstance(value, dict):
        return {key: _sanitize_error_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize_error_value(item) for item in value]
    if isinstance(value, (int, bool)) or value is None:
        return value
    return str(value)


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


class RequestBodyLimitMiddleware:
    """按 Content-Length 提前拒绝超限请求体（评审 I-23）。

    直连 8002（绕过 nginx）时没有 client_max_body_size，multipart 解析阶段
    超限分片会整体落进容器 64MB 的 tmpfs /tmp——必须在解析前拦下。
    不带 Content-Length 的 chunked 请求无法预检，属已知边界。
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # 请求时读配置，测试可以按需调整上限
            limit = settings.MAX_REQUEST_BODY_SIZE
            for key, value in scope.get("headers", []):
                if key == b"content-length" and value.isdigit() and int(value) > limit:
                    response = JSONResponse({"detail": "请求体过大"}, status_code=413)
                    await response(scope, receive, send)
                    return
        await self.app(scope, receive, send)


app.add_middleware(RequestBodyLimitMiddleware)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request, exc: RequestValidationError):
    # FastAPI 的 RequestValidationError.errors() 是自定义签名，不接受
    # pydantic 的 include_url/include_input 参数
    errors = []
    for error in exc.errors():
        # ctx 里的原始异常对象也要清洗，否则不可序列化（ValueError 等）
        errors.append({key: _sanitize_error_value(value) for key, value in error.items()})
    return JSONResponse(status_code=422, content={"detail": errors})

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

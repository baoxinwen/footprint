import httpx
from fastapi import APIRouter, Depends, Query, HTTPException

from app.core.security import get_current_user_id
from app.core.config import settings

router = APIRouter(prefix="/api/amap", tags=["高德地图"])

_http_client: httpx.AsyncClient | None = None


async def get_http_client() -> httpx.AsyncClient:
    """获取或创建 HTTP 客户端，确保连接可复用。"""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=10)
    return _http_client


async def close_http_client():
    """关闭 HTTP 客户端，释放连接资源。"""
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


@router.get("/poi/search")
async def search_poi(
    keywords: str = Query(..., description="搜索关键词"),
    city: str = Query("", description="城市"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=25),
    user_id: int = Depends(get_current_user_id),
):
    """代理高德 POI 搜索，避免前端被广告拦截器屏蔽。"""
    if not settings.AMAP_KEY:
        raise HTTPException(status_code=500, detail="AMAP_KEY 未配置")
    url = "https://restapi.amap.com/v3/place/text"
    params = {
        "key": settings.AMAP_KEY,
        "keywords": keywords,
        "city": city,
        "offset": page_size,
        "page": page,
        "extensions": "base",
    }
    client = await get_http_client()
    resp = await client.get(url, params=params)
    data = resp.json()

    if data.get("status") != "1" or not data.get("pois"):
        return []

    results = []
    for poi in data.get("pois", []):
        location = poi.get("location", "")
        parts = location.split(",") if location else []
        lng = float(parts[0]) if len(parts) >= 1 else 0.0
        lat = float(parts[1]) if len(parts) >= 2 else 0.0
        results.append({
            "name": poi.get("name", ""),
            "address": poi.get("address", ""),
            "location": {"lng": lng, "lat": lat},
            "cityname": poi.get("cityname", ""),
            "pname": poi.get("pname", ""),
        })
    return results

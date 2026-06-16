import json
import zipfile
import io
import logging
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.trip import Trip
from app.models.location import Location
from app.core.config import settings
from app.utils.zip_utils import add_photos_to_zip, build_export_headers, _sanitize

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["导入导出"])


@router.get("/trips/{trip_id}/export/json")
def export_json(
    trip_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    locations = sorted(trip.locations, key=lambda l: l.sort_order)
    data = {
        "title": trip.title,
        "description": trip.description,
        "startDate": trip.start_date.isoformat(),
        "endDate": trip.end_date.isoformat(),
        "locations": [
            {
                "name": l.name,
                "address": l.address,
                "longitude": l.longitude,
                "latitude": l.latitude,
                "city": l.city,
                "province": l.province,
                "note": l.note,
            }
            for l in locations
        ],
    }

    content = json.dumps(data, ensure_ascii=False, indent=2)
    filename = f"{trip.title}.json"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


def _build_markdown(trip: Trip, locations: list) -> str:
    """构建旅行的 Markdown 内容。"""
    md_lines = [
        f"# {trip.title}",
        "",
        f"**日期：** {trip.start_date.isoformat()} ~ {trip.end_date.isoformat()}",
        "",
    ]
    if trip.description:
        md_lines.append(f"**描述：** {trip.description}")
        md_lines.append("")

    md_lines.append("---")
    md_lines.append("")

    for i, loc in enumerate(locations, 1):
        md_lines.append(f"## {i}. {loc.name}")
        md_lines.append("")
        md_lines.append(f"**地址：** {loc.address}")
        md_lines.append(f"**城市：** {loc.city} · {loc.province}")
        md_lines.append("")

        if loc.photos:
            md_lines.append("**照片：**")
            md_lines.append("")
            for photo in loc.photos:
                md_lines.append(f"![{photo.file_name}](photos/{_sanitize(loc.name)}/{_sanitize(photo.file_name)})")
                md_lines.append("")

        if loc.note:
            md_lines.append("**游记：**")
            md_lines.append("")
            md_lines.append(loc.note)
            md_lines.append("")

        md_lines.append("---")
        md_lines.append("")

    return "\n".join(md_lines)


@router.get("/trips/{trip_id}/export/markdown")
def export_markdown(
    trip_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="旅行不存在")

    locations = sorted(trip.locations, key=lambda l: l.sort_order)
    md_content = _build_markdown(trip, locations)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{_sanitize(trip.title)}.md", md_content)
        skipped = add_photos_to_zip(zf, locations, trip.title)

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers=build_export_headers(f"{trip.title}.zip", skipped),
    )


def _import_trip_data(trip_data: dict, idx: int, db: Session, user_id: int) -> None:
    """验证并导入单条旅行数据。"""
    trip = Trip(
        user_id=user_id,
        title=trip_data.get("title", "未命名旅行"),
        description=trip_data.get("description"),
        start_date=datetime.fromisoformat(trip_data["startDate"]).date(),
        end_date=datetime.fromisoformat(trip_data["endDate"]).date(),
    )
    db.add(trip)
    db.flush()

    for i, loc_data in enumerate(trip_data.get("locations", [])):
        name = (loc_data.get("name") or "").strip()
        address = (loc_data.get("address") or "").strip()
        longitude = loc_data.get("longitude", 0)
        latitude = loc_data.get("latitude", 0)

        if not name:
            raise ValueError(f"地点 {i + 1} 名称不能为空")
        if not (-180 <= longitude <= 180) or not (-90 <= latitude <= 90):
            raise ValueError(f"地点 {i + 1} 经纬度范围无效")

        location = Location(
            trip_id=trip.id,
            name=name,
            address=address,
            longitude=longitude,
            latitude=latitude,
            city=(loc_data.get("city") or "").strip(),
            province=(loc_data.get("province") or "").strip(),
            note=loc_data.get("note"),
            sort_order=i,
        )
        db.add(location)


@router.post("/trips/import")
async def import_trips(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".json"):
        logger.warning(f"导入失败: 非 JSON 文件 (filename: {file.filename})")
        raise HTTPException(status_code=400, detail="请上传 JSON 文件")

    content = await file.read()
    if len(content) > settings.MAX_IMPORT_SIZE:
        limit_mb = settings.MAX_IMPORT_SIZE // (1024 * 1024)
        logger.warning(f"导入失败: 文件过大 ({len(content)} bytes)")
        raise HTTPException(status_code=400, detail=f"文件大小超过 {limit_mb}MB 限制")

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        logger.warning(f"导入失败: JSON 格式错误 (filename: {file.filename})")
        raise HTTPException(status_code=400, detail="JSON 格式错误")

    trips_data = data if isinstance(data, list) else [data]

    imported = 0
    errors = []
    for idx, trip_data in enumerate(trips_data):
        savepoint = db.begin_nested()
        try:
            _import_trip_data(trip_data, idx, db, user_id)
            savepoint.commit()
            imported += 1
        except (KeyError, ValueError) as e:
            savepoint.rollback()
            errors.append(f"第 {idx + 1} 条记录导入失败: {str(e)}")
            continue

    db.commit()

    result = {"message": f"成功导入 {imported} 条旅行记录"}
    if errors:
        result["errors"] = errors
    return result

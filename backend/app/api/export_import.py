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

    # Build markdown content
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

        # Photos
        if loc.photos:
            md_lines.append("**照片：**")
            md_lines.append("")
            safe_name = loc.name.replace("/", "_").replace("\\", "_")
            for photo in loc.photos:
                md_lines.append(f"![{photo.file_name}](photos/{safe_name}/{photo.file_name})")
                md_lines.append("")

        # Note
        if loc.note:
            md_lines.append("**游记：**")
            md_lines.append("")
            md_lines.append(loc.note)
            md_lines.append("")

        md_lines.append("---")
        md_lines.append("")

    md_content = "\n".join(md_lines)

    # Create zip with size limit
    zip_buffer = io.BytesIO()
    total_size = 0
    skipped_photos = 0

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        safe_title = trip.title.replace("/", "_").replace("\\", "_").replace("..", "_")
        zf.writestr(f"{safe_title}.md", md_content)

        # Add photos with size limit
        for loc in locations:
            if loc.photos:
                safe_name = loc.name.replace("/", "_").replace("\\", "_").replace("..", "_")
                for photo in loc.photos:
                    photo_path = settings.UPLOAD_DIR / photo.original_path
                    safe_file = photo.file_name.replace("/", "_").replace("\\", "_").replace("..", "_")
                    if photo_path.exists():
                        file_size = photo_path.stat().st_size
                        if total_size + file_size > settings.MAX_ZIP_SIZE:
                            skipped_photos += 1
                            logger.warning(f"导出大小超限，跳过照片: {photo.file_name}")
                            continue
                        zf.write(photo_path, f"photos/{safe_name}/{safe_file}")
                        total_size += file_size

    zip_buffer.seek(0)
    filename = f"{trip.title}.zip"

    response_headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    if skipped_photos > 0:
        response_headers["X-Skipped-Photos"] = str(skipped_photos)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers=response_headers,
    )


@router.post("/trips/import")
async def import_trips(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="请上传 JSON 文件")

    # Check file size (max 1MB)
    MAX_IMPORT_SIZE = 1 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_IMPORT_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过 1MB 限制")

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="JSON 格式错误")

    # Support single trip or array of trips
    trips_data = data if isinstance(data, list) else [data]

    imported = 0
    errors = []
    for idx, trip_data in enumerate(trips_data):
        try:
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
                # 验证地点数据
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

            imported += 1
        except (KeyError, ValueError) as e:
            errors.append(f"第 {idx + 1} 条记录导入失败: {str(e)}")
            continue

    db.commit()

    result = {"message": f"成功导入 {imported} 条旅行记录"}
    if errors:
        result["errors"] = errors
    return result

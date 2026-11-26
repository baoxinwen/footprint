import json
import re
import zipfile
import io
import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import ValidationError
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.trip import Trip
from app.models.location import Location
from app.core.config import settings
from app.schemas.export_import import ImportTrip
from app.utils.upload import UploadSizeExceeded, read_upload_limited_sync
from app.utils.zip_utils import (
    add_photos_to_zip,
    build_export_headers,
    new_temp_zip_path,
    photo_archive_path,
    remove_temp_file,
    _sanitize,
)

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


_NOTE_PHOTO_RE = re.compile(r"/api/photos/(\d+)/(?:original|thumbnail)")


def _rewrite_note_images(note: str, archive_by_photo_id: dict) -> str:
    """把游记里的站内照片引用改写成包内路径（评审 M-6 / PRD 5.7）。

    引用不属于本旅行的照片 id 时保持原样——那是一条本来就失效的引用，
    不应被改写成误导性的包内路径。
    """

    def _sub(match: re.Match) -> str:
        return archive_by_photo_id.get(int(match.group(1)), match.group(0))

    return _NOTE_PHOTO_RE.sub(_sub, note)


def _build_markdown(trip: Trip, locations: list) -> str:
    """构建旅行的 Markdown 内容。"""
    archive_by_photo_id = {
        photo.id: photo_archive_path(trip.title, loc, photo)
        for loc in locations
        for photo in loc.photos
    }
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
                archive_path = photo_archive_path(trip.title, loc, photo)
                # 目标包进尖括号（CommonMark 允许其中出现空格/圆括号），alt 转义
                # 方括号——否则名称含空格时整条图片语法不被解析（评审 I-4）
                alt = photo.file_name.replace("[", "\\[").replace("]", "\\]")
                md_lines.append(f"![{alt}](<{archive_path}>)")
                md_lines.append("")

        if loc.note:
            md_lines.append("**游记：**")
            md_lines.append("")
            md_lines.append(_rewrite_note_images(loc.note, archive_by_photo_id))
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

    temp_path = new_temp_zip_path()
    try:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"{_sanitize(trip.title)}.md", md_content)
            skipped = add_photos_to_zip(zf, locations, trip.title)
    except Exception:
        remove_temp_file(temp_path)
        raise

    return FileResponse(
        temp_path,
        media_type="application/zip",
        headers=build_export_headers(f"{trip.title}.zip", skipped),
        background=BackgroundTask(remove_temp_file, temp_path),
    )


def _import_trip_data(trip_data: ImportTrip, db: Session, user_id: int) -> None:
    """Import one already-validated trip."""
    trip = Trip(
        user_id=user_id,
        title=trip_data.title,
        description=trip_data.description,
        start_date=trip_data.start_date,
        end_date=trip_data.end_date,
    )
    db.add(trip)
    db.flush()

    for i, loc_data in enumerate(trip_data.locations):
        location = Location(
            trip_id=trip.id,
            name=loc_data.name.strip(),
            address=loc_data.address.strip(),
            longitude=loc_data.longitude,
            latitude=loc_data.latitude,
            city=loc_data.city.strip(),
            province=loc_data.province.strip(),
            note=loc_data.note,
            sort_order=i,
        )
        db.add(location)


@router.post("/trips/import")
def import_trips(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    filename = file.filename or ""
    if not filename.lower().endswith(".json"):
        logger.warning(f"导入失败: 非 JSON 文件 (filename: {file.filename})")
        raise HTTPException(status_code=400, detail="请上传 JSON 文件")

    try:
        content = read_upload_limited_sync(file, settings.MAX_IMPORT_SIZE)
    except UploadSizeExceeded:
        limit_mb = settings.MAX_IMPORT_SIZE // (1024 * 1024)
        logger.warning(f"导入失败: 文件超过限制 ({settings.MAX_IMPORT_SIZE} bytes)")
        raise HTTPException(status_code=400, detail=f"文件大小超过 {limit_mb}MB 限制")

    try:
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError):
        logger.warning(f"导入失败: JSON 格式错误 (filename: {file.filename})")
        raise HTTPException(status_code=400, detail="JSON 格式错误")
    except RecursionError:
        # 深度嵌套的恶意/损坏 JSON 会让 C 解析器递归超限；
        # 体积已被限制在 1MB 内，无内存风险，但需返回友好错误而非 500
        logger.warning(f"导入失败: JSON 嵌套过深 (filename: {file.filename})")
        raise HTTPException(status_code=400, detail="JSON 格式错误")

    raw_trips = data if isinstance(data, list) else [data]
    if not raw_trips:
        # 空数组没有可导入的内容：明确拒绝，而不是「成功导入 0 条」（评审 M-14）
        logger.warning("导入失败: 导入内容为空")
        raise HTTPException(status_code=400, detail="导入内容为空")
    try:
        trips_data = [ImportTrip.model_validate(item) for item in raw_trips]
    except ValidationError as exc:
        details = [
            {key: error[key] for key in ("type", "loc", "msg")}
            for error in exc.errors(include_url=False, include_input=False)
        ]
        raise HTTPException(
            status_code=422,
            detail=details,
        ) from exc

    for trip_data in trips_data:
        _import_trip_data(trip_data, db, user_id)

    db.commit()
    return {"message": f"成功导入 {len(trips_data)} 条旅行记录"}

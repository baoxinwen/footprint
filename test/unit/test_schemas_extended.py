"""
单元测试 — Pydantic Schema 校验（扩展）
覆盖: LocationCreate 新增验证
"""
import pytest
from pydantic import ValidationError

from app.schemas.export_import import ImportTrip
from app.schemas.location import LocationCreate, LocationUpdate, SortOrderUpdate
from app.schemas.user import ChangePasswordRequest


@pytest.mark.unit
class TestLocationCreateSchema:
    """地点创建 Schema 校验。"""

    def test_valid_input(self):
        """正常输入应通过校验。"""
        loc = LocationCreate(
            name="故宫博物院",
            address="景山前街4号",
            longitude=116.397128,
            latitude=39.916527,
            city="北京",
            province="北京",
        )
        assert loc.name == "故宫博物院"

    def test_empty_name_raises(self):
        """空名称应校验失败。"""
        with pytest.raises(ValidationError):
            LocationCreate(
                name="",
                address="景山前街4号",
                longitude=116.397128,
                latitude=39.916527,
                city="北京",
                province="北京",
            )

    def test_whitespace_only_name_rejected(self):
        data = {
            "name": "故宫",
            "address": "景山前街4号",
            "longitude": 116.397128,
            "latitude": 39.916527,
            "city": "北京",
            "province": "北京",
        }
        data["name"] = "   "
        with pytest.raises(ValidationError):
            LocationCreate(**data)

    def test_missing_amap_metadata_is_accepted_and_trimmed(self):
        location = LocationCreate(
            name="  无地址景点  ",
            address="   ",
            longitude=116.397128,
            latitude=39.916527,
            city="   ",
            province="   ",
        )

        assert location.name == "无地址景点"
        assert location.address == ""
        assert location.city == ""
        assert location.province == ""

    def test_note_preserves_markdown_edge_whitespace(self):
        note = "    indented first line\n\nbody\n  "
        location = LocationCreate(
            name="故宫",
            address="",
            longitude=116.397128,
            latitude=39.916527,
            city="",
            province="",
            note=note,
        )

        assert location.note == note

    def test_longitude_out_of_range_raises(self):
        """经度超出范围应校验失败。"""
        with pytest.raises(ValidationError):
            LocationCreate(
                name="故宫",
                address="景山前街4号",
                longitude=200.0,
                latitude=39.916527,
                city="北京",
                province="北京",
            )

    def test_latitude_out_of_range_raises(self):
        """纬度超出范围应校验失败。"""
        with pytest.raises(ValidationError):
            LocationCreate(
                name="故宫",
                address="景山前街4号",
                longitude=116.397128,
                latitude=100.0,
                city="北京",
                province="北京",
            )

    def test_optional_note(self):
        """note 字段应为可选。"""
        loc = LocationCreate(
            name="故宫",
            address="景山前街4号",
            longitude=116.397128,
            latitude=39.916527,
            city="北京",
            province="北京",
        )
        assert loc.note is None


@pytest.mark.unit
class TestLocationUpdateSchema:
    """地点更新 Schema 校验。"""

    def test_all_fields_optional(self):
        """所有字段都应为可选。"""
        loc = LocationUpdate()
        assert loc.name is None
        assert loc.address is None
        assert loc.longitude is None
        assert loc.latitude is None
        assert loc.city is None
        assert loc.province is None
        assert loc.note is None

    def test_partial_update(self):
        """部分更新应通过校验。"""
        loc = LocationUpdate(name="新名称")
        assert loc.name == "新名称"
        assert loc.address is None

    def test_whitespace_only_name_rejected(self):
        with pytest.raises(ValidationError):
            LocationUpdate(name="   ")

    def test_structured_fields_are_trimmed_but_note_is_preserved(self):
        note = "    indented first line\n  "
        location = LocationUpdate(
            name="  新名称  ",
            address="   ",
            city="  北京  ",
            province="  北京  ",
            note=note,
        )

        assert location.name == "新名称"
        assert location.address == ""
        assert location.city == "北京"
        assert location.province == "北京"
        assert location.note == note

    @pytest.mark.parametrize(
        ("field", "value"),
        [("longitude", 181.0), ("latitude", 91.0)],
    )
    def test_coordinate_range_is_validated(self, field, value):
        with pytest.raises(ValidationError):
            LocationUpdate(**{field: value})


@pytest.mark.unit
class TestImportTripSchema:
    def test_import_preserves_markdown_and_accepts_missing_amap_metadata(self):
        description = "    trip code block\n  "
        note = "    location code block\n  "
        trip = ImportTrip.model_validate({
            "title": "  导入旅行  ",
            "description": description,
            "startDate": "2025-10-01",
            "endDate": "2025-10-03",
            "locations": [{
                "name": "  未知区域景点  ",
                "address": "   ",
                "longitude": 116.397128,
                "latitude": 39.916527,
                "city": "   ",
                "province": "   ",
                "note": note,
            }],
        })

        assert trip.title == "导入旅行"
        assert trip.description == description
        assert trip.locations[0].name == "未知区域景点"
        assert trip.locations[0].address == ""
        assert trip.locations[0].city == ""
        assert trip.locations[0].province == ""
        assert trip.locations[0].note == note


@pytest.mark.unit
class TestChangePasswordSchema:
    """修改密码 Schema 校验。"""

    def test_valid_input(self):
        """正常输入应通过校验。"""
        req = ChangePasswordRequest(
            current_password="old_pass",
            new_password="new_pass123",
            confirm_password="new_pass123",
        )
        assert req.new_password == "new_pass123"

    def test_new_password_too_short(self):
        """新密码少于 6 位应校验失败。"""
        with pytest.raises(ValidationError):
            ChangePasswordRequest(
                current_password="old_pass",
                new_password="12345",
                confirm_password="12345",
            )

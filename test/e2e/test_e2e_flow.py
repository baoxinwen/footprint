"""
端到端测试 — 完整用户流程
覆盖: 注册 → 登录 → 创建旅行 → 添加地点 → 上传照片 → 查看 → 导出 → 分享 → 修改密码
"""
import json
import zipfile
import io
import pytest


@pytest.mark.e2e
class TestFullUserFlow:
    """完整用户操作流程 E2E。"""

    def test_complete_flow(self, client, upload_dir):
        """模拟用户从注册到使用的完整流程。"""

        # Step 1: 注册
        resp = client.post("/api/auth/register", json={"username": "e2euser", "password": "123456"})
        assert resp.status_code == 200, "注册应成功"

        # Step 2: 登录
        resp = client.post("/api/auth/login", json={"username": "e2euser", "password": "123456"})
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Step 3: 创建旅行
        trip_data = {
            "title": "国庆北京游",
            "description": "2025年国庆假期",
            "start_date": "2025-10-01",
            "end_date": "2025-10-03",
            "locations": [
                {
                    "name": "故宫博物院",
                    "address": "北京市东城区景山前街4号",
                    "longitude": 116.397128,
                    "latitude": 39.916527,
                    "city": "北京",
                    "province": "北京",
                    "note": "## 游记\n\n故宫真的很大，走了一天。",
                },
                {
                    "name": "长城",
                    "address": "北京市延庆区",
                    "longitude": 116.001,
                    "latitude": 40.431,
                    "city": "北京",
                    "province": "北京",
                },
            ],
        }
        resp = client.post("/api/trips", json=trip_data, headers=headers)
        assert resp.status_code == 201
        trip_id = resp.json()["id"]

        # Step 4: 查看旅行详情
        resp = client.get(f"/api/trips/{trip_id}", headers=headers)
        assert resp.status_code == 200
        detail = resp.json()
        assert len(detail["locations"]) == 2
        assert detail["locations"][0]["note"] is not None
        loc_id = detail["locations"][0]["id"]

        # Step 5: 上传照片
        from PIL import Image
        from io import BytesIO
        img = Image.new("RGB", (200, 200), color="blue")
        buf = BytesIO()
        img.save(buf, format="JPEG")
        photo_bytes = buf.getvalue()

        resp = client.post(
            f"/api/photos/upload/{loc_id}",
            files={"file": ("photo.jpg", photo_bytes, "image/jpeg")},
            headers=headers,
        )
        assert resp.status_code == 201
        photo_id = resp.json()["id"]

        # Step 6: 查看照片列表
        resp = client.get(f"/api/photos/location/{loc_id}", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        # Step 7: 导出 JSON
        resp = client.get(f"/api/trips/{trip_id}/export/json", headers=headers)
        assert resp.status_code == 200
        exported = json.loads(resp.content)
        assert exported["title"] == "国庆北京游"

        # Step 8: 导出 Markdown
        resp = client.get(f"/api/trips/{trip_id}/export/markdown", headers=headers)
        assert resp.status_code == 200
        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        assert any(n.endswith(".md") for n in zf.namelist())

        # Step 9: 创建分享链接
        resp = client.post(f"/api/shares/{trip_id}", headers=headers)
        assert resp.status_code == 200
        share_token = resp.json()["token"]

        # Step 10: 无登录查看分享
        resp = client.get(f"/api/shares/view/{share_token}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "国庆北京游"

        # Step 11: 查看统计
        resp = client.get("/api/stats/overview", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["trip_count"] == 1

        # Step 12: 查看时间线
        resp = client.get("/api/timeline", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        # Step 13: 修改密码
        resp = client.post("/api/auth/change-password", json={
            "current_password": "123456", "new_password": "654321", "confirm_password": "654321"
        }, headers=headers)
        assert resp.status_code == 200

        # Step 14: 用新密码登录
        resp = client.post("/api/auth/login", json={"username": "e2euser", "password": "654321"})
        assert resp.status_code == 200

        # Step 15: 删除旅行
        new_token = resp.json()["access_token"]
        new_headers = {"Authorization": f"Bearer {new_token}"}
        resp = client.delete(f"/api/trips/{trip_id}", headers=new_headers)
        assert resp.status_code == 200

        # Step 16: 验证删除后统计更新
        resp = client.get("/api/stats/overview", headers=new_headers)
        assert resp.json()["trip_count"] == 0

    def test_import_then_export_flow(self, client, upload_dir):
        """导入 JSON 后再导出的完整流程。"""
        # 注册登录
        client.post("/api/auth/register", json={"username": "importuser", "password": "123456"})
        resp = client.post("/api/auth/login", json={"username": "importuser", "password": "123456"})
        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        # 导入
        import_data = {
            "title": "导入的旅行",
            "startDate": "2025-06-01",
            "endDate": "2025-06-03",
            "locations": [{"name": "西湖", "address": "杭州", "longitude": 120.15, "latitude": 30.25, "city": "杭州", "province": "浙江"}],
        }
        json_bytes = json.dumps(import_data, ensure_ascii=False).encode()
        resp = client.post("/api/trips/import", files={"file": ("trip.json", json_bytes, "application/json")}, headers=headers)
        assert resp.status_code == 200

        # 导出
        resp = client.get("/api/trips?page=1", headers=headers)
        trip_id = resp.json()["items"][0]["id"]
        resp = client.get(f"/api/trips/{trip_id}/export/json", headers=headers)
        assert resp.status_code == 200
        exported = json.loads(resp.content)
        assert exported["title"] == "导入的旅行"

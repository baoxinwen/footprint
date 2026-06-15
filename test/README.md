# 旅行足迹地图 — 测试套件

## 目录结构

```
test/
├── README.md                  ← 本文件，测试套件说明
├── pytest.ini                 ← pytest 配置（报告路径、覆盖率、标记）
├── requirements-test.txt      ← 测试依赖
├── conftest.py                ← 全局 fixtures（数据库、客户端、认证、测试数据）
│
├── test-plan.md               ← 测试计划文档
│
├── unit/                      ← 单元测试
│   ├── test_security.py       ← 密码加密、JWT
│   ├── test_image.py          ← 图片验证
│   ├── test_image_extended.py ← 图片处理扩展测试
│   ├── test_rate_limit.py     ← 频率限制
│   ├── test_rate_limit_extended.py ← 频率限制扩展测试
│   ├── test_schemas.py        ← Pydantic 校验
│   ├── test_schemas_extended.py ← Schema 扩展测试
│   └── test_escape.py         ← LIKE 转义工具
│
├── integration/               ← 集成测试
│   ├── test_auth.py           ← 账号系统（注册、登录、修改密码、安全）
│   ├── test_account.py        ← 账号模块（账号信息、导出）
│   ├── test_trips.py          ← 旅行管理（CRUD、分页、搜索、排序、数据隔离）
│   ├── test_photos.py         ← 照片管理（上传、列表、删除、访问控制）
│   ├── test_export_import.py  ← 导入导出（JSON、Markdown）
│   ├── test_export_import_extended.py ← 导入导出扩展测试
│   ├── test_shares.py         ← 分享功能（创建、查看、过期）
│   ├── test_stats.py          ← 统计分析（概览、排行、地图、年度/月度）
│   ├── test_timeline.py       ← 时间线
│   ├── test_search.py         ← 全局搜索
│   ├── test_photo_map.py      ← 照片地图标记
│   └── test_amap.py           ← 高德地图 POI 搜索（mock 外部请求）
│
├── e2e/                       ← 端到端测试
│   ├── test_e2e_flow.py       ← 完整用户流程（注册→登录→创建→上传→导出→分享→改密→删除）
│   └── test_deployed.py       ← 部署实例测试（针对 Docker 部署）
│
└── reports/                   ← 测试报告输出目录
    ├── report.html            ← pytest-html 生成的测试报告
    └── coverage/              ← 覆盖率报告
```

## 快速开始

### 1. 安装测试依赖

```bash
cd test
pip install -r requirements-test.txt
```

同时确保后端依赖已安装：

```bash
cd ../backend
pip install -r requirements.txt
```

### 2. 运行全部测试

```bash
cd test

# 单元测试
pytest unit/

# 集成测试
pytest integration/

# E2E 测试
pytest e2e/
```

### 3. 按文件运行集成测试

如果遇到 SQLite 内存数据库隔离问题，可按文件单独运行：

```bash
pytest integration/test_auth.py
pytest integration/test_account.py
pytest integration/test_trips.py
pytest integration/test_photos.py
pytest integration/test_export_import.py
pytest integration/test_shares.py
pytest integration/test_stats.py
pytest integration/test_timeline.py
pytest integration/test_search.py
pytest integration/test_photo_map.py
pytest integration/test_amap.py
```

### 4. 查看测试报告

测试运行后自动生成报告：

```bash
# 打开 HTML 报告
start reports/report.html        # Windows
open reports/report.html         # macOS
xdg-open reports/report.html    # Linux
```

### 5. 查看覆盖率报告

```bash
start reports/coverage/index.html   # Windows
open reports/coverage/index.html    # macOS
```

## 测试策略

| 层级 | 目标 | 工具 | 数据库 |
|------|------|------|--------|
| 单元测试 | 验证独立函数正确性 | pytest | 无 |
| 集成测试 | 验证 API 接口 + 数据库交互 | pytest + TestClient | SQLite 内存 |
| E2E 测试 | 验证完整用户流程 | pytest + TestClient | SQLite 内存 |
| 部署测试 | 验证 Docker 部署实例 | pytest + requests | 真实数据库 |

## Fixtures 说明

| Fixture | 说明 |
|---------|------|
| `client` | FastAPI TestClient，使用内存数据库 |
| `db_session` | 与 TestClient 共享的数据库会话 |
| `auth_headers` | 已登录用户的 Authorization header |
| `auth_headers_user_b` | 第二个用户（用于数据隔离测试） |
| `sample_trip_data` | 标准旅行数据（含 2 个地点） |
| `sample_location_data` | 标准地点数据 |
| `sample_import_json` | 标准导入 JSON 数据 |
| `test_image_bytes` | 程序生成的测试 JPEG |
| `test_webp_bytes` | 程序生成的测试 WebP |
| `test_gif_bytes` | 程序生成的测试 GIF |
| `upload_dir` | 临时上传目录（测试后自动清理） |

## 部署实例测试

`test_deployed.py` 包含针对 Docker 部署实例的测试，覆盖：

- 健康检查（前端、后端、API 代理、CSP 头）
- 认证系统（注册、登录、修改密码）
- 旅行管理（CRUD、分页、数据隔离）
- 地点管理（添加、删除）
- 照片管理（上传、列表、删除）
- 导入导出（JSON、Markdown、批量导入）
- 统计分析（概览、城市排行、地图标记、路线）
- 时间线
- 分享功能（创建、查看、复用）
- 搜索功能
- 账户管理

运行方式：

```bash
cd test
pytest test_deployed.py -v
```

## 用例 ID 对照

测试代码中通过注释关联到用例 ID，例如：

```python
def test_login_success(self, client):
    """TC-AUTH-005: 正常登录。"""
    ...
```

## CI 集成

在 CI 流水线中运行：

```bash
cd test
pytest --tb=long --junitxml=reports/junit.xml
```

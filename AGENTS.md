# AGENTS.md — 旅行足迹地图

## 项目概述

私人旅行足迹记录工具。前端 Vue 3 + Element Plus，后端 FastAPI + SQLAlchemy + SQLite。Docker Compose 部署，nginx 反向代理 `/api` 到后端。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + Pinia |
| 后端 | Python FastAPI + SQLAlchemy + Pillow |
| 数据库 | SQLite |
| 地图 | 高德地图 JS API v2.0（GCJ-02 坐标系） |
| 部署 | Docker Compose（frontend: nginx, backend: uvicorn） |

## 开发命令

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev          # 开发服务器，代理 /api 到 localhost:8000
npm run build        # vue-tsc -b && vite build
npm run test         # vitest run
npm run test:watch   # vitest 监听模式
npm run test:coverage
```

### 测试

```bash
# 后端测试（从 test/ 目录运行）
cd test
pip install -r requirements-test.txt
pip install -r ../backend/requirements.txt

pytest                         # 全部测试
pytest unit/                   # 单元测试
pytest integration/            # 集成测试
pytest e2e/                    # 端到端测试
pytest integration/test_auth.py  # 单文件

# 前端测试
cd frontend
npm run test
```

## 环境变量

必须在 `.env` 中配置（复制 `.env.example`）：

| 变量 | 必填 | 说明 |
|------|------|------|
| `JWT_SECRET` | 是 | JWT 签名密钥，启动时校验 |
| `AMAP_KEY` | 否 | 高德地图 API Key（POI 搜索） |
| `GITHUB_REPOSITORY` | 否 | GitHub 仓库路径（Docker 镜像） |

## 项目结构

```
├── backend/
│   └── app/
│       ├── main.py           # FastAPI 入口，注册所有路由
│       ├── core/
│       │   ├── config.py     # Settings（pydantic-settings，读 .env）
│       │   ├── database.py   # SQLAlchemy engine + get_db 依赖
│       │   └── security.py   # JWT + bcrypt
│       ├── api/              # 路由模块（auth, trips, photos, shares, stats, timeline, export_import, amap, account, search）
│       ├── models/           # SQLAlchemy 模型（user, trip, location, photo, share）
│       ├── schemas/          # Pydantic 请求/响应模型
│       └── utils/            # 工具函数（rate_limit, image, escape）
├── frontend/
│   └── src/
│       ├── api/              # Axios 请求封装（request.ts 是基础，含拦截器）
│       ├── views/            # 页面组件（10 个：Login, Map, Trips, TripForm, TripDetail, Timeline, Stats, Settings, Share, ShareExpired）
│       ├── components/       # 共享组件（PhotoViewer, EmptyState）
│       ├── stores/           # Pinia store（auth.ts）
│       ├── router/           # Vue Router（路由守卫检查 JWT）
│       ├── composables/      # 组合式函数（useTheme）
│       ├── utils/            # 工具函数（format, markdown）
│       ├── types/            # TypeScript 类型定义（index.ts）
│       ├── assets/           # 静态资源（main.css 含设计系统变量和深色模式）
│       └── __tests__/        # Vitest 测试
├── test/                     # 后端 pytest 测试套件
│   ├── conftest.py           # 全局 fixtures（client, auth_headers...）
│   ├── unit/                 # 单元测试（5 个文件）
│   ├── integration/          # 集成测试（11 个文件）
│   └── e2e/                  # 端到端测试（1 个文件）
└── data/                     # 持久化数据（db/, uploads/）
```

## 关键架构细节

### API 路由前缀

所有后端路由以 `/api/` 开头。前端 nginx 将 `/api/*` 代理到 `backend:8000`。前端开发时 Vite 也代理 `/api` 到 `localhost:8000`。

### 认证流程

- 注册/登录返回 JWT token，前端存 `localStorage`
- 路由守卫在 `router/index.ts` 中检查 token 有效性（解码 JWT 检查过期时间）
- 后端通过 `get_current_user_id` 依赖注入获取用户 ID
- Token 有效期 24 小时，不做无感刷新
- 前端请求拦截器自动附加 `Authorization: Bearer {token}`（`api/request.ts`）
- 401 响应自动跳转登录页（排除登录接口本身）

### 数据库

- SQLAlchemy 2.0 模式，使用 `DeclarativeBase`
- 数据库初始化在 `main.py` 的 lifespan 中调用 `init_db()`
- 测试使用 SQLite 内存数据库（`StaticPool`），每个测试独立
- 数据模型：User → Trip → Location → Photo，Share → Trip

### 测试 fixtures（test/conftest.py）

| Fixture | 说明 |
|---------|------|
| `client` | FastAPI TestClient，内存数据库 |
| `db_session` | 与 TestClient 共享的数据库会话 |
| `auth_headers` | 已登录用户的 Authorization header |
| `auth_headers_user_b` | 第二个用户（数据隔离测试） |
| `sample_trip_data` | 标准旅行数据（含 2 个地点） |
| `sample_location_data` | 标准地点数据 |
| `sample_import_json` | 标准导入 JSON 数据 |
| `test_image_bytes` | 程序生成的测试 JPEG |
| `test_webp_bytes` | 程序生成的测试 WebP |
| `test_gif_bytes` | 程序生成的测试 GIF |
| `large_image_bytes` | 4000x4000 BMP（测试大小限制） |
| `upload_dir` | 临时上传目录（测试后自动清理） |

### 前端测试配置

- Vitest 环境：jsdom
- Setup 文件：`src/__tests__/setup.ts`（mock localStorage, matchMedia, IntersectionObserver, URL.createObjectURL）
- Element Plus CSS 被 mock 掉
- 测试文件放在 `src/__tests__/` 下，按功能分子目录（views, components, composables, utils, api, stores）

### 坐标系

使用高德坐标系（GCJ-02），不要转换为 WGS-84。

### 照片处理

- 上传验证文件头（magic bytes），不仅检查扩展名
- 自动生成缩略图（宽度 300px）
- GIF 截取第一帧作为静态缩略图
- 文件用 UUID 重命名存储
- `PIL.Image.MAX_IMAGE_PIXELS` 设为 1 亿像素（防解压炸弹）

### 前端设计系统

- CSS 变量定义在 `src/assets/main.css`，包含颜色、阴影、圆角、间距、字体
- 深色模式通过 `html.dark` 类切换，CSS 变量自动适配
- 主题切换使用 `@vueuse/core` 的 `useDark`，支持跟随系统/浅色/深色三种模式
- 字体：Noto Serif SC（标题）、Noto Sans SC（正文）

### 高德地图集成

- 前端通过 `@amap/amap-jsapi-loader` 加载 SDK
- 需要 `VITE_AMAP_KEY` 和 `VITE_AMAP_SECURITY_CODE` 环境变量
- POI 搜索通过后端代理（`/api/amap/poi/search`），避免被广告拦截器屏蔽
- 地图样式切换需要销毁重建地图实例

## Docker 部署

```bash
# 开发模式（本地构建）
docker-compose up -d

# 生产模式（预构建镜像）
docker-compose -f docker-compose.prod.yml up -d

# 数据持久化
# - 数据库: ./data/db/footprint.db
# - 上传文件: ./data/uploads/
```

## CI/CD

GitHub Actions 在 push 到 `main` 或创建 `v*` 标签时自动构建 Docker 镜像并推送到 GHCR。PR 只构建不推送。

## 注意事项

- 所有界面文案为中文，不做多语言
- 地图仅覆盖中国大陆
- 密码使用 bcrypt 加密
- 接口有应用层频率限制（注册、登录、改密），使用内存存储（重启重置）
- 分享链接 30 天过期，使用 UUID token
- 前端使用 `unplugin-auto-import` 和 `unplugin-vue-components` 自动导入 Element Plus 组件
- Markdown 渲染使用 `markdown-it` + `DOMPurify`（html: false 防 XSS）
- nginx 配置了 CSP 头，限制脚本/样式/图片/连接来源

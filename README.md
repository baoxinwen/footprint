# 旅行足迹地图

一款私人的旅行足迹记录工具，帮助你在地图上标记去过的城市和景点，上传旅行照片，撰写旅行游记。

## 功能特性

- **地图展示** — 高德地图集成，城市标记、行程路线、照片地图模式
- **旅行管理** — 创建/编辑/删除旅行，添加地点，拖拽排序
- **照片管理** — 上传/删除照片，自动生成缩略图，全屏预览
- **游记撰写** — Markdown 编辑器，实时预览
- **时间线** — 按年月分组回顾旅行足迹
- **统计分析** — 年度/月度统计，城市排行榜
- **分享功能** — 生成分享链接（30天过期）
- **导入导出** — JSON/Markdown 格式
- **深色模式** — 自动跟随系统或手动切换
- **响应式设计** — 适配桌面端和移动端

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + Pinia |
| 后端 | Python FastAPI + SQLAlchemy + Pillow |
| 数据库 | SQLite |
| 地图 | 高德地图 JS API v2.0 |
| 部署 | Docker Compose（nginx + uvicorn） |

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/baoxinwen/footprint.git
cd footprint
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，设置 JWT_SECRET（必填）
```

### 3. Docker 部署

```bash
# 开发模式（本地构建）
docker-compose up -d

# 生产模式（拉取预构建镜像）
docker-compose -f docker-compose.prod.yml up -d
```

### 4. 访问应用

- 前端：http://localhost
- 后端 API：http://localhost:8000
- API 文档：http://localhost:8000/docs

## 本地开发

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
npm run dev
```

### 测试

```bash
# 后端测试
cd test
pip install -r requirements-test.txt
pip install -r ../backend/requirements.txt
pytest

# 前端测试
cd frontend
npm run test

# E2E 测试
npm run test:e2e
```

## 项目结构

```
├── backend/               # FastAPI 后端
│   └── app/
│       ├── api/           # 路由模块
│       ├── core/          # 配置、数据库、安全
│       ├── models/        # SQLAlchemy 模型
│       ├── schemas/       # Pydantic 请求/响应模型
│       └── utils/         # 工具函数
├── frontend/              # Vue 3 前端
│   ├── src/
│   │   ├── api/           # API 请求封装
│   │   ├── views/         # 页面组件
│   │   ├── components/    # 共享组件
│   │   ├── stores/        # Pinia 状态管理
│   │   └── router/        # Vue Router
│   └── e2e/               # Playwright E2E 测试
├── test/                  # 后端 pytest 测试
├── docker-compose.yml     # Docker 部署配置
└── .github/workflows/     # CI/CD 自动构建
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `JWT_SECRET` | 是 | JWT 签名密钥 |
| `AMAP_KEY` | 否 | 高德地图 API Key |
| `GITHUB_REPOSITORY` | 否 | GitHub 仓库路径（用于拉取预构建镜像） |

## 数据持久化

- 数据库：`./data/db/footprint.db`
- 上传文件：`./data/uploads/`

## License

MIT

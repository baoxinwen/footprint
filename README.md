# 旅行足迹地图

一款私人的旅行足迹记录工具，帮助你在地图上标记去过的城市和景点，上传旅行照片，撰写旅行游记。

## 功能特性

- **地图展示** — 高德地图集成，城市标记、行程路线、照片地图模式
- **旅行管理** — 创建/编辑/删除旅行，添加地点，拖拽排序
- **照片管理** — 上传/删除照片，自动生成缩略图，全屏预览
- **游记撰写** — Markdown 编辑器，实时预览
- **时间线** — 按年月分组回顾旅行足迹
- **统计分析** — 年度/月度统计，城市排行榜
- **全局搜索** — 搜索旅行、地点、城市
- **分享功能** — 生成分享链接（30天过期）
- **导入导出** — JSON/Markdown 格式，支持批量导入
- **深色模式** — 自动跟随系统或手动切换
- **响应式设计** — 适配桌面端和移动端
- **PWA** — 可安装到手机桌面与电脑；联网时看过的内容断网后仍可查看；有新版本时提示更新

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + Pinia |
| PWA | vite-plugin-pwa（Workbox 生成的 Service Worker）+ 应用清单 |
| 后端 | Python FastAPI + SQLAlchemy + Pillow |
| 数据库 | SQLite |
| 地图 | 高德地图 JS API v2.0 |
| 测试 | pytest (后端) + Vitest (前端) + Playwright (E2E) |
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
# 编辑 .env，至少设置 JWT_SECRET
```

### 3. Docker 部署

```bash
docker compose pull
docker compose up -d
```

### 4. 访问应用

- 前端：http://localhost:8001
- 后端 API：http://<NAS 的 IP>:8002（对局域网开放）
- API 文档：http://<NAS 的 IP>:8002/docs

`8001` 默认是明文 HTTP，并发布到宿主机所有网络接口。局域网或公网部署时应在其前方配置 HTTPS 反向代理和防火墙，不要直接暴露到公网；外层代理也应关闭 `/api/shares/view/` 路径的访问日志，避免分享 token 进入日志。

### 5. 安装到手机或电脑

应用是一个 PWA，可以像原生应用一样装到桌面，以独立窗口打开：

- **Android（Chrome / Edge）**：打开应用，点浏览器菜单里的「安装应用」或「添加到主屏幕」
- **iPhone / iPad（Safari）**：点底部的「分享」按钮，选「添加到主屏幕」
- **电脑（Chrome / Edge）**：点地址栏右侧的安装图标，或浏览器菜单里的「安装应用」

也可以在应用的 **设置 → 应用 → 安装应用** 里操作。装好之后长按图标，可以直接进入新建旅行、时间线或统计。

安装与离线都需要 HTTPS（`localhost` 除外）：明文 HTTP 下浏览器不会提供安装入口，也不会注册 Service Worker。

#### 离线使用

首次打开后，应用会在后台缓存应用壳，并提示「已可离线使用」。之后断网也能打开；联网时**看过的**页面——旅行列表与详情、时间线、统计、照片缩略图——会显示上次拿到的内容，页面顶部会提示当前离线。

离线时只能查看，并且只是快照：

- 保存、删除、上传、分享都需要联网
- 没打开过的内容不会凭空出现
- 地图与照片原图需要联网。地图页离线时会就地说明原因，恢复联网后自动加载
- 登录状态有有效期（24 小时）。过期后应用会回到登录页并清掉缓存里的私人数据，需要联网重新登录——离线查看的最长时间因此是最后一次登录后的 24 小时

退出登录、登录态失效或切换账号时，缓存里的私人数据会被清掉，下一个账号看不到上一个账号的内容。

#### 版本更新

发布新版本后，已打开的应用会提示「有新版本可用」，点「立即刷新」切换到新版；也可以随时在 **设置 → 应用 → 检查更新** 里主动检查，有新版本会直接切换。

前端自带的 nginx 配置已让 `sw.js`、`manifest.webmanifest` 与 `index.html` 不被浏览器缓存。如果它前面还有一层反向代理，同样不要缓存这三个文件，否则发版后浏览器拿不到新版本。

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

# E2E 测试。Playwright 会自行启动测试用的后端与前端，并构建一次前端供 PWA 用例使用
npx playwright test
# 只跑离线与更新相关的用例（对构建产物验证）
npx playwright test --project=pwa

# 图标由 scripts/pwa-icons/ 下的 SVG 生成；改动后重新生成，并把产出的 PNG 一并提交
npm run icons
```

## 项目结构

```
├── backend/               # FastAPI 后端
│   └── app/
│       ├── api/           # 路由模块 (auth, trips, photos, shares, stats, timeline, export_import, amap, account, search)
│       ├── core/          # 配置、数据库、安全
│       ├── models/        # SQLAlchemy 模型 (user, trip, location, photo, share)
│       ├── schemas/       # Pydantic 请求/响应模型
│       └── utils/         # 工具函数 (image, rate_limit, escape, zip_utils, storage, upload, data_dir)
├── frontend/              # Vue 3 前端
│   ├── src/
│   │   ├── api/           # API 请求封装
│   │   ├── views/         # 页面组件 (10 个页面)
│   │   ├── components/    # 共享组件 (PhotoViewer, EmptyState, AuthenticatedImage, OfflineBanner, UpdatePrompt)
│   │   ├── stores/        # Pinia 状态管理
│   │   ├── composables/   # 组合式函数 (useTheme, useAuthenticatedImage, useInstallPrompt)
│   │   ├── utils/         # 工具函数 (format, markdown, authSession, tripDraft, authenticatedImage, pwa)
│   │   ├── pwa/           # 离线缓存规则、更新检查与切换
│   │   └── router/        # Vue Router
│   ├── public/            # 应用清单 manifest.webmanifest 与图标 icons/
│   ├── scripts/           # 图标生成脚本 (generate-icons.mjs 与 SVG 源)
│   ├── e2e/               # Playwright E2E 测试 (13 个测试文件，对开发服务器)
│   └── e2e-pwa/           # 对构建产物验证离线、更新与可安装性的 E2E 测试
├── test/                  # 后端 pytest 测试
│   ├── unit/              # 单元测试 (13 个文件)
│   ├── integration/       # 集成测试 (13 个文件)
│   ├── e2e/               # 端到端测试 (完整流程 test_e2e_flow.py)
│   └── test_deployed.py   # Docker 部署实例集成测试
├── docker-compose.yml     # Docker 部署配置
└── .github/workflows/     # CI/CD 自动构建
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `JWT_SECRET` | 是 | JWT 签名密钥 |
| `FOOTPRINT_DATA_DIR` | 否 | 单一持久化数据根目录，默认 `./data` |
| `PUID` / `PGID` | 否 | 后端写入持久化目录时使用的非 root 宿主机 UID/GID，必须大于 `0`，默认 `1000` |
| `AMAP_KEY` | 否 | 高德地图 API Key（POI 搜索功能需要） |
| `AMAP_SECURITY_CODE` | 否 | 高德地图 JS API 的浏览器端安全密钥 |

## 数据持久化

- 数据库：`./data/db/footprint.db`
- 上传文件：`./data/uploads/`
- 导出临时文件：`./data/tmp/`（响应结束后自动删除）

## License

MIT

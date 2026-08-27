# 旅行足迹地图 — 前端

私人旅行足迹记录工具的 Web 前端，基于 Vue 3 + TypeScript 构建。后端为同仓库的 `backend/`（FastAPI），接口约定见根目录 `README.md`。

## 技术栈

| 分类 | 技术 |
|------|------|
| 框架 | Vue 3（`<script setup>`）+ TypeScript |
| 构建 | Vite + vue-tsc |
| UI | Element Plus（`unplugin-auto-import` / `unplugin-vue-components` 自动按需导入） |
| 状态管理 | Pinia |
| 路由 | Vue Router 4（路由守卫解码 JWT 检查过期） |
| 地图 | 高德地图 JS API v2.0（GCJ-02 坐标系），经 `@amap/amap-jsapi-loader` 加载 |
| Markdown | `md-editor-v3` 编辑器；渲染用 `markdown-it` + `DOMPurify`（防 XSS） |
| 主题 | `@vueuse/core` 的 `useDark`，跟随系统/浅色/深色三种模式 |

## 开发命令

```bash
npm install

npm run dev            # 开发服务器，/api 代理到 localhost:8000
npm run build          # vue-tsc -b && vite build
npm run preview        # 本地预览构建产物

# 单元测试（Vitest，jsdom 环境）
npm run test
npm run test:watch
npm run test:coverage

# E2E 测试（Playwright，需要先启动后端）
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:report
```

### 后端联调

开发服务器会把 `/api/*` 代理到 `http://localhost:8000`。如需指向其他后端实例，通过环境变量 `VITE_API_PROXY_TARGET` 覆盖（Playwright 配置内部即使用该变量，无需写入 `.env` 文件）。

### 地图 Key 说明

前端不在构建期配置地图 Key。应用启动时从后端公开接口 `GET /api/config` 获取 `amap_key` 与 `amap_security_code`（见 `src/api/config.ts`），因此只需在**后端** `.env` 中配置 `AMAP_KEY` / `AMAP_SECURITY_CODE`。

## 目录结构

```
├── src/
│   ├── api/               # Axios 封装与各资源请求（request.ts 含拦截器：附加 token、401 跳登录）
│   ├── views/             # 页面（10 个）：Login, Map, Trips, TripForm,
│   │                      #   TripDetail, Timeline, Stats, Settings, Share, ShareExpired
│   ├── components/        # PhotoViewer（全屏看图）、EmptyState、AuthenticatedImage（带鉴权的图片加载）
│   ├── composables/       # useTheme（主题切换）、useAuthenticatedImage
│   ├── stores/            # Pinia（auth.ts）
│   ├── router/            # 路由与守卫（检查 JWT 过期）
│   ├── utils/             # format、markdown 渲染、authSession、tripDraft、authenticatedImage 签名工具
│   ├── types/             # TypeScript 类型定义
│   ├── assets/            # main.css 设计系统变量（含深色模式适配）
│   └── __tests__/         # Vitest 单元测试（views/components/composables/utils/api/stores 分目录）
├── e2e/                   # Playwright E2E 测试（13 个 spec 文件 + helpers/global-teardown）
├── nginx.conf             # 生产容器内 nginx：静态托管 + /api 反向代理 + CSP 安全头
└── vite.config.ts         # Vite/Vitest 配置（自动导入、代理、覆盖率）
```

## 测试说明

- **单元测试**：jsdom 环境，setup 文件 mock 了 `localStorage`、`matchMedia`、`IntersectionObserver`、`URL.createObjectURL`；Element Plus CSS 被 mock。
- **E2E**：`playwright.config.ts` 会自行拉起前端服务并动态设置后端端口与 `/api` 代理目标；测试前置条件与运行方式见各 spec 文件及仓库根 `README.md`。

## 生产部署

前端 Docker 镜像基于多阶段构建：Node 构建产物交由 nginx 托管，`nginx.conf` 负责 SPA fallback、`/api` 反代到后端容器、安全响应头（CSP 允许 `*.amap.com` / `*.autonavi.com`）。完整编排见仓库根 `docker-compose.yml` 与 `DEPLOY.md`。

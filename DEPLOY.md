# 部署指南

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/your-username/footprint.git
cd footprint
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，设置 JWT_SECRET 和 AMAP_KEY
```

### 3. 使用 Docker Compose 部署

#### 开发模式（本地构建）
```bash
docker-compose up -d
```

#### 生产模式（使用预构建镜像）
```bash
# 确保 GITHUB_REPOSITORY 已在 .env 中设置
docker-compose -f docker-compose.prod.yml up -d
```

### 4. 访问应用

- 前端: http://localhost
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs

## GitHub Actions 自动构建

推送到 `main` 分支或创建 `v*` 标签时，会自动构建 Docker 镜像并推送到 GitHub Container Registry。

### 镜像地址

- 前端: `ghcr.io/your-username/footprint/frontend:main`
- 后端: `ghcr.io/your-username/footprint/backend:main`

### 手动触发构建

在 GitHub 仓库的 Actions 页面可以手动触发构建。

## 数据持久化

- 数据库: `./data/db/footprint.db`
- 上传文件: `./data/uploads/`

## 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `JWT_SECRET` | 是 | JWT 签名密钥，用于用户认证 |
| `AMAP_KEY` | 否 | 高德地图 API Key，用于 POI 搜索 |
| `GITHUB_REPOSITORY` | 否 | GitHub 仓库路径，用于拉取预构建镜像 |

## 常见问题

### 1. 如何生成安全的 JWT_SECRET？

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. 如何获取高德地图 API Key？

1. 访问 https://lbs.amap.com/
2. 注册账号并创建应用
3. 获取 Web端(JS API) 类型的 Key

### 3. 如何更新应用？

```bash
# 拉取最新代码
git pull

# 重新构建并部署
docker-compose down
docker-compose up -d --build
```

### 4. 如何备份数据？

```bash
# 备份数据库
cp data/db/footprint.db backup/footprint.db.$(date +%Y%m%d)

# 备份上传文件
tar -czf backup/uploads.$(date +%Y%m%d).tar.gz data/uploads/
```

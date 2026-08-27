FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# 容器内 npm ci 曾复现 "Exit handler never called"（退出码 0 但 node_modules
# 不完整）：npm install 走更稳的 reify 路径且尊重 lockfile；哨兵校验兜底
RUN --mount=type=cache,target=/root/.npm     npm install --no-audit --no-fund && test -x node_modules/.bin/vue-tsc
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 8080

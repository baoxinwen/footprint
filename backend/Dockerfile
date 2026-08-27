FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .
# 容器以 root 启动仅为数据目录初始化；docker-entrypoint.sh 随即
# 降权到 PUID:PGID 并 exec 应用，应用代码永不以 root 运行
ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
EXPOSE 8000

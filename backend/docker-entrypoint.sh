#!/bin/sh
# 容器以 root 启动仅用于持久化数据初始化（建目录/修正属主），
# 随即通过 setpriv 降权并以 exec 启动应用——应用代码永不以 root 运行。
set -eu

export FOOTPRINT_DATA_ROOT="${FOOTPRINT_DATA_ROOT:-/app/footprint-data}"
export PUID="${PUID:?PUID must be set}"
export PGID="${PGID:?PGID must be set}"

python -m app.utils.data_dir

exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- /bin/sh -eu -c '
  umask 077
  # 信任 X-Forwarded-For 的来源限定为 Docker 默认地址池＝只采信容器内
# 前端 nginx 的转发头；自定义过 Docker 网段时改为实际网段
exec uvicorn app.main:app --host 0.0.0.0 --port 8000     --proxy-headers --forwarded-allow-ips="172.16.0.0/12" --no-access-log
'

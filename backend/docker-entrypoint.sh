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
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000     --proxy-headers --forwarded-allow-ips="${BACKEND_TRUSTED_PROXIES:-*}" --no-access-log
'

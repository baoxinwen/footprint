#!/usr/bin/env bash
set -euo pipefail

project_name="footprint-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}"
image_tag="ci-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}"
data_dir="$(mktemp -d -t footprint-compose-XXXXXXXX)"

export FOOTPRINT_IMAGE_TAG="$image_tag"
export FOOTPRINT_DATA_DIR="$data_dir"
export JWT_SECRET="ci-compose-smoke-secret-not-for-production-64-bytes-minimum-00000000"
export AMAP_KEY=""
export PUID="$(id -u)"
export PGID="$(id -g)"

cleanup() {
  docker compose --project-name "$project_name" down --volumes --remove-orphans || true

  case "$data_dir" in
    "${TMPDIR:-/tmp}"/footprint-compose-*) rm -rf -- "$data_dir" ;;
    *) echo "Refusing to remove unexpected smoke data directory: $data_dir" >&2 ;;
  esac
}
trap cleanup EXIT

docker build \
  --tag "ghcr.io/baoxinwen/footprint/backend:${image_tag}" \
  ./backend
docker build \
  --tag "ghcr.io/baoxinwen/footprint/frontend:${image_tag}" \
  ./frontend

docker compose --project-name "$project_name" config --quiet
docker compose --project-name "$project_name" up --detach --wait --wait-timeout 180

curl --fail --silent --show-error http://127.0.0.1:8002/api/health
curl --fail --silent --show-error http://127.0.0.1:8001/api/health
curl --fail --silent --show-error http://127.0.0.1:8001/ > /dev/null

docker compose --project-name "$project_name" exec --no-TTY backend sh -eu -c '
  test "$(id -u)" != "0"
  test -f /app/footprint-data/.footprint-data
  for directory in /app/footprint-data/db /app/footprint-data/uploads /app/footprint-data/tmp; do
    probe="$directory/.compose-write-probe"
    : > "$probe"
    rm -f -- "$probe"
  done
  test "$DATABASE_URL" = "sqlite:////app/footprint-data/db/footprint.db"
  test "$UPLOAD_DIR" = "/app/footprint-data/uploads"
  test "$EXPORT_TMP_DIR" = "/app/footprint-data/tmp"
'
docker compose --project-name "$project_name" exec --no-TTY frontend sh -eu -c '
  test "$(id -u)" != "0"
'

backend_id="$(docker compose --project-name "$project_name" ps --quiet backend)"
frontend_id="$(docker compose --project-name "$project_name" ps --quiet frontend)"
test "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$backend_id")" = "true"
test "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$frontend_id")" = "true"

docker compose --project-name "$project_name" exec --no-TTY backend python -c '
from app.core.config import settings
from app.utils.zip_utils import new_temp_zip_path, remove_temp_file

path = new_temp_zip_path()
assert path.parent == settings.EXPORT_TMP_DIR
remove_temp_file(path)
'

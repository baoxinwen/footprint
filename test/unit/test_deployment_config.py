import importlib
from pathlib import Path

import pytest
import yaml


REPOSITORY_ROOT = Path(__file__).parents[2]


def _load_data_dir_module():
    try:
        return importlib.import_module("app.utils.data_dir")
    except ModuleNotFoundError:
        pytest.fail("The fail-closed data directory initializer is missing")


@pytest.mark.unit
def test_compose_passes_jwt_secret_through_and_example_does_not_supply_placeholder():
    compose = yaml.safe_load(
        (REPOSITORY_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    )
    backend_environment = compose["services"]["backend"]["environment"]
    jwt_assignment = next(
        item for item in backend_environment if item.startswith("JWT_SECRET=")
    )

    # compose 只做透传，非空与长度校验由后端启动时 validate_jwt_secret 兜底
    assert jwt_assignment == "JWT_SECRET=${JWT_SECRET}"

    example_values = {
        key: value
        for line in (REPOSITORY_ROOT / ".env.example")
        .read_text(encoding="utf-8")
        .splitlines()
        if line and not line.startswith("#") and "=" in line
        for key, value in [line.split("=", 1)]
    }
    assert example_values["JWT_SECRET"] == ""


@pytest.mark.unit
def test_compose_mounts_data_root_once_without_init_container():
    compose = yaml.safe_load(
        (REPOSITORY_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    )

    # B 方案：无独立初始化容器，backend 入口自初始化后降权
    assert "data-init" not in compose["services"]
    assert "data-init" not in compose["services"]["backend"].get("depends_on", {})
    assert compose["services"]["backend"]["volumes"] == [
        "${FOOTPRINT_DATA_DIR:-./data}:/app/footprint-data"
    ]
    backend_environment = compose["services"]["backend"]["environment"]
    assert "FOOTPRINT_DATA_ROOT=/app/footprint-data" in backend_environment
    assert "PUID=${PUID:-1000}" in backend_environment
    assert "PGID=${PGID:-1000}" in backend_environment


@pytest.mark.unit
def test_backend_uses_paths_inside_single_data_root_mount():
    compose = yaml.safe_load(
        (REPOSITORY_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    )
    backend_environment = compose["services"]["backend"]["environment"]

    assert "DATABASE_URL=sqlite:////app/footprint-data/db/footprint.db" in (
        backend_environment
    )
    assert "UPLOAD_DIR=/app/footprint-data/uploads" in backend_environment
    assert "EXPORT_TMP_DIR=/app/footprint-data/tmp" in backend_environment


@pytest.mark.unit
def test_initializer_rejects_host_root_shape_before_creating_or_chowning(
    tmp_path, monkeypatch
):
    data_dir_module = _load_data_dir_module()
    host_root = tmp_path / "host-root"
    host_root.mkdir()
    (host_root / "etc").mkdir()
    (host_root / "tmp").mkdir()
    chowned = []
    monkeypatch.setattr(
        data_dir_module,
        "_chown_tree",
        lambda path, uid, gid: chowned.append(path),
    )

    with pytest.raises(data_dir_module.UnsafeDataDirectory, match="etc"):
        data_dir_module.initialize_data_root(host_root, uid=1000, gid=1000)

    assert sorted(path.name for path in host_root.iterdir()) == ["etc", "tmp"]
    assert chowned == []


@pytest.mark.unit
@pytest.mark.parametrize("unsafe_kind", ["file", "symlink"])
def test_initializer_rejects_managed_path_that_is_not_a_real_directory(
    tmp_path, monkeypatch, unsafe_kind
):
    data_dir_module = _load_data_dir_module()
    data_root = tmp_path / "data"
    data_root.mkdir()
    unsafe_path = data_root / "db"
    if unsafe_kind == "file":
        unsafe_path.write_bytes(b"not-a-directory")
    else:
        symlink_target = tmp_path / "outside"
        symlink_target.mkdir()
        unsafe_path.symlink_to(symlink_target, target_is_directory=True)

    chowned = []
    monkeypatch.setattr(
        data_dir_module,
        "_chown_tree",
        lambda path, uid, gid: chowned.append(path),
    )

    with pytest.raises(data_dir_module.UnsafeDataDirectory, match="db"):
        data_dir_module.initialize_data_root(data_root, uid=1000, gid=1000)

    assert not (data_root / "uploads").exists()
    assert not (data_root / "tmp").exists()
    assert not (data_root / ".footprint-data").exists()
    assert chowned == []


@pytest.mark.unit
def test_initializer_upgrades_unmarked_legacy_data_directory(tmp_path, monkeypatch):
    data_dir_module = _load_data_dir_module()
    data_root = tmp_path / "data"
    (data_root / "db").mkdir(parents=True)
    (data_root / "uploads").mkdir()
    (data_root / "db" / "footprint.db").write_bytes(b"legacy")
    chowned = []
    monkeypatch.setattr(
        data_dir_module,
        "_chown_tree",
        lambda path, uid, gid: chowned.append(path),
    )

    data_dir_module.initialize_data_root(data_root, uid=1000, gid=1000)

    assert (data_root / ".footprint-data").read_text(encoding="ascii") == (
        "footprint-data-v1\n"
    )
    assert (data_root / "tmp").is_dir()
    assert chowned == [
        data_root / "db",
        data_root / "uploads",
        data_root / "tmp",
    ]


@pytest.mark.unit
def test_initializer_repairs_owner_only_modes_for_legacy_data(tmp_path, monkeypatch):
    data_dir_module = _load_data_dir_module()
    data_root = tmp_path / "data"
    nested_directory = data_root / "uploads" / "trip-1"
    nested_directory.mkdir(parents=True)
    (data_root / "db").mkdir()
    (data_root / "tmp").mkdir()
    database_file = data_root / "db" / "footprint.db"
    photo_file = nested_directory / "photo.jpg"
    temporary_file = data_root / "tmp" / "export.zip"
    database_file.write_bytes(b"legacy-db")
    photo_file.write_bytes(b"legacy-photo")
    temporary_file.write_bytes(b"legacy-export")
    marker = data_root / ".footprint-data"
    marker.write_text("footprint-data-v1\n", encoding="ascii")

    modes = {}
    monkeypatch.setattr(
        data_dir_module.os,
        "chown",
        lambda path, uid, gid, **kwargs: None,
        raising=False,
    )
    monkeypatch.setattr(
        data_dir_module.os,
        "chmod",
        lambda path, mode, **kwargs: modes.__setitem__(Path(path), mode),
    )

    data_dir_module.initialize_data_root(data_root, uid=1000, gid=1000)

    assert modes == {
        data_root / "db": 0o700,
        data_root / "uploads": 0o700,
        nested_directory: 0o700,
        data_root / "tmp": 0o700,
        database_file: 0o600,
        photo_file: 0o600,
        temporary_file: 0o600,
        marker: 0o600,
    }


@pytest.mark.unit
@pytest.mark.parametrize(("uid", "gid"), [(0, 1000), (1000, 0)])
def test_initializer_rejects_root_target_ids(
    tmp_path, monkeypatch, capsys, uid, gid
):
    data_dir_module = _load_data_dir_module()
    data_root = tmp_path / "data"
    data_root.mkdir()
    initialized = []
    monkeypatch.setenv("FOOTPRINT_DATA_ROOT", str(data_root))
    monkeypatch.setenv("PUID", str(uid))
    monkeypatch.setenv("PGID", str(gid))
    monkeypatch.setattr(
        data_dir_module,
        "initialize_data_root",
        lambda *args: initialized.append(args),
    )

    assert data_dir_module.main() == 1
    assert initialized == []
    assert "Refusing to initialize persistent data directory" in capsys.readouterr().err


@pytest.mark.unit
def test_backend_image_keeps_application_source_owned_by_root():
    dockerfile = (REPOSITORY_ROOT / "backend" / "Dockerfile").read_text(
        encoding="utf-8"
    )

    assert "COPY --chown=footprint:footprint . ." not in dockerfile
    assert "COPY . ." in dockerfile


@pytest.mark.unit
def test_backend_runtime_is_private_non_root_and_trusts_the_frontend_proxy():
    dockerfile = (REPOSITORY_ROOT / "backend" / "Dockerfile").read_text(
        encoding="utf-8"
    )
    compose = yaml.safe_load(
        (REPOSITORY_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    )
    entrypoint = (REPOSITORY_ROOT / "backend" / "docker-entrypoint.sh").read_text(
        encoding="utf-8"
    )

    # 应用代码永不以 root 运行：入口以 root 仅执行数据初始化，随即降权 exec
    assert 'ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]' in dockerfile
    assert "USER footprint" not in dockerfile
    assert "python -m app.utils.data_dir" in entrypoint
    assert "exec setpriv --reuid=\"$PUID\" --regid=\"$PGID\"" in entrypoint
    assert "umask 077" in entrypoint
    assert "--proxy-headers" in entrypoint
    assert '--forwarded-allow-ips="172.16.0.0/12"' in entrypoint
    assert "--no-access-log" in entrypoint

    # root 仅为目录初始化保留最小能力；降权所需的 SETGID/SETUID 显式列出
    backend_caps = compose["services"]["backend"]["cap_add"]
    assert {"CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID"} <= set(backend_caps)
    assert compose["services"]["backend"].get("user") is None
    assert compose["services"]["backend"]["ports"] == ["8002:8000"]
    # 信任代理不再暴露为配置：写死 Docker 默认地址池，只采信容器内前端的转发头
    assert all(
        not item.startswith("BACKEND_TRUSTED_PROXIES=")
        for item in compose["services"]["backend"]["environment"]
    )


@pytest.mark.unit
def test_nginx_replaces_forwarded_for_and_hides_share_tokens_from_access_log():
    nginx = (REPOSITORY_ROOT / "frontend" / "nginx.conf").read_text(
        encoding="utf-8"
    )

    assert "$proxy_add_x_forwarded_for" not in nginx
    assert nginx.count("proxy_set_header X-Forwarded-For $remote_addr;") == 2
    share_location = "location ~ ^/api/shares/(?:view|photo)/ {"
    assert share_location in nginx
    share_location_body = nginx.split(share_location, 1)[1].split("\n    }", 1)[0]
    assert "access_log off;" in share_location_body
    # SPA 分享落地页 /share/{token} 的 URL 同样携带凭据级 token：
    # 用正则置于静态资源正则之前（防带扩展名 URI 被资源块抢占），并关闭访问日志
    assert "location ~ ^/share/ {" in nginx
    share_page_body = nginx.split("location ~ ^/share/ {", 1)[1].split("\n    }", 1)[0]
    assert "access_log off;" in share_page_body
    # 正则顺序：/share/ 必须出现在静态资源缓存块之前才能首配命中
    assert nginx.index("location ~ ^/share/") < nginx.index("location ~*")
    assert nginx.count("access_log off;") == 2


@pytest.mark.unit
def test_compose_smoke_checks_the_single_data_root_layout():
    smoke_script = (
        REPOSITORY_ROOT / ".github" / "scripts" / "compose-smoke.sh"
    ).read_text(encoding="utf-8")

    assert "/app/footprint-data/.footprint-data" in smoke_script
    assert "/app/footprint-data/db" in smoke_script
    assert "/app/footprint-data/uploads" in smoke_script
    assert "/app/footprint-data/tmp" in smoke_script
    assert "/app/export-tmp" not in smoke_script


@pytest.mark.unit
def test_frontends_use_same_origin_api_proxies_without_production_cors():
    main_source = (REPOSITORY_ROOT / "backend" / "app" / "main.py").read_text(
        encoding="utf-8"
    )
    nginx_config = (REPOSITORY_ROOT / "frontend" / "nginx.conf").read_text(
        encoding="utf-8"
    )
    vite_config = (REPOSITORY_ROOT / "frontend" / "vite.config.ts").read_text(
        encoding="utf-8"
    )

    assert "CORSMiddleware" not in main_source
    assert "location /api/" in nginx_config
    assert "proxy_pass http://backend:8000" in nginx_config
    assert "'/api'" in vite_config

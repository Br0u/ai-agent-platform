from dataclasses import asdict
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

from agent_service.model_endpoint_catalog import (
    EndpointCatalogError,
    EndpointNotAllowedError,
    load_model_endpoint_catalog,
)
from agent_service.model_config_types import ModelProvider


OFFICIAL_ENDPOINTS: dict[str, tuple[ModelProvider, str]] = {
    "openai-official": ("openai", "https://api.openai.com/v1"),
    "anthropic-official": ("anthropic", "https://api.anthropic.com"),
    "google-official": (
        "google",
        "https://generativelanguage.googleapis.com",
    ),
    "dashscope-official": (
        "dashscope",
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    ),
    "deepseek-official": ("deepseek", "https://api.deepseek.com"),
    "minimax-official": ("minimax", "https://api.minimax.io/v1"),
}


def write_endpoint_file(
    tmp_path: Path,
    endpoints: list[dict[str, object]],
    *,
    raw: str | None = None,
    mode: int = 0o600,
) -> Path:
    path = tmp_path / "model-endpoints.json"
    path.write_text(
        raw
        if raw is not None
        else json.dumps({"version": "1", "endpoints": endpoints}),
        encoding="utf-8",
    )
    path.chmod(mode)
    return path


def custom_endpoint(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "id": "openai-deployment",
        "label": "OpenAI deployment",
        "provider": "openai",
        "base_url": "https://models.example.com/v1",
        "enabled": True,
    }
    values.update(overrides)
    return values


def test_catalog_contains_six_code_owned_official_endpoints() -> None:
    catalog = load_model_endpoint_catalog()

    assert set(catalog.endpoint_ids) == set(OFFICIAL_ENDPOINTS)
    for endpoint_id, (provider, base_url) in OFFICIAL_ENDPOINTS.items():
        endpoint = catalog.resolve(endpoint_id, provider)
        assert endpoint.base_url == base_url


def test_public_snapshot_contains_only_safe_metadata() -> None:
    snapshot = load_model_endpoint_catalog().public_snapshot()

    assert len(snapshot) == 6
    for item in snapshot:
        assert set(asdict(item)) == {"id", "label", "provider"}
        assert "url" not in repr(item).lower()


def test_deployment_file_adds_enabled_strict_https_endpoint(tmp_path: Path) -> None:
    path = write_endpoint_file(tmp_path, [custom_endpoint()])

    catalog = load_model_endpoint_catalog(path)

    endpoint = catalog.resolve("openai-deployment", "openai")
    assert endpoint.base_url == "https://models.example.com/v1"
    assert any(item.id == "openai-deployment" for item in catalog.public_snapshot())


def test_disabled_deployment_endpoint_is_not_public_or_resolvable(
    tmp_path: Path,
) -> None:
    path = write_endpoint_file(
        tmp_path,
        [custom_endpoint(enabled=False)],
    )

    catalog = load_model_endpoint_catalog(path)

    assert all(item.id != "openai-deployment" for item in catalog.public_snapshot())
    with pytest.raises(EndpointNotAllowedError, match="^endpoint not allowed$"):
        catalog.resolve("openai-deployment", "openai")


def test_provider_mismatch_is_rejected_without_exposing_url() -> None:
    catalog = load_model_endpoint_catalog()

    with pytest.raises(
        EndpointNotAllowedError, match="^endpoint not allowed$"
    ) as exc_info:
        catalog.resolve("openai-official", "anthropic")

    assert "api.openai.com" not in str(exc_info.value)


@pytest.mark.parametrize(
    "endpoints",
    (
        [custom_endpoint(), custom_endpoint(label="duplicate")],
        [custom_endpoint(id="openai-official")],
    ),
)
def test_duplicate_ids_are_rejected(
    tmp_path: Path,
    endpoints: list[dict[str, object]],
) -> None:
    path = write_endpoint_file(tmp_path, endpoints)

    with pytest.raises(EndpointCatalogError, match="^invalid endpoint catalog$"):
        load_model_endpoint_catalog(path)


@pytest.mark.parametrize(
    "base_url",
    (
        "http://models.example.com/v1",
        "https://user:pass@models.example.com/v1",
        "https://models.example.com/v1?key=value",
        "https://models.example.com/v1#fragment",
        "https://*.example.com/v1",
        "https://localhost/v1",
        "https://models.localhost/v1",
        "https://intranet/v1",
        "https://127.0.0.1/v1",
        "https://0177.0.0.1/v1",
        "https://0x7f.0.0.1/v1",
        "https://10.0.0.1/v1",
        "https://172.16.0.1/v1",
        "https://192.168.1.1/v1",
        "https://169.254.1.1/v1",
        "https://224.0.0.1/v1",
        "https://239.255.255.250/v1",
        "https://[::1]/v1",
        "https://[fc00::1]/v1",
        "https://[fe80::1]/v1",
        "https://[ff02::1]/v1",
        "https://[ff0e::1]/v1",
    ),
)
def test_unsafe_literal_urls_are_rejected(tmp_path: Path, base_url: str) -> None:
    path = write_endpoint_file(
        tmp_path,
        [custom_endpoint(base_url=base_url)],
    )

    with pytest.raises(
        EndpointCatalogError, match="^invalid endpoint catalog$"
    ) as exc_info:
        load_model_endpoint_catalog(path)

    assert base_url not in str(exc_info.value)


def test_url_validation_does_not_resolve_dns(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import socket

    def fail_dns(*args: object, **kwargs: object) -> None:
        raise AssertionError("endpoint validation must not resolve DNS")

    monkeypatch.setattr(socket, "getaddrinfo", fail_dns)
    path = write_endpoint_file(tmp_path, [custom_endpoint()])

    assert (
        load_model_endpoint_catalog(path)
        .resolve(
            "openai-deployment",
            "openai",
        )
        .base_url
        == "https://models.example.com/v1"
    )


@pytest.mark.parametrize("mode", (0o620, 0o606, 0o666))
def test_group_or_world_writable_files_are_rejected(
    tmp_path: Path,
    mode: int,
) -> None:
    path = write_endpoint_file(tmp_path, [], mode=mode)

    with pytest.raises(EndpointCatalogError, match="^invalid endpoint catalog$"):
        load_model_endpoint_catalog(path)


def test_non_regular_file_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(EndpointCatalogError, match="^invalid endpoint catalog$"):
        load_model_endpoint_catalog(tmp_path)


def test_fifo_is_rejected_without_blocking_before_file_type_check(
    tmp_path: Path,
) -> None:
    fifo = tmp_path / "model-endpoints.fifo"
    os.mkfifo(fifo, mode=0o600)
    script = (
        "from pathlib import Path\n"
        "import sys\n"
        "from agent_service.model_endpoint_catalog import "
        "EndpointCatalogError, load_model_endpoint_catalog\n"
        "try:\n"
        "    load_model_endpoint_catalog(Path(sys.argv[1]))\n"
        "except EndpointCatalogError:\n"
        "    raise SystemExit(0)\n"
        "raise SystemExit(2)\n"
    )
    source_root = str(Path(__file__).resolve().parents[1] / "src")
    inherited_pythonpath = os.environ.get("PYTHONPATH")
    pythonpath = os.pathsep.join(
        [source_root, inherited_pythonpath] if inherited_pythonpath else [source_root]
    )

    try:
        result = subprocess.run(
            [sys.executable, "-c", script, str(fifo)],
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
            env={**os.environ, "PYTHONPATH": pythonpath},
        )
    except subprocess.TimeoutExpired:
        pytest.fail("endpoint catalog blocked while opening a FIFO")

    assert result.returncode == 0, result.stderr or result.stdout


def test_symlink_is_rejected(tmp_path: Path) -> None:
    target = write_endpoint_file(tmp_path, [])
    link = tmp_path / "endpoint-link.json"
    link.symlink_to(target)

    with pytest.raises(EndpointCatalogError, match="^invalid endpoint catalog$"):
        load_model_endpoint_catalog(link)


@pytest.mark.parametrize(
    "raw",
    ("{", "[]", '{"version":"2","endpoints":[]}', '{"version":"1"}'),
)
def test_malformed_or_wrong_shape_json_is_rejected(
    tmp_path: Path,
    raw: str,
) -> None:
    path = write_endpoint_file(tmp_path, [], raw=raw)

    with pytest.raises(EndpointCatalogError, match="^invalid endpoint catalog$"):
        load_model_endpoint_catalog(path)


def test_endpoint_file_and_items_forbid_extra_fields(tmp_path: Path) -> None:
    path = write_endpoint_file(
        tmp_path,
        [{**custom_endpoint(), "api_key": "must-never-be-accepted"}],
    )

    with pytest.raises(
        EndpointCatalogError, match="^invalid endpoint catalog$"
    ) as exc_info:
        load_model_endpoint_catalog(path)

    assert "must-never-be-accepted" not in str(exc_info.value)


def test_file_owner_must_be_root_or_current_agent_user(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import agent_service.model_endpoint_catalog as module

    path = write_endpoint_file(tmp_path, [])
    original_fstat = os.fstat

    def untrusted_fstat(fd: int) -> os.stat_result:
        current = original_fstat(fd)
        values = list(current)
        values[4] = os.geteuid() + 10_000
        return os.stat_result(values)

    monkeypatch.setattr(module.os, "fstat", untrusted_fstat)

    with pytest.raises(EndpointCatalogError, match="^invalid endpoint catalog$"):
        load_model_endpoint_catalog(path)

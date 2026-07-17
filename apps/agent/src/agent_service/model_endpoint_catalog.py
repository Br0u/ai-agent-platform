"""Code-owned model endpoints plus a strict deployment allowlist."""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
import ipaddress
import os
from pathlib import Path
import re
import stat
from types import MappingProxyType
from typing import Final, Literal
from urllib.parse import SplitResult, urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, ValidationError

from agent_service.model_config_types import MODEL_PROVIDERS, ModelProvider


_MAX_ENDPOINT_FILE_BYTES: Final = 64 * 1024
_ENDPOINT_ID_PATTERN: Final = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?")
_NUMERIC_HOST_LABEL_PATTERN: Final = re.compile(r"(?:0x[0-9a-f]+|[0-9]+)")
_LOCAL_HOST_SUFFIXES: Final = (".localhost", ".local")


class EndpointCatalogError(ValueError):
    """Sanitized deployment-catalog failure."""


class EndpointNotAllowedError(ValueError):
    """Sanitized unknown, disabled, or Provider-mismatched endpoint failure."""


@dataclass(frozen=True, slots=True)
class ModelEndpoint:
    """Agent-internal endpoint record. The Base URL never crosses the BFF."""

    id: str
    label: str
    provider: ModelProvider
    base_url: str


@dataclass(frozen=True, slots=True)
class EndpointOption:
    """Safe Admin-facing endpoint option."""

    id: str
    label: str
    provider: ModelProvider


_OFFICIAL_ENDPOINTS: Final[tuple[ModelEndpoint, ...]] = (
    ModelEndpoint(
        id="openai-official",
        label="OpenAI official",
        provider="openai",
        base_url="https://api.openai.com/v1",
    ),
    ModelEndpoint(
        id="anthropic-official",
        label="Anthropic official",
        provider="anthropic",
        base_url="https://api.anthropic.com",
    ),
    ModelEndpoint(
        id="google-official",
        label="Google Gemini official",
        provider="google",
        base_url="https://generativelanguage.googleapis.com",
    ),
    ModelEndpoint(
        id="dashscope-official",
        label="DashScope official",
        provider="dashscope",
        base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    ),
    ModelEndpoint(
        id="deepseek-official",
        label="DeepSeek official",
        provider="deepseek",
        base_url="https://api.deepseek.com",
    ),
    ModelEndpoint(
        id="minimax-official",
        label="MiniMax official",
        provider="minimax",
        base_url="https://api.minimax.io/v1",
    ),
)
OFFICIAL_MODEL_ENDPOINTS: Final[Mapping[str, ModelEndpoint]] = MappingProxyType(
    {endpoint.id: endpoint for endpoint in _OFFICIAL_ENDPOINTS}
)


class _DeploymentEndpoint(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        hide_input_in_errors=True,
        strict=True,
    )

    id: str
    label: str
    provider: ModelProvider
    base_url: str
    enabled: bool


class _DeploymentEndpointFile(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        hide_input_in_errors=True,
        strict=True,
    )

    version: Literal["1"]
    endpoints: tuple[_DeploymentEndpoint, ...]


class ModelEndpointCatalog:
    """Immutable endpoint lookup with a metadata-only public projection."""

    __slots__ = ("_endpoints", "_ordered_ids")

    def __init__(self, endpoints: Iterable[ModelEndpoint]) -> None:
        endpoint_map: dict[str, ModelEndpoint] = {}
        ordered_ids: list[str] = []
        for endpoint in endpoints:
            if endpoint.id in endpoint_map:
                raise EndpointCatalogError("invalid endpoint catalog")
            endpoint_map[endpoint.id] = endpoint
            ordered_ids.append(endpoint.id)
        self._endpoints = MappingProxyType(endpoint_map)
        self._ordered_ids = tuple(ordered_ids)

    @property
    def endpoint_ids(self) -> tuple[str, ...]:
        return self._ordered_ids

    def resolve(
        self,
        endpoint_id: str,
        provider: ModelProvider,
    ) -> ModelEndpoint:
        endpoint = self._endpoints.get(endpoint_id)
        if endpoint is None or endpoint.provider != provider:
            raise EndpointNotAllowedError("endpoint not allowed")
        return endpoint

    def public_snapshot(
        self,
        provider: ModelProvider | None = None,
    ) -> tuple[EndpointOption, ...]:
        return tuple(
            EndpointOption(
                id=endpoint.id,
                label=endpoint.label,
                provider=endpoint.provider,
            )
            for endpoint_id in self._ordered_ids
            if (endpoint := self._endpoints[endpoint_id]).provider == provider
            or provider is None
        )


def _read_deployment_file(path: Path) -> bytes:
    flags = (
        os.O_RDONLY
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_NONBLOCK", 0)
    )
    fd = -1
    try:
        fd = os.open(path, flags)
        file_stat = os.fstat(fd)
        if not stat.S_ISREG(file_stat.st_mode):
            raise EndpointCatalogError("invalid endpoint catalog")
        if file_stat.st_uid not in {0, os.geteuid()}:
            raise EndpointCatalogError("invalid endpoint catalog")
        if file_stat.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
            raise EndpointCatalogError("invalid endpoint catalog")
        if file_stat.st_size > _MAX_ENDPOINT_FILE_BYTES:
            raise EndpointCatalogError("invalid endpoint catalog")

        chunks: list[bytes] = []
        bytes_read = 0
        while True:
            chunk = os.read(fd, min(8192, _MAX_ENDPOINT_FILE_BYTES + 1 - bytes_read))
            if not chunk:
                break
            chunks.append(chunk)
            bytes_read += len(chunk)
            if bytes_read > _MAX_ENDPOINT_FILE_BYTES:
                raise EndpointCatalogError("invalid endpoint catalog")
        return b"".join(chunks)
    except EndpointCatalogError:
        raise
    except (OSError, ValueError):
        raise EndpointCatalogError("invalid endpoint catalog") from None
    finally:
        if fd >= 0:
            try:
                os.close(fd)
            except OSError:
                pass


def _validate_endpoint_id(value: str) -> str:
    if _ENDPOINT_ID_PATTERN.fullmatch(value) is None:
        raise EndpointCatalogError("invalid endpoint catalog")
    return value


def _validate_label(value: str) -> str:
    if (
        not value
        or value != value.strip()
        or len(value) > 80
        or any(
            ord(character) <= 0x1F or 0x7F <= ord(character) <= 0x9F
            for character in value
        )
    ):
        raise EndpointCatalogError("invalid endpoint catalog")
    return value


def _validated_hostname(host: str) -> tuple[str, bool]:
    candidate = host.rstrip(".").lower()
    if not candidate or "*" in candidate:
        raise EndpointCatalogError("invalid endpoint catalog")

    try:
        address = ipaddress.ip_address(candidate)
    except ValueError:
        if (
            "." not in candidate
            or candidate == "localhost"
            or candidate.endswith(_LOCAL_HOST_SUFFIXES)
        ):
            raise EndpointCatalogError("invalid endpoint catalog") from None
        try:
            ascii_host = candidate.encode("idna").decode("ascii")
        except UnicodeError:
            raise EndpointCatalogError("invalid endpoint catalog") from None
        labels = ascii_host.split(".")
        if (
            all(_NUMERIC_HOST_LABEL_PATTERN.fullmatch(label) for label in labels)
            or any(
                not label
                or len(label) > 63
                or label.startswith("-")
                or label.endswith("-")
                or re.fullmatch(r"[a-z0-9-]+", label) is None
                for label in labels
            )
        ):
            raise EndpointCatalogError("invalid endpoint catalog")
        return ascii_host, False

    if not address.is_global or address.is_multicast:
        raise EndpointCatalogError("invalid endpoint catalog")
    return address.compressed, address.version == 6


def _normalize_base_url(value: str) -> str:
    if (
        not value.startswith("https://")
        or any(character.isspace() for character in value)
        or any(
            ord(character) <= 0x1F or 0x7F <= ord(character) <= 0x9F
            for character in value
        )
        or "\\" in value
        or "?" in value
        or "#" in value
        or "*" in value
    ):
        raise EndpointCatalogError("invalid endpoint catalog")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        raise EndpointCatalogError("invalid endpoint catalog") from None
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or "@" in parsed.netloc
        or parsed.query
        or parsed.fragment
        or parsed.hostname is None
    ):
        raise EndpointCatalogError("invalid endpoint catalog")

    host, is_ipv6 = _validated_hostname(parsed.hostname)
    normalized_host = f"[{host}]" if is_ipv6 else host
    if port not in {None, 443}:
        normalized_host = f"{normalized_host}:{port}"
    normalized = SplitResult(
        scheme="https",
        netloc=normalized_host,
        path=parsed.path,
        query="",
        fragment="",
    )
    return urlunsplit(normalized)


def _parse_deployment_endpoints(path: Path) -> tuple[ModelEndpoint, ...]:
    try:
        payload = _DeploymentEndpointFile.model_validate_json(
            _read_deployment_file(path)
        )
        endpoints: list[ModelEndpoint] = []
        seen_ids = set(OFFICIAL_MODEL_ENDPOINTS)
        for item in payload.endpoints:
            endpoint_id = _validate_endpoint_id(item.id)
            if endpoint_id in seen_ids:
                raise EndpointCatalogError("invalid endpoint catalog")
            seen_ids.add(endpoint_id)
            if item.provider not in MODEL_PROVIDERS:
                raise EndpointCatalogError("invalid endpoint catalog")
            label = _validate_label(item.label)
            base_url = _normalize_base_url(item.base_url)
            if item.enabled:
                endpoints.append(
                    ModelEndpoint(
                        id=endpoint_id,
                        label=label,
                        provider=item.provider,
                        base_url=base_url,
                    )
                )
        return tuple(endpoints)
    except EndpointCatalogError:
        raise
    except (ValidationError, UnicodeError, ValueError):
        raise EndpointCatalogError("invalid endpoint catalog") from None


def load_model_endpoint_catalog(
    path: str | Path | None = None,
) -> ModelEndpointCatalog:
    """Load official endpoints plus an optional trusted deployment file."""
    resolved_path = path
    if resolved_path is None:
        resolved_path = os.environ.get("MODEL_ENDPOINTS_FILE")
    custom = (
        ()
        if resolved_path is None
        else _parse_deployment_endpoints(Path(resolved_path))
    )
    return ModelEndpointCatalog((*_OFFICIAL_ENDPOINTS, *custom))

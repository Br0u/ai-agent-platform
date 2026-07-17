"""Transactional persistence for immutable model configuration drafts."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, NoReturn, Protocol, cast
from uuid import UUID

import psycopg
from pydantic import SecretStr, ValidationError
from sqlalchemy.engine import make_url

from agent_service.model_config_crypto import SealedSecret
from agent_service.model_config_types import (
    MODEL_PROVIDERS,
    TEST_STATUSES,
    ModelConfigDraft,
    ModelProvider,
    StoredModelConfigMetadata,
    TestStatus,
)


_VALIDATION_ERROR = "validation_error"
_CONFLICT_ERROR = "configuration_conflict"
_NOT_FOUND_ERROR = "model_configuration_not_found"
_STORAGE_ERROR = "storage_unavailable"

_LIST_METADATA_SQL = """SELECT
  provider,
  model_id,
  endpoint_id,
  api_key_last_four,
  revision,
  test_status
FROM agent_control.model_configs
WHERE is_current = true
ORDER BY provider
"""

_LOAD_CURRENT_SEALED_SQL = """SELECT
  id,
  provider,
  model_id,
  endpoint_id,
  api_key_ciphertext,
  api_key_nonce,
  api_key_last_four,
  encryption_key_version,
  revision,
  test_status
FROM agent_control.model_configs
WHERE provider = %s AND is_current = true
"""

_LOAD_ACTIVE_SQL = """SELECT
  config.id,
  config.provider,
  config.model_id,
  config.endpoint_id,
  config.api_key_ciphertext,
  config.api_key_nonce,
  config.api_key_last_four,
  config.encryption_key_version,
  config.revision,
  config.test_status,
  active.config_revision,
  active.activation_version,
  active.activated_at
FROM agent_control.active_model_config AS active
JOIN agent_control.model_configs AS config ON config.id = active.model_config_id
WHERE active.singleton = true
"""

_LOCK_CURRENT_HEAD_SQL = """SELECT id, revision
FROM agent_control.model_configs
WHERE provider = %s AND is_current = true
FOR UPDATE
"""

_RETIRE_CURRENT_HEAD_SQL = """UPDATE agent_control.model_configs
SET is_current = false, updated_at = now()
WHERE id = %s AND revision = %s AND is_current = true
"""

_INSERT_CONFIG_SQL = """INSERT INTO agent_control.model_configs (
  id,
  provider,
  model_id,
  endpoint_id,
  api_key_ciphertext,
  api_key_nonce,
  api_key_last_four,
  encryption_key_version,
  revision,
  is_current,
  test_status,
  last_tested_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, true, 'untested', NULL)
"""

_INSERT_EVENT_SQL = """INSERT INTO agent_control.control_events (
  id,
  request_id,
  assertion_nonce,
  actor_user_id,
  action,
  provider,
  model_id,
  endpoint_id,
  config_revision,
  result
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""


class ModelConfigRepositoryError(RuntimeError):
    """Base class for fixed, non-sensitive repository failures."""


class ModelConfigValidationError(ModelConfigRepositoryError):
    """The repository command is not a valid bounded domain command."""


class ModelConfigConflictError(ModelConfigRepositoryError):
    """The requested revision or one-time assertion is stale."""


class ModelConfigNotFoundError(ModelConfigRepositoryError):
    """No current model configuration exists for the requested Provider."""


class ModelConfigStorageError(ModelConfigRepositoryError):
    """A fixed storage failure that never exposes driver or SQL details."""


def _invalid() -> NoReturn:
    raise ModelConfigValidationError(_VALIDATION_ERROR) from None


def _conflict() -> NoReturn:
    raise ModelConfigConflictError(_CONFLICT_ERROR) from None


def _storage() -> NoReturn:
    raise ModelConfigStorageError(_STORAGE_ERROR) from None


def _validate_uuid(value: object) -> UUID:
    if type(value) is not UUID:
        _invalid()
    return cast(UUID, value)


def _validate_positive_integer(value: object) -> int:
    if type(value) is not int or cast(int, value) < 1:
        _invalid()
    return cast(int, value)


def _validate_non_negative_integer(value: object) -> int:
    if type(value) is not int or cast(int, value) < 0:
        _invalid()
    return cast(int, value)


def _validate_model_fields(
    *,
    provider: object,
    model_id: object,
    endpoint_id: object,
) -> tuple[ModelProvider, str, str]:
    validated: ModelConfigDraft | None = None
    try:
        validated = ModelConfigDraft.model_validate(
            {
                "provider": provider,
                "model_id": model_id,
                "endpoint_id": endpoint_id,
                "api_key": None,
                "expected_revision": 0,
            }
        )
    except ValidationError:
        pass
    if validated is None:
        _invalid()
    return validated.provider, validated.model_id, validated.endpoint_id


def _validate_sealed(value: object) -> SealedSecret:
    if type(value) is not SealedSecret:
        _invalid()
    sealed = cast(SealedSecret, value)
    if (
        type(sealed.ciphertext) is not bytes
        or len(sealed.ciphertext) < 16
        or type(sealed.nonce) is not bytes
        or len(sealed.nonce) != 12
        or type(sealed.key_version) is not int
        or sealed.key_version != 1
        or type(sealed.last_four) is not str
        or len(sealed.last_four) != 4
        or any(character.isspace() for character in sealed.last_four)
    ):
        _invalid()
    return sealed


@dataclass(frozen=True, slots=True)
class SaveSealedConfig:
    """One caller-sealed immutable revision to insert as the current draft."""

    config_id: UUID
    provider: ModelProvider
    model_id: str
    endpoint_id: str
    revision: int
    expected_revision: int
    sealed: SealedSecret = field(repr=False)
    assertion_nonce: UUID

    def __post_init__(self) -> None:
        config_id = _validate_uuid(self.config_id)
        provider, model_id, endpoint_id = _validate_model_fields(
            provider=self.provider,
            model_id=self.model_id,
            endpoint_id=self.endpoint_id,
        )
        revision = _validate_positive_integer(self.revision)
        expected_revision = _validate_non_negative_integer(self.expected_revision)
        sealed = _validate_sealed(self.sealed)
        assertion_nonce = _validate_uuid(self.assertion_nonce)
        object.__setattr__(self, "config_id", config_id)
        object.__setattr__(self, "provider", provider)
        object.__setattr__(self, "model_id", model_id)
        object.__setattr__(self, "endpoint_id", endpoint_id)
        object.__setattr__(self, "revision", revision)
        object.__setattr__(self, "expected_revision", expected_revision)
        object.__setattr__(self, "sealed", sealed)
        object.__setattr__(self, "assertion_nonce", assertion_nonce)


@dataclass(frozen=True, slots=True)
class ControlEvent:
    """Sanitized save-result audit event committed with its configuration."""

    event_id: UUID
    request_id: UUID
    assertion_nonce: UUID
    actor_user_id: UUID
    action: Literal["model_config_saved"]
    provider: ModelProvider
    model_id: str
    endpoint_id: str
    config_revision: int
    result: Literal["success"]

    def __post_init__(self) -> None:
        event_id = _validate_uuid(self.event_id)
        request_id = _validate_uuid(self.request_id)
        assertion_nonce = _validate_uuid(self.assertion_nonce)
        actor_user_id = _validate_uuid(self.actor_user_id)
        if self.action != "model_config_saved" or self.result != "success":
            _invalid()
        provider, model_id, endpoint_id = _validate_model_fields(
            provider=self.provider,
            model_id=self.model_id,
            endpoint_id=self.endpoint_id,
        )
        revision = _validate_positive_integer(self.config_revision)
        object.__setattr__(self, "event_id", event_id)
        object.__setattr__(self, "request_id", request_id)
        object.__setattr__(self, "assertion_nonce", assertion_nonce)
        object.__setattr__(self, "actor_user_id", actor_user_id)
        object.__setattr__(self, "provider", provider)
        object.__setattr__(self, "model_id", model_id)
        object.__setattr__(self, "endpoint_id", endpoint_id)
        object.__setattr__(self, "config_revision", revision)


@dataclass(frozen=True, slots=True)
class StoredSealedConfig:
    """Exact current immutable row, including sealed material for internal use."""

    config_id: UUID
    provider: ModelProvider
    model_id: str
    endpoint_id: str
    revision: int
    test_status: TestStatus
    sealed: SealedSecret = field(repr=False)

    def __post_init__(self) -> None:
        config_id = _validate_uuid(self.config_id)
        provider, model_id, endpoint_id = _validate_model_fields(
            provider=self.provider,
            model_id=self.model_id,
            endpoint_id=self.endpoint_id,
        )
        revision = _validate_positive_integer(self.revision)
        if self.test_status not in TEST_STATUSES:
            _invalid()
        sealed = _validate_sealed(self.sealed)
        object.__setattr__(self, "config_id", config_id)
        object.__setattr__(self, "provider", provider)
        object.__setattr__(self, "model_id", model_id)
        object.__setattr__(self, "endpoint_id", endpoint_id)
        object.__setattr__(self, "revision", revision)
        object.__setattr__(self, "test_status", cast(TestStatus, self.test_status))
        object.__setattr__(self, "sealed", sealed)


@dataclass(frozen=True, slots=True)
class StoredActiveConfig:
    """The exact immutable revision referenced by the singleton active pointer."""

    config_id: UUID
    provider: ModelProvider
    model_id: str
    endpoint_id: str
    revision: int
    test_status: TestStatus
    sealed: SealedSecret = field(repr=False)
    activation_version: int
    activated_at: datetime

    def __post_init__(self) -> None:
        config_id = _validate_uuid(self.config_id)
        provider, model_id, endpoint_id = _validate_model_fields(
            provider=self.provider,
            model_id=self.model_id,
            endpoint_id=self.endpoint_id,
        )
        revision = _validate_positive_integer(self.revision)
        if self.test_status not in TEST_STATUSES:
            _invalid()
        sealed = _validate_sealed(self.sealed)
        activation_version = _validate_positive_integer(self.activation_version)
        if (
            type(self.activated_at) is not datetime
            or self.activated_at.tzinfo is None
            or self.activated_at.utcoffset() is None
        ):
            _invalid()
        object.__setattr__(self, "config_id", config_id)
        object.__setattr__(self, "provider", provider)
        object.__setattr__(self, "model_id", model_id)
        object.__setattr__(self, "endpoint_id", endpoint_id)
        object.__setattr__(self, "revision", revision)
        object.__setattr__(self, "test_status", cast(TestStatus, self.test_status))
        object.__setattr__(self, "sealed", sealed)
        object.__setattr__(self, "activation_version", activation_version)


class ModelConfigRepository(Protocol):
    async def list_metadata(self) -> list[StoredModelConfigMetadata]: ...

    async def save_draft(
        self,
        command: SaveSealedConfig,
        event: ControlEvent,
    ) -> StoredModelConfigMetadata: ...

    async def load_sealed(self, provider: ModelProvider) -> StoredSealedConfig: ...

    async def load_active(self) -> StoredActiveConfig | None: ...


class RepositoryCursor(Protocol):
    rowcount: int

    async def __aenter__(self) -> "RepositoryCursor": ...

    async def __aexit__(self, *args: object) -> None: ...

    async def execute(
        self,
        query: str,
        params: tuple[object, ...] | None = None,
    ) -> Any: ...

    async def fetchone(self) -> tuple[Any, ...] | None: ...

    async def fetchall(self) -> list[tuple[Any, ...]]: ...


class RepositoryConnection(Protocol):
    async def __aenter__(self) -> "RepositoryConnection": ...

    async def __aexit__(self, *args: object) -> None: ...

    def cursor(self) -> RepositoryCursor: ...


RepositoryConnector = Callable[[SecretStr], Awaitable[RepositoryConnection]]


async def connect_database(database_url: SecretStr) -> RepositoryConnection:
    connection = await psycopg.AsyncConnection.connect(database_url.get_secret_value())
    return cast(RepositoryConnection, connection)


def _validated_psycopg_url(database_url: SecretStr | str) -> SecretStr:
    if isinstance(database_url, SecretStr):
        raw_url = database_url.get_secret_value()
    elif type(database_url) is str:
        raw_url = database_url
    else:
        _invalid()
    parsed = None
    try:
        parsed = make_url(raw_url)
    except Exception:
        pass
    if parsed is None:
        _invalid()
    if (
        parsed.drivername != "postgresql+psycopg_async"
        or not parsed.username
        or not parsed.password
        or not parsed.host
        or not parsed.database
    ):
        _invalid()
    return SecretStr(raw_url.replace("postgresql+psycopg_async://", "postgresql://", 1))


def _stored_sealed_from_row(row: tuple[Any, ...]) -> StoredSealedConfig:
    if len(row) != 10:
        _storage()
    stored: StoredSealedConfig | None = None
    try:
        stored = StoredSealedConfig(
            config_id=row[0],
            provider=row[1],
            model_id=row[2],
            endpoint_id=row[3],
            sealed=SealedSecret(
                ciphertext=row[4],
                nonce=row[5],
                last_four=row[6],
                key_version=row[7],
            ),
            revision=row[8],
            test_status=row[9],
        )
    except ModelConfigValidationError:
        pass
    if stored is None:
        _storage()
    return stored


def _metadata_from_row(row: tuple[Any, ...]) -> StoredModelConfigMetadata:
    if len(row) != 6:
        _storage()
    metadata: StoredModelConfigMetadata | None = None
    try:
        metadata = StoredModelConfigMetadata(
            provider=row[0],
            model_id=row[1],
            endpoint_id=row[2],
            api_key_last_four=row[3],
            revision=row[4],
            test_status=row[5],
        )
    except (TypeError, ValueError):
        pass
    if metadata is None:
        _storage()
    return metadata


def _validate_provider(provider: object) -> ModelProvider:
    if type(provider) is not str or provider not in MODEL_PROVIDERS:
        _invalid()
    return cast(ModelProvider, provider)


def _validate_event_matches_command(
    command: SaveSealedConfig,
    event: ControlEvent,
) -> None:
    if type(command) is not SaveSealedConfig or type(event) is not ControlEvent:
        _invalid()
    command.__post_init__()
    event.__post_init__()
    if (
        event.assertion_nonce != command.assertion_nonce
        or event.provider != command.provider
        or event.model_id != command.model_id
        or event.endpoint_id != command.endpoint_id
        or event.config_revision != command.revision
    ):
        _invalid()


_CONFLICT_DATABASE_ERRORS = (
    psycopg.errors.UniqueViolation,
    psycopg.errors.SerializationFailure,
    psycopg.errors.DeadlockDetected,
)


class PostgresModelConfigRepository:
    """Short-lived psycopg repository with fixed SQL and fixed domain errors."""

    __slots__ = ("__connector", "__database_url")

    def __init__(
        self,
        *,
        database_url: SecretStr | str,
        connector: RepositoryConnector = connect_database,
    ) -> None:
        self.__database_url = _validated_psycopg_url(database_url)
        self.__connector = connector

    async def list_metadata(self) -> list[StoredModelConfigMetadata]:
        try:
            connection = await self.__connector(self.__database_url)
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(_LIST_METADATA_SQL)
                    rows = await cursor.fetchall()
                    return [_metadata_from_row(row) for row in rows]
        except ModelConfigRepositoryError:
            raise
        except Exception:
            pass
        _storage()

    async def load_sealed(self, provider: ModelProvider) -> StoredSealedConfig:
        validated_provider = _validate_provider(provider)
        try:
            connection = await self.__connector(self.__database_url)
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        _LOAD_CURRENT_SEALED_SQL,
                        (validated_provider,),
                    )
                    row = await cursor.fetchone()
                    if row is None:
                        raise ModelConfigNotFoundError(_NOT_FOUND_ERROR)
                    return _stored_sealed_from_row(row)
        except ModelConfigRepositoryError:
            raise
        except Exception:
            pass
        _storage()

    async def load_active(self) -> StoredActiveConfig | None:
        try:
            connection = await self.__connector(self.__database_url)
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(_LOAD_ACTIVE_SQL)
                    row = await cursor.fetchone()
                    if row is None:
                        return None
                    if len(row) != 13 or row[8] != row[10]:
                        _storage()
                    stored = _stored_sealed_from_row(row[:10])
                    active: StoredActiveConfig | None = None
                    try:
                        active = StoredActiveConfig(
                            config_id=stored.config_id,
                            provider=stored.provider,
                            model_id=stored.model_id,
                            endpoint_id=stored.endpoint_id,
                            sealed=stored.sealed,
                            revision=stored.revision,
                            test_status=stored.test_status,
                            activation_version=row[11],
                            activated_at=row[12],
                        )
                    except ModelConfigValidationError:
                        pass
                    if active is None:
                        _storage()
                    return active
        except ModelConfigRepositoryError:
            raise
        except Exception:
            pass
        _storage()

    async def save_draft(
        self,
        command: SaveSealedConfig,
        event: ControlEvent,
    ) -> StoredModelConfigMetadata:
        _validate_event_matches_command(command, event)
        database_conflict = False
        try:
            connection = await self.__connector(self.__database_url)
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        _LOCK_CURRENT_HEAD_SQL,
                        (command.provider,),
                    )
                    head = await cursor.fetchone()
                    if head is None:
                        if command.expected_revision != 0 or command.revision != 1:
                            _conflict()
                    else:
                        if (
                            len(head) != 2
                            or type(head[0]) is not UUID
                            or type(head[1]) is not int
                            or head[1] < 1
                        ):
                            _storage()
                        current_id = cast(UUID, head[0])
                        current_revision = cast(int, head[1])
                        if (
                            command.expected_revision != current_revision
                            or command.revision != current_revision + 1
                        ):
                            _conflict()
                        if command.config_id == current_id:
                            _invalid()
                        await cursor.execute(
                            _RETIRE_CURRENT_HEAD_SQL,
                            (current_id, current_revision),
                        )
                        if cursor.rowcount != 1:
                            _conflict()

                    await cursor.execute(
                        _INSERT_CONFIG_SQL,
                        (
                            command.config_id,
                            command.provider,
                            command.model_id,
                            command.endpoint_id,
                            command.sealed.ciphertext,
                            command.sealed.nonce,
                            command.sealed.last_four,
                            command.sealed.key_version,
                            command.revision,
                        ),
                    )
                    if cursor.rowcount != 1:
                        _storage()
                    await cursor.execute(
                        _INSERT_EVENT_SQL,
                        (
                            event.event_id,
                            event.request_id,
                            event.assertion_nonce,
                            event.actor_user_id,
                            event.action,
                            event.provider,
                            event.model_id,
                            event.endpoint_id,
                            event.config_revision,
                            event.result,
                        ),
                    )
                    if cursor.rowcount != 1:
                        _storage()
                    return StoredModelConfigMetadata(
                        provider=command.provider,
                        model_id=command.model_id,
                        endpoint_id=command.endpoint_id,
                        api_key_last_four=command.sealed.last_four,
                        revision=command.revision,
                        test_status="untested",
                    )
        except ModelConfigRepositoryError:
            raise
        except _CONFLICT_DATABASE_ERRORS:
            database_conflict = True
        except Exception:
            pass
        if database_conflict:
            _conflict()
        _storage()

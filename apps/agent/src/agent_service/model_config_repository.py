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
  test_status,
  last_tested_at
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

_LOAD_EXACT_SEALED_SQL = """SELECT
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
WHERE provider = %s AND revision = %s
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

_LOCK_EXACT_CONFIG_SQL = """SELECT id, is_current, model_id, endpoint_id
FROM agent_control.model_configs
WHERE provider = %s AND revision = %s
FOR UPDATE
"""

_MARK_TEST_FAILED_SQL = """UPDATE agent_control.model_configs
SET test_status = 'failed', last_tested_at = now(), updated_at = now()
WHERE id = %s AND provider = %s AND revision = %s AND is_current = true
"""

_LOCK_ACTIVE_POINTER_SQL = """SELECT
  model_config_id,
  config_revision,
  activation_version
FROM agent_control.active_model_config
WHERE singleton = true
FOR UPDATE
"""

_LOCK_ACTIVATION_TRANSACTION_SQL = "SELECT pg_advisory_xact_lock(6251743982704117761)"

_MARK_TEST_PASSED_SQL = """UPDATE agent_control.model_configs
SET test_status = 'passed', last_tested_at = now(), updated_at = now()
WHERE id = %s AND provider = %s AND revision = %s AND is_current = true
"""

_INSERT_ACTIVE_POINTER_SQL = """INSERT INTO agent_control.active_model_config (
  singleton,
  model_config_id,
  config_revision,
  activation_version
) VALUES (true, %s, %s, %s)
RETURNING activated_at
"""

_UPDATE_ACTIVE_POINTER_SQL = """UPDATE agent_control.active_model_config
SET model_config_id = %s,
    config_revision = %s,
    activation_version = %s,
    activated_at = now()
WHERE singleton = true AND activation_version = %s
RETURNING activated_at
"""


ControlAction = Literal[
    "model_config_saved",
    "model_config_tested",
    "model_config_activated",
    "model_key_revealed",
]
ControlResult = Literal[
    "success",
    "configuration_conflict",
    "credential_rejected",
    "model_not_found",
    "provider_unreachable",
    "provider_timeout",
    "encryption_unavailable",
]
RevealCommitResult = Literal["committed", "stale"]

_CONTROL_RESULTS_BY_ACTION: dict[ControlAction, frozenset[ControlResult]] = {
    "model_config_saved": frozenset({"success"}),
    "model_config_tested": frozenset(
        {
            "configuration_conflict",
            "credential_rejected",
            "model_not_found",
            "provider_unreachable",
            "provider_timeout",
        }
    ),
    "model_config_activated": frozenset({"success", "configuration_conflict"}),
    "model_key_revealed": frozenset(
        {"success", "configuration_conflict", "encryption_unavailable"}
    ),
}


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
class CommitVerifiedActivation:
    """CAS command for one verified current configuration and global pointer."""

    provider: ModelProvider
    config_revision: int
    expected_activation_version: int

    def __post_init__(self) -> None:
        object.__setattr__(self, "provider", _validate_provider(self.provider))
        object.__setattr__(
            self,
            "config_revision",
            _validate_positive_integer(self.config_revision),
        )
        object.__setattr__(
            self,
            "expected_activation_version",
            _validate_non_negative_integer(self.expected_activation_version),
        )


@dataclass(frozen=True, slots=True)
class ControlEvent:
    """Sanitized bounded control event committed with its configuration change."""

    event_id: UUID
    request_id: UUID
    assertion_nonce: UUID
    actor_user_id: UUID
    action: ControlAction
    provider: ModelProvider
    model_id: str
    endpoint_id: str
    config_revision: int
    result: ControlResult

    def __post_init__(self) -> None:
        event_id = _validate_uuid(self.event_id)
        request_id = _validate_uuid(self.request_id)
        assertion_nonce = _validate_uuid(self.assertion_nonce)
        actor_user_id = _validate_uuid(self.actor_user_id)
        if type(self.action) is not str or type(self.result) is not str:
            _invalid()
        action = cast(ControlAction, self.action)
        result = cast(ControlResult, self.result)
        if (
            action not in _CONTROL_RESULTS_BY_ACTION
            or result not in _CONTROL_RESULTS_BY_ACTION[action]
        ):
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
        object.__setattr__(self, "action", action)
        object.__setattr__(self, "provider", provider)
        object.__setattr__(self, "model_id", model_id)
        object.__setattr__(self, "endpoint_id", endpoint_id)
        object.__setattr__(self, "config_revision", revision)
        object.__setattr__(self, "result", result)


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


@dataclass(frozen=True, slots=True)
class ActiveConfigPointer:
    """Committed singleton pointer identity returned by the activation CAS."""

    config_id: UUID
    provider: ModelProvider
    config_revision: int
    activation_version: int
    activated_at: datetime

    def __post_init__(self) -> None:
        object.__setattr__(self, "config_id", _validate_uuid(self.config_id))
        object.__setattr__(self, "provider", _validate_provider(self.provider))
        object.__setattr__(
            self,
            "config_revision",
            _validate_positive_integer(self.config_revision),
        )
        object.__setattr__(
            self,
            "activation_version",
            _validate_positive_integer(self.activation_version),
        )
        if (
            type(self.activated_at) is not datetime
            or self.activated_at.tzinfo is None
            or self.activated_at.utcoffset() is None
        ):
            _invalid()


class ModelConfigRepository(Protocol):
    async def list_metadata(self) -> list[StoredModelConfigMetadata]: ...

    async def save_draft(
        self,
        command: SaveSealedConfig,
        event: ControlEvent,
    ) -> StoredModelConfigMetadata: ...

    async def load_sealed(self, provider: ModelProvider) -> StoredSealedConfig: ...

    async def load_active(self) -> StoredActiveConfig | None: ...

    async def record_failed_test(
        self,
        provider: ModelProvider,
        revision: int,
        event: ControlEvent,
    ) -> None: ...

    async def commit_test_and_activation(
        self,
        command: CommitVerifiedActivation,
        event: ControlEvent,
    ) -> ActiveConfigPointer: ...

    async def load_for_reveal(
        self,
        provider: ModelProvider,
        revision: int,
    ) -> StoredSealedConfig: ...

    async def commit_reveal_success(
        self,
        provider: ModelProvider,
        revision: int,
        event: ControlEvent,
    ) -> RevealCommitResult: ...

    async def commit_reveal_failure(
        self,
        provider: ModelProvider,
        revision: int,
        event: ControlEvent,
    ) -> None: ...


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
    if len(row) != 7:
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
            last_tested_at=row[6],
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


def _validate_exact_event(
    *,
    provider: object,
    revision: object,
    event: object,
    action: ControlAction,
    allowed_results: frozenset[ControlResult],
) -> tuple[ModelProvider, int, ControlEvent]:
    validated_provider = _validate_provider(provider)
    validated_revision = _validate_positive_integer(revision)
    if type(event) is not ControlEvent:
        _invalid()
    validated_event = cast(ControlEvent, event)
    validated_event.__post_init__()
    if (
        validated_event.action != action
        or validated_event.result not in allowed_results
        or validated_event.provider != validated_provider
        or validated_event.config_revision != validated_revision
    ):
        _invalid()
    return validated_provider, validated_revision, validated_event


def _event_params(
    event: ControlEvent, *, result: ControlResult | None = None
) -> tuple[object, ...]:
    return (
        event.event_id,
        event.request_id,
        event.assertion_nonce,
        event.actor_user_id,
        event.action,
        event.provider,
        event.model_id,
        event.endpoint_id,
        event.config_revision,
        event.result if result is None else result,
    )


def _validate_activation(
    command: object,
    event: object,
) -> tuple[CommitVerifiedActivation, ControlEvent]:
    if type(command) is not CommitVerifiedActivation or type(event) is not ControlEvent:
        _invalid()
    validated_command = cast(CommitVerifiedActivation, command)
    validated_command.__post_init__()
    _, _, validated_event = _validate_exact_event(
        provider=validated_command.provider,
        revision=validated_command.config_revision,
        event=event,
        action="model_config_activated",
        allowed_results=frozenset({"success"}),
    )
    return validated_command, validated_event


def _validate_locked_config_row(
    row: tuple[Any, ...] | None,
    event: ControlEvent,
) -> tuple[UUID, bool]:
    if row is None:
        _conflict()
    if (
        len(row) != 4
        or type(row[0]) is not UUID
        or type(row[1]) is not bool
        or type(row[2]) is not str
        or type(row[3]) is not str
    ):
        _storage()
    if row[2] != event.model_id or row[3] != event.endpoint_id:
        _invalid()
    return cast(UUID, row[0]), cast(bool, row[1])


def _validate_pointer_row(row: tuple[Any, ...]) -> tuple[UUID, int, int]:
    if (
        len(row) != 3
        or type(row[0]) is not UUID
        or type(row[1]) is not int
        or row[1] < 1
        or type(row[2]) is not int
        or row[2] < 1
    ):
        _storage()
    return cast(UUID, row[0]), cast(int, row[1]), cast(int, row[2])


def _validate_activated_at_row(row: tuple[Any, ...] | None) -> datetime:
    if (
        row is None
        or len(row) != 1
        or type(row[0]) is not datetime
        or row[0].tzinfo is None
        or row[0].utcoffset() is None
    ):
        _storage()
    return cast(datetime, row[0])


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

    async def load_for_reveal(
        self,
        provider: ModelProvider,
        revision: int,
    ) -> StoredSealedConfig:
        validated_provider = _validate_provider(provider)
        validated_revision = _validate_positive_integer(revision)
        try:
            connection = await self.__connector(self.__database_url)
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        _LOAD_EXACT_SEALED_SQL,
                        (validated_provider, validated_revision),
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

    async def record_failed_test(
        self,
        provider: ModelProvider,
        revision: int,
        event: ControlEvent,
    ) -> None:
        validated_provider, validated_revision, validated_event = _validate_exact_event(
            provider=provider,
            revision=revision,
            event=event,
            action="model_config_tested",
            allowed_results=frozenset(
                {
                    "credential_rejected",
                    "model_not_found",
                    "provider_unreachable",
                    "provider_timeout",
                }
            ),
        )
        stale_conflict = False
        database_conflict = False
        completed = False
        try:
            connection = await self.__connector(self.__database_url)
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        _LOCK_EXACT_CONFIG_SQL,
                        (validated_provider, validated_revision),
                    )
                    config_id, is_current = _validate_locked_config_row(
                        await cursor.fetchone(),
                        validated_event,
                    )
                    if is_current:
                        await cursor.execute(
                            _MARK_TEST_FAILED_SQL,
                            (config_id, validated_provider, validated_revision),
                        )
                        if cursor.rowcount != 1:
                            _conflict()
                        event_result: ControlResult = validated_event.result
                    else:
                        stale_conflict = True
                        event_result = "configuration_conflict"
                    await cursor.execute(
                        _INSERT_EVENT_SQL,
                        _event_params(validated_event, result=event_result),
                    )
                    if cursor.rowcount != 1:
                        _storage()
            completed = True
        except ModelConfigRepositoryError:
            raise
        except _CONFLICT_DATABASE_ERRORS:
            database_conflict = True
        except Exception:
            pass
        if database_conflict:
            _conflict()
        if completed and stale_conflict:
            _conflict()
        if not completed:
            _storage()

    async def commit_test_and_activation(
        self,
        command: CommitVerifiedActivation,
        event: ControlEvent,
    ) -> ActiveConfigPointer:
        validated_command, validated_event = _validate_activation(command, event)
        database_conflict = False
        stale_conflict = False
        completed = False
        pointer: ActiveConfigPointer | None = None
        try:
            connection = await self.__connector(self.__database_url)
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        _LOCK_EXACT_CONFIG_SQL,
                        (
                            validated_command.provider,
                            validated_command.config_revision,
                        ),
                    )
                    config_id, is_current = _validate_locked_config_row(
                        await cursor.fetchone(),
                        validated_event,
                    )
                    await cursor.execute(_LOCK_ACTIVATION_TRANSACTION_SQL)
                    await cursor.execute(_LOCK_ACTIVE_POINTER_SQL)
                    pointer_row = await cursor.fetchone()
                    if pointer_row is None:
                        actual_activation_version = 0
                    else:
                        _, _, actual_activation_version = _validate_pointer_row(
                            pointer_row
                        )
                    if (
                        not is_current
                        or actual_activation_version
                        != validated_command.expected_activation_version
                    ):
                        stale_conflict = True
                    else:
                        next_activation_version = actual_activation_version + 1
                        await cursor.execute(
                            _MARK_TEST_PASSED_SQL,
                            (
                                config_id,
                                validated_command.provider,
                                validated_command.config_revision,
                            ),
                        )
                        if cursor.rowcount != 1:
                            _conflict()
                        if pointer_row is None:
                            await cursor.execute(
                                _INSERT_ACTIVE_POINTER_SQL,
                                (
                                    config_id,
                                    validated_command.config_revision,
                                    next_activation_version,
                                ),
                            )
                        else:
                            await cursor.execute(
                                _UPDATE_ACTIVE_POINTER_SQL,
                                (
                                    config_id,
                                    validated_command.config_revision,
                                    next_activation_version,
                                    actual_activation_version,
                                ),
                            )
                        if cursor.rowcount != 1:
                            _conflict()
                        activated_at = _validate_activated_at_row(
                            await cursor.fetchone()
                        )
                        pointer = ActiveConfigPointer(
                            config_id=config_id,
                            provider=validated_command.provider,
                            config_revision=validated_command.config_revision,
                            activation_version=next_activation_version,
                            activated_at=activated_at,
                        )
                    await cursor.execute(
                        _INSERT_EVENT_SQL,
                        _event_params(
                            validated_event,
                            result=(
                                "configuration_conflict"
                                if stale_conflict
                                else "success"
                            ),
                        ),
                    )
                    if cursor.rowcount != 1:
                        _storage()
            completed = True
        except ModelConfigRepositoryError:
            raise
        except _CONFLICT_DATABASE_ERRORS:
            database_conflict = True
        except Exception:
            pass
        if database_conflict:
            _conflict()
        if completed and stale_conflict:
            _conflict()
        if not completed or pointer is None:
            _storage()
        return pointer

    async def commit_reveal_success(
        self,
        provider: ModelProvider,
        revision: int,
        event: ControlEvent,
    ) -> RevealCommitResult:
        validated_provider, validated_revision, validated_event = _validate_exact_event(
            provider=provider,
            revision=revision,
            event=event,
            action="model_key_revealed",
            allowed_results=frozenset({"success"}),
        )
        return await self.__commit_reveal_event(
            provider=validated_provider,
            revision=validated_revision,
            event=validated_event,
            stale_is_conflict=True,
        )

    async def commit_reveal_failure(
        self,
        provider: ModelProvider,
        revision: int,
        event: ControlEvent,
    ) -> None:
        validated_provider, validated_revision, validated_event = _validate_exact_event(
            provider=provider,
            revision=revision,
            event=event,
            action="model_key_revealed",
            allowed_results=frozenset({"encryption_unavailable"}),
        )
        await self.__commit_reveal_event(
            provider=validated_provider,
            revision=validated_revision,
            event=validated_event,
            stale_is_conflict=False,
        )

    async def __commit_reveal_event(
        self,
        *,
        provider: ModelProvider,
        revision: int,
        event: ControlEvent,
        stale_is_conflict: bool,
    ) -> RevealCommitResult:
        database_conflict = False
        outcome: RevealCommitResult | None = None
        completed = False
        try:
            connection = await self.__connector(self.__database_url)
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        _LOCK_EXACT_CONFIG_SQL,
                        (provider, revision),
                    )
                    _, is_current = _validate_locked_config_row(
                        await cursor.fetchone(),
                        event,
                    )
                    if stale_is_conflict and not is_current:
                        event_result: ControlResult = "configuration_conflict"
                        outcome = "stale"
                    else:
                        event_result = event.result
                        outcome = "committed"
                    await cursor.execute(
                        _INSERT_EVENT_SQL,
                        _event_params(event, result=event_result),
                    )
                    if cursor.rowcount != 1:
                        _storage()
            completed = True
        except ModelConfigRepositoryError:
            raise
        except _CONFLICT_DATABASE_ERRORS:
            database_conflict = True
        except Exception:
            pass
        if database_conflict:
            _conflict()
        if not completed or outcome is None:
            _storage()
        return outcome

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
                        last_tested_at=None,
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

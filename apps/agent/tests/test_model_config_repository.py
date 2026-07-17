"""Unit contracts for the model configuration repository."""

from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
import inspect
from typing import Any, cast
from uuid import UUID

import psycopg
from pydantic import SecretStr
import pytest

from agent_service.model_config_crypto import SealedSecret
from agent_service.model_config_repository import (
    ControlEvent,
    ModelConfigConflictError,
    ModelConfigNotFoundError,
    ModelConfigRepository,
    ModelConfigStorageError,
    ModelConfigValidationError,
    PostgresModelConfigRepository,
    RepositoryConnection,
    SaveSealedConfig,
    StoredActiveConfig,
    StoredSealedConfig,
)
from agent_service.model_config_types import ModelProvider, StoredModelConfigMetadata


DATABASE_URL = "postgresql+psycopg_async://control:do-not-leak@db:5432/platform"
PSYCOPG_URL = "postgresql://control:do-not-leak@db:5432/platform"
CONFIG_ID = UUID("10000000-0000-4000-8000-000000000001")
REPLACEMENT_ID = UUID("10000000-0000-4000-8000-000000000002")
EVENT_ID = UUID("20000000-0000-4000-8000-000000000001")
REQUEST_ID = UUID("30000000-0000-4000-8000-000000000001")
ASSERTION_NONCE = UUID("40000000-0000-4000-8000-000000000001")
ACTOR_ID = UUID("50000000-0000-4000-8000-000000000001")
ACTIVATED_AT = datetime(2026, 7, 17, 8, 0, tzinfo=UTC)
SEALED = SealedSecret(
    ciphertext=b"sealed-ciphertext-and-tag",
    nonce=b"unique-nonce",
    key_version=1,
    last_four="s3cr",
)
NEW_SEALED = SealedSecret(
    ciphertext=b"new-sealed-ciphertext-and-tag",
    nonce=b"fresh-nonce!",
    key_version=1,
    last_four="n3w!",
)


@dataclass(slots=True)
class Reply:
    query_contains: str
    one: tuple[Any, ...] | None = None
    many: list[tuple[Any, ...]] | None = None
    rowcount: int = -1
    error: Exception | None = None


class FakeCursor:
    def __init__(self, replies: list[Reply]) -> None:
        self.replies = deque(replies)
        self.executions: list[tuple[str, tuple[object, ...] | None]] = []
        self.current: Reply | None = None
        self.rowcount = -1

    async def __aenter__(self) -> "FakeCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(
        self,
        query: str,
        params: tuple[object, ...] | None = None,
    ) -> None:
        assert self.replies, f"unexpected query: {query}"
        reply = self.replies.popleft()
        normalized = " ".join(query.split())
        assert reply.query_contains in normalized
        self.executions.append((normalized, params))
        self.current = reply
        self.rowcount = reply.rowcount
        if reply.error is not None:
            raise reply.error

    async def fetchone(self) -> tuple[Any, ...] | None:
        assert self.current is not None
        return self.current.one

    async def fetchall(self) -> list[tuple[Any, ...]]:
        assert self.current is not None
        return self.current.many or []


class FakeConnection:
    def __init__(self, cursor: FakeCursor, events: list[str]) -> None:
        self.fake_cursor = cursor
        self.events = events

    async def __aenter__(self) -> "FakeConnection":
        self.events.append("transaction:begin")
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        *_args: object,
    ) -> None:
        self.events.append(
            "transaction:rollback" if exc_type is not None else "transaction:commit"
        )
        return None

    def cursor(self) -> FakeCursor:
        return self.fake_cursor


def repository_with(
    replies: list[Reply],
) -> tuple[PostgresModelConfigRepository, FakeCursor, list[str]]:
    cursor = FakeCursor(replies)
    events: list[str] = []

    async def connector(database_url: SecretStr) -> RepositoryConnection:
        assert isinstance(database_url, SecretStr)
        assert database_url.get_secret_value() == PSYCOPG_URL
        events.append("connect")
        return cast(RepositoryConnection, FakeConnection(cursor, events))

    repository = PostgresModelConfigRepository(
        database_url=SecretStr(DATABASE_URL),
        connector=connector,
    )
    return repository, cursor, events


def command(
    *,
    config_id: UUID = CONFIG_ID,
    revision: int = 1,
    expected_revision: int = 0,
    sealed: SealedSecret = SEALED,
) -> SaveSealedConfig:
    return SaveSealedConfig(
        config_id=config_id,
        provider="openai",
        model_id="gpt-4.1-mini",
        endpoint_id="openai-default",
        revision=revision,
        expected_revision=expected_revision,
        sealed=sealed,
        assertion_nonce=ASSERTION_NONCE,
    )


def event(*, revision: int = 1) -> ControlEvent:
    return ControlEvent(
        event_id=EVENT_ID,
        request_id=REQUEST_ID,
        assertion_nonce=ASSERTION_NONCE,
        actor_user_id=ACTOR_ID,
        action="model_config_saved",
        provider="openai",
        model_id="gpt-4.1-mini",
        endpoint_id="openai-default",
        config_revision=revision,
        result="success",
    )


def sealed_row(
    *,
    config_id: UUID = CONFIG_ID,
    revision: int = 1,
    sealed: SealedSecret = SEALED,
) -> tuple[object, ...]:
    return (
        config_id,
        "openai",
        "gpt-4.1-mini",
        "openai-default",
        sealed.ciphertext,
        sealed.nonce,
        sealed.last_four,
        sealed.key_version,
        revision,
        "untested",
    )


def test_repository_protocol_has_only_use_case_operations() -> None:
    operations = {
        name
        for name, member in inspect.getmembers(ModelConfigRepository)
        if inspect.isfunction(member) and not name.startswith("_")
    }

    assert operations == {"list_metadata", "save_draft", "load_sealed", "load_active"}


@pytest.mark.parametrize(
    ("target", "changes"),
    [
        ("command", {"config_id": "not-a-uuid"}),
        ("command", {"provider": "local"}),
        ("command", {"model_id": " bad"}),
        ("command", {"endpoint_id": "bad endpoint"}),
        ("command", {"revision": True}),
        ("command", {"expected_revision": -1}),
        ("command", {"sealed": SealedSecret(b"short", b"bad", 1, "oops")}),
        ("event", {"event_id": "not-a-uuid"}),
        ("event", {"action": "arbitrary_action"}),
        ("event", {"result": "raw provider failure"}),
        ("event", {"config_revision": True}),
    ],
)
def test_commands_and_events_reject_invalid_runtime_values_with_fixed_errors(
    target: str,
    changes: dict[str, object],
) -> None:
    command_values: dict[str, object] = {
        "config_id": CONFIG_ID,
        "provider": "openai",
        "model_id": "gpt-4.1-mini",
        "endpoint_id": "openai-default",
        "revision": 1,
        "expected_revision": 0,
        "sealed": SEALED,
        "assertion_nonce": ASSERTION_NONCE,
    }
    event_values: dict[str, object] = {
        "event_id": EVENT_ID,
        "request_id": REQUEST_ID,
        "assertion_nonce": ASSERTION_NONCE,
        "actor_user_id": ACTOR_ID,
        "action": "model_config_saved",
        "provider": "openai",
        "model_id": "gpt-4.1-mini",
        "endpoint_id": "openai-default",
        "config_revision": 1,
        "result": "success",
    }
    values = command_values if target == "command" else event_values
    values.update(changes)

    with pytest.raises(ModelConfigValidationError, match="^validation_error$") as error:
        if target == "command":
            SaveSealedConfig(**values)  # type: ignore[arg-type]
        else:
            ControlEvent(**values)  # type: ignore[arg-type]

    rendered = f"{error.value!s} {error.value!r}"
    assert "do-not-leak" not in rendered
    assert "sealed-ciphertext" not in rendered
    assert "s3cr" not in rendered


def test_secret_bearing_types_are_frozen_and_hide_sealed_fields_from_repr() -> None:
    saved = command()
    stored = StoredSealedConfig(
        config_id=CONFIG_ID,
        provider="openai",
        model_id="gpt-4.1-mini",
        endpoint_id="openai-default",
        revision=1,
        test_status="untested",
        sealed=SEALED,
    )
    active = StoredActiveConfig(
        config_id=CONFIG_ID,
        provider="openai",
        model_id="gpt-4.1-mini",
        endpoint_id="openai-default",
        revision=1,
        test_status="untested",
        sealed=SEALED,
        activation_version=3,
        activated_at=ACTIVATED_AT,
    )

    for value in (saved, stored, active):
        rendered = repr(value)
        assert "sealed-ciphertext" not in rendered
        assert "unique-nonce" not in rendered
        assert "s3cr" not in rendered
        with pytest.raises((AttributeError, TypeError)):
            value.revision = 2  # type: ignore[misc]


def test_repository_constructor_validates_and_hides_database_url() -> None:
    with pytest.raises(ModelConfigValidationError, match="^validation_error$") as error:
        PostgresModelConfigRepository(
            database_url="postgresql://control:super-secret@db/platform"
        )

    assert "super-secret" not in str(error.value)
    assert "super-secret" not in repr(error.value)


@pytest.mark.asyncio
async def test_list_metadata_selects_only_current_safe_projection() -> None:
    repository, cursor, events = repository_with(
        [
            Reply(
                "FROM agent_control.model_configs WHERE is_current = true",
                many=[
                    (
                        "openai",
                        "gpt-4.1-mini",
                        "openai-default",
                        "s3cr",
                        1,
                        "untested",
                    )
                ],
            )
        ]
    )

    result = await repository.list_metadata()

    assert result == [
        StoredModelConfigMetadata(
            provider="openai",
            model_id="gpt-4.1-mini",
            endpoint_id="openai-default",
            api_key_last_four="s3cr",
            revision=1,
            test_status="untested",
        )
    ]
    query, params = cursor.executions[0]
    assert params is None
    assert "api_key_ciphertext" not in query
    assert "api_key_nonce" not in query
    assert events == ["connect", "transaction:begin", "transaction:commit"]


@pytest.mark.asyncio
async def test_load_sealed_reads_the_exact_current_provider() -> None:
    repository, cursor, events = repository_with(
        [
            Reply(
                "WHERE provider = %s AND is_current = true",
                one=sealed_row(),
            )
        ]
    )

    result = await repository.load_sealed("openai")

    assert result == StoredSealedConfig(
        config_id=CONFIG_ID,
        provider="openai",
        model_id="gpt-4.1-mini",
        endpoint_id="openai-default",
        revision=1,
        test_status="untested",
        sealed=SEALED,
    )
    assert cursor.executions[0][1] == ("openai",)
    assert events[-1] == "transaction:commit"


@pytest.mark.asyncio
async def test_load_sealed_maps_missing_current_head_to_fixed_not_found() -> None:
    repository, _cursor, events = repository_with(
        [Reply("WHERE provider = %s AND is_current = true", one=None)]
    )

    with pytest.raises(
        ModelConfigNotFoundError, match="^model_configuration_not_found$"
    ):
        await repository.load_sealed("openai")

    assert events[-1] == "transaction:rollback"


@pytest.mark.asyncio
async def test_load_active_joins_pointer_id_and_preserves_exact_old_revision() -> None:
    active_row = sealed_row() + (1, 7, ACTIVATED_AT)
    repository, cursor, events = repository_with(
        [
            Reply(
                "JOIN agent_control.model_configs AS config ON config.id = active.model_config_id",
                one=active_row,
            )
        ]
    )

    result = await repository.load_active()

    assert result == StoredActiveConfig(
        config_id=CONFIG_ID,
        provider="openai",
        model_id="gpt-4.1-mini",
        endpoint_id="openai-default",
        revision=1,
        test_status="untested",
        sealed=SEALED,
        activation_version=7,
        activated_at=ACTIVATED_AT,
    )
    query = cursor.executions[0][0]
    assert "config.is_current" not in query
    assert events[-1] == "transaction:commit"


@pytest.mark.asyncio
async def test_load_active_rejects_pointer_revision_mismatch() -> None:
    repository, _cursor, events = repository_with(
        [
            Reply(
                "JOIN agent_control.model_configs AS config ON config.id = active.model_config_id",
                one=sealed_row() + (2, 7, ACTIVATED_AT),
            )
        ]
    )

    with pytest.raises(ModelConfigStorageError, match="^storage_unavailable$"):
        await repository.load_active()

    assert events[-1] == "transaction:rollback"


@pytest.mark.asyncio
async def test_save_first_revision_inserts_new_sealed_bytes_then_one_event() -> None:
    repository, cursor, events = repository_with(
        [
            Reply("FOR UPDATE", one=None),
            Reply("INSERT INTO agent_control.model_configs", rowcount=1),
            Reply("INSERT INTO agent_control.control_events", rowcount=1),
        ]
    )

    result = await repository.save_draft(command(), event())

    assert result == StoredModelConfigMetadata(
        provider="openai",
        model_id="gpt-4.1-mini",
        endpoint_id="openai-default",
        api_key_last_four="s3cr",
        revision=1,
        test_status="untested",
    )
    assert [execution[0].split(maxsplit=1)[0] for execution in cursor.executions] == [
        "SELECT",
        "INSERT",
        "INSERT",
    ]
    assert cursor.executions[0][1] == ("openai",)
    config_params = cursor.executions[1][1]
    assert config_params == (
        CONFIG_ID,
        "openai",
        "gpt-4.1-mini",
        "openai-default",
        SEALED.ciphertext,
        SEALED.nonce,
        SEALED.last_four,
        1,
        1,
    )
    assert cursor.executions[2][1] == (
        EVENT_ID,
        REQUEST_ID,
        ASSERTION_NONCE,
        ACTOR_ID,
        "model_config_saved",
        "openai",
        "gpt-4.1-mini",
        "openai-default",
        1,
        "success",
    )
    assert events == ["connect", "transaction:begin", "transaction:commit"]


@pytest.mark.asyncio
async def test_save_replacement_retires_head_then_inserts_new_identity_and_seal() -> (
    None
):
    repository, cursor, events = repository_with(
        [
            Reply("FOR UPDATE", one=(CONFIG_ID, 1)),
            Reply("UPDATE agent_control.model_configs", rowcount=1),
            Reply("INSERT INTO agent_control.model_configs", rowcount=1),
            Reply("INSERT INTO agent_control.control_events", rowcount=1),
        ]
    )

    await repository.save_draft(
        command(
            config_id=REPLACEMENT_ID,
            revision=2,
            expected_revision=1,
            sealed=NEW_SEALED,
        ),
        event(revision=2),
    )

    queries = [execution[0] for execution in cursor.executions]
    assert [query.split(maxsplit=1)[0] for query in queries] == [
        "SELECT",
        "UPDATE",
        "INSERT",
        "INSERT",
    ]
    retirement_query, retirement_params = cursor.executions[1]
    assert retirement_params == (CONFIG_ID, 1)
    for immutable_column in (
        "model_id",
        "endpoint_id",
        "api_key_ciphertext",
        "api_key_nonce",
        "api_key_last_four",
        "revision",
    ):
        assert f"SET {immutable_column}" not in retirement_query
        assert (
            f", {immutable_column}" not in retirement_query.split("SET", maxsplit=1)[1]
        )
    replacement_params = cursor.executions[2][1]
    assert replacement_params is not None
    assert replacement_params[0] == REPLACEMENT_ID
    assert replacement_params[4:8] == (
        NEW_SEALED.ciphertext,
        NEW_SEALED.nonce,
        NEW_SEALED.last_four,
        1,
    )
    assert SEALED.ciphertext not in replacement_params
    assert SEALED.nonce not in replacement_params
    assert events[-1] == "transaction:commit"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("head", "replacement"),
    [
        (None, command(revision=1, expected_revision=1)),
        (
            (CONFIG_ID, 2),
            command(
                config_id=REPLACEMENT_ID,
                revision=2,
                expected_revision=1,
                sealed=NEW_SEALED,
            ),
        ),
        (
            (CONFIG_ID, 1),
            command(
                config_id=REPLACEMENT_ID,
                revision=3,
                expected_revision=1,
                sealed=NEW_SEALED,
            ),
        ),
    ],
)
async def test_save_rejects_missing_or_stale_revision_before_mutation(
    head: tuple[UUID, int] | None,
    replacement: SaveSealedConfig,
) -> None:
    repository, cursor, events = repository_with([Reply("FOR UPDATE", one=head)])

    with pytest.raises(ModelConfigConflictError, match="^configuration_conflict$"):
        await repository.save_draft(
            replacement,
            event(revision=replacement.revision),
        )

    assert len(cursor.executions) == 1
    assert events[-1] == "transaction:rollback"


@pytest.mark.asyncio
async def test_save_rejects_reusing_current_config_identity() -> None:
    repository, cursor, events = repository_with(
        [Reply("FOR UPDATE", one=(CONFIG_ID, 1))]
    )

    with pytest.raises(ModelConfigValidationError, match="^validation_error$"):
        await repository.save_draft(
            command(config_id=CONFIG_ID, revision=2, expected_revision=1),
            event(revision=2),
        )

    assert len(cursor.executions) == 1
    assert events[-1] == "transaction:rollback"


@pytest.mark.asyncio
async def test_event_insert_failure_rolls_back_head_retirement_and_new_revision() -> (
    None
):
    repository, cursor, events = repository_with(
        [
            Reply("FOR UPDATE", one=(CONFIG_ID, 1)),
            Reply("UPDATE agent_control.model_configs", rowcount=1),
            Reply("INSERT INTO agent_control.model_configs", rowcount=1),
            Reply(
                "INSERT INTO agent_control.control_events",
                error=psycopg.errors.UniqueViolation("secret SQL details"),
            ),
        ]
    )

    with pytest.raises(
        ModelConfigConflictError, match="^configuration_conflict$"
    ) as error:
        await repository.save_draft(
            command(
                config_id=REPLACEMENT_ID,
                revision=2,
                expected_revision=1,
                sealed=NEW_SEALED,
            ),
            event(revision=2),
        )

    assert "secret SQL details" not in str(error.value)
    assert len(cursor.executions) == 4
    assert events[-1] == "transaction:rollback"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "database_error",
    [
        psycopg.errors.SerializationFailure("internal serialization detail"),
        psycopg.errors.DeadlockDetected("internal deadlock detail"),
    ],
)
async def test_retryable_transaction_failures_map_to_fixed_conflict(
    database_error: Exception,
) -> None:
    repository, _cursor, events = repository_with(
        [Reply("FOR UPDATE", error=database_error)]
    )

    with pytest.raises(
        ModelConfigConflictError, match="^configuration_conflict$"
    ) as error:
        await repository.save_draft(command(), event())

    assert "internal" not in str(error.value)
    assert events[-1] == "transaction:rollback"


@pytest.mark.asyncio
async def test_save_validates_event_matches_command_before_connecting() -> None:
    repository, cursor, events = repository_with([])
    mismatched_event = event()
    object.__setattr__(mismatched_event, "model_id", "gpt-valid-but-mismatched")

    with pytest.raises(ModelConfigValidationError, match="^validation_error$"):
        await repository.save_draft(command(), mismatched_event)

    assert cursor.executions == []
    assert events == []


@pytest.mark.asyncio
async def test_database_failure_maps_to_fixed_storage_error_and_rolls_back() -> None:
    repository, _cursor, events = repository_with(
        [Reply("FROM agent_control.model_configs", error=RuntimeError(DATABASE_URL))]
    )

    with pytest.raises(ModelConfigStorageError, match="^storage_unavailable$") as error:
        await repository.list_metadata()

    assert "do-not-leak" not in str(error.value)
    assert events[-1] == "transaction:rollback"


@pytest.mark.asyncio
async def test_provider_inputs_are_runtime_validated() -> None:
    repository, _cursor, _events = repository_with([])

    with pytest.raises(ModelConfigValidationError, match="^validation_error$"):
        await repository.load_sealed(cast(ModelProvider, "local"))

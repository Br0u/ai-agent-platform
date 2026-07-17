"""Optional PostgreSQL integration coverage for model configuration drafts."""

import asyncio
from dataclasses import dataclass
import os
import re
from urllib.parse import unquote, urlsplit
from uuid import UUID, uuid4

import psycopg
from pydantic import SecretStr
import pytest

from agent_service.model_config_crypto import ModelConfigCipher
from agent_service.model_config_repository import (
    ControlEvent,
    ModelConfigConflictError,
    PostgresModelConfigRepository,
    SaveSealedConfig,
)
from agent_service.model_config_types import StoredModelConfigMetadata


CONTROL_URL = os.getenv("AGENT_CONTROL_DATABASE_URL")
MIGRATOR_URL = os.getenv("AGENT_CONTROL_MIGRATOR_DATABASE_URL")
DEDICATED_TEST_DATABASE = re.compile(
    r"(?:ai_agent_platform_(?:identity|control|agent_control)_test|agent_control_test)"
    r"(?:_[a-z0-9][a-z0-9-]{0,63})?"
)
MASTER_KEY = SecretStr("11" * 32)
FIXTURE_PLAINTEXT = "fixture-super-secret-api-key-7f31"
RUNTIME_TEST_URL = (
    "postgresql+psycopg_async://ai_agent_control:runtime-password@localhost/"
    "ai_agent_platform_agent_control_test"
)
MIGRATOR_TEST_URL = (
    "postgresql+psycopg_async://ai_agent_control_migrator:migrator-password@"
    "localhost:5432/ai_agent_platform_agent_control_test"
)


@dataclass(frozen=True, slots=True)
class ParsedControlTestUrl:
    hostname: str
    port: int
    database: str


def _parse_safe_control_test_url(
    database_url: str,
    *,
    expected_username: str,
    error_message: str,
) -> ParsedControlTestUrl:
    prefix = "postgresql+psycopg_async://"
    if type(database_url) is not str or not database_url.startswith(prefix):
        raise ValueError(error_message)
    try:
        parsed = urlsplit(f"postgresql://{database_url.removeprefix(prefix)}")
        hostname = parsed.hostname
        parsed_port = parsed.port
        port = 5432 if parsed_port is None else parsed_port
        username = unquote(parsed.username or "")
        password = unquote(parsed.password or "")
        database_name = unquote(parsed.path.removeprefix("/"))
    except (TypeError, ValueError):
        raise ValueError(error_message) from None
    if (
        username != expected_username
        or not password
        or hostname not in {"localhost", "127.0.0.1", "::1"}
        or parsed.query
        or parsed.fragment
        or port < 1
        or not parsed.path.startswith("/")
        or DEDICATED_TEST_DATABASE.fullmatch(database_name) is None
    ):
        raise ValueError(error_message)
    return ParsedControlTestUrl(
        hostname=hostname,
        port=port,
        database=database_name,
    )


def assert_safe_control_test_urls(
    runtime_database_url: str,
    migrator_database_url: str,
) -> tuple[str, str]:
    error_message = "dedicated control repository test database pair is required"
    runtime = _parse_safe_control_test_url(
        runtime_database_url,
        expected_username="ai_agent_control",
        error_message=error_message,
    )
    migrator = _parse_safe_control_test_url(
        migrator_database_url,
        expected_username="ai_agent_control_migrator",
        error_message=error_message,
    )
    if runtime != migrator:
        raise ValueError(error_message)
    return runtime_database_url, migrator_database_url


def missing_control_database_environment(
    runtime_database_url: str | None,
    migrator_database_url: str | None,
) -> tuple[str, ...]:
    missing: list[str] = []
    if not runtime_database_url:
        missing.append("AGENT_CONTROL_DATABASE_URL")
    if not migrator_database_url:
        missing.append("AGENT_CONTROL_MIGRATOR_DATABASE_URL")
    return tuple(missing)


MISSING_DATABASE_ENVIRONMENT = missing_control_database_environment(
    CONTROL_URL,
    MIGRATOR_URL,
)
INTEGRATION_SKIP_REASON = "missing PostgreSQL integration environment: " + ", ".join(
    MISSING_DATABASE_ENVIRONMENT
)


def psycopg_url(database_url: str) -> str:
    return database_url.replace(
        "postgresql+psycopg_async://",
        "postgresql://",
        1,
    )


async def truncate_dedicated_control_tables(migrator_database_url: str) -> None:
    _parse_safe_control_test_url(
        migrator_database_url,
        expected_username="ai_agent_control_migrator",
        error_message="dedicated control repository migrator database is required",
    )
    async with await psycopg.AsyncConnection.connect(
        psycopg_url(migrator_database_url)
    ) as conn:
        await conn.execute(
            """TRUNCATE TABLE
              agent_control.active_model_config,
              agent_control.control_events,
              agent_control.model_configs"""
        )


def save_command(
    *,
    cipher: ModelConfigCipher,
    config_id: UUID,
    revision: int,
    expected_revision: int,
    assertion_nonce: UUID,
    model_suffix: str = "",
) -> SaveSealedConfig:
    sealed = cipher.seal(
        config_id=config_id,
        provider="openai",
        revision=revision,
        secret=SecretStr(FIXTURE_PLAINTEXT),
    )
    return SaveSealedConfig(
        config_id=config_id,
        provider="openai",
        model_id=f"gpt-integration-revision-{revision}{model_suffix}",
        endpoint_id="openai-default",
        revision=revision,
        expected_revision=expected_revision,
        sealed=sealed,
        assertion_nonce=assertion_nonce,
    )


def save_event(
    command: SaveSealedConfig,
    *,
    event_id: UUID | None = None,
) -> ControlEvent:
    return ControlEvent(
        event_id=event_id or uuid4(),
        request_id=uuid4(),
        assertion_nonce=command.assertion_nonce,
        actor_user_id=uuid4(),
        action="model_config_saved",
        provider=command.provider,
        model_id=command.model_id,
        endpoint_id=command.endpoint_id,
        config_revision=command.revision,
        result="success",
    )


def test_control_database_guards_accept_exact_roles_on_same_dedicated_database() -> (
    None
):
    assert assert_safe_control_test_urls(
        RUNTIME_TEST_URL,
        MIGRATOR_TEST_URL,
    ) == (RUNTIME_TEST_URL, MIGRATOR_TEST_URL)


@pytest.mark.parametrize(
    ("runtime_url", "migrator_url"),
    [
        (
            RUNTIME_TEST_URL.replace("ai_agent_control:", "postgres:"),
            MIGRATOR_TEST_URL,
        ),
        (
            RUNTIME_TEST_URL,
            MIGRATOR_TEST_URL.replace("ai_agent_control_migrator:", "postgres:"),
        ),
        (
            RUNTIME_TEST_URL.replace("localhost", "database.internal"),
            MIGRATOR_TEST_URL.replace("localhost", "database.internal"),
        ),
        (
            RUNTIME_TEST_URL.replace(
                "ai_agent_platform_agent_control_test",
                "production",
            ),
            MIGRATOR_TEST_URL.replace(
                "ai_agent_platform_agent_control_test",
                "production",
            ),
        ),
        (f"{RUNTIME_TEST_URL}?sslmode=disable", MIGRATOR_TEST_URL),
        (RUNTIME_TEST_URL, f"{MIGRATOR_TEST_URL}#unsafe"),
        (
            RUNTIME_TEST_URL.replace(":runtime-password@", ":@"),
            MIGRATOR_TEST_URL,
        ),
        (
            RUNTIME_TEST_URL,
            MIGRATOR_TEST_URL.replace(":migrator-password@", ":@"),
        ),
        (
            RUNTIME_TEST_URL,
            MIGRATOR_TEST_URL.replace("localhost:5432", "127.0.0.1:5432"),
        ),
        (
            RUNTIME_TEST_URL,
            MIGRATOR_TEST_URL.replace("localhost:5432", "localhost:5433"),
        ),
        (
            RUNTIME_TEST_URL,
            MIGRATOR_TEST_URL.replace("localhost:5432", "localhost:0"),
        ),
        (
            RUNTIME_TEST_URL,
            MIGRATOR_TEST_URL.replace(
                "ai_agent_platform_agent_control_test",
                "ai_agent_platform_agent_control_test_other",
            ),
        ),
    ],
)
def test_control_database_guards_reject_unsafe_or_mismatched_pairs(
    runtime_url: str,
    migrator_url: str,
) -> None:
    with pytest.raises(
        ValueError,
        match="^dedicated control repository test database pair is required$",
    ) as error:
        assert_safe_control_test_urls(runtime_url, migrator_url)

    rendered = f"{error.value!s} {error.value!r}"
    assert "runtime-password" not in rendered
    assert "migrator-password" not in rendered


@pytest.mark.parametrize(
    ("runtime_url", "migrator_url", "missing"),
    [
        (
            None,
            None,
            ("AGENT_CONTROL_DATABASE_URL", "AGENT_CONTROL_MIGRATOR_DATABASE_URL"),
        ),
        (RUNTIME_TEST_URL, None, ("AGENT_CONTROL_MIGRATOR_DATABASE_URL",)),
        (None, MIGRATOR_TEST_URL, ("AGENT_CONTROL_DATABASE_URL",)),
        (RUNTIME_TEST_URL, MIGRATOR_TEST_URL, ()),
    ],
)
def test_missing_database_environment_names_are_explicit(
    runtime_url: str | None,
    migrator_url: str | None,
    missing: tuple[str, ...],
) -> None:
    assert missing_control_database_environment(runtime_url, migrator_url) == missing


@pytest.mark.asyncio
async def test_truncate_rejects_runtime_role_before_connecting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unexpected_connect(_database_url: str) -> None:
        raise AssertionError("runtime URL reached database cleanup")

    monkeypatch.setattr(psycopg.AsyncConnection, "connect", unexpected_connect)

    with pytest.raises(
        ValueError,
        match="^dedicated control repository migrator database is required$",
    ):
        await truncate_dedicated_control_tables(RUNTIME_TEST_URL)


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_DATABASE_ENVIRONMENT),
    reason=INTEGRATION_SKIP_REASON,
)
async def test_real_repository_enforces_atomic_cas_secrecy_and_exact_active_revision() -> (
    None
):
    assert CONTROL_URL is not None
    assert MIGRATOR_URL is not None
    runtime_url, migrator_url = assert_safe_control_test_urls(
        CONTROL_URL,
        MIGRATOR_URL,
    )
    repository = PostgresModelConfigRepository(database_url=SecretStr(runtime_url))
    cipher = ModelConfigCipher(master_key=MASTER_KEY)

    await truncate_dedicated_control_tables(migrator_url)
    try:
        first_nonce = uuid4()
        first_id = uuid4()
        first_event_id = uuid4()
        first_command = save_command(
            cipher=cipher,
            config_id=first_id,
            revision=1,
            expected_revision=0,
            assertion_nonce=first_nonce,
        )
        await repository.save_draft(
            first_command,
            save_event(first_command, event_id=first_event_id),
        )

        async with await psycopg.AsyncConnection.connect(
            psycopg_url(runtime_url)
        ) as conn:
            await conn.execute(
                """INSERT INTO agent_control.active_model_config (
                  singleton, model_config_id, config_revision, activation_version
                ) VALUES (true, %s, 1, 1)""",
                (first_id,),
            )
            immutable_before = await (
                await conn.execute(
                    """SELECT
                      id, provider, model_id, endpoint_id, api_key_ciphertext,
                      api_key_nonce, api_key_last_four, encryption_key_version,
                      revision, created_at
                    FROM agent_control.model_configs
                    WHERE id = %s""",
                    (first_id,),
                )
            ).fetchone()

        event_failure_command = save_command(
            cipher=cipher,
            config_id=uuid4(),
            revision=2,
            expected_revision=1,
            assertion_nonce=uuid4(),
        )
        with pytest.raises(ModelConfigConflictError, match="^configuration_conflict$"):
            await repository.save_draft(
                event_failure_command,
                save_event(event_failure_command, event_id=first_event_id),
            )

        replay_command = save_command(
            cipher=cipher,
            config_id=uuid4(),
            revision=2,
            expected_revision=1,
            assertion_nonce=first_nonce,
        )
        with pytest.raises(ModelConfigConflictError, match="^configuration_conflict$"):
            await repository.save_draft(replay_command, save_event(replay_command))

        async with await psycopg.AsyncConnection.connect(
            psycopg_url(runtime_url)
        ) as conn:
            assert await (
                await conn.execute(
                    """SELECT id, revision
                    FROM agent_control.model_configs
                    WHERE provider = 'openai' AND is_current = true"""
                )
            ).fetchone() == (first_id, 1)
            assert await (
                await conn.execute("SELECT count(*) FROM agent_control.model_configs")
            ).fetchone() == (1,)
            assert await (
                await conn.execute("SELECT count(*) FROM agent_control.control_events")
            ).fetchone() == (1,)

        contender_commands = [
            save_command(
                cipher=cipher,
                config_id=uuid4(),
                revision=2,
                expected_revision=1,
                assertion_nonce=uuid4(),
                model_suffix=suffix,
            )
            for suffix in ("-a", "-b")
        ]
        results = await asyncio.gather(
            *(
                repository.save_draft(contender, save_event(contender))
                for contender in contender_commands
            ),
            return_exceptions=True,
        )

        successes = [
            result
            for result in results
            if isinstance(result, StoredModelConfigMetadata)
        ]
        conflicts = [
            result for result in results if isinstance(result, ModelConfigConflictError)
        ]
        assert len(successes) == 1
        assert len(conflicts) == 1
        winning_id = next(
            contender.config_id
            for contender in contender_commands
            if contender.model_id == successes[0].model_id
        )

        metadata = await repository.list_metadata()
        assert len(metadata) == 1
        assert metadata[0].revision == 2
        assert not hasattr(metadata[0], "ciphertext")
        assert not hasattr(metadata[0], "nonce")

        active = await repository.load_active()
        assert active is not None
        assert active.config_id == first_id
        assert active.revision == 1
        assert active.activation_version == 1

        async with await psycopg.AsyncConnection.connect(
            psycopg_url(runtime_url)
        ) as conn:
            immutable_after = await (
                await conn.execute(
                    """SELECT
                      id, provider, model_id, endpoint_id, api_key_ciphertext,
                      api_key_nonce, api_key_last_four, encryption_key_version,
                      revision, created_at
                    FROM agent_control.model_configs
                    WHERE id = %s""",
                    (first_id,),
                )
            ).fetchone()
            assert immutable_after == immutable_before
            assert await (
                await conn.execute(
                    """SELECT count(*)
                    FROM agent_control.model_configs
                    WHERE provider = 'openai' AND is_current = true"""
                )
            ).fetchone() == (1,)
            assert await (
                await conn.execute(
                    """SELECT id, revision, test_status
                    FROM agent_control.model_configs
                    WHERE provider = 'openai'
                    ORDER BY revision"""
                )
            ).fetchall() == [
                (first_id, 1, "untested"),
                (winning_id, 2, "untested"),
            ]
            assert await (
                await conn.execute("SELECT count(*) FROM agent_control.control_events")
            ).fetchone() == (2,)
            plaintext_bytes = FIXTURE_PLAINTEXT.encode()
            assert await (
                await conn.execute(
                    """SELECT count(*)
                    FROM agent_control.model_configs
                    WHERE position(%s::bytea IN api_key_ciphertext) > 0
                       OR position(%s IN model_id) > 0
                       OR position(%s IN endpoint_id) > 0""",
                    (plaintext_bytes, FIXTURE_PLAINTEXT, FIXTURE_PLAINTEXT),
                )
            ).fetchone() == (0,)
            assert await (
                await conn.execute(
                    """SELECT count(*)
                    FROM agent_control.control_events
                    WHERE position(%s IN action) > 0
                       OR position(%s IN model_id) > 0
                       OR position(%s IN endpoint_id) > 0
                       OR position(%s IN result) > 0""",
                    (
                        FIXTURE_PLAINTEXT,
                        FIXTURE_PLAINTEXT,
                        FIXTURE_PLAINTEXT,
                        FIXTURE_PLAINTEXT,
                    ),
                )
            ).fetchone() == (0,)
    finally:
        await truncate_dedicated_control_tables(migrator_url)

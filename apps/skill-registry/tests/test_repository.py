from __future__ import annotations

import io
import stat
import zipfile
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import UUID, uuid4

import pytest

from skill_core import canonicalize_skill_zip
from skill_core.types import (
    CanonicalSkillPackage,
    SkillFinding,
)
from skill_registry.repository import PostgresSkillRegistryRepository
from skill_registry.schema import SCHEMA_VERSION_5_SQL
from skill_registry.skill_set_repository import PostgresSkillSetRepository
from skill_registry.types import (
    ArchiveSkill,
    ClonePreviousSkillSet,
    CreateSkillSet,
    CreateUploadRevision,
    DiscardSkillSet,
    RegistryError,
)


NOW = datetime(2026, 7, 21, tzinfo=UTC)
ACTOR = UUID("00000000-0000-4000-8000-000000000001")
SKILL_ID = UUID("10000000-0000-4000-8000-000000000001")
REVISION_ID = UUID("20000000-0000-4000-8000-000000000001")
SET_ID = UUID("40000000-0000-4000-8000-000000000001")


def package() -> CanonicalSkillPackage:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        info = zipfile.ZipInfo("demo-skill/SKILL.md", (2026, 7, 21, 12, 0, 0))
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | 0o600) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(
            info,
            b"---\nname: demo-skill\ndescription: Demo.\nlicense: MIT\n---\n# Demo\n",
        )
    canonical = canonicalize_skill_zip(output.getvalue())
    return replace(
        canonical,
        findings=(
            SkillFinding(
                path="scripts/run.py",
                line=1,
                code="unsupported_import",
                message="Import is outside the configured module allowlist.",
                blocking=True,
            ),
        ),
    )


def create_command(**changes: object) -> CreateUploadRevision:
    values: dict[str, object] = {
        "actor": ACTOR,
        "request_id": uuid4(),
        "assertion_nonce": uuid4(),
        "package": package(),
        "target_skill_id": None,
    }
    values.update(changes)
    return CreateUploadRevision(**values)  # type: ignore[arg-type]


def stored_row(
    *,
    state: str = "published",
    findings: list[dict[str, object]] | None = None,
) -> tuple[object, ...]:
    return (
        REVISION_ID,
        SKILL_ID,
        "demo-skill",
        1,
        state,
        "upload",
        {
            "name": "demo-skill",
            "description": "Demo.",
            "instructions": "# Demo",
            "scripts": [],
            "references": [],
            "metadata": None,
            "license": "MIT",
            "compatibility": None,
            "allowed_tools": [],
        },
        findings
        if findings is not None
        else [
            {
                "path": "scripts/run.py",
                "line": 1,
                "code": "unsupported_import",
                "message": "Import is outside the configured module allowlist.",
                "blocking": True,
            }
        ],
        ACTOR,
        NOW,
        "a" * 64,
        9,
        7,
        1,
    )


class Reply:
    def __init__(
        self,
        contains: str,
        *,
        one: tuple[Any, ...] | None = None,
        all_rows: list[tuple[Any, ...]] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.contains = contains
        self.one = one
        self.all_rows = all_rows or []
        self.error = error


class ScriptedCursor:
    def __init__(self, replies: list[Reply]) -> None:
        self.replies = replies
        self.current: Reply | None = None
        self.executions: list[tuple[str, tuple[object, ...]]] = []

    async def __aenter__(self) -> ScriptedCursor:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, query: str, parameters: tuple[object, ...] = ()) -> None:
        assert self.replies, f"unexpected SQL: {query}"
        normalized = " ".join(query.split())
        if (
            "WHERE assertion_nonce = %s" in normalized
            and "WHERE assertion_nonce = %s" not in self.replies[0].contains
        ):
            self.current = Reply("WHERE assertion_nonce = %s", one=None)
            self.executions.append((query, parameters))
            return
        reply = self.replies.pop(0)
        assert reply.contains in normalized, query
        self.current = reply
        self.executions.append((query, parameters))
        if reply.error is not None:
            raise reply.error

    async def fetchone(self) -> tuple[Any, ...] | None:
        assert self.current is not None
        return self.current.one

    async def fetchall(self) -> list[tuple[Any, ...]]:
        assert self.current is not None
        return self.current.all_rows


class Transaction:
    def __init__(self, connection: ScriptedConnection) -> None:
        self.connection = connection

    async def __aenter__(self) -> Transaction:
        return self

    async def __aexit__(self, *args: object) -> None:
        self.connection.rolled_back = args[0] is not None
        self.connection.committed = args[0] is None


class ScriptedConnection:
    def __init__(self, replies: list[Reply]) -> None:
        self.script = ScriptedCursor(replies)
        self.committed = False
        self.rolled_back = False

    async def __aenter__(self) -> ScriptedConnection:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def transaction(self) -> Transaction:
        return Transaction(self)

    def cursor(self) -> ScriptedCursor:
        return self.script


def repository_with(
    replies: list[Reply],
) -> tuple[PostgresSkillRegistryRepository, ScriptedConnection]:
    connection = ScriptedConnection(replies)
    identifiers = iter(
        (
            SKILL_ID,
            REVISION_ID,
            UUID("30000000-0000-4000-8000-000000000001"),
        )
    )
    return PostgresSkillRegistryRepository(
        lambda: connection, id_factory=lambda: next(identifiers)
    ), connection


def skill_set_repository_with(
    replies: list[Reply],
) -> tuple[PostgresSkillSetRepository, ScriptedConnection]:
    connection = ScriptedConnection(replies)
    return PostgresSkillSetRepository(lambda: connection), connection


@pytest.mark.asyncio
async def test_archive_skill_requires_inactive_matching_digest() -> None:
    repository, connection = repository_with(
        [
            Reply("FOR UPDATE OF skill", one=(SKILL_ID,)),
            Reply("artifact.artifact_sha256", one=("a" * 64, False)),
            Reply("UPDATE skill_registry.skills"),
            Reply("INSERT INTO skill_registry.skill_control_events"),
        ]
    )

    await repository.archive_skill(
        ArchiveSkill(
            actor=ACTOR,
            request_id=uuid4(),
            assertion_nonce=uuid4(),
            skill_id=SKILL_ID,
            expected_artifact_sha256="a" * 64,
        )
    )

    assert connection.committed is True
    lock_query = next(
        query for query, _ in connection.script.executions if "FOR UPDATE OF skill" in query
    )
    validation_query = next(
        query for query, _ in connection.script.executions if "artifact.artifact_sha256" in query
    )
    assert "manager_active_skill_set" not in lock_query
    assert "FROM skill_registry.manager_active_skill_set AS active_set" in validation_query
    assert "JOIN skill_registry.manager_skill_set_items AS active_item" in validation_query
    assert "FROM skill_registry.active_agent_skill_sets" not in validation_query
    assert connection.script.executions.index((lock_query, (SKILL_ID,))) < (
        connection.script.executions.index((validation_query, (SKILL_ID,)))
    )
    assert "archived_at = now()" in connection.script.executions[-2][0]


@pytest.mark.asyncio
async def test_create_upload_revision_writes_complete_bundle_in_one_transaction() -> None:
    repository, connection = repository_with(
        [
            Reply("INSERT INTO skill_registry.skills", one=(SKILL_ID,)),
            Reply("artifact_sha256 = %s", one=None),
            Reply("INSERT INTO skill_registry.skill_revisions", one=(NOW,)),
            Reply("INSERT INTO skill_registry.skill_revision_artifacts"),
            Reply("INSERT INTO skill_registry.skill_revision_files"),
            Reply("UPDATE skill_registry.skills"),
            Reply("INSERT INTO skill_registry.skill_control_events"),
        ]
    )

    revision = await repository.create_upload_revision(create_command())

    assert revision.id == REVISION_ID
    assert revision.skill_id == SKILL_ID
    assert revision.state == "published"
    assert revision.manifest.license == "MIT"
    assert revision.findings[0].code == "unsupported_import"
    assert connection.committed is True
    assert connection.rolled_back is False
    queries = [query for query, _ in connection.script.executions]
    assert "ON CONFLICT (slug) WHERE archived_at IS NULL DO NOTHING" in queries[1]
    assert "current_revision_id" in queries[-2]
    assert queries[-1].find("skill_control_events") >= 0
    artifact_parameters = connection.script.executions[4][1]
    assert artifact_parameters[-1] == package().archive
    assert all(b"raw" not in value for value in artifact_parameters if isinstance(value, bytes))


@pytest.mark.asyncio
async def test_create_upload_revision_rolls_back_everything_when_file_index_fails() -> None:
    repository, connection = repository_with(
        [
            Reply("INSERT INTO skill_registry.skills", one=(SKILL_ID,)),
            Reply("artifact_sha256 = %s", one=None),
            Reply("INSERT INTO skill_registry.skill_revisions", one=(NOW,)),
            Reply("INSERT INTO skill_registry.skill_revision_artifacts"),
            Reply(
                "INSERT INTO skill_registry.skill_revision_files",
                error=RuntimeError("simulated storage failure with secret-source"),
            ),
        ]
    )

    with pytest.raises(RegistryError) as caught:
        await repository.create_upload_revision(create_command())

    assert caught.value.code == "REGISTRY_STORAGE_ERROR"
    assert "secret-source" not in str(caught.value)
    assert connection.rolled_back is True
    assert connection.committed is False


@pytest.mark.asyncio
async def test_new_upload_uses_unique_slug_as_source_for_conflict_or_idempotence() -> None:
    conflicting, conflict_connection = repository_with(
        [
            Reply("INSERT INTO skill_registry.skills", one=None),
            Reply("SELECT id FROM skill_registry.skills WHERE slug", one=(SKILL_ID,)),
            Reply("artifact_sha256 = %s", one=None),
            Reply("revision.id = skill.current_revision_id", one=("a" * 64, True)),
        ]
    )

    with pytest.raises(RegistryError) as caught:
        await conflicting.create_upload_revision(create_command())
    assert caught.value.code == "SKILL_NAME_CONFLICT"
    assert caught.value.conflicting_skill_id == SKILL_ID
    assert caught.value.replacement_token == "a" * 64
    assert caught.value.conflicting_skill_enabled is True
    assert (
        "ON CONFLICT (slug) WHERE archived_at IS NULL DO NOTHING"
        in conflict_connection.script.executions[1][0]
    )
    assert "archived_at IS NULL" in conflict_connection.script.executions[2][0]

    idempotent, idempotent_connection = repository_with(
        [
            Reply("INSERT INTO skill_registry.skills", one=None),
            Reply("SELECT id FROM skill_registry.skills WHERE slug", one=(SKILL_ID,)),
            Reply("artifact_sha256 = %s", one=stored_row()),
            Reply("INSERT INTO skill_registry.skill_control_events"),
        ]
    )
    existing = await idempotent.create_upload_revision(create_command())
    assert existing.id == REVISION_ID
    assert len(idempotent_connection.script.executions) == 5
    assert idempotent_connection.script.executions[-1][1][-1] == "replay"


@pytest.mark.asyncio
async def test_target_revision_requires_locked_matching_slug_and_is_digest_idempotent() -> None:
    repository, _ = repository_with(
        [
            Reply(
                "WHERE skill.id = %s AND skill.archived_at IS NULL",
                one=("other-skill", "a" * 64),
            )
        ]
    )
    with pytest.raises(RegistryError) as caught:
        await repository.create_upload_revision(
            create_command(
                target_skill_id=SKILL_ID,
                expected_artifact_sha256="a" * 64,
            )
        )
    assert caught.value.code == "SKILL_NAME_CONFLICT"

    repository, connection = repository_with(
        [
            Reply(
                "WHERE skill.id = %s AND skill.archived_at IS NULL",
                one=("demo-skill", "a" * 64),
            ),
            Reply("artifact_sha256 = %s", one=stored_row()),
            Reply("INSERT INTO skill_registry.skill_control_events"),
        ]
    )
    revision = await repository.create_upload_revision(
        create_command(
            target_skill_id=SKILL_ID,
            expected_artifact_sha256="a" * 64,
        )
    )
    assert revision.id == REVISION_ID
    assert "archived_at IS NULL" in connection.script.executions[1][0]
    assert len(connection.script.executions) == 4
    assert connection.script.executions[-1][1][-1] == "replay"


@pytest.mark.asyncio
async def test_repository_queries_lists_files_and_previous_published_revision() -> None:
    repository, connection = repository_with(
        [
            Reply(
                "FROM skill_registry.skills AS skill",
                all_rows=[
                    (
                        SKILL_ID,
                        "demo-skill",
                        "Demo.",
                        True,
                        NOW,
                        "a" * 64,
                        REVISION_ID,
                    )
                ],
            ),
            Reply("FROM skill_registry.skill_revisions AS revision", one=stored_row()),
            Reply(
                "FROM skill_registry.skill_revision_files",
                all_rows=[("SKILL.md", "b" * 64, 7, "text/markdown")],
            ),
            Reply("revision.state = 'published'", one=None),
        ]
    )

    summaries = await repository.list_skills(limit=25, offset=10)
    revision = await repository.get_revision(SKILL_ID, REVISION_ID)
    files = await repository.list_revision_files(REVISION_ID)
    previous = await repository.find_previous_published(revision)

    assert summaries[0].name == "demo-skill"
    assert summaries[0].description == "Demo."
    assert summaries[0].enabled is True
    assert summaries[0].replacement_token == "a" * 64
    assert summaries[0].revision_id == REVISION_ID
    list_query = connection.script.executions[0][0]
    assert "current_revision.id = skill.current_revision_id" in list_query
    assert "ORDER BY latest_revision.revision_no DESC" not in list_query
    assert "FROM skill_registry.manager_active_skill_set AS active_set" in list_query
    assert "JOIN skill_registry.manager_skill_set_items AS active_item" in list_query
    assert "FROM skill_registry.active_agent_skill_sets" not in list_query
    assert "candidate" not in list_query
    assert connection.script.executions[0][1] == (25, 10)
    assert revision.id == REVISION_ID
    assert files[0].path == "SKILL.md"
    assert previous is None


def test_schema_removes_review_state_and_keeps_revision_immutability() -> None:
    sql = " ".join(SCHEMA_VERSION_5_SQL.split())

    assert "DROP COLUMN reviewed_by" in sql
    assert "DROP COLUMN reviewed_at" in sql
    assert "state IN ('published', 'archived')" in sql
    assert "NEW.findings IS DISTINCT FROM OLD.findings" in sql


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["create", "list"])
async def test_repository_sanitizes_connection_failures(operation: str) -> None:
    def fail_connection() -> NoReturn:
        raise RuntimeError("connection failure includes secret-source")

    repository = PostgresSkillRegistryRepository(fail_connection)

    with pytest.raises(RegistryError) as caught:
        if operation == "create":
            await repository.create_upload_revision(create_command())
        else:
            await repository.list_skills()

    assert caught.value.code == "REGISTRY_STORAGE_ERROR"
    assert "secret-source" not in str(caught.value)
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None


@pytest.mark.asyncio
async def test_repeated_upload_nonce_is_rejected_before_business_work() -> None:
    repository, connection = repository_with(
        [Reply("WHERE assertion_nonce = %s", one=(REVISION_ID,))]
    )

    with pytest.raises(RegistryError) as caught:
        await repository.create_upload_revision(create_command())

    assert caught.value.code == "ASSERTION_REPLAY"
    assert len(connection.script.executions) == 1


@pytest.mark.asyncio
async def test_repository_rejects_forged_package_before_database_write() -> None:
    repository, connection = repository_with([])
    forged = replace(package(), extracted_size=99)

    with pytest.raises(RegistryError) as caught:
        await repository.create_upload_revision(create_command(package=forged))

    assert caught.value.code == "ARTIFACT_DIGEST_MISMATCH"
    assert connection.script.executions == []


@pytest.mark.asyncio
async def test_repository_scrubs_invalid_database_values_during_mapping() -> None:
    secret = "secret-database-value"
    repository, _ = repository_with(
        [Reply("SELECT skill.id", all_rows=[(secret, "demo-skill", None, None, None, NOW)])]
    )

    with pytest.raises(RegistryError) as caught:
        await repository.list_skills()

    assert caught.value.code == "REGISTRY_STORAGE_ERROR"
    assert secret not in repr(caught.value.args)
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None


@pytest.mark.asyncio
async def test_skill_set_repository_create_calls_function_and_loads_ordered_set() -> None:
    repository, connection = skill_set_repository_with(
        [
            Reply("create_agent_skill_set", one=(SET_ID, False, 1, 123)),
            Reply(
                "FROM skill_registry.manager_skill_sets",
                one=(
                    SET_ID,
                    "maduoduo",
                    "candidate",
                    1,
                    123,
                    None,
                    None,
                ),
            ),
            Reply(
                "FROM skill_registry.manager_skill_set_items",
                all_rows=[(REVISION_ID,)],
            ),
        ]
    )
    request_id = uuid4()
    command = CreateSkillSet(
        ACTOR,
        request_id,
        request_id,
        "maduoduo",
        (REVISION_ID,),
    )

    result = await repository.create_skill_set(command, "a" * 64)

    assert result.skill_set.id == SET_ID
    assert result.skill_set.revision_ids == (REVISION_ID,)
    assert result.skill_set.item_count == 1
    assert result.replayed is False
    assert connection.committed is True
    assert connection.script.executions[0][1] == (
        "maduoduo",
        [REVISION_ID],
        ACTOR,
        request_id,
        request_id,
        "a" * 64,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["discard", "clone"])
async def test_skill_set_repository_discard_and_clone_return_current_stored_set(
    operation: str,
) -> None:
    function_name = (
        "discard_agent_skill_set" if operation == "discard" else "clone_previous_agent_skill_set"
    )
    state = "discarded" if operation == "discard" else "candidate"
    function_row: tuple[object, ...] = (
        (SET_ID, state, False) if operation == "discard" else (SET_ID, False, 0, 0)
    )
    repository, _ = skill_set_repository_with(
        [
            Reply(function_name, one=function_row),
            Reply(
                "FROM skill_registry.manager_skill_sets",
                one=(
                    SET_ID,
                    "maduoduo",
                    state,
                    0,
                    0,
                    None,
                    None,
                ),
            ),
            Reply("FROM skill_registry.manager_skill_set_items", all_rows=[]),
        ]
    )
    request_id = uuid4()

    if operation == "discard":
        result = await repository.discard_skill_set(
            DiscardSkillSet(ACTOR, request_id, request_id, "maduoduo", SET_ID),
            "b" * 64,
        )
    else:
        result = await repository.clone_previous_skill_set(
            ClonePreviousSkillSet(
                ACTOR,
                request_id,
                request_id,
                "maduoduo",
                2,
                SET_ID,
            ),
            "c" * 64,
        )

    assert result.skill_set.state == state
    assert result.replayed is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sqlstate", "code"),
    [
        ("P0002", "SKILL_SET_NOT_FOUND"),
        ("23505", "IDEMPOTENCY_CONFLICT"),
        ("40001", "SKILL_SET_STATE_CONFLICT"),
        ("22023", "CANDIDATE_INVALID"),
        ("99999", "REGISTRY_STORAGE_ERROR"),
    ],
)
async def test_skill_set_repository_maps_mutation_sqlstates(sqlstate: str, code: str) -> None:
    class DatabaseFailure(RuntimeError):
        pass

    failure = DatabaseFailure("private database detail")
    failure.sqlstate = sqlstate  # type: ignore[attr-defined]
    repository, _ = skill_set_repository_with([Reply("discard_agent_skill_set", error=failure)])
    request_id = uuid4()

    with pytest.raises(RegistryError) as caught:
        await repository.discard_skill_set(
            DiscardSkillSet(ACTOR, request_id, request_id, "maduoduo", SET_ID),
            "b" * 64,
        )

    assert caught.value.code == code
    assert "private" not in str(caught.value)
    assert caught.value.__cause__ is None


@pytest.mark.asyncio
async def test_skill_set_repository_resolves_all_published_revisions_and_pages() -> None:
    repository, connection = skill_set_repository_with(
        [
            Reply(
                "revision.id = ANY",
                all_rows=[(SKILL_ID, REVISION_ID, "demo-skill", 2, "a" * 64, 123)],
            ),
            Reply("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"),
            Reply("count(*)", one=(1,)),
            Reply(
                "revision.state = 'published'",
                all_rows=[(SKILL_ID, REVISION_ID, "demo-skill", 2, "a" * 64, 123)],
            ),
        ]
    )

    resolved = await repository.resolve_published_revisions((REVISION_ID,))
    page, total = await repository.list_available_revisions(limit=25, offset=10)

    assert resolved[0].revision_id == REVISION_ID
    assert page[0].revision_no == 2
    assert total == 1
    assert all(
        "skill.archived_at IS NULL" in query
        for query, _ in connection.script.executions
        if "skill_revisions AS revision" in query
    )
    assert connection.script.executions[-1][1] == (25, 10)


@pytest.mark.asyncio
async def test_skill_library_reads_the_authoritative_current_revision() -> None:
    repository, connection = repository_with(
        [
            Reply(
                "FROM skill_registry.skills AS skill",
                all_rows=[],
            )
        ]
    )

    await repository.list_skills()

    query = connection.script.executions[0][0]
    assert "active_item.revision_id" in query
    assert "current_revision.id = skill.current_revision_id" in query
    assert "artifact.artifact_sha256" in query
    assert "current_revision.artifact_sha256" not in query
    assert "SELECT latest_revision.id" not in query


@pytest.mark.asyncio
async def test_skill_set_repository_reads_active_previous_and_candidates() -> None:
    previous_id = uuid4()
    candidate_id = uuid4()
    repository, _ = skill_set_repository_with(
        [
            Reply("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"),
            Reply("FROM skill_registry.manager_active_skill_set", one=(SET_ID, previous_id, 3)),
            Reply(
                "FROM skill_registry.manager_skill_sets",
                one=(
                    SET_ID,
                    "maduoduo",
                    "active",
                    1,
                    10,
                    None,
                    3,
                ),
            ),
            Reply("FROM skill_registry.manager_skill_set_items", all_rows=[(REVISION_ID,)]),
            Reply(
                "FROM skill_registry.manager_skill_sets",
                one=(
                    previous_id,
                    "maduoduo",
                    "superseded",
                    0,
                    0,
                    None,
                    3,
                ),
            ),
            Reply("FROM skill_registry.manager_skill_set_items", all_rows=[]),
            Reply("state = 'candidate'", all_rows=[(candidate_id,)]),
            Reply(
                "FROM skill_registry.manager_skill_sets",
                one=(
                    candidate_id,
                    "maduoduo",
                    "candidate",
                    0,
                    0,
                    None,
                    None,
                ),
            ),
            Reply("FROM skill_registry.manager_skill_set_items", all_rows=[]),
        ]
    )

    status = await repository.get_runtime_status("maduoduo")

    assert status.activation_version == 3
    assert status.active is not None and status.active.id == SET_ID
    assert status.previous is not None and status.previous.id == previous_id
    assert [candidate.id for candidate in status.candidates] == [candidate_id]

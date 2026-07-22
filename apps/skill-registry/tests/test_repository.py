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
from skill_registry.schema import SCHEMA_VERSION_1_SQL
from skill_registry.skill_set_repository import PostgresSkillSetRepository
from skill_registry.types import (
    ClonePreviousSkillSet,
    CreateSkillSet,
    CreateUploadRevision,
    DiscardSkillSet,
    RegistryError,
    ReviewAttestations,
    ReviewRevision,
)


NOW = datetime(2026, 7, 21, tzinfo=UTC)
ACTOR = UUID("00000000-0000-4000-8000-000000000001")
REVIEWER = UUID("00000000-0000-4000-8000-000000000002")
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
    state: str = "pending_review",
    reviewed_by: UUID | None = None,
    reviewed_at: datetime | None = None,
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
        reviewed_by,
        reviewed_at,
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
async def test_create_upload_revision_writes_complete_bundle_in_one_transaction() -> None:
    repository, connection = repository_with(
        [
            Reply("INSERT INTO skill_registry.skills", one=(SKILL_ID,)),
            Reply("artifact_sha256 = %s", one=None),
            Reply("INSERT INTO skill_registry.skill_revisions", one=(NOW,)),
            Reply("INSERT INTO skill_registry.skill_revision_artifacts"),
            Reply("INSERT INTO skill_registry.skill_revision_files"),
            Reply("INSERT INTO skill_registry.skill_control_events"),
        ]
    )

    revision = await repository.create_upload_revision(create_command())

    assert revision.id == REVISION_ID
    assert revision.skill_id == SKILL_ID
    assert revision.state == "pending_review"
    assert revision.manifest.license == "MIT"
    assert revision.findings[0].code == "unsupported_import"
    assert connection.committed is True
    assert connection.rolled_back is False
    queries = [query for query, _ in connection.script.executions]
    assert "ON CONFLICT (slug) DO NOTHING" in queries[1]
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
        ]
    )

    with pytest.raises(RegistryError) as caught:
        await conflicting.create_upload_revision(create_command())
    assert caught.value.code == "SKILL_NAME_CONFLICT"
    assert "ON CONFLICT (slug) DO NOTHING" in conflict_connection.script.executions[1][0]

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
        [Reply("FROM skill_registry.skills WHERE id = %s FOR UPDATE", one=("other-skill",))]
    )
    with pytest.raises(RegistryError) as caught:
        await repository.create_upload_revision(create_command(target_skill_id=SKILL_ID))
    assert caught.value.code == "SKILL_NAME_CONFLICT"

    repository, connection = repository_with(
        [
            Reply("FROM skill_registry.skills WHERE id = %s FOR UPDATE", one=("demo-skill",)),
            Reply("artifact_sha256 = %s", one=stored_row()),
            Reply("INSERT INTO skill_registry.skill_control_events"),
        ]
    )
    revision = await repository.create_upload_revision(create_command(target_skill_id=SKILL_ID))
    assert revision.id == REVISION_ID
    assert len(connection.script.executions) == 4
    assert connection.script.executions[-1][1][-1] == "replay"


def review_command(**changes: object) -> ReviewRevision:
    values: dict[str, object] = {
        "revision_id": REVISION_ID,
        "reviewer": REVIEWER,
        "request_id": uuid4(),
        "assertion_nonce": uuid4(),
        "decision": "approve",
        "expected_state": "pending_review",
        "reason": None,
        "attestations": ReviewAttestations(
            content_reviewed=True,
            usage_rights_confirmed=True,
            execution_risk_accepted=True,
            reviewer_authorization_confirmed=True,
        ),
    }
    values.update(changes)
    return ReviewRevision(**values)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_review_locks_then_writes_matching_event_before_state_update() -> None:
    repository, connection = repository_with(
        [
            Reply("FROM skill_registry.skill_revisions AS revision", one=stored_row(findings=[])),
            Reply("INSERT INTO skill_registry.skill_control_events"),
            Reply("UPDATE skill_registry.skill_revisions", one=(NOW,)),
        ]
    )

    revision = await repository.review_revision(review_command(skill_id=SKILL_ID))

    assert revision.state == "published"
    assert revision.reviewed_by == REVIEWER
    queries = [" ".join(query.split()) for query, _ in connection.script.executions]
    assert "FOR UPDATE" in queries[1]
    assert "AND revision.skill_id = %s" in queries[1]
    assert connection.script.executions[1][1] == (REVISION_ID, SKILL_ID)
    assert "revision_published" in connection.script.executions[2][1]
    assert queries[2].startswith("INSERT INTO skill_registry.skill_control_events")
    assert "reviewer_authorization_confirmed" in queries[2]
    assert "independent_reviewer_confirmed" not in queries[2]
    assert queries[3].startswith("UPDATE skill_registry.skill_revisions")
    assert connection.committed is True


@pytest.mark.asyncio
async def test_revision_creator_can_review_and_is_bound_to_event_and_update() -> None:
    repository, connection = repository_with(
        [
            Reply("FROM skill_registry.skill_revisions AS revision", one=stored_row(findings=[])),
            Reply("INSERT INTO skill_registry.skill_control_events"),
            Reply("UPDATE skill_registry.skill_revisions", one=(NOW,)),
        ]
    )

    revision = await repository.review_revision(review_command(reviewer=ACTOR))

    assert revision.state == "published"
    assert revision.created_by == ACTOR
    assert revision.reviewed_by == ACTOR
    assert connection.script.executions[2][1][3] == str(ACTOR)
    assert connection.script.executions[3][1][1] == ACTOR
    assert connection.committed is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("command", "row", "code"),
    [
        (
            review_command(
                attestations=replace(
                    ReviewAttestations(True, True, True, True),
                    execution_risk_accepted=False,
                )
            ),
            stored_row(findings=[]),
            "VALIDATION_ERROR",
        ),
        (
            review_command(),
            stored_row(state="published", reviewed_by=REVIEWER, reviewed_at=NOW),
            "REVISION_STATE_CONFLICT",
        ),
        (review_command(), stored_row(), "REVIEW_BLOCKED"),
        (review_command(decision="reject", reason=""), stored_row(findings=[]), "VALIDATION_ERROR"),
        (
            review_command(decision="reject", reason="   "),
            stored_row(findings=[]),
            "VALIDATION_ERROR",
        ),
        (
            review_command(decision="reject", reason="x" * 501),
            stored_row(findings=[]),
            "VALIDATION_ERROR",
        ),
        (
            review_command(decision="reject", reason=" " + "x" * 500 + " "),
            stored_row(findings=[]),
            "VALIDATION_ERROR",
        ),
    ],
)
async def test_review_rejects_invalid_or_blocked_transition_under_lock(
    command: ReviewRevision,
    row: tuple[object, ...],
    code: str,
) -> None:
    repository, connection = repository_with(
        [Reply("FROM skill_registry.skill_revisions AS revision", one=row)]
    )

    with pytest.raises(RegistryError) as caught:
        await repository.review_revision(command)

    assert caught.value.code == code
    assert connection.rolled_back is True


@pytest.mark.asyncio
async def test_warning_findings_do_not_block_fully_attested_approval() -> None:
    warnings = [
        {
            "path": "SKILL.md",
            "line": 4,
            "code": "possible_secret",
            "message": "Possible credential-like assignment; review required.",
            "blocking": False,
        }
    ]
    repository, _ = repository_with(
        [
            Reply(
                "FROM skill_registry.skill_revisions AS revision", one=stored_row(findings=warnings)
            ),
            Reply("INSERT INTO skill_registry.skill_control_events"),
            Reply("UPDATE skill_registry.skill_revisions", one=(NOW,)),
        ]
    )

    result = await repository.review_revision(review_command())

    assert result.state == "published"


@pytest.mark.asyncio
async def test_reject_writes_bounded_reason_to_event_and_state_transition() -> None:
    repository, connection = repository_with(
        [
            Reply("FROM skill_registry.skill_revisions AS revision", one=stored_row(findings=[])),
            Reply("INSERT INTO skill_registry.skill_control_events"),
            Reply("UPDATE skill_registry.skill_revisions", one=(NOW,)),
        ]
    )

    result = await repository.review_revision(
        review_command(decision="reject", reason="Usage rights were not demonstrated.")
    )

    assert result.state == "rejected"
    event_parameters = connection.script.executions[2][1]
    assert "revision_rejected" in event_parameters
    assert event_parameters[6] == "Usage rights were not demonstrated."
    assert event_parameters[7:] == (True, True, True, True)


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
                        1,
                        REVISION_ID,
                        "pending_review",
                        NOW,
                        "upload",
                        "a" * 64,
                        ACTOR,
                        NOW,
                        None,
                        None,
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

    assert summaries[0].slug == "demo-skill"
    assert summaries[0].latest_artifact_sha256 == "a" * 64
    assert connection.script.executions[0][1] == (25, 10)
    assert revision.id == REVISION_ID
    assert files[0].path == "SKILL.md"
    assert previous is None


def test_schema_persists_findings_and_rejection_reason_with_immutable_boundaries() -> None:
    sql = " ".join(SCHEMA_VERSION_1_SQL.split())

    assert "findings jsonb NOT NULL" in sql
    assert "review_reason varchar(500)" in sql
    assert "NEW.findings IS DISTINCT FROM OLD.findings" in sql
    assert "event_type = 'revision_rejected'" in sql
    assert "GRANT UPDATE (review_reason)" not in sql


def test_schema_requires_exact_review_evidence_and_blocks_findings_in_trigger() -> None:
    sql = " ".join(SCHEMA_VERSION_1_SQL.split())

    for column in (
        "content_reviewed boolean",
        "usage_rights_confirmed boolean",
        "execution_risk_accepted boolean",
        "independent_reviewer_confirmed boolean",
    ):
        assert column in sql
    assert "CONSTRAINT skill_revisions_findings_array" in sql
    assert "CONSTRAINT skill_control_events_review_evidence" in sql
    assert "CONSTRAINT skill_control_events_review_reason" in sql
    assert "content_reviewed IS TRUE" in sql
    assert "content_reviewed IS NULL" in sql
    assert "event_type = 'revision_rejected' AND review_reason IS NOT NULL" in sql
    assert "event_type <> 'revision_rejected' AND review_reason IS NULL" in sql
    assert "jsonb_array_elements(OLD.findings)" in sql
    assert "finding ->> 'code' IN ('unsupported_import', 'private_key')" in sql


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["create", "review", "list"])
async def test_repository_sanitizes_connection_failures(operation: str) -> None:
    def fail_connection() -> NoReturn:
        raise RuntimeError("connection failure includes secret-source")

    repository = PostgresSkillRegistryRepository(fail_connection)

    with pytest.raises(RegistryError) as caught:
        if operation == "create":
            await repository.create_upload_revision(create_command())
        elif operation == "review":
            await repository.review_revision(review_command())
        else:
            await repository.list_skills()

    assert caught.value.code == "REGISTRY_STORAGE_ERROR"
    assert "secret-source" not in str(caught.value)
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["upload", "review"])
async def test_repeated_mutation_nonce_is_rejected_before_business_work(operation: str) -> None:
    repository, connection = repository_with(
        [Reply("WHERE assertion_nonce = %s", one=(REVISION_ID,))]
    )

    with pytest.raises(RegistryError) as caught:
        if operation == "upload":
            await repository.create_upload_revision(create_command())
        else:
            await repository.review_revision(review_command())

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
    assert connection.script.executions[-1][1] == (25, 10)


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

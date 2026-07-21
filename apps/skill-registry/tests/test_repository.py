from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import UUID, uuid4

import pytest

from skill_core.types import (
    CanonicalSkillPackage,
    SkillFile,
    SkillFinding,
    SkillManifest,
)
from skill_registry.repository import PostgresSkillRegistryRepository
from skill_registry.schema import SCHEMA_VERSION_1_SQL
from skill_registry.types import (
    CreateUploadRevision,
    RegistryError,
    ReviewAttestations,
    ReviewRevision,
)


NOW = datetime(2026, 7, 21, tzinfo=UTC)
ACTOR = UUID("00000000-0000-4000-8000-000000000001")
REVIEWER = UUID("00000000-0000-4000-8000-000000000002")
SKILL_ID = UUID("10000000-0000-4000-8000-000000000001")
REVISION_ID = UUID("20000000-0000-4000-8000-000000000001")


def package(*, digest: str = "a" * 64) -> CanonicalSkillPackage:
    skill_file = SkillFile("SKILL.md", b"# Demo\n", "b" * 64, 7)
    return CanonicalSkillPackage(
        slug="demo-skill",
        archive=b"canonical",
        sha256=digest,
        compressed_size=9,
        extracted_size=7,
        files=(skill_file,),
        manifest=SkillManifest(
            name="demo-skill",
            description="Demo.",
            instructions="# Demo",
            scripts=(),
            references=(),
            license="MIT",
        ),
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
        reply = self.replies.pop(0)
        assert reply.contains in " ".join(query.split()), query
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
    assert "ON CONFLICT (slug) DO NOTHING" in queries[0]
    assert queries[-1].find("skill_control_events") >= 0
    artifact_parameters = connection.script.executions[3][1]
    assert artifact_parameters[-1] == b"canonical"
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
    assert "ON CONFLICT (slug) DO NOTHING" in conflict_connection.script.executions[0][0]

    idempotent, idempotent_connection = repository_with(
        [
            Reply("INSERT INTO skill_registry.skills", one=None),
            Reply("SELECT id FROM skill_registry.skills WHERE slug", one=(SKILL_ID,)),
            Reply("artifact_sha256 = %s", one=stored_row()),
        ]
    )
    existing = await idempotent.create_upload_revision(create_command())
    assert existing.id == REVISION_ID
    assert len(idempotent_connection.script.executions) == 3


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
        ]
    )
    revision = await repository.create_upload_revision(create_command(target_skill_id=SKILL_ID))
    assert revision.id == REVISION_ID
    assert len(connection.script.executions) == 2


def review_command(**changes: object) -> ReviewRevision:
    values: dict[str, object] = {
        "revision_id": REVISION_ID,
        "reviewer": REVIEWER,
        "request_id": uuid4(),
        "assertion_nonce": uuid4(),
        "decision": "approve",
        "expected_state": "pending_review",
        "reason": None,
        "attestations": ReviewAttestations(True, True, True, True),
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

    revision = await repository.review_revision(review_command())

    assert revision.state == "published"
    assert revision.reviewed_by == REVIEWER
    queries = [" ".join(query.split()) for query, _ in connection.script.executions]
    assert "FOR UPDATE" in queries[0]
    assert "revision_published" in connection.script.executions[1][1]
    assert queries[1].startswith("INSERT INTO skill_registry.skill_control_events")
    assert queries[2].startswith("UPDATE skill_registry.skill_revisions")
    assert connection.committed is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("command", "row", "code"),
    [
        (review_command(reviewer=ACTOR), stored_row(findings=[]), "REVIEW_SELF_APPROVAL_DENIED"),
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
    event_parameters = connection.script.executions[1][1]
    assert "revision_rejected" in event_parameters
    assert event_parameters[-1] == "Usage rights were not demonstrated."


@pytest.mark.asyncio
async def test_repository_queries_lists_files_and_previous_published_revision() -> None:
    repository, _ = repository_with(
        [
            Reply(
                "FROM skill_registry.skills AS skill",
                all_rows=[(SKILL_ID, "demo-skill", 1, REVISION_ID, "pending_review", NOW)],
            ),
            Reply("FROM skill_registry.skill_revisions AS revision", one=stored_row()),
            Reply(
                "FROM skill_registry.skill_revision_files",
                all_rows=[("SKILL.md", "b" * 64, 7, "text/markdown")],
            ),
            Reply("revision.state = 'published'", one=None),
        ]
    )

    summaries = await repository.list_skills()
    revision = await repository.get_revision(SKILL_ID, REVISION_ID)
    files = await repository.list_revision_files(REVISION_ID)
    previous = await repository.find_previous_published(revision)

    assert summaries[0].slug == "demo-skill"
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

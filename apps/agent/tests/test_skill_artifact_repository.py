from __future__ import annotations

from collections import deque
from contextlib import asynccontextmanager
import io
import stat
from uuid import UUID
import zipfile

from pydantic import SecretStr
import pytest

from agent_service.skill_artifact_repository import (
    PostgresSkillArtifactRepository,
    SkillRuntimeRepositoryError,
)
from agent_service.skill_runtime_types import ActivateSkillSet, FailSkillSet
from skill_core import canonicalize_skill_zip


DATABASE_URL = "postgresql+psycopg_async://skill-runtime:do-not-leak@db:5432/platform"
SET_ID = UUID("10000000-0000-4000-8000-000000000001")
PREVIOUS_SET_ID = UUID("10000000-0000-4000-8000-000000000002")
SKILL_ID = UUID("20000000-0000-4000-8000-000000000001")
REVISION_ID = UUID("30000000-0000-4000-8000-000000000001")
ACTOR = UUID("40000000-0000-4000-8000-000000000001")
REQUEST_ID = UUID("50000000-0000-4000-8000-000000000001")


def package():
    output = io.BytesIO()
    files = {
        "demo-skill/SKILL.md": b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n",
        "demo-skill/scripts/run.py": b"#!/usr/bin/env python3\nprint('ok')\n",
    }
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            info = zipfile.ZipInfo(path, (2026, 7, 22, 12, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
    return canonicalize_skill_zip(output.getvalue())


def file_index() -> list[dict[str, object]]:
    return [
        {
            "path": file.path,
            "sha256": file.sha256,
            "size": file.size,
            "mediaType": (
                "text/markdown" if file.path.endswith(".md") else "text/x-python"
            ),
        }
        for file in package().files
    ]


def noncanonical_archive() -> bytes:
    output = io.BytesIO()
    files = {
        "demo-skill/scripts/run.py": b"#!/usr/bin/env python3\nprint('ok')\n",
        "demo-skill/SKILL.md": b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n",
    }
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    assert canonicalize_skill_zip(output.getvalue()) == package()
    assert output.getvalue() != package().archive
    return output.getvalue()


def set_row(*, state: str = "candidate") -> tuple[object, ...]:
    value = package()
    return (SET_ID, "maduoduo", state, 1, value.extracted_size)


def item_row(**changes: object) -> tuple[object, ...]:
    value = package()
    values: list[object] = [
        SET_ID,
        0,
        SKILL_ID,
        REVISION_ID,
        "demo-skill",
        value.sha256,
        value.compressed_size,
        value.extracted_size,
        len(value.files),
        value.archive,
        file_index(),
    ]
    indexes = {
        "set_id": 0,
        "ordinal": 1,
        "skill_id": 2,
        "revision_id": 3,
        "slug": 4,
        "sha256": 5,
        "compressed_size": 6,
        "extracted_size": 7,
        "file_count": 8,
        "archive": 9,
        "file_index": 10,
    }
    for name, replacement in changes.items():
        values[indexes[name]] = replacement
    return tuple(values)


class DatabaseFailure(RuntimeError):
    def __init__(self, sqlstate: str) -> None:
        self.sqlstate = sqlstate
        super().__init__("private database detail")


class Reply:
    def __init__(
        self,
        contains: str,
        *,
        one: tuple[object, ...] | None = None,
        many: list[tuple[object, ...]] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.contains = contains
        self.one = one
        self.many = many or []
        self.error = error


class FakeCursor:
    def __init__(self, replies: list[Reply]) -> None:
        self.replies = deque(replies)
        self.current: Reply | None = None
        self.executions: list[tuple[str, tuple[object, ...] | None]] = []

    async def __aenter__(self) -> FakeCursor:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(
        self, query: str, parameters: tuple[object, ...] | None = None
    ) -> None:
        assert self.replies, f"unexpected SQL: {query}"
        reply = self.replies.popleft()
        normalized = " ".join(query.split())
        assert reply.contains in normalized
        self.executions.append((normalized, parameters))
        self.current = reply
        if reply.error is not None:
            raise reply.error

    async def fetchone(self) -> tuple[object, ...] | None:
        assert self.current is not None
        return self.current.one

    async def fetchall(self) -> list[tuple[object, ...]]:
        assert self.current is not None
        return self.current.many


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self.fake_cursor = cursor

    def cursor(self) -> FakeCursor:
        return self.fake_cursor

    @asynccontextmanager
    async def transaction(self):
        yield None


class FakePool:
    def __init__(self, replies: list[Reply]) -> None:
        self.cursor = FakeCursor(replies)
        self.connection_value = FakeConnection(self.cursor)
        self.opened = 0
        self.closed = 0

    async def open(self, *, wait: bool) -> None:
        assert wait is True
        self.opened += 1

    async def close(self) -> None:
        self.closed += 1

    @asynccontextmanager
    async def connection(self):
        yield self.connection_value


async def repository_with(
    replies: list[Reply],
) -> tuple[PostgresSkillArtifactRepository, FakePool]:
    pool = FakePool(replies)

    def pool_factory(database_url: SecretStr) -> FakePool:
        assert database_url.get_secret_value() == DATABASE_URL
        return pool

    repository = PostgresSkillArtifactRepository(
        database_url=SecretStr(DATABASE_URL), pool_factory=pool_factory
    )
    await repository.open()
    return repository, pool


@pytest.mark.asyncio
async def test_load_candidate_returns_verified_ordered_canonical_package() -> None:
    repository, pool = await repository_with(
        [
            Reply("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"),
            Reply("FROM skill_registry.runtime_skill_sets", one=set_row()),
            Reply("FROM skill_registry.runtime_skill_set_items", many=[item_row()]),
        ]
    )

    loaded = await repository.load_candidate(SET_ID)
    await repository.aclose()

    assert loaded.set_id == SET_ID
    assert loaded.state == "candidate"
    assert loaded.item_count == 1
    assert loaded.items[0].ordinal == 0
    assert loaded.items[0].package == package()
    assert "PK" not in repr(loaded.items[0])
    assert pool.opened == pool.closed == 1


@pytest.mark.asyncio
async def test_load_active_uses_one_repeatable_read_snapshot() -> None:
    repository, _ = await repository_with(
        [
            Reply("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"),
            Reply(
                "FROM skill_registry.runtime_active_skill_set",
                one=("maduoduo", SET_ID, PREVIOUS_SET_ID, 7),
            ),
            Reply(
                "FROM skill_registry.runtime_skill_sets", one=set_row(state="active")
            ),
            Reply("FROM skill_registry.runtime_skill_set_items", many=[item_row()]),
        ]
    )

    loaded = await repository.load_active()

    assert loaded is not None
    assert loaded.state == "active"
    assert loaded.activation_version == 7
    assert loaded.previous_set_id == PREVIOUS_SET_ID


@pytest.mark.asyncio
async def test_load_active_without_pointer_returns_none() -> None:
    repository, _ = await repository_with(
        [
            Reply("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"),
            Reply("FROM skill_registry.runtime_active_skill_set", one=None),
        ]
    )

    assert await repository.load_active() is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "row",
    [
        item_row(ordinal=1),
        item_row(set_id=PREVIOUS_SET_ID),
        item_row(slug="wrong"),
        item_row(sha256="0" * 64),
        item_row(compressed_size=1),
        item_row(extracted_size=1),
        item_row(file_count=1),
        item_row(archive=b"not-a-zip"),
        item_row(archive=noncanonical_archive()),
        item_row(file_index=[]),
        item_row(file_index=[*file_index(), file_index()[0]]),
    ],
    ids=[
        "ordinal-gap",
        "wrong-set",
        "slug",
        "digest",
        "compressed-size",
        "extracted-size",
        "file-count",
        "archive",
        "noncanonical-archive",
        "file-index-missing",
        "file-index-duplicate",
    ],
)
async def test_candidate_rejects_every_artifact_or_row_mismatch(
    row: tuple[object, ...],
) -> None:
    repository, _ = await repository_with(
        [
            Reply("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"),
            Reply("FROM skill_registry.runtime_skill_sets", one=set_row()),
            Reply("FROM skill_registry.runtime_skill_set_items", many=[row]),
        ]
    )

    with pytest.raises(SkillRuntimeRepositoryError) as caught:
        await repository.load_candidate(SET_ID)

    assert caught.value.code == "artifact_invalid"
    assert caught.value.__cause__ is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("set_values", "items"),
    [
        ((SET_ID, "maduoduo", "candidate", 2, package().extracted_size), [item_row()]),
        (
            (SET_ID, "maduoduo", "candidate", 2, package().extracted_size * 2),
            [item_row(), item_row()],
        ),
        ((SET_ID, "other", "candidate", 1, package().extracted_size), [item_row()]),
        ((SET_ID, "maduoduo", "active", 1, package().extracted_size), [item_row()]),
        ((SET_ID, "maduoduo", "candidate", 17, 0), [item_row()] * 17),
        ((SET_ID, "maduoduo", "candidate", 1, 25 * 1024 * 1024), [item_row()]),
    ],
    ids=["count", "duplicate", "agent", "state", "too-many", "too-large"],
)
async def test_candidate_rejects_invalid_set_shape(
    set_values: tuple[object, ...], items: list[tuple[object, ...]]
) -> None:
    repository, _ = await repository_with(
        [
            Reply("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"),
            Reply("FROM skill_registry.runtime_skill_sets", one=set_values),
            Reply("FROM skill_registry.runtime_skill_set_items", many=items),
        ]
    )

    with pytest.raises(SkillRuntimeRepositoryError) as caught:
        await repository.load_candidate(SET_ID)
    assert caught.value.code == "artifact_invalid"


@pytest.mark.asyncio
async def test_mutations_call_only_runtime_functions_with_statement_timeout() -> None:
    repository, pool = await repository_with(
        [
            Reply("SET LOCAL statement_timeout = '5s'"),
            Reply("skill_registry.activate_agent_skill_set", one=(8,)),
            Reply("SET LOCAL statement_timeout = '5s'"),
            Reply("skill_registry.mark_agent_skill_set_failed", one=(True,)),
            Reply(
                "skill_registry.reconcile_agent_skill_activation",
                one=(SET_ID, None, 8, "active"),
            ),
        ]
    )
    activate = ActivateSkillSet(SET_ID, 7, ACTOR, REQUEST_ID, REQUEST_ID, "a" * 64)
    fail = FailSkillSet(
        SET_ID, 7, ACTOR, REQUEST_ID, REQUEST_ID, "b" * 64, "artifact_invalid"
    )

    assert await repository.activate(activate) == 8
    assert await repository.mark_failed(fail) is True
    reconciled = await repository.reconcile(SET_ID)

    assert reconciled.active_set_id == SET_ID
    assert reconciled.activation_version == 8
    assert reconciled.target_state == "active"
    assert all("agent_skill_sets" not in query for query, _ in pool.cursor.executions)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sqlstate", "code"),
    [
        ("40001", "activation_conflict"),
        ("23505", "activation_conflict"),
        ("22023", "artifact_invalid"),
        ("23514", "artifact_invalid"),
        ("57014", "activation_timeout"),
        ("99999", "storage_unavailable"),
    ],
)
async def test_mutation_errors_are_stable_and_scrubbed(
    sqlstate: str, code: str
) -> None:
    repository, _ = await repository_with(
        [
            Reply("SET LOCAL statement_timeout = '5s'"),
            Reply(
                "skill_registry.activate_agent_skill_set",
                error=DatabaseFailure(sqlstate),
            ),
        ]
    )

    with pytest.raises(SkillRuntimeRepositoryError) as caught:
        await repository.activate(
            ActivateSkillSet(SET_ID, 7, ACTOR, REQUEST_ID, REQUEST_ID, "a" * 64)
        )

    assert caught.value.code == code
    assert "private" not in str(caught.value)
    assert caught.value.__cause__ is None

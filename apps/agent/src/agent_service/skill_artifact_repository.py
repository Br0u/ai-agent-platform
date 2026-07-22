"""Read-only reviewed artifact access and restricted Skill activation calls."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
import mimetypes
import re
from typing import Any, Final, NoReturn, Protocol, cast
from uuid import UUID

from pydantic import SecretStr
from psycopg_pool import AsyncConnectionPool

from agent_service.skill_runtime_types import (
    ActivateSkillSet,
    FailSkillSet,
    ReconcileResult,
    RuntimeSetSnapshot,
    RuntimeSkillArtifact,
    RuntimeSkillFile,
    SkillSetState,
)
from skill_core import SkillPackageError, canonicalize_skill_zip
from skill_core.types import MAX_ARCHIVE_BYTES


_MAX_SET_ITEMS: Final = 16
_MAX_SET_EXTRACTED_BYTES: Final = 24 * 1024 * 1024
_SHA256: Final = re.compile(r"[0-9a-f]{64}\Z")
_SET_STATES: Final = frozenset(
    {"candidate", "active", "superseded", "failed", "discarded"}
)


class SkillRuntimeRepositoryError(RuntimeError):
    """A stable repository failure safe for control-plane mapping."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def _fail(code: str) -> NoReturn:
    raise SkillRuntimeRepositoryError(code) from None


class RuntimeCursor(Protocol):
    async def __aenter__(self) -> RuntimeCursor: ...

    async def __aexit__(self, *args: object) -> None: ...

    async def execute(
        self, query: str, parameters: tuple[object, ...] | None = None
    ) -> Any: ...

    async def fetchone(self) -> tuple[Any, ...] | None: ...

    async def fetchall(self) -> list[tuple[Any, ...]]: ...


class RuntimeConnection(Protocol):
    def cursor(self) -> RuntimeCursor: ...

    def transaction(self) -> AbstractAsyncContextManager[object]: ...


class RuntimePool(Protocol):
    async def open(self, *, wait: bool) -> None: ...

    async def close(self) -> None: ...

    def connection(self) -> AbstractAsyncContextManager[RuntimeConnection]: ...


PoolFactory = Callable[[SecretStr], RuntimePool]


def _psycopg_url(value: str) -> str:
    return value.replace("postgresql+psycopg_async://", "postgresql://", 1)


def _default_pool_factory(database_url: SecretStr) -> RuntimePool:
    conninfo = _psycopg_url(database_url.get_secret_value())
    try:
        pool = AsyncConnectionPool(
            conninfo=conninfo,
            min_size=1,
            max_size=4,
            open=False,
            timeout=2.0,
        )
    finally:
        conninfo = ""
    return cast(RuntimePool, pool)


class PostgresSkillArtifactRepository:
    """Use only runtime views and SECURITY DEFINER runtime functions."""

    def __init__(
        self,
        *,
        database_url: SecretStr,
        pool_factory: PoolFactory = _default_pool_factory,
    ) -> None:
        self._database_url = database_url
        self._pool_factory = pool_factory
        self._pool: RuntimePool | None = None

    async def open(self) -> None:
        if self._pool is not None:
            _fail("storage_unavailable")
        try:
            pool = self._pool_factory(self._database_url)
            await pool.open(wait=True)
            self._pool = pool
        except SkillRuntimeRepositoryError:
            raise
        except Exception:
            _fail("storage_unavailable")

    async def aclose(self) -> None:
        pool = self._pool
        self._pool = None
        if pool is None:
            return
        try:
            await pool.close()
        except Exception:
            _fail("storage_unavailable")

    def _pool_or_fail(self) -> RuntimePool:
        if self._pool is None:
            _fail("storage_unavailable")
        return self._pool

    async def probe(self) -> bool:
        try:
            async with self._pool_or_fail().connection() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute("SELECT 1")
                    row = await cursor.fetchone()
                    return row == (1,)
        except SkillRuntimeRepositoryError:
            raise
        except Exception:
            _fail("storage_unavailable")

    async def load_active(self) -> RuntimeSetSnapshot | None:
        try:
            async with self._pool_or_fail().connection() as connection:
                async with connection.transaction():
                    async with connection.cursor() as cursor:
                        await cursor.execute(
                            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
                        )
                        await cursor.execute(
                            """SELECT agent_id, active_set_id, previous_set_id, activation_version
                            FROM skill_registry.runtime_active_skill_set
                            WHERE agent_id = 'maduoduo'"""
                        )
                        pointer = await cursor.fetchone()
                        if pointer is None:
                            return None
                        if len(pointer) != 4 or pointer[0] != "maduoduo":
                            _fail("artifact_invalid")
                        active_set_id = _uuid(pointer[1])
                        previous_set_id = (
                            None if pointer[2] is None else _uuid(pointer[2])
                        )
                        activation_version = _integer(pointer[3], minimum=1)
                        return await self._load_set(
                            cursor,
                            active_set_id,
                            expected_state="active",
                            activation_version=activation_version,
                            previous_set_id=previous_set_id,
                        )
        except SkillRuntimeRepositoryError:
            raise
        except Exception:
            _fail("storage_unavailable")

    async def load_candidate(self, set_id: UUID) -> RuntimeSetSnapshot:
        if type(set_id) is not UUID:
            _fail("artifact_invalid")
        try:
            async with self._pool_or_fail().connection() as connection:
                async with connection.transaction():
                    async with connection.cursor() as cursor:
                        await cursor.execute(
                            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
                        )
                        return await self._load_set(
                            cursor,
                            set_id,
                            expected_state="candidate",
                        )
        except SkillRuntimeRepositoryError:
            raise
        except Exception:
            _fail("storage_unavailable")

    async def _load_set(
        self,
        cursor: RuntimeCursor,
        set_id: UUID,
        *,
        expected_state: SkillSetState,
        activation_version: int | None = None,
        previous_set_id: UUID | None = None,
    ) -> RuntimeSetSnapshot:
        await cursor.execute(
            """SELECT set_id, agent_id, state, item_count, total_extracted_size
            FROM skill_registry.runtime_skill_sets
            WHERE set_id = %s AND agent_id = 'maduoduo'""",
            (set_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            _fail("skill_set_not_found")
        if len(row) != 5:
            _fail("artifact_invalid")
        mapped_set_id = _uuid(row[0])
        state = row[2]
        item_count = _integer(row[3], minimum=0)
        total_extracted_size = _integer(row[4], minimum=0)
        if (
            mapped_set_id != set_id
            or row[1] != "maduoduo"
            or state != expected_state
            or state not in _SET_STATES
            or item_count > _MAX_SET_ITEMS
            or total_extracted_size > _MAX_SET_EXTRACTED_BYTES
        ):
            _fail("artifact_invalid")
        await cursor.execute(
            """SELECT set_id, ordinal, skill_id, revision_id, slug,
              artifact_sha256, compressed_size, extracted_size, file_count,
              archive_bytes, file_index
            FROM skill_registry.runtime_skill_set_items
            WHERE set_id = %s
            ORDER BY ordinal""",
            (set_id,),
        )
        rows = await cursor.fetchall()
        if len(rows) != item_count or len(rows) > _MAX_SET_ITEMS:
            _fail("artifact_invalid")
        items = tuple(
            _map_artifact(row, set_id=set_id, ordinal=index)
            for index, row in enumerate(rows)
        )
        if (
            len({item.skill_id for item in items}) != len(items)
            or len({item.revision_id for item in items}) != len(items)
            or len({item.slug for item in items}) != len(items)
            or sum(item.extracted_size for item in items) != total_extracted_size
        ):
            _fail("artifact_invalid")
        return RuntimeSetSnapshot(
            set_id,
            cast(SkillSetState, state),
            item_count,
            total_extracted_size,
            items,
            activation_version,
            previous_set_id,
        )

    async def activate(self, command: ActivateSkillSet) -> int:
        row = await self._mutation(
            """SELECT skill_registry.activate_agent_skill_set(
              'maduoduo', %s::uuid, %s::bigint, %s::uuid, %s::uuid, %s::uuid, %s::char(64)
            )""",
            (
                command.set_id,
                command.expected_activation_version,
                command.actor,
                command.request_id,
                command.assertion_nonce,
                command.request_fingerprint,
            ),
        )
        if len(row) != 1:
            _fail("storage_unavailable")
        return _integer(row[0], minimum=1)

    async def mark_failed(self, command: FailSkillSet) -> bool:
        row = await self._mutation(
            """SELECT skill_registry.mark_agent_skill_set_failed(
              'maduoduo', %s::uuid, %s::bigint, %s::uuid, %s::uuid, %s::uuid,
              %s::char(64), %s::text
            )""",
            (
                command.set_id,
                command.expected_activation_version,
                command.actor,
                command.request_id,
                command.assertion_nonce,
                command.request_fingerprint,
                command.failure_code,
            ),
        )
        if len(row) != 1 or type(row[0]) is not bool:
            _fail("storage_unavailable")
        return cast(bool, row[0])

    async def _mutation(
        self, query: str, parameters: tuple[object, ...]
    ) -> tuple[Any, ...]:
        try:
            async with self._pool_or_fail().connection() as connection:
                async with connection.transaction():
                    async with connection.cursor() as cursor:
                        await cursor.execute("SET LOCAL statement_timeout = '5s'")
                        await cursor.execute(query, parameters)
                        row = await cursor.fetchone()
                        if row is None:
                            _fail("storage_unavailable")
                        return row
        except SkillRuntimeRepositoryError:
            raise
        except Exception as error:
            _database_error(error)

    async def reconcile(self, set_id: UUID) -> ReconcileResult:
        if type(set_id) is not UUID:
            _fail("artifact_invalid")
        try:
            async with self._pool_or_fail().connection() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """SELECT active_set_id, previous_set_id, activation_version, target_state
                        FROM skill_registry.reconcile_agent_skill_activation(
                          'maduoduo', %s::uuid
                        )""",
                        (set_id,),
                    )
                    row = await cursor.fetchone()
                    if row is None or len(row) != 4:
                        _fail("storage_unavailable")
                    target_state = row[3]
                    if target_state is not None and target_state not in _SET_STATES:
                        _fail("artifact_invalid")
                    return ReconcileResult(
                        None if row[0] is None else _uuid(row[0]),
                        None if row[1] is None else _uuid(row[1]),
                        _integer(row[2], minimum=0),
                        cast(SkillSetState | None, target_state),
                    )
        except SkillRuntimeRepositoryError:
            raise
        except Exception:
            _fail("storage_unavailable")


def _uuid(value: object) -> UUID:
    try:
        parsed = UUID(str(value))
    except (AttributeError, TypeError, ValueError):
        _fail("artifact_invalid")
    return parsed


def _integer(value: object, *, minimum: int) -> int:
    if type(value) is not int or cast(int, value) < minimum:
        _fail("artifact_invalid")
    return cast(int, value)


def _map_file_index(value: object) -> tuple[RuntimeSkillFile, ...]:
    if type(value) is not list:
        _fail("artifact_invalid")
    result: list[RuntimeSkillFile] = []
    for entry in value:
        if type(entry) is not dict or set(entry) != {
            "path",
            "sha256",
            "size",
            "mediaType",
        }:
            _fail("artifact_invalid")
        path, sha256, size, media_type = (
            entry["path"],
            entry["sha256"],
            entry["size"],
            entry["mediaType"],
        )
        if (
            type(path) is not str
            or type(sha256) is not str
            or _SHA256.fullmatch(sha256) is None
            or type(size) is not int
            or size < 0
            or (media_type is not None and type(media_type) is not str)
        ):
            _fail("artifact_invalid")
        result.append(RuntimeSkillFile(path, sha256, size, media_type))
    if len({item.path for item in result}) != len(result):
        _fail("artifact_invalid")
    return tuple(result)


def _map_artifact(
    row: tuple[Any, ...], *, set_id: UUID, ordinal: int
) -> RuntimeSkillArtifact:
    if len(row) != 11:
        _fail("artifact_invalid")
    mapped_set_id = _uuid(row[0])
    mapped_ordinal = _integer(row[1], minimum=0)
    skill_id = _uuid(row[2])
    revision_id = _uuid(row[3])
    slug = row[4]
    artifact_sha256 = row[5]
    compressed_size = _integer(row[6], minimum=0)
    extracted_size = _integer(row[7], minimum=0)
    file_count = _integer(row[8], minimum=0)
    archive = row[9]
    file_index = _map_file_index(row[10])
    if (
        mapped_set_id != set_id
        or mapped_ordinal != ordinal
        or type(slug) is not str
        or not slug
        or type(artifact_sha256) is not str
        or _SHA256.fullmatch(artifact_sha256) is None
        or compressed_size > MAX_ARCHIVE_BYTES
        or extracted_size > _MAX_SET_EXTRACTED_BYTES
        or not 1 <= file_count <= 128
        or type(archive) is not bytes
    ):
        _fail("artifact_invalid")
    try:
        package = canonicalize_skill_zip(archive)
    except (SkillPackageError, TypeError, ValueError):
        _fail("artifact_invalid")
    expected_index = tuple(
        RuntimeSkillFile(
            file.path,
            file.sha256,
            file.size,
            mimetypes.guess_type(file.path)[0],
        )
        for file in package.files
    )
    if (
        package.slug != slug
        or package.manifest.name != slug
        or package.archive != archive
        or package.sha256 != artifact_sha256
        or package.compressed_size != compressed_size
        or package.extracted_size != extracted_size
        or len(package.files) != file_count
        or expected_index != file_index
    ):
        _fail("artifact_invalid")
    return RuntimeSkillArtifact(
        ordinal,
        skill_id,
        revision_id,
        slug,
        artifact_sha256,
        compressed_size,
        extracted_size,
        file_count,
        file_index,
        package,
    )


def _database_error(error: Exception) -> NoReturn:
    sqlstate = getattr(error, "sqlstate", None)
    if sqlstate in {"40001", "23505"}:
        _fail("activation_conflict")
    if sqlstate in {"22023", "23514"}:
        _fail("artifact_invalid")
    if sqlstate == "57014":
        _fail("activation_timeout")
    _fail("storage_unavailable")

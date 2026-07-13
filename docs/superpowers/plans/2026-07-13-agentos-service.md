# AgentOS Service and Database Boundary Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a locked, model-free Agno AgentOS service that starts in Docker, reports separate liveness/readiness/capability, and uses a least-privilege `agno` PostgreSQL schema without touching platform identity tables.

**Architecture:** Treat `apps/agent` as an independent Python service with its own `uv.lock`, tests, migration entrypoint, and hardened image. Provision separate migrator/runtime roles and run Agno's migration manager in a one-shot Compose service before AgentOS starts. Register no real model, Agent, or Skill in this phase; readiness can be true while capability remains `placeholder`.

**Tech Stack:** Python 3.13, Agno AgentOS, FastAPI, Pydantic Settings, PostgreSQL 18, psycopg, uv, pytest, Ruff, mypy, Docker Compose.

**Source spec:** `docs/superpowers/specs/2026-07-13-agentos-assistant-experience-design.md`

**Official references:** [AgentOS custom FastAPI](https://docs.agno.com/agent-os/custom-fastapi/overview), [AgentOS security](https://docs.agno.com/agent-os/security/overview), [PostgresDb](https://docs.agno.com/reference/storage/postgres), [MigrationManager](https://docs.agno.com/reference/storage/migrations).

---

## File structure

- `apps/agent/src/agent_service/config.py`: strict environment parsing only.
- `apps/agent/src/agent_service/database.py`: `AsyncPostgresDb(db_schema="agno")` factory only.
- `apps/agent/src/agent_service/migrate.py`: one-shot schema migration command using migrator credentials.
- `apps/agent/src/agent_service/app.py`: FastAPI/AgentOS composition and health endpoints.
- `apps/agent/src/agent_service/catalog.py`: empty model/Agent/Skill catalog with explicit placeholder capability.
- `infra/postgres/03-agno-roles.sql`: idempotent roles, schema ownership, cross-schema revokes, and backup grants.
- `infra/postgres/03-agno-roles.sh`: owner-executed bootstrap/upgrade wrapper for new and existing volumes.

## Chunk 1: Python service and storage seam

### Task 1: Scaffold a reproducible Python service

**Files:**
- Create: `apps/agent/.python-version`
- Create: `apps/agent/pyproject.toml`
- Create: `apps/agent/uv.lock`
- Create: `apps/agent/src/agent_service/__init__.py`
- Create: `apps/agent/src/agent_service/config.py`
- Create: `apps/agent/tests/test_config.py`
- Modify: `package.json`

- [ ] **Step 1: Initialize and lock dependencies**

From `apps/agent`, use `uv init --lib --python 3.13`, then add Agno, FastAPI, Uvicorn, Pydantic Settings, psycopg, and SQLAlchemy. Add pytest, pytest-asyncio, HTTPX, Ruff, and mypy as dev dependencies. Do not guess dependency versions in prose; commit the exact resolver output in `uv.lock` and use `uv sync --frozen` everywhere after this step.

- [ ] **Step 2: Write failing configuration tests**

```py
def test_runtime_requires_internal_security_key(monkeypatch):
    monkeypatch.delenv("OS_SECURITY_KEY", raising=False)
    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)

def test_placeholder_is_distinct_from_readiness(valid_env):
    settings = RuntimeSettings(_env_file=None)
    assert settings.capability == "placeholder"
    assert settings.agent_enabled is False
```

Define separate `RuntimeSettings` and `MigrationSettings` with a shared async-Postgres URL validator. Runtime reads only `OS_SECURITY_KEY` and `AGNO_DATABASE_URL`; migration reads only `AGNO_MIGRATOR_DATABASE_URL`. Test that each constructs successfully when the other role's URL is absent. Also test `AGNO_SCHEMA == "agno"`, positive health-cache values, and rejection of model/provider keys while `AGENT_ENABLED=false` is not required.

Require both runtime and migrator URLs to use `postgresql+psycopg_async://`; reject synchronous/unknown drivers. In this phase `AGENT_ENABLED=true` must fail configuration because there is no typed model/default-Agent configuration, and `capability` is derived—not accepted from an environment variable.

- [ ] **Step 3: Run and confirm RED**

```bash
uv --directory apps/agent run pytest tests/test_config.py -q
```

Expected: missing module/settings.

- [ ] **Step 4: Implement strict settings and root scripts**

Use `RuntimeSettings` with no default secret, fixed schema literal `agno`, `agent_enabled: bool = False`, and `capability` derived as `placeholder`. Use `MigrationSettings` only in `migrate.py`; runtime code must not import or instantiate it. Reject `agent_enabled=true` until a later plan introduces typed model/default-Agent configuration; no environment value may directly set capability. Validate both URL types through one shared async-psycopg validator. Add root scripts:

```json
{
  "agent:test": "uv --directory apps/agent run pytest -q",
  "agent:lint": "uv --directory apps/agent run ruff check .",
  "agent:typecheck": "uv --directory apps/agent run mypy src tests"
}
```

- [ ] **Step 5: Run and confirm GREEN**

```bash
pnpm agent:test -- tests/test_config.py
pnpm agent:lint
pnpm agent:typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/agent package.json
git commit -m "build(agent): scaffold locked Python service"
```

### Task 2: Build the model-free AgentOS application and health model

**Files:**
- Create: `apps/agent/src/agent_service/catalog.py`
- Create: `apps/agent/src/agent_service/database.py`
- Create: `apps/agent/src/agent_service/app.py`
- Create: `apps/agent/tests/test_catalog.py`
- Create: `apps/agent/tests/test_database.py`
- Create: `apps/agent/tests/test_app.py`
- Create: `apps/agent/src/agent_service/agents/README.md`
- Create: `apps/agent/src/agent_service/skills/README.md`

- [ ] **Step 1: Write failing catalog/database/app tests**

Require:

```py
assert build_catalog(settings).agents == []
assert build_catalog(settings).capability == "placeholder"
db = build_database(settings)
assert db.db_schema == "agno"
```

All health endpoints require `Authorization: Bearer <OS_SECURITY_KEY>`. With `TestClient`, assert missing/incorrect keys return 401; the correct key makes `/internal/health/live` return 200 and `/internal/health/ready` return 503 when the injected database probe fails. The safe status body contains only `live`, `ready`, `capability`, and `message`. Assert a discovered AgentOS route follows the same missing/incorrect/correct Bearer behavior. Inspect the running app's OpenAPI in the test rather than hard-coding an Agno route path that can drift.

Inject/capture the AgentOS constructor and assert the exact database returned by `build_database()` is passed as `db`, `auto_provision_dbs` is `False`, and the readiness probe uses that same database boundary.

- [ ] **Step 2: Run and confirm RED**

```bash
uv --directory apps/agent run pytest tests/test_catalog.py tests/test_database.py tests/test_app.py -q
```

Expected: modules do not exist.

- [ ] **Step 3: Implement the minimal AgentOS composition**

Instantiate `AsyncPostgresDb(db_url=settings.agno_database_url, db_schema="agno")`. Build a base FastAPI app whose internal live/ready routes use the same constant-time Bearer Security Key dependency, then pass the same object to `AgentOS(id="ai-agent-platform", agents=[], db=db, base_app=base_app, auto_provision_dbs=False)`. Reuse it for readiness. Protect every AgentOS/health route with `Authorization: Bearer <OS_SECURITY_KEY>` and test missing, incorrect, and correct keys. Do not register a model, Agent, Team, Workflow, knowledge base, or Skill.

- [ ] **Step 4: Run and confirm GREEN**

```bash
uv --directory apps/agent run pytest tests/test_catalog.py tests/test_database.py tests/test_app.py -q
uv --directory apps/agent run ruff check .
uv --directory apps/agent run mypy src tests
```

Expected: all pass; placeholder and ready remain separate fields.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src apps/agent/tests
git commit -m "feat(agent): add model-free AgentOS service"
```

### Task 3: Add an explicit Agno migration entrypoint

**Files:**
- Create: `apps/agent/src/agent_service/migrate.py`
- Create: `apps/agent/tests/test_migrate.py`

- [ ] **Step 1: Write failing unit tests around `MigrationManager`**

Inject the database and manager factory. Assert the command constructs `AsyncPostgresDb` with the validated async `AGNO_MIGRATOR_DATABASE_URL`, `db_schema="agno"`, and calls `await MigrationManager(db).up()` exactly once. Assert an exception returns a non-zero CLI exit and does not report ready.

- [ ] **Step 2: Run and confirm RED**

```bash
uv --directory apps/agent run pytest tests/test_migrate.py -q
```

Expected: migration module missing.

- [ ] **Step 3: Implement the one-shot migration command**

Keep migration credentials in a separate settings type so runtime cannot read them. Call Agno's public `MigrationManager.up()` API. Do not call migration from `app.py` and do not enable silent runtime DDL.

- [ ] **Step 4: Run and confirm GREEN**

```bash
uv --directory apps/agent run pytest tests/test_migrate.py -q
```

Expected: injected migration command tests pass. PostgreSQL idempotency waits until the real roles exist in Task 4.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/agent_service/migrate.py apps/agent/tests/test_migrate.py
git commit -m "feat(agent): add explicit Agno schema migration"
```

## Chunk 2: PostgreSQL roles, Docker, backup, and CI

### Task 4: Provision least-privilege Agno database roles

**Files:**
- Create: `infra/postgres/03-agno-roles.sql`
- Create: `infra/postgres/03-agno-roles.sh`
- Modify: `infra/postgres/01-roles.sql`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Create: `packages/database/src/agno-role-boundary.integration.test.ts`
- Create: `apps/agent/tests/test_migrate_postgres.py`
- Modify: `.env.example`

- [ ] **Step 1: Write failing deployment and integration tests**

Static contracts must require `ai_agent_agno_migrator`, `ai_agent_agno`, schema `agno`, cross-schema revokes, backup SELECT, and an owner-executed idempotent wrapper. Integration tests must prove:

```sql
SELECT has_schema_privilege('ai_agent_agno', 'public', 'USAGE'); -- false
SELECT has_schema_privilege('ai_agent_agno_migrator', 'public', 'USAGE'); -- false

SET ROLE ai_agent_agno;
SELECT * FROM public.users;              -- permission denied
CREATE TABLE agno.forbidden(id int);     -- permission denied

SET ROLE ai_agent_runtime;
SELECT * FROM agno.agno_sessions;        -- permission denied

SET ROLE ai_agent_backup;
SELECT * FROM agno.agno_sessions;        -- allowed
```

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/database test -- src/deployment-contracts.test.ts src/agno-role-boundary.integration.test.ts
```

Expected: role/schema files and env variables missing.

- [ ] **Step 3: Implement idempotent roles and grants**

`03-agno-roles.sql` creates/updates both Agno passwords and creates `agno` owned by the migrator. It executes `REVOKE USAGE ON SCHEMA public FROM PUBLIC`, then explicitly restores required `public` access to the platform migrator/runtime/backup roles; it also executes `REVOKE ALL ON SCHEMA agno FROM PUBLIC` before precise grants. Set default privileges as the actual object creator:

```sql
SET ROLE ai_agent_agno_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_agent_agno;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT USAGE, SELECT ON SEQUENCES TO ai_agent_agno;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT SELECT ON TABLES TO ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  REVOKE USAGE, UPDATE ON SEQUENCES FROM ai_agent_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT SELECT ON SEQUENCES TO ai_agent_backup;
RESET ROLE;
```

After migrations, apply equivalent current-object grants: runtime DML/sequence usage, backup table SELECT, and backup sequence SELECT after explicitly revoking sequence USAGE/UPDATE. The wrapper accepts owner credentials and is safe for a fresh or existing volume. Add independent async `AGNO_MIGRATOR_DATABASE_URL`, `AGNO_DATABASE_URL`, and passwords to `.env.example`; never add real values.

- [ ] **Step 4: Run real migrations twice and confirm GREEN**

Run the wrapper twice against the isolated test database, then run Agno `MigrationManager.up()` twice through `tests/test_migrate_postgres.py`. Assert `agno.agno_sessions` and `agno.agno_schema_versions` remain, runtime DML succeeds, runtime DDL fails, and both cross-schema access tests fail closed. Have the migrator create a new post-bootstrap fixture table plus identity/sequence; prove runtime inherits required DML/sequence usage while backup inherits table/sequence SELECT but not sequence USAGE/UPDATE. This demonstrates defaults are owned by the object creator. Then run Step 2 plus:

```bash
uv --directory apps/agent run pytest tests/test_migrate_postgres.py -q
```

Expected: both bootstraps, both migrations, and all boundary tests pass.

- [ ] **Step 5: Commit**

```bash
git add infra/postgres packages/database/src/deployment-contracts.test.ts packages/database/src/agno-role-boundary.integration.test.ts apps/agent/tests/test_migrate_postgres.py .env.example
git commit -m "feat(database): isolate Agno schema roles"
```

### Task 5: Add hardened AgentOS services to Compose

**Files:**
- Create: `apps/agent/Dockerfile`
- Create: `apps/agent/.dockerignore`
- Modify: `compose.yaml`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write failing container contract tests**

Assert Compose has `agno-bootstrap`, `agent-migrate`, and `agent`; bootstrap uses owner credentials only for the idempotent role/schema upgrade, migration waits for bootstrap success, and runtime waits for migration success. Use the same `agno-bootstrap` path for fresh and existing volumes—do not mount 03 into initdb. Agent exposes only to backend, has no `ports`, runs non-root, sets `read_only`, bounded `/tmp` tmpfs, `no-new-privileges`, `cap_drop: ALL`, health check, and resource limits. Assert its command binds `0.0.0.0:7777` and the Python healthcheck calls `/internal/health/ready` with `Authorization: Bearer $OS_SECURITY_KEY`; the secret must not appear as a literal in Compose. Assert the Dockerfile uses a pinned Python base, `uv sync --frozen --no-dev`, copies only required files, and ends as a non-root user.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/database test -- src/deployment-contracts.test.ts
```

Expected: missing services/image contracts.

- [ ] **Step 3: Implement Dockerfile and dependency order**

Use one builder and one runtime stage. Add a one-shot `agno-bootstrap` based on the pinned PostgreSQL client image, dependent on `db: service_healthy`, mounting only `03-agno-roles.sh/sql`; this is the sole fresh/existing path and, apart from the database container itself, the only service receiving owner credentials. `agent-migrate` receives only `AGNO_MIGRATOR_DATABASE_URL`; `agent` receives only `AGNO_DATABASE_URL` and `OS_SECURITY_KEY`. Start AgentOS on `0.0.0.0:7777`, and make readiness—not liveness—the Compose health check. Production has `expose: ["7777"]` on backend only. Make `backup` wait for successful `agent-migrate` as well as platform migration, so the first dump cannot race the Agno schema. Add a development-only `compose.dev.yaml` override if host API docs are needed; never publish 7777 in production Compose.

- [ ] **Step 4: Add Python CI gates**

Pin the official `astral-sh/setup-uv` action by commit SHA and extend masked CI fixtures with Agno role passwords and `OS_SECURITY_KEY`. The CI order must be explicit:

1. generate all secrets and async Agno URLs;
2. run existing `01-roles.sh`;
3. run platform `db:prepare`;
4. run `03-agno-roles.sh` twice;
5. `uv sync --frozen`;
6. run Python migration twice;
7. run role-boundary and backup-grant integration tests;
8. run pytest, Ruff, mypy, and build the Agent image.

- [ ] **Step 5: Validate and confirm GREEN**

```bash
docker compose config --quiet
docker build -f apps/agent/Dockerfile .
pnpm --filter @ai-agent-platform/database test -- src/deployment-contracts.test.ts
```

Expected: all exit `0`; `docker compose config` shows no AgentOS host port.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/Dockerfile apps/agent/.dockerignore compose.yaml .github/workflows/ci.yml packages/database/src/deployment-contracts.test.ts
git commit -m "build(agent): harden AgentOS container services"
```

### Task 6: Extend backup, restore, and operations documentation

**Files:**
- Modify: `infra/docker/backup.sh`
- Modify: `infra/docker/restore-drill.sh`
- Modify: `infra/docker/README.md`
- Modify: `docs/deployment/server-readiness.md`
- Modify: `docs/architecture/system-design.md`
- Modify: `README.md`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Create: `docs/testing/run-agentos-backup-restore.sh`

- [ ] **Step 1: Write failing backup/restore contracts**

Require the backup role to dump `public`, `drizzle`, and `agno`; require the restore drill to assert `to_regclass('agno.agno_sessions') IS NOT NULL`, `to_regclass('agno.agno_schema_versions') IS NOT NULL`, and a restored row/count contract without printing message bodies. Require documented existing-volume upgrade command and service order: `db → platform migrate → agno-bootstrap → agent-migrate → agent → web → proxy/backup`; backup must depend on Agno migration completion.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/database test -- src/deployment-contracts.test.ts
```

Expected: restore and runbook do not mention Agno.

- [ ] **Step 3: Implement backup and restore coverage**

Keep one encrypted/permissioned dump path. Extend restore validation to the Agno schema and schema version, not message contents. Document rollback: stop agent, restore last dump, run the pinned migration command, verify readiness, then restart Web integration. Create `run-agentos-backup-restore.sh` with an isolated Compose project name, ignored random env file, and EXIT/INT/TERM cleanup trap that always runs `down -v --remove-orphans`.

- [ ] **Step 4: Run a real disposable restore drill**

The script must: validate Compose config; build current migrator/Agent/backup images; start isolated `db`, platform migration, `agno-bootstrap`, and `agent-migrate`; start `agent` and `backup`; poll the isolated `backup_data` volume for the first generated dump; copy that dump through a pinned helper image into a `mktemp -d` directory; call `infra/docker/restore-drill.sh` on the generated path; and clean both stack volumes and temp files on every exit.

Do not publish port 7777 for acceptance. Poll ready with a bounded retry loop (for example 30 × 1 second) using `docker compose -p "$project" ... exec -T agent python -c ...`; the in-container request targets `http://127.0.0.1:7777/internal/health/ready`, reads `OS_SECURITY_KEY` from the container environment, sends the Bearer header, and asserts both HTTP 200 and JSON `{"ready":true,"capability":"placeholder"}` before proceeding.

Run:

```bash
sh docs/testing/run-agentos-backup-restore.sh
```

Expected: the isolated AgentOS ready endpoint is true, capability is placeholder, the generated dump contains both platform and Agno schemas, restore drill exits `0`, and no test volume remains.

- [ ] **Step 5: Run all gates and commit**

```bash
pnpm agent:test
pnpm agent:lint
pnpm agent:typecheck
pnpm --filter @ai-agent-platform/database test
docker compose config --quiet
git add infra/docker docs/testing/run-agentos-backup-restore.sh docs/deployment/server-readiness.md docs/architecture/system-design.md README.md packages/database/src/deployment-contracts.test.ts
git commit -m "docs(agent): add AgentOS operations and restore runbook"
```

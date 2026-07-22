# 码多多 Skill Runtime 安全 MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理员把零到十六个已发布 Skill revision 组成不可变集合，并由单实例码多多安全加载、原子切换、状态对账和回滚。

**Architecture:** Skill Registry 保存不可变 candidate、active/previous 指针和受限 CAS；Agent 使用独立 runtime 角色复验 artifact，物化到 96 MiB tmpfs，并通过固定 `AgentFactory`、generation 租约和 coordinator 切换 Skills。Web 只做权限、MFA、编排和状态展示，不传 ZIP 或源码。

**Tech Stack:** PostgreSQL 18、Python 3.13、Agno 2.7.2、FastAPI/ASGI、psycopg 3、Next.js 16、React 19、TypeScript 5.9、Vitest、Pytest、Docker Compose。

---

**Spec:** `docs/superpowers/specs/2026-07-22-maduoduo-skill-runtime-mvp-design.md`

**Supersedes for implementation:** `docs/superpowers/plans/2026-07-20-maduoduo-skill-runtime-activation.md`

**Out of scope:** Git Provider、Webhook、Marketplace、多 Agent、多 AgentOS 实例、WebSocket run、脚本沙箱。

**Mandatory workflow skills:** `@test-driven-development` for every behavior change, `@verification-before-completion` before every task completion, and `@requesting-code-review` after each chunk.

## File responsibility map

### Registry

- `schema.py` / `migrate.py`: versioned immutable SQL and migration verification only.
- `skill_set_schema.py`: schema v3 set tables, views, functions and verification constants only.
- `types.py`: frozen command/result DTOs and stable error codes.
- `repository.py`: existing revision SQL only.
- `skill_set_repository.py`: candidate/status/discard/rollback SQL transactions only.
- `service.py`: candidate rules and state-machine orchestration.
- `skill_set_api.py`: bounded set request parsing and routes only.
- `api.py` / `auth.py`: route composition and signed assertion boundary.

### Agent

- `skill_runtime_types.py`: immutable generation/status/error contracts.
- `skill_artifact_repository.py`: runtime-view reads and CAS calls only.
- `skill_materializer.py`: fd-relative artifact verification and tmpfs writes only.
- `skill_generation_slot.py`: current generation, reference counts and retired cleanup only.
- `skill_agent_factory.py`: `ContextVar`, instructions and per-request Agent construction only.
- `skill_runtime_middleware.py`: exact route guard and HTTP/SSE lease lifetime only.
- `skill_activation_coordinator.py`: prepare/CAS/reconcile state machine only.
- `skill_control_auth.py` / `skill_control_api.py`: signed internal control boundary only.

### Web

- `admin-skill-runtime-contract.ts`: strict public DTO parser only.
- `agent-skill-control-client.ts`: pinned private Agent transport and assertions only.
- `admin-skill-runtime-commands.ts`: permission/MFA and Registry→Agent orchestration only.
- `assistant-skill-configuration-panel.tsx`: selection, activation, rollback, discard and status UI only.

## Chunk 1: Registry baseline、schema 和 candidate API

### Task 1: 收口当前上传/审核分支并恢复全绿基线

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/api.py:406-412`
- Modify: `apps/skill-registry/tests/test_api.py`
- Verify and commit existing changes: `apps/web/README.md`
- Verify and commit existing changes: `apps/web/package.json`
- Verify and commit existing changes: `apps/web/scripts/run-dev.mjs`
- Verify and commit existing changes: `apps/web/src/server/dev/dev-web-environment.mts`
- Verify and commit existing changes: `apps/web/src/server/dev/dev-web-environment.test.ts`
- Verify and commit existing changes: `apps/web/src/server/assistant/skill-registry-client.ts`
- Verify and commit existing changes: `apps/web/src/server/assistant/skill-registry-client.test.ts`
- Verify and commit existing changes: `apps/web/src/app/api/v1/admin/assistant/skills/handler.ts`
- Verify and commit existing changes: `apps/web/src/app/api/v1/admin/assistant/skills/uploads/route.test.ts`
- Verify and commit existing changes: `apps/web/src/components/admin/assistant-skill-upload-dialog.tsx`
- Verify and commit existing changes: `apps/web/src/components/admin/assistant-skill-upload-dialog.test.tsx`
- Verify and commit existing changes: `infra/docker/compose.skill-registry-dev-proxy.yaml`
- Verify and commit existing changes: `package.json`

- [ ] **Step 1: 固化 API 字段失败测试**

在 `test_upload_and_review_forward_verified_assertion_context` 继续提交外部 JSON `independentReviewerConfirmed: true`，并断言 service 收到：

```python
assert service.reviewed is not None
assert service.reviewed.attestations.reviewer_authorization_confirmed is True
```

- [ ] **Step 2: 运行红灯**

Run: `uv --directory apps/skill-registry run pytest tests/test_api.py::test_upload_and_review_forward_verified_assertion_context -q`

Expected: FAIL with `unexpected keyword argument 'independent_reviewer_confirmed'`.

- [ ] **Step 3: 修复边界映射**

保留现有外部 JSON 字段以兼容 Web，只把 Python DTO 构造参数改为：

```python
ReviewAttestations(
    content_reviewed=cast(bool, attestations["contentReviewed"]),
    usage_rights_confirmed=cast(bool, attestations["usageRightsConfirmed"]),
    execution_risk_accepted=cast(bool, attestations["executionRiskAccepted"]),
    reviewer_authorization_confirmed=cast(
        bool, attestations["independentReviewerConfirmed"]
    ),
)
```

- [ ] **Step 4: 跑 Registry 和 Web 定向绿灯**

Run: `uv --directory apps/skill-registry run pytest tests/test_api.py tests/test_service.py tests/test_repository.py -q`

Run: `pnpm --dir apps/web exec vitest run src/server/dev/dev-web-environment.test.ts src/server/assistant/skill-registry-client.test.ts src/app/api/v1/admin/assistant/skills/uploads/route.test.ts src/components/admin/assistant-skill-upload-dialog.test.tsx`

Expected: all PASS, zero failed.

- [ ] **Step 5: 跑完整静态与 Compose 基线**

Run: `uv --directory apps/skill-registry run pytest -q`

Run: `uv --directory apps/skill-registry run ruff check . && uv --directory apps/skill-registry run ruff format --check . && uv --directory apps/skill-registry run mypy src`

Run: `pnpm --dir apps/web test && pnpm --dir apps/web typecheck && pnpm --dir apps/web lint && pnpm --dir apps/web format:check`

Run: `docker compose --env-file .env.example -f compose.yaml -f infra/docker/compose.skill-registry-dev-proxy.yaml config --quiet`

Run: `git diff --check`

Expected: all PASS. 若 mypy 暴露已知基线错误，先单独修复或记录为 blocker，不能忽略后宣布全绿。

- [ ] **Step 6: 跑真实 PostgreSQL 基线门禁**

Precondition: export `SKILL_REGISTRY_TEST_DATABASE_URL`, `SKILL_REGISTRY_MIGRATOR_DATABASE_URL`, `SKILL_REGISTRY_DATABASE_URL`, `SKILL_REGISTRY_RUNTIME_DATABASE_URL` for the isolated test database.

Run: `uv --directory apps/skill-registry run pytest tests/test_migrate_postgres.py tests/test_repository_postgres.py -q`

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/skill-registry-role-boundary.integration.test.ts`

Expected: PASS with zero skipped. A missing DSN is a blocked gate, not success.

- [ ] **Step 7: 重建最新 Registry 并重跑 ZIP 审核 E2E**

Run: `bash docs/testing/run-skill-registry-e2e.sh`

Expected: runner 自行隔离构建最新镜像，并完成 ZIP upload → pending_review → 当前权限规则审核 → published；E2E PASS 且不复用旧容器镜像。

- [ ] **Step 8: 分离提交现有功能修复**

先只暂存 Web/local-dev/upload files，确认 `git diff --cached --name-only` 不含 Registry Python，再提交：

```bash
git commit -m "fix(skills): stabilize local registry administration"
```

再只暂存 `api.py` 和 `test_api.py`，提交：

```bash
git commit -m "fix(skills): align review authorization mapping"
```

### Task 2: 建立 Skill set schema、角色边界和受限状态转换

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/schema.py`
- Create: `apps/skill-registry/src/skill_registry/skill_set_schema.py`
- Modify: `apps/skill-registry/src/skill_registry/migrate.py`
- Modify: `apps/skill-registry/tests/test_schema.py`
- Modify: `apps/skill-registry/tests/test_migrate.py`
- Modify: `apps/skill-registry/tests/test_migrate_postgres.py`
- Modify: `infra/postgres/05-skill-registry-roles.sql`
- Modify: `infra/postgres/05-skill-registry-roles.sh`
- Modify: `packages/database/src/skill-registry-role-boundary.integration.test.ts`

- [ ] **Step 1: 写 tables/views schema v3 红灯合同**

断言 schema version 递增且只新增：

```text
agent_skill_sets
agent_skill_set_items
active_agent_skill_sets
skill_set_control_events
runtime_active_skill_set
runtime_skill_sets
runtime_skill_set_items
manager_active_skill_set
manager_skill_sets
manager_skill_set_items
```

固定 set state 为 `candidate|active|superseded|failed|discarded`。精确列和键：

```text
agent_skill_sets:
  id uuid PK; agent_id='maduoduo'; set_no bigint; state;
  created_by uuid; request_id uuid; request_fingerprint char(64);
  item_count smallint 0..16; total_extracted_size bigint 0..25165824;
  failure_code varchar(64) nullable;
  created_at; activated_at; failed_at; discarded_at;
  UNIQUE(id,agent_id); UNIQUE(agent_id,set_no);
  UNIQUE(created_by,agent_id,request_id)

agent_skill_set_items:
  set_id uuid; agent_id='maduoduo'; ordinal smallint 0..15;
  skill_id uuid; skill_revision_id uuid;
  PRIMARY KEY(set_id,ordinal); UNIQUE(set_id,skill_id);
  UNIQUE(set_id,skill_revision_id);
  FOREIGN KEY(set_id,agent_id) -> agent_skill_sets(id,agent_id);
  FOREIGN KEY(skill_revision_id,skill_id) -> skill_revisions(id,skill_id)

active_agent_skill_sets:
  agent_id='maduoduo' PK; active_set_id uuid NOT NULL;
  previous_set_id uuid nullable; activation_version bigint > 0; updated_at;
  FOREIGN KEY(active_set_id,agent_id) -> agent_skill_sets(id,agent_id);
  FOREIGN KEY(previous_set_id,agent_id) -> agent_skill_sets(id,agent_id)

skill_set_control_events:
  id uuid PK; actor uuid; action varchar(64); event_type varchar(32);
  target varchar(160) NOT NULL; request_id uuid; assertion_nonce uuid NOT NULL UNIQUE;
  request_fingerprint char(64);
  result_set_id uuid nullable; result_set_state varchar(24) nullable;
  result_activation_version bigint nullable; error_code varchar(64) nullable;
  created_at; UNIQUE(actor,action,target,request_id)
```

三个 runtime view 精确投影：

```text
runtime_active_skill_set:
  agent_id, active_set_id, previous_set_id, activation_version
runtime_skill_sets:
  set_id, agent_id, state, item_count, total_extracted_size
runtime_skill_set_items:
  set_id, ordinal, skill_id, revision_id, slug, artifact_sha256,
  compressed_size, extracted_size, file_count, archive_bytes,
  file_index (ordered JSON array of path/sha256/size/mediaType)

manager_active_skill_set:
  agent_id, active_set_id, previous_set_id, activation_version
manager_skill_sets:
  set_id, agent_id, set_no, state, created_by, item_count,
  total_extracted_size, failure_code, created_at, activated_at,
  failed_at, discarded_at
manager_skill_set_items:
  set_id, ordinal, skill_id, revision_id, slug, revision_no,
  artifact_sha256, extracted_size (never archive_bytes)
```

- [ ] **Step 2: 运行 tables/views 红灯**

Run: `uv --directory apps/skill-registry run pytest tests/test_schema.py tests/test_migrate.py -q -k 'skill_set_tables or skill_set_views'`

Expected: FAIL because schema v3 objects do not exist.

- [ ] **Step 3: 实现 tables/views 并跑第一组绿灯**

`schema.py` 只把 `skill_set_schema.py` 的 immutable v3 SQL 加入迁移序列。manager 不得直接 INSERT/UPDATE/DELETE set 表或 `skill_set_control_events`，只能调用后续 manager functions 和 SELECT 三个 manager views；runtime 只能 SELECT 三个 runtime views，且同样不能直接写私有事件表。deferred constraint trigger 重算 item 数量和总大小，拒绝重复 `skill_id`、非 published revision 和超过限制。`ai_agent_backup` 只获得 set/items/active pointer/private set events/artifacts SELECT，不能 INSERT/UPDATE/DELETE 或执行 manager/runtime functions。

Run: `uv --directory apps/skill-registry run pytest tests/test_schema.py tests/test_migrate.py -q -k 'skill_set_tables or skill_set_views'`

Expected: tables/views/immutability PASS; function tests remain RED.

- [ ] **Step 4: 写 activation/failure/reconcile 函数红灯**

测试 stale version、重复 request replay、相同 request 不同 fingerprint、并发 CAS、CAS 时 revision 已归档、active+previous 归档保护、result unknown reconcile 和 PUBLIC/manager 无执行权。

Run: `uv --directory apps/skill-registry run pytest tests/test_migrate_postgres.py -q -k 'activation_function or failure_function or reconcile_function or set_replay or active_archive'`

Expected: FAIL because functions and event replay fields do not exist.

- [ ] **Step 5: 实现三个 runtime SECURITY DEFINER 函数**

函数必须 `SET search_path=pg_catalog,skill_registry`、由 migrator owner 持有、`REVOKE ALL FROM PUBLIC`，并在入口验证 `session_user='ai_agent_skill_registry_runtime'`。

```sql
activate_agent_skill_set(
  p_agent_id text,
  p_set_id uuid,
  p_expected_activation_version bigint,
  p_actor uuid,
  p_request_id uuid,
  p_assertion_nonce uuid,
  p_request_fingerprint char(64)
) returns bigint

mark_agent_skill_set_failed(
  p_agent_id text,
  p_set_id uuid,
  p_expected_activation_version bigint,
  p_actor uuid,
  p_request_id uuid,
  p_assertion_nonce uuid,
  p_request_fingerprint char(64),
  p_failure_code text
) returns boolean

reconcile_agent_skill_activation(
  p_agent_id text,
  p_target_set_id uuid
) returns table(active_set_id uuid, previous_set_id uuid,
                activation_version bigint, target_state text)
```

不要复用 manager 可写的既有 `skill_control_events` 做 replay 依据。新增私有 `skill_set_control_events`，对 manager/runtime/PUBLIC 均不授予直接 DML；只有本任务的 SECURITY DEFINER 函数可以写。`target` 保存 assertion 的非空 canonical target，避免 nullable target 绕过幂等唯一性；`assertion_nonce uuid NOT NULL UNIQUE` 作为 set mutation 的私有 nonce ledger。固定 event type 为 `skill_set_created|skill_set_discarded|skill_set_cloned|skill_set_activated|skill_set_failed`，`request_fingerprint` 必须匹配 `^[0-9a-f]{64}$`。逐 event type 做精确 CHECK：created/cloned/discarded/failed 只能保存对应合法 `result_set_state` 且 activation version 为 NULL；activated 必须保存 `result_set_state='active'` 和正整数 version；不适用的 result/error 列必须为 NULL。执行顺序固定为：先按 actor/action/target/request 查 replay；同 fingerprint 且同 nonce 返回保存结果，fingerprint 或 nonce 不同则抛 idempotency conflict；无 replay 时先拒绝已使用 nonce，再取得业务锁并变更。测试跨 set mutation 重复 nonce、相同 request replay、不同 fingerprint/nonce 冲突，以及 manager/runtime/PUBLIC 不能伪造 replay event。`activate` 同一事务重新确认全部 revision 仍为 `published`，更新 active/previous，消费 nonce和写事件。revision trigger 禁止归档 active 或 immediate previous 使用的 revision。

Run: `uv --directory apps/skill-registry run pytest tests/test_migrate_postgres.py -q -k 'activation_function or failure_function or reconcile_function or set_replay or active_archive'`

Expected: runtime function/replay tests PASS; manager create/discard tests remain RED.

- [ ] **Step 6: 写 manager create/discard/clone/backup 红灯**

测试 create/discard/clone exact result、replay、21st quota、manager 基础表和私有事件表 DML 拒绝、runtime/PUBLIC 执行拒绝，以及 backup SELECT 成功但 DML/函数执行拒绝。clone 必须在锁内校验 expected activation version 和 expected previous set ID；并发切换 active pointer 时只能完整成功或以 stale version 失败，不能克隆错误 previous。

Run: `uv --directory apps/skill-registry run pytest tests/test_migrate_postgres.py -q -k 'manager_create or manager_discard or manager_clone or backup_skill_set'`

Expected: FAIL because manager functions/grants are absent.

- [ ] **Step 7: 实现 manager create/discard/clone 并跑绿灯**

固定签名：

```sql
create_agent_skill_set(
  p_agent_id text, p_revision_ids uuid[], p_actor uuid,
  p_request_id uuid, p_assertion_nonce uuid,
  p_request_fingerprint char(64)
) returns table(set_id uuid, replayed boolean,
                item_count smallint, total_extracted_size bigint)

discard_agent_skill_set(
  p_agent_id text, p_set_id uuid, p_actor uuid,
  p_request_id uuid, p_assertion_nonce uuid,
  p_request_fingerprint char(64)
) returns table(set_id uuid, state text, replayed boolean)

clone_previous_agent_skill_set(
  p_agent_id text,
  p_expected_activation_version bigint,
  p_expected_previous_set_id uuid,
  p_actor uuid, p_request_id uuid, p_assertion_nonce uuid,
  p_request_fingerprint char(64)
) returns table(set_id uuid, replayed boolean,
                item_count smallint, total_extracted_size bigint)
```

create 在 SECURITY DEFINER 内取得固定 advisory transaction lock，通过 `unnest(... WITH ORDINALITY)` 原样保存调用方顺序，拒绝第 21 个 candidate、非法 item count 和重复输入；discard 只允许 `candidate -> discarded`，写事件且不删除 set/items。clone 在同一 advisory lock/事务内锁 active pointer，重新校验 expected version 和 expected previous ID，再按原 ordinal 克隆为全新 candidate。三者通过私有事件表实现 fingerprint replay；manager 仍无基础表或事件表 DML 权限。

Run: `uv --directory apps/skill-registry run pytest tests/test_migrate_postgres.py -q -k 'manager_create or manager_discard or manager_clone or backup_skill_set'`

Expected: PASS.

- [ ] **Step 8: 跑完整 PostgreSQL 权限、并发和恢复绿灯**

Run: `uv --directory apps/skill-registry run pytest tests/test_schema.py tests/test_migrate.py tests/test_migrate_postgres.py -q`

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/skill-registry-role-boundary.integration.test.ts`

Expected: zero failed/skipped; manager/runtime/PUBLIC/backup negative paths, concurrent CAS, result reconciliation, active+previous archive protection, empty set and candidate quota all PASS.

- [ ] **Step 9: 提交 schema 边界**

```bash
git add apps/skill-registry/src/skill_registry/schema.py apps/skill-registry/src/skill_registry/skill_set_schema.py apps/skill-registry/src/skill_registry/migrate.py apps/skill-registry/tests/test_schema.py apps/skill-registry/tests/test_migrate.py apps/skill-registry/tests/test_migrate_postgres.py infra/postgres/05-skill-registry-roles.sql infra/postgres/05-skill-registry-roles.sh packages/database/src/skill-registry-role-boundary.integration.test.ts
git commit -m "feat(skills): add runtime set state machine"
```

### Task 3: 实现 candidate、status、discard 和 rollback Registry API

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/types.py`
- Modify: `apps/skill-registry/src/skill_registry/repository.py`
- Create: `apps/skill-registry/src/skill_registry/skill_set_repository.py`
- Modify: `apps/skill-registry/src/skill_registry/service.py`
- Modify: `apps/skill-registry/src/skill_registry/auth.py`
- Modify: `apps/skill-registry/src/skill_registry/api.py`
- Create: `apps/skill-registry/src/skill_registry/skill_set_api.py`
- Create: `apps/skill-registry/tests/test_types.py`
- Modify: `apps/skill-registry/tests/test_repository.py`
- Modify: `apps/skill-registry/tests/test_repository_postgres.py`
- Modify: `apps/skill-registry/tests/test_service.py`
- Modify: `apps/skill-registry/tests/test_auth.py`
- Modify: `apps/skill-registry/tests/test_api.py`

- [ ] **Step 1: 写 frozen DTO 和 service 红灯**

在 `types.py` 定义：

```python
SkillSetState = Literal["candidate", "active", "superseded", "failed", "discarded"]

@dataclass(frozen=True, slots=True)
class CreateSkillSet:
    actor: UUID
    request_id: UUID
    assertion_nonce: UUID
    agent_id: Literal["maduoduo"]
    revision_ids: tuple[UUID, ...]  # length 0..16

@dataclass(frozen=True, slots=True)
class StoredSkillSet:
    id: UUID
    agent_id: Literal["maduoduo"]
    state: SkillSetState
    revision_ids: tuple[UUID, ...]
    item_count: int
    total_extracted_size: int
    activation_version: int | None
    failure_code: str | None

@dataclass(frozen=True, slots=True)
class CreateSkillSetResult:
    skill_set: StoredSkillSet
    replayed: bool
```

同时定义 `DiscardSkillSet`、`ClonePreviousSkillSet`、`SkillRuntimeStatus`、`PublishedRevisionOption` 和分页结果 DTO。`ClonePreviousSkillSet` 必须包含 `expected_activation_version` 和 `expected_previous_set_id`。测试空集合、输入顺序持久化、重复 revision 直接拒绝、两个 revision 同属一个 Skill 拒绝、非 published、21st candidate、discard 幂等、previous clone、stale expected pointer/version 和不同 request fingerprint 冲突；禁止静默排序或去重。

- [ ] **Step 2: 运行领域红灯**

Run: `uv --directory apps/skill-registry run pytest tests/test_types.py tests/test_repository.py tests/test_service.py -q`

Expected: FAIL because set contracts are absent.

- [ ] **Step 3: 实现 repository 事务和 service**

`skill_set_repository.py` 只返回 frozen DTO并调用 Task 2 受限 manager functions；service 固定 Agent ID，保留调用方选择顺序，显式拒绝重复 revision 和重复 `skill_id`，计算 canonical request fingerprint。rollback 不在应用层先读再写；它把 expected activation version 和 expected previous set ID 传给原子的 `clone_previous_agent_skill_set`，由数据库在锁内按原 ordinal 创建全新 candidate。

Run: `uv --directory apps/skill-registry run pytest tests/test_types.py tests/test_repository.py tests/test_service.py -q`

Expected: PASS before starting HTTP work.

- [ ] **Step 4: 写私有 API/assertion 红灯**

固定路由：

```text
POST /internal/skill-sets
GET  /internal/skill-sets/runtime-status
GET  /internal/skill-sets/available-revisions?limit=100&offset=0
POST /internal/skill-sets/{set_id}/discard
POST /internal/skill-sets/rollback-candidates
```

available endpoint 分页返回所有仍为 `published` 的 revision，而不是只返回每个 Skill 的 latest。mutation 权限为 `admin:assistant:skills:configure`，status/available 明确使用现有 read permission `admin:assistant:skills`；mutation 要求 password+mfa、actor、request ID、target 和 assertion nonce 精确绑定。所有新增 set mutation 进一步要求 `assertion.nonce == requestId`，保证跨 HTTP 重试仍能命中数据库 same request/same nonce replay；read assertion 继续使用短期随机 nonce。body 限制 8 KiB，unknown field 拒绝，所有响应 no-store。

精确 JSON：

```text
POST /internal/skill-sets
{"agentId":"maduoduo","revisionIds":["uuid"],"requestId":"uuid"}

200/201
{"set":{"id":"uuid","state":"candidate","revisionIds":["uuid"],"itemCount":1,"totalExtractedSize":123},"replayed":false}

GET /internal/skill-sets/runtime-status
{"active":null,"previous":null,"activationVersion":0,"candidateCount":1,"candidates":[{"id":"uuid","state":"candidate","revisionIds":["uuid"],"itemCount":1,"totalExtractedSize":123,"failureCode":null}]}

GET /internal/skill-sets/available-revisions?limit=100&offset=0
{"items":[{"skillId":"uuid","revisionId":"uuid","slug":"demo","revisionNo":2,"artifactSha256":"64hex","extractedSize":123}],"limit":100,"offset":0,"total":1}

POST /internal/skill-sets/{setId}/discard
{"requestId":"uuid"}
-> {"set":{"id":"uuid","state":"discarded","revisionIds":["uuid"],"itemCount":1,"totalExtractedSize":123},"replayed":false}

POST /internal/skill-sets/rollback-candidates
{"agentId":"maduoduo","expectedActivationVersion":1,"expectedPreviousSetId":"uuid","requestId":"uuid"}
-> {"set":{"id":"uuid","state":"candidate","revisionIds":["uuid"],"itemCount":1,"totalExtractedSize":123},"replayed":false}
```

active/previous 使用与 candidate 相同的有界 set summary；candidates 最多 20，revisionIds 最多 16。assertion action/target 固定：status=`skill_set_status/maduoduo`，available=`skill_set_available/published-revisions`，create=`skill_set_create/maduoduo`，discard=`skill_set_discard/maduoduo:{setId}`，rollback=`skill_set_rollback/maduoduo:previous`。400 `candidate_invalid`（含 quota），403 permission/assurance，404 missing，409 state/idempotency，503 storage unavailable。

- [ ] **Step 5: 实现 API 并跑单测绿灯**

Run: `uv --directory apps/skill-registry run pytest tests/test_types.py tests/test_repository.py tests/test_service.py tests/test_auth.py tests/test_api.py -q`

Expected: PASS.

- [ ] **Step 6: 跑 PostgreSQL repository integration**

Run: `uv --directory apps/skill-registry run pytest tests/test_repository_postgres.py -q`

Expected: PASS, zero skipped; verify create/discard/clone events and no base-table privilege leakage.

- [ ] **Step 7: 提交 Registry domain/API**

```bash
git add apps/skill-registry/src/skill_registry/types.py apps/skill-registry/src/skill_registry/repository.py apps/skill-registry/src/skill_registry/skill_set_repository.py apps/skill-registry/src/skill_registry/service.py apps/skill-registry/src/skill_registry/auth.py apps/skill-registry/src/skill_registry/api.py apps/skill-registry/src/skill_registry/skill_set_api.py apps/skill-registry/tests
git commit -m "feat(skills): manage runtime candidates"
```

## Chunk 2: Agent 物化、Factory generation 和激活控制

### Task 4: 建立只读 artifact repository 和安全 materializer

**Files:**
- Create: `packages/skill-core/src/skill_core/materialize.py`
- Create: `packages/skill-core/tests/test_materialize.py`
- Modify: `packages/skill-core/src/skill_core/__init__.py`
- Modify: `apps/agent/pyproject.toml`
- Modify: `apps/agent/uv.lock`
- Modify: `apps/agent/Dockerfile`
- Modify: `apps/agent/src/agent_service/config.py`
- Create: `apps/agent/src/agent_service/skill_runtime_types.py`
- Create: `apps/agent/src/agent_service/skill_artifact_repository.py`
- Create: `apps/agent/src/agent_service/skill_materializer.py`
- Modify: `apps/agent/tests/test_config.py`
- Create: `apps/agent/tests/test_skill_artifact_repository.py`
- Create: `apps/agent/tests/test_skill_artifact_repository_postgres.py`
- Create: `apps/agent/tests/test_skill_materializer.py`

- [ ] **Step 1: 写 fd-relative materialize 负向测试**

覆盖 symlink swap、父目录替换、重复路径、摘要错误、file index 不符、特殊权限、写一半取消、跨 generation 覆盖和根目录逃逸。输出只能是 caller 预先打开目录 fd 下的新目录。

- [ ] **Step 2: 实现 `materialize_canonical_skill` 并跑 skill-core 绿灯**

接口固定为：

```python
def materialize_canonical_skill(
    package: CanonicalSkillPackage,
    *,
    root_fd: int,
    directory_name: str,
) -> None: ...
```

Run: `uv --directory packages/skill-core run pytest tests/test_archive.py tests/test_materialize.py -q`

Expected: PASS.

- [ ] **Step 3: 锁定依赖和配置合同**

把 Agent 依赖改为 `agno[anthropic,google,openai]==2.7.2`，通过 workspace source 安装 `skill-core`。新增必填 `SKILL_REGISTRY_RUNTIME_DATABASE_URL`、固定绝对 `/run/aap-skills`、60 秒 activate、5 秒 CAS、30 秒 shutdown 配置；Secret 不进入 repr。

- [ ] **Step 4: 写 runtime view repository 红灯**

repository 固定协议：

```python
async def load_active(self) -> RuntimeSetSnapshot | None: ...
async def load_candidate(self, set_id: UUID) -> RuntimeSetSnapshot: ...
async def activate(self, command: ActivateSkillSet) -> int: ...
async def mark_failed(self, command: FailSkillSet) -> bool: ...
async def reconcile(self, set_id: UUID) -> ReconcileResult: ...
```

只查询 runtime views/函数，验证 row shape、重复 rows、0..16 item、24 MiB 和 bytea 摘要。每个 artifact 必须把 `archive_bytes` 重新传给 `canonicalize_skill_zip`，并把 canonical archive bytes、slug、sha256、compressed/extracted size、file count 和 ordered file index 与数据库逐项比较；任何差异都在触碰文件系统前失败。

- [ ] **Step 5: 实现 Agent materializer**

为每个 set 创建 `.preparing-<uuid>`，逐个调用 skill-core materialize，完成后原子 rename 为 `generation-<set-id>`，再用：

```python
Skills(loaders=[LocalSkills(path=generation_path, validate=True)])
```

构建前拒绝重复 manifest skill name；构建后断言 `Skills.get_all_skills()` 数量、name 和 source path 与 candidate exact items 一致，防止 Agno 对重复 name 覆盖或 loader 静默漏载。空 set 不创建 `Skills`，返回 `skills=None`，确保不会暴露三个 skill access tools。构建并返回 immutable `PreparedGeneration`。对外失败只映射到 spec 已批准的 `artifact_invalid|skill_validation_failed`；更细的 mismatch/name/load 子码只进入安全日志。所有失败都 fd-relative 清理临时目录。

- [ ] **Step 6: 跑单元与真实 PostgreSQL 绿灯**

Run: `uv --directory apps/agent run pytest tests/test_config.py tests/test_skill_artifact_repository.py tests/test_skill_materializer.py -q`

Run: `uv --directory apps/agent run pytest tests/test_skill_artifact_repository_postgres.py -q`

Expected: PASS, PostgreSQL test zero skipped.

- [ ] **Step 7: 提交 repository/materializer**

```bash
git add packages/skill-core apps/agent/pyproject.toml apps/agent/uv.lock apps/agent/Dockerfile apps/agent/src/agent_service/config.py apps/agent/src/agent_service/skill_runtime_types.py apps/agent/src/agent_service/skill_artifact_repository.py apps/agent/src/agent_service/skill_materializer.py apps/agent/tests
git commit -m "feat(skills): materialize reviewed runtime sets"
```

### Task 5: 实现 generation slot、固定 AgentFactory 和 route guard

**Files:**
- Modify: `apps/agent/src/agent_service/default_agent.py`
- Modify: `apps/agent/src/agent_service/catalog.py`
- Create: `apps/agent/src/agent_service/skill_generation_slot.py`
- Create: `apps/agent/src/agent_service/skill_agent_factory.py`
- Create: `apps/agent/src/agent_service/skill_runtime_middleware.py`
- Modify: `apps/agent/tests/test_default_agent.py`
- Modify: `apps/agent/tests/test_catalog.py`
- Create: `apps/agent/tests/test_skill_generation_slot.py`
- Create: `apps/agent/tests/test_skill_agent_factory.py`
- Create: `apps/agent/tests/test_skill_runtime_middleware.py`

- [ ] **Step 1: 写 generation 引用计数红灯**

固定类型：

```python
@dataclass(frozen=True, slots=True)
class RuntimeGeneration:
    configured: bool
    set_id: UUID | None
    activation_version: int
    skills: Skills | None
    root: Path | None

class GenerationLease:
    generation: RuntimeGeneration
    def release(self) -> None: ...
```

覆盖空/unconfigured、显式空 set（`configured=true, skills=None`）、capture 一次、activate 原子替换、最多一个 retired、SSE 未结束不清理、重复 release、取消和 cleanup failure。

- [ ] **Step 2: 实现 slot 和清理 reaper**

slot 使用短临界区 `threading.Lock` 管理 current/refcounts；async reaper 只使用已打开 runtime root fd、`O_NOFOLLOW`/`dir_fd` 操作清理 retired 且 refcount=0 的目录，绝不对存储路径重新 `resolve()`。在 coordinator activation lock 内先 reserve 一次 replacement capacity，第二个未排空 retired 风险必须在数据库 CAS 前返回 `runtime_busy`；CAS 成功后 commit reserved generation 不得再因容量失败。

- [ ] **Step 3: 写 AgentFactory 和指令红灯**

Factory 从 `ContextVar[RuntimeGeneration]` 取 generation，用同一个 `ModelRuntimeSlot`、`AsyncPostgresDb` 和 `skills=generation.skills` 调用扩展后的 `build_default_agent`。空 Skills 保留“没有工具”；非空 Skills 移除该句并明确只允许审核 Skill 工具。断言模型 slot 和 DB 对象 identity 不变。

- [ ] **Step 4: 枚举 Agno 2.7.2 路由并写 guard 红灯**

从构建后的 AgentOS app 读取 routes，快照所有会解析 `maduoduo` Factory 的路径。只允许当前 `POST /agents/maduoduo/runs` 进入 Factory；fork/resume/其他不兼容路径由本地 guard 在 Agno resolver 前返回固定 404/405。Agno 2.7.2 同一路由的 multipart `background=true` 会创建脱离响应生命周期的 task，本阶段必须用有界 form preflight 在 capture lease 前固定拒绝；普通 HTTP 和 SSE 仅允许 `background=false`。覆盖缺省/false/true、重复或畸形 background 字段，转发合法 body 时不得丢字节。不得 patch `.venv`。

- [ ] **Step 5: 实现 HTTP/SSE generation middleware**

精确 run 请求通过 background preflight 后 capture lease、设置 ContextVar，ASGI `finally` 在普通响应、完整 SSE、断开和取消后 reset ContextVar 并 release。非目标路径不读取 slot。shutdown/draining 标志置位后，新 run 在 capture 前返回 `runtime_degraded`，已有 lease 继续排空。

- [ ] **Step 6: 跑 Factory/lease/现有 Agent 回归**

Run: `uv --directory apps/agent run pytest tests/test_default_agent.py tests/test_catalog.py tests/test_skill_generation_slot.py tests/test_skill_agent_factory.py tests/test_skill_runtime_middleware.py tests/test_app.py -q`

Expected: PASS; deterministic route snapshot proves incompatible paths remain closed.

- [ ] **Step 7: 提交 generation boundary**

```bash
git add apps/agent/src/agent_service/default_agent.py apps/agent/src/agent_service/catalog.py apps/agent/src/agent_service/skill_generation_slot.py apps/agent/src/agent_service/skill_agent_factory.py apps/agent/src/agent_service/skill_runtime_middleware.py apps/agent/tests
git commit -m "feat(skills): lease runtime generations per run"
```

### Task 6: 实现 coordinator、控制 API、启动恢复和 readiness

**Files:**
- Create: `apps/agent/src/agent_service/skill_activation_coordinator.py`
- Create: `apps/agent/src/agent_service/skill_control_auth.py`
- Create: `apps/agent/src/agent_service/skill_control_api.py`
- Modify: `apps/agent/src/agent_service/model_control_api.py`
- Modify: `apps/agent/src/agent_service/app.py`
- Create: `apps/agent/tests/test_skill_activation_coordinator.py`
- Create: `apps/agent/tests/test_skill_control_auth.py`
- Create: `apps/agent/tests/test_skill_control_api.py`
- Modify: `apps/agent/tests/test_model_control_api.py`
- Modify: `apps/agent/tests/test_app.py`

- [ ] **Step 1: 写 coordinator 状态机红灯**

覆盖 prepare failure→mark failed、nonblocking activation lock、runtime_busy reservation、CAS conflict、CAS success→slot activate、CAS 前请求取消、CAS 后请求取消、60 秒同步 deadline、5 秒数据库 statement timeout、discard race 和 failure-code sanitization。CAS 事务显式执行 `SET LOCAL statement_timeout='5s'`。

- [ ] **Step 2: 写未知 CAS 三分支红灯**

对账由 lifespan-owned task 在同一个 activation lock 内持续执行：

```text
target active     -> install retained generation -> ready
target candidate + active pointer/version still equal pre-CAS snapshot
                  -> mark failed -> delete prepared -> restore old
target failed     -> delete prepared -> restore old
target discarded  -> delete prepared -> restore old -> conflict
unreachable       -> retain prepared -> degraded -> reject runs/activation
other/inconsistent -> retain prepared -> degraded -> reject runs/activation
```

CAS 开始后创建 lifespan-owned task 并用 `asyncio.shield` 等待，禁止用会取消底层事务的裸 `wait_for`。客户端断开或 60 秒 API deadline 只结束同步等待，不取消 DB task；task 继续持有 activation lock，先取得确定 commit/rollback，连接丢失无法判断时才进入上述 reconciliation。HTTP 请求结束不能取消对账；shutdown 有序停止，重启按 active pointer 恢复。

- [ ] **Step 3: 实现 skill assertion/auth middleware**

复用 `AGENT_CONFIG_CONTROL_KEY`，但使用独立 KDF domain 和 action enum `skill_runtime_status|skill_runtime_activate`。status assertion 固定 permission=`admin:assistant:skills`、assurance=`session`、target=`maduoduo`；activate 固定 permission=`admin:assistant:skills:configure`、assurance=`password+mfa`、assuredAt `<=600s`、target=`maduoduo:<set-id>:<expected-version>`。认证必须在读取 body 前完成。修改现有 `ModelControlAuthMiddleware` matcher，使它只处理精确 model-config routes；未知 `/internal/control/*` 仍失败关闭，但精确 skill-runtime routes 交给独立 Skill auth middleware，测试中间件顺序和 trailing-slash 拒绝。

- [ ] **Step 4: 实现内部控制 API**

```text
GET  /internal/control/skill-runtime
POST /internal/control/skill-runtime/{set_id}/activate
```

activate body 固定为 `{"expectedActivationVersion":1,"requestId":"uuid"}`，8 KiB、exact JSON、拒绝 unknown/duplicate field；body request ID 必须与 assertion request ID 相同。Agent 调 Registry runtime function 时固定 `p_request_id=requestId` 且 `p_assertion_nonce=requestId`，不把 Web→Agent assertion nonce跨边界复用，从而满足 Registry replay 的 same request/same nonce 合同。status 精确返回 `{"skillCapability":"unconfigured|ready|preparing|degraded","configured":false,"activeSetId":null,"loadedSetId":null,"previousSetId":null,"activationVersion":0,"failureCode":null}`，不改现有 model capability JSON。busy=423、invalid=400/422、conflict=409、timeout=504、unknown/degraded=503；所有响应 no-store，错误响应只带 request ID 和 stable error code。

- [ ] **Step 5: 装配 lifespan、启动恢复和 readiness**

`create_app` lifespan 顺序：start model slot → open skill runtime repository → 打开并固定 runtime root fd → 在 generation slot 尚未启动、确定不存在任何租约时 fd-relative/no-follow 清理全部旧 `.preparing-*` 和 `generation-*` → start generation slot/coordinator → load DB active pointer → 从 Registry artifact 重新 materialize/Factory verify → ready。禁止复用上次进程留下的 active 目录，避免 rename 撞到非空目标；增加“同一容器内进程重启、tmpfs 仍保留旧 active 目录”的恢复测试。无 pointer 安装 configured=false empty generation；有 pointer 或启动清理失败则 skill degraded。readiness 保留现有 JSON shape并在每次 probe 同时检查既有 Agno DB 和 Skill runtime repository DB；`preparing` 且旧 generation 一致时仍为 200，runtime DB 失败、model degraded、skill degraded 或 active/loaded mismatch 返回 503。

关闭顺序固定为：先置 draining 并拒绝新 run/activation → 停止 coordinator 新工作和 unknown reconcile（不强杀正在提交的 DB task）→ 最多 30 秒等待 generation lease 归零 → fd-relative 清理可清理目录 → 关闭 Skill repository → 继续既有 model slot/Agno DB cleanup；超时后退出，未排空 tmpfs 交给容器生命周期。

- [ ] **Step 6: 跑 Agent 控制面全绿**

Run: `uv --directory apps/agent run pytest tests/test_skill_activation_coordinator.py tests/test_skill_control_auth.py tests/test_skill_control_api.py tests/test_model_control_api.py tests/test_app.py -q`

Run: `uv --directory apps/agent run pytest -q`

Expected: PASS; database-dependent tests must not skip in acceptance environment.

- [ ] **Step 7: 提交 coordinator/control**

```bash
git add apps/agent/src/agent_service/skill_activation_coordinator.py apps/agent/src/agent_service/skill_control_auth.py apps/agent/src/agent_service/skill_control_api.py apps/agent/src/agent_service/model_control_api.py apps/agent/src/agent_service/app.py apps/agent/tests
git commit -m "feat(skills): activate and recover runtime sets"
```

## Chunk 3: Web 编排、部署和确定性验收

### Task 7: 实现 Web BFF、后台配置和回滚 UI

**Files:**
- Create: `apps/web/src/features/assistant/admin-skill-runtime-contract.ts`
- Create: `apps/web/src/features/assistant/admin-skill-runtime-contract.test.ts`
- Create: `apps/web/src/server/assistant/agent-skill-control-client.ts`
- Create: `apps/web/src/server/assistant/agent-skill-control-client.test.ts`
- Modify: `apps/web/src/server/assistant/skill-registry-client.ts`
- Modify: `apps/web/src/server/assistant/skill-registry-client.test.ts`
- Create: `apps/web/src/server/assistant/admin-skill-runtime-commands.ts`
- Create: `apps/web/src/server/assistant/admin-skill-runtime-commands.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/handler.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/candidates/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/candidates/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/candidates/[setId]/activate/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/candidates/[setId]/activate/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/candidates/[setId]/discard/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/candidates/[setId]/discard/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/rollback/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/rollback/route.test.ts`
- Create: `apps/web/src/components/admin/assistant-skill-configuration-panel.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-configuration-panel.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.css`
- Modify: `apps/web/src/app/admin/assistant/page.tsx`
- Modify: `apps/web/src/app/admin/assistant/page.test.tsx`

- [ ] **Step 1: 写严格 Web DTO 红灯**

DTO 固定 `published revisions + Registry truth + Agent loaded truth + permissions`；数组和字符串有界，拒绝 unknown field、prototype pollution、active/loaded 自相矛盾和私密路径。`skillCapability` 独立于现有 model capability。server page 加载 initial runtime snapshot，失败时只降级 Skill configuration panel，不影响既有 Registry panel。

- [ ] **Step 2: 实现 Registry/Agent 两个私有客户端**

扩展现有 `skill-registry-client.ts` 支持 set endpoints；新增 set mutation signer 固定 assertion nonce=`requestId`，read 仍用随机短期 nonce。新 Agent client 复用 pinned transport 模式并用独立 assertion domain。任何响应只接受 exact JSON，body 上限 64 KiB，redirect/公网 DNS/错误 media type 一律失败关闭。

- [ ] **Step 3: 写命令层失败顺序红灯**

固定流程：

```text
create: permission+MFA -> Registry candidate -> return candidate
activate: permission+MFA -> Agent activate -> refresh both truths
rollback: permission+MFA -> 带 expected version/previous ID 调 Registry 原子 clone -> Agent activate
discard: permission+MFA -> Registry discard
```

Web 不伪造分布式事务。Agent 返回 result unknown 时只展示“正在对账”并轮询 status；不得创建第二个 candidate 或换 request ID 重试。

BFF mutation body 固定为：

```text
create   {"agentId":"maduoduo","revisionIds":["uuid"],"requestId":"uuid"}
activate {"expectedActivationVersion":0,"requestId":"uuid"}
discard  {"requestId":"uuid"}
rollback {"expectedActivationVersion":1,"expectedPreviousSetId":"uuid","requestId":"clone-uuid","activationRequestId":"activate-uuid"}
```

rollback 的两个 UUID 必须不同：`requestId` 专用于 Registry clone，`activationRequestId` 专用于 Agent activation。UI 在一次操作开始时生成并持有二者，网络重试复用原 payload；若页面状态已进入 unknown，只轮询，不重新编排。

- [ ] **Step 4: 实现 BFF routes 和平台审计**

所有 mutation recheck organization/realm/permission，要求近期 MFA，body 8 KiB，exact JSON/UUID、Origin exact match，响应 no-store。平台 audit 只保存 set ID、revision count、clone/activation request ID、result code，不保存 artifact/正文/DSN。

- [ ] **Step 5: 写 UI 行为和可访问性红灯**

覆盖选择 0..16 个 published revision、重复 Skill 禁止、显式空集合确认、20 candidate quota、busy/degraded、未知结果轮询、discard、previous rollback、无权限隐藏 mutation、键盘/焦点/aria-live。

- [ ] **Step 6: 实现独立配置 panel**

RegistryPanel 继续负责上传/审核；ConfigurationPanel 只负责码多多 binding。页面同时展示 active、loaded、previous、activation version 和 failure code；不一致显示 degraded，不能写“已生效”。

- [ ] **Step 7: 跑 Web 全绿并提交**

Run: `pnpm --dir apps/web exec vitest run src/features/assistant/admin-skill-runtime-contract.test.ts src/server/assistant/skill-registry-client.test.ts src/server/assistant/agent-skill-control-client.test.ts src/server/assistant/admin-skill-runtime-commands.test.ts src/app/api/v1/admin/assistant/skill-runtime src/components/admin/assistant-skill-configuration-panel.test.tsx src/components/admin/assistant-admin-page.test.tsx src/app/admin/assistant/page.test.tsx`

Run: `pnpm --dir apps/web typecheck && pnpm --dir apps/web lint`

Expected: PASS.

```bash
git add apps/web/src/features/assistant/admin-skill-runtime-contract.ts apps/web/src/features/assistant/admin-skill-runtime-contract.test.ts apps/web/src/server/assistant/skill-registry-client.ts apps/web/src/server/assistant/skill-registry-client.test.ts apps/web/src/server/assistant/agent-skill-control-client.ts apps/web/src/server/assistant/agent-skill-control-client.test.ts apps/web/src/server/assistant/admin-skill-runtime-commands.ts apps/web/src/server/assistant/admin-skill-runtime-commands.test.ts apps/web/src/app/api/v1/admin/assistant/skill-runtime apps/web/src/components/admin/assistant-skill-configuration-panel.tsx apps/web/src/components/admin/assistant-skill-configuration-panel.test.tsx apps/web/src/components/admin/assistant-admin-page.tsx apps/web/src/components/admin/assistant-admin-page.test.tsx apps/web/src/components/admin/assistant-admin-page.css apps/web/src/app/admin/assistant/page.tsx apps/web/src/app/admin/assistant/page.test.tsx
git commit -m "feat(skills): configure maduoduo runtime sets"
```

### Task 8: 完成 Compose、CI、确定性 E2E、恢复和交付文档

**Files:**
- Modify: `.env.example`
- Modify: `compose.yaml`
- Modify: `infra/docker/run-agent-with-secret-env.sh`
- Modify: `infra/docker/validate-compose-secret-files.py`
- Modify: `apps/agent/Dockerfile`
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Create: `docs/testing/run-skill-runtime-e2e.sh`
- Create: `docs/testing/fixtures/skills/deterministic/SKILL.md`
- Create: `docs/testing/fixtures/skills/deterministic/scripts/record.py`
- Create: `docs/testing/skill-runtime-e2e.test.ts`
- Create: `apps/agent/tests/e2e_skill_runtime/__init__.py`
- Create: `apps/agent/tests/e2e_skill_runtime/app.py`
- Create: `apps/agent/tests/e2e_skill_runtime/faults.py`
- Modify: `infra/docker/backup.sh`
- Modify: `infra/docker/restore-drill.sh`
- Modify: `docs/testing/run-agentos-backup-restore.sh`
- Modify: `apps/web/src/content/deployment.mdx`
- Modify: `docs/testing/README.md`
- Modify: `README.md`

- [ ] **Step 1: 写部署合同红灯**

断言 Agent 新增 `SKILL_REGISTRY_RUNTIME_DATABASE_URL` secret，`/run/aap-skills:rw,exec,nosuid,nodev,size=96m` tmpfs，依赖 `skill-registry-migrate` 成功，Registry/Agent 不发布 host port，本地 loopback flag 不进入生产。Secret preflight 要求 runtime URL 文件 `0600` 且不与 manager/migrator URL 混用。

- [ ] **Step 2: 实现 Compose、secret 和镜像合同**

`.env.example` 新增 `SKILL_REGISTRY_RUNTIME_DATABASE_URL_FILE`。Agent `SECRET_ENV_SPECS` 挂载 runtime URL；现有 `pnpm secrets:preflight` 入口继续调用 `infra/docker/validate-compose-secret-files.py`，扩展该 validator 校验 runtime URL 文件存在、regular/no symlink、mode `0600`、DSN role 为 runtime 且不等于 manager/migrator DSN。Dockerfile clean build 安装精确 Agno 和 workspace skill-core。保持只读 root、非 root runtime、最小 capability 和 backend-only 网络。

- [ ] **Step 3: 写确定性 E2E 红灯**

fixture Skill 提供一个只输出固定 nonce marker 的脚本；acceptance model 必须确定性调用 `get_skill_script(..., execute=True)`。E2E 以 AgentOS stream 中的 exact tool call、tool result 和脚本 stdout marker 为证据，不依赖模型自然语言。`apps/agent/tests/e2e_skill_runtime` 是 acceptance-only composition root：注入确定性 model 和可控 repository transport fault（response lost / unreachable），但仍调用 production coordinator、materializer、Factory、middleware 和数据库函数。必须验证：

```text
publish -> candidate -> activate -> real run records exact skill tool call/result
bad digest -> old behavior remains
in-flight SSE old generation / new run new generation
busy + runtime_busy
CAS success but response lost -> reconcile installs retained generation
CAS not committed -> reconcile cleans prepared
CAS unreachable -> readiness 503 and new runs fail
rollback -> new activation version and old behavior
restart -> restore same active set
empty set -> no Skill tools
unauthorized/no MFA -> 403
```

不得用模型自然语言声称“已加载”作为证据；production image 不得包含 test-only recorder、fixture switch 或绕过 LocalSkills 的注入点。

- [ ] **Step 4: 实现隔离 E2E runner**

runner 使用唯一 Compose project、临时端口和临时 secret/volume；E2E overlay 只构建 Dockerfile 的 `acceptance` target，并把 `e2e_skill_runtime` 复制到该 target；最终 `runtime` stage、production Compose 和 `agent_service.app` 不出现 test flag/fault endpoint。先做 owner/port/container/volume/network 检查，取得所有权后才 build/up，trap 只清理自己的资源。fault API 仅存在于隔离项目并继续要求 bearer；真实 PostgreSQL DSN 测试 zero skipped。

- [ ] **Step 5: 扩展 backup/restore**

备份包含 set/items/active pointer/events/artifacts。扩展隔离 runner 在备份前写入 candidate→active→previous 的完整 fixture 和私有 events；恢复验收证明 active+previous revision、activation version 和 artifact digest 一致，并启动 Agent 从恢复 pointer 重新物化、通过确定性 Skill 工具行为，不依赖远端仓库。

- [ ] **Step 6: 接入 CI 并跑全量门禁**

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Run: `pnpm --dir apps/web test && pnpm --dir apps/web typecheck && pnpm --dir apps/web lint`

Run: `uv --directory packages/skill-core run pytest -q && uv --directory packages/skill-core run ruff check . && uv --directory packages/skill-core run mypy src`

Run: `uv --directory apps/skill-registry run pytest -q && uv --directory apps/skill-registry run ruff check . && uv --directory apps/skill-registry run mypy src`

Run: `uv --directory apps/agent run pytest -q && uv --directory apps/agent run ruff check . && uv --directory apps/agent run mypy src`

Run: `docker compose --env-file .env.example config --quiet`

Run: `bash docs/testing/run-skill-runtime-e2e.sh`

Run: `bash docs/testing/run-agentos-backup-restore.sh`

Expected: all PASS; zero skipped database/E2E/backup-restore tests; no secret values in output。`.github/workflows/ci.yml` 必须显式运行两个隔离 runner，普通 restart 不替代 backup/restore 门禁。

- [ ] **Step 7: 更新运维文档和最终提交**

文档说明启用顺序、96 MiB tmpfs、激活/回滚、unknown 对账、readiness 503、备份恢复和 `AGENT_ENABLED=false` emergency stop；明确 Git 导入和脚本沙箱仍未实现。

```bash
git add .env.example compose.yaml infra/docker apps/agent/Dockerfile .github/workflows/ci.yml packages/database/src/deployment-contracts.test.ts docs/testing apps/web/src/content/deployment.mdx README.md
git commit -m "test(skills): verify runtime activation delivery"
```

## Completion checkpoint

- ZIP 审核通过的 exact revision 可以组成 `0..16` item candidate；
- Agent 重新校验 artifact，并通过确定性工具调用证明 Skill 真实生效；
- 每个 run 捕获一个 generation，切换时不混用；
- 失败、busy、超时和 CAS result unknown 都按规格收敛；
- active 和 immediate previous 始终可恢复/回滚；
- 重启恢复、readiness、权限、tmpfs、备份和真实 PostgreSQL E2E 全部通过；
- GitHub/GitLab/GitCode 导入仍明确属于下一阶段。

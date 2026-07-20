# 码多多 Skill 运行时加载与原子激活 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让超级管理员把已发布的精确 Skill revision 组成不可变集合，并由 Agent 使用 Agno 2.7.2 `Skills + LocalSkills(validate=True)` 原子加载；任何准备、并发等待或激活失败都继续服务旧集合。

**Architecture:** 在 `skill_registry` schema v2 中加入 candidate set、runtime 只读视图和受限 CAS 函数；Agent 用独立 runtime 角色读取 canonical ZIP，物化到专用 executable tmpfs，再通过 generation 读写租约切换 `maduoduo.skills`。Web 只负责编排 Registry candidate 和 Agent activate 两个私有 API，不传 ZIP 或源码。

**Tech Stack:** PostgreSQL 18、Python 3.13、Agno 2.7.2、FastAPI/ASGI、psycopg 3、Next.js 16、React 19、TypeScript 5.9、Vitest、Pytest、Docker Compose。

---

**Spec:** `docs/superpowers/specs/2026-07-20-maduoduo-skill-registry-design.md`

**Depends on:** `docs/superpowers/plans/2026-07-20-skill-registry-upload-review.md` 已完整交付并通过真实 PostgreSQL/Registry E2E。

**Out of scope:** Git Provider、自动更新、Webhook、第三方 Skill 沙箱、多 Agent、多 AgentOS 实例一致激活。

## Chunk 1: Runtime schema、候选集合与 Registry API

### Task 1: 创建 schema v2、runtime views 和受限 CAS 函数

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/schema.py`
- Modify: `apps/skill-registry/src/skill_registry/migrate.py`
- Modify: `apps/skill-registry/tests/test_schema.py`
- Modify: `apps/skill-registry/tests/test_migrate.py`
- Modify: `apps/skill-registry/tests/test_migrate_postgres.py`
- Modify: `infra/postgres/05-skill-registry-roles.sql`
- Modify: `infra/postgres/05-skill-registry-roles.sh`
- Modify: `packages/database/src/skill-registry-role-boundary.integration.test.ts`

- [ ] **Step 1: 写 schema v2 和角色边界失败测试**

固定新增对象：

```text
skill_registry.agent_skill_sets
skill_registry.agent_skill_set_items
skill_registry.active_agent_skill_sets
skill_registry.runtime_active_skill_set
skill_registry.runtime_skill_sets
skill_registry.runtime_skill_set_items
skill_registry.activate_agent_skill_set(...)
skill_registry.mark_agent_skill_set_failed(...)
skill_registry.reconcile_agent_skill_activation(...)
```

`agent_skill_sets` 固定 `agent_id='maduoduo'`，状态为 `candidate|active|superseded|failed`；固定 `idempotency_key UUID`、`request_fingerprint CHAR(64)`、`total_extracted_size`，并设置 `UNIQUE(agent_id,set_no)` 和 `UNIQUE(created_by,agent_id,idempotency_key)`。同一 key 不同 fingerprint 固定返回 `IDEMPOTENCY_CONFLICT`。

item 冗余受保护的 `skill_id`，使用 `(set_id, ordinal)` 主键、`UNIQUE(set_id,skill_revision_id)`、`UNIQUE(set_id,skill_id)` 和 `(skill_id,skill_revision_id)` 复合 FK；revision 表补对应复合唯一键。deferred constraint trigger 从 revision/artifact 重算 `total_extracted_size`，限制整个 set 不超过 24 MiB，禁止 manager 伪造汇总。空集合合法。

Run: `uv --directory apps/skill-registry run pytest tests/test_schema.py tests/test_migrate.py -q`

Expected: FAIL，schema version 仍为 1。

- [ ] **Step 2: 实现不可变集合和 runtime views**

manager 只能创建 candidate set/item 和读取集合。set 的 agent/idempotency/fingerprint/content/timestamps 与全部 item 永久不可变；只有本任务定义的 activate/failed 两个 `SECURITY DEFINER` 函数能更新 set 的 state/failure/activated_at，manager/runtime 均无直接 UPDATE/DELETE；第三个 reconcile 函数严格只读。创建事务锁定所选 revision，要求全部为 `published`，并写 `skill_set_created` event。

runtime active view 暴露 agent ID、active set ID 和 activation version；另两个 view 只暴露 set ID/state/set no、revision/skill ID、slug、artifact SHA-256/bytea、大小、file index；不得暴露 created_by、reviewer、Provider connection 或审核正文。runtime 角色只能 SELECT views，不能 SELECT artifact/revision/base set 表。

- [ ] **Step 3: 实现三个 `SECURITY DEFINER` 函数**

函数由 migrator 专属 owner 持有，固定 `SECURITY DEFINER SET search_path=pg_catalog,skill_registry`，`REVOKE ALL ... FROM PUBLIC` 后只 `GRANT EXECUTE` 给 runtime role；函数第一步检查 `session_user='ai_agent_skill_registry_runtime'`。固定锁顺序为 agent advisory transaction lock → active pointer → candidate header → UUID 排序的 revisions，避免激活/归档死锁。校验 `agent_id='maduoduo'`、UUID、状态和 expected version：

```sql
activate_agent_skill_set(
  p_agent_id text,
  p_set_id uuid,
  p_expected_activation_version bigint,
  p_actor uuid,
  p_request_id uuid,
  p_assertion_nonce uuid
) returns bigint
```

它重新确认 candidate 的所有 revision 仍为 published，CAS 插入/更新 active pointer，旧 active 改 superseded，新 set 改 active，写 event，返回递增后的 `activation_version`。空集合也成功。任何检查失败整事务回滚。

没有 active pointer 时只接受 `p_expected_activation_version=0` 并插入 version 1；已有 pointer 时必须精确相等再 `+1`。revision 状态 trigger 还必须拒绝归档任一 active set item。

失败函数固定签名：

```sql
mark_agent_skill_set_failed(
  p_agent_id text,
  p_set_id uuid,
  p_expected_activation_version bigint,
  p_actor uuid,
  p_request_id uuid,
  p_assertion_nonce uuid,
  p_failure_code text
) returns boolean
```

它按同一锁序确认 active version 未变化且 set 仍为 candidate，才改 failed、写 event 并消费唯一 nonce；若另一个请求已经把同一 set 激活，返回 false，绝不能把 active 改 failed。failure code 只能取稳定运行时枚举。`activate` 事务回滚后 nonce 未被消费，才允许同一请求用该 nonce 写 failed；成功激活已消费 nonce，不能再写失败。

只读恢复函数固定签名：

```sql
reconcile_agent_skill_activation(
  p_agent_id text,
  p_target_set_id uuid
) returns table(active_set_id uuid, activation_version bigint, target_state text)
```

它先取得与 activate 相同的 agent advisory transaction lock，再按相同顺序锁/read active pointer 和 target header，因此返回时任何先前持有该 advisory lock 的 commit 必然已提交或回滚。它不写 event、不消费 nonce，同样只授权 runtime role。

- [ ] **Step 4: 运行真实 PostgreSQL 权限与并发测试**

Precondition: 已导出 Plan A 声明的四个 Skill Registry 测试 DSN。

Run: `uv --directory apps/skill-registry run pytest tests/test_migrate_postgres.py -q`

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/skill-registry-role-boundary.integration.test.ts`

Expected: PASS；两个 runtime 并发 CAS 只有一个成功；reconcile 会等待尚未结束的 CAS transaction；同 candidate 并发 activate 时失败方不能把 active set 标 failed；unpublished/重复 Skill/超过 24 MiB/活动 revision 归档均被数据库拒绝；同 idempotency key 不同 fingerprint 被拒绝；PUBLIC 无函数执行权；runtime 不能绕过函数写表；manager 不能激活；backup 只读全部新表。缺 DSN 时 SKIPPED 不算交付通过。

- [ ] **Step 5: 提交**

```bash
git add apps/skill-registry/src/skill_registry/schema.py apps/skill-registry/src/skill_registry/migrate.py apps/skill-registry/tests/test_schema.py apps/skill-registry/tests/test_migrate.py apps/skill-registry/tests/test_migrate_postgres.py infra/postgres/05-skill-registry-roles.sql infra/postgres/05-skill-registry-roles.sh packages/database/src/skill-registry-role-boundary.integration.test.ts
git commit -m "feat(skills): add immutable agent skill sets"
```

### Task 2: 在 Registry 创建、查询和克隆 candidate set

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/types.py`
- Modify: `apps/skill-registry/src/skill_registry/repository.py`
- Modify: `apps/skill-registry/src/skill_registry/service.py`
- Modify: `apps/skill-registry/src/skill_registry/auth.py`
- Modify: `apps/skill-registry/src/skill_registry/api.py`
- Modify: `apps/skill-registry/tests/test_repository.py`
- Modify: `apps/skill-registry/tests/test_repository_postgres.py`
- Modify: `apps/skill-registry/tests/test_service.py`
- Modify: `apps/skill-registry/tests/test_auth.py`
- Modify: `apps/skill-registry/tests/test_api.py`

- [ ] **Step 1: 写 candidate service 失败测试**

`create_candidate(actor, agent_id, revision_ids, idempotency_key)` 接受 0–32 个 canonical UUID，`idempotency_key` 也是 UUID。输入顺序无语义，服务先按 Skill slug 排序，再对 canonical `{agentId,revisionIds}` 算 SHA-256 fingerprint 并固化 ordinal。覆盖空集合、重复 revision、同 Skill 两个 revision、未发布/已归档 revision、24 MiB 总上限、32 item 上限、相同 key 同 payload 重试、相同 key 不同 payload 和并发 set_no。

`clone_candidate(actor, source_set_id, idempotency_key)` 复制历史内容到新 candidate，不修改原 set；若历史 item 已非 published 则整体失败。

Run: `uv --directory apps/skill-registry run pytest tests/test_repository.py tests/test_service.py -q`

Expected: FAIL，set repository/service 尚不存在。

- [ ] **Step 2: 实现 candidate 事务和运行状态查询**

所有 revision 校验、header/items/event/idempotency key 在一个 manager 事务完成；constraint violation 映射稳定错误。查询返回 active set、`activationVersion`、candidate/history 及新增/升级/降级/移除 diff，但不读取 artifact bytea。

Run: `uv --directory apps/skill-registry run pytest tests/test_repository.py tests/test_service.py -q`

Expected: PASS。

- [ ] **Step 3: 写并实现 Registry 私有 API**

新增：

```text
GET  /internal/skill-sets?agentId=maduoduo
POST /internal/skill-sets
POST /internal/skill-sets/{setId}/rollback
```

assertion 映射固定，Registry/Web 两端共享合同测试：

| Route | action | target | permission | assurance | nonce |
| --- | --- | --- | --- | --- | --- |
| GET list | `skill_sets_list` | `maduoduo` | `admin:assistant:skills` | `session` | 5 秒内存 read nonce |
| POST create | `skill_set_create` | `maduoduo` | `admin:assistant:skills:configure` | `password+mfa`，`assuredAt<=600s` | DB mutation nonce |
| POST rollback | `skill_set_rollback` | `maduoduo:{sourceSetId}` | `admin:assistant:skills:configure` | `password+mfa`，`assuredAt<=600s` | DB mutation nonce |

请求最多 16 KiB，严格 JSON、no-store；mutation 只返回 set metadata，不返回 ZIP。

Run: `uv --directory apps/skill-registry run pytest tests/test_auth.py tests/test_api.py -q`

Expected: 首次 FAIL；实现后 PASS，wrong permission/stale MFA/replay 在读取 body 前失败。

- [ ] **Step 4: 运行 PostgreSQL repository integration**

Run: `uv --directory apps/skill-registry run pytest tests/test_repository_postgres.py -q`

Expected: PASS；幂等重试返回同一 set，两个并发 create 得到不同连续 set_no，未发布 revision 无残留。

- [ ] **Step 5: 提交**

```bash
git add apps/skill-registry/src/skill_registry/types.py apps/skill-registry/src/skill_registry/repository.py apps/skill-registry/src/skill_registry/service.py apps/skill-registry/src/skill_registry/auth.py apps/skill-registry/src/skill_registry/api.py apps/skill-registry/tests/test_repository.py apps/skill-registry/tests/test_repository_postgres.py apps/skill-registry/tests/test_service.py apps/skill-registry/tests/test_auth.py apps/skill-registry/tests/test_api.py
git commit -m "feat(skills): manage candidate skill sets"
```

## Chunk 2: Agent 物化、generation 租约与激活

### Task 3: 给 Agent 建立只读 runtime repository 和安全物化器

**Files:**
- Modify: `packages/skill-core/src/skill_core/archive.py`
- Create: `packages/skill-core/src/skill_core/materialize.py`
- Modify: `packages/skill-core/tests/test_archive.py`
- Create: `packages/skill-core/tests/test_materialize.py`
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

- [ ] **Step 1: 写 materialize 负向测试**

覆盖 root/generations 为 symlink、目标已存在、ZIP 摘要错误、索引/内容摘要不一致、非 published item、重复 slug、权限设置失败、中途异常和取消。失败后候选目录必须完全删除，既有 generation 不变。

Run: `uv --directory packages/skill-core run pytest tests/test_archive.py tests/test_materialize.py -q`

Expected: FAIL，安全物化 API 尚不存在。

- [ ] **Step 2: 实现 fd-relative 安全物化**

共享包新增 `materialize_canonical_zip(package, destination_fd)`：只消费已通过 Plan A canonical parser 的对象，使用 `dir_fd`、`O_NOFOLLOW|O_EXCL` 逐层创建，不调用 `extractall()`；目录 `0700`、普通文件（包括 `SKILL.md`）`0600`、仅 script `0700`；写后按 file index 逐项复验 SHA-256，最后 `fsync` 并返回冻结 materialization result。

Run: `uv --directory packages/skill-core run pytest tests/test_archive.py tests/test_materialize.py -q`

Expected: PASS。

- [ ] **Step 3: 锁定 Agent 依赖并写 runtime repository 测试**

把 Agent 的 Agno 依赖从范围改为精确 `agno[anthropic,google,openai]==2.7.2`，通过 `[tool.uv.sources]` 引用 `../../packages/skill-core` 并更新 lock。配置新增必填 `SKILL_REGISTRY_RUNTIME_DATABASE_URL`、绝对 `SKILL_RUNTIME_ROOT=/run/aap-skills`，以及范围 1–120 秒、默认 30 秒的 `SKILL_ACTIVATION_DRAIN_TIMEOUT_SECONDS` 和 `SKILL_SHUTDOWN_DRAIN_TIMEOUT_SECONDS`；Secret 不进 repr。

repository 只查询 Task 1 runtime views，公开精确协议：

```python
class SkillRuntimeRepository(Protocol):
    async def load_active_snapshot(self) -> ActiveSkillSetSnapshot | None: ...
    async def load_set_snapshot(self, set_id: UUID) -> SkillSetSnapshot: ...
    async def activate(self, command: ActivateSkillSet) -> int: ...
    async def mark_failed(self, command: FailSkillSet) -> bool: ...
    async def reconcile_activation(self, set_id: UUID) -> ActivationReconciliation: ...
    async def aclose(self) -> None: ...
```

两个 load 都在单个 `REPEATABLE READ READ ONLY` transaction 中读取 header+items，拒绝 torn snapshot；每个 artifact 在返回前重算 SHA-256，集合必须与 header state 一致。`activate/mark_failed/reconcile_activation` 各在一个 transaction 中只调用 Task 1 对应函数，不直接写表；reconcile 必须从 pool 获取新连接，不能复用结果未知的 connection。

Run: `uv --directory apps/agent run pytest tests/test_config.py tests/test_skill_artifact_repository.py -q`

Expected: FAIL，配置/repository 尚不存在。

- [ ] **Step 4: 实现 repository 和 Agent materializer**

`SkillSetMaterializer.prepare(snapshot)` 在 `/run/aap-skills/generations/<set-id>-<random>` 建新目录。数据库已限制每个 set 解压总量 24 MiB；prepare 还用 `statvfs` 要求当前 tmpfs 可用字节至少为候选真实解压量 + 8 MiB reserve。旧 active 和候选在切换前必须共存，不能删除旧 generation 腾空间，也不能只比较候选与 64 MiB 配额。然后逐 item 调共享 materializer并构造：

```python
Skills(loaders=[LocalSkills(path=generation_path, validate=True)])
```

用 `Skills.get_skill_names()` 把 Agno 加载后的 name 集合与数据库期望集合严格等值比较；测试捕获 Agno warning/log，任何 warning、少加载、重复/覆盖、额外 Skill 都固定失败为 `SKILL_LOAD_FAILED`。空集合返回 `skills=None`，仍拥有一个可清理 generation handle。

Docker builder 必须在执行 `uv sync` 前复制 `packages/skill-core/pyproject.toml`、lock 和源码到与 `[tool.uv.sources]` 一致的位置；新增 image build test，防止本地 workspace 依赖只在宿主机可用。

Run: `uv --directory apps/agent run pytest tests/test_skill_artifact_repository.py tests/test_skill_materializer.py -q`

Expected: PASS；测试明确模拟 Agno 构造未抛错但少加载，仍失败。

- [ ] **Step 5: 运行真实 PostgreSQL runtime view 测试并提交**

Precondition: `SKILL_REGISTRY_RUNTIME_DATABASE_URL` 指向 Plan A/B 测试库。

Run: `uv --directory apps/agent run pytest tests/test_skill_artifact_repository_postgres.py -q`

Run: `docker build --target runtime -f apps/agent/Dockerfile .`

Expected: 两条命令均 PASS；runtime 能读取 published candidate/active 制品，不能读 base tables 或非 published revision；Agent image 能从 clean build context 安装本地 skill-core。缺 DSN 时 SKIPPED 不算通过。

```bash
git add packages/skill-core/src/skill_core/archive.py packages/skill-core/src/skill_core/materialize.py packages/skill-core/tests/test_archive.py packages/skill-core/tests/test_materialize.py apps/agent/pyproject.toml apps/agent/uv.lock apps/agent/Dockerfile apps/agent/src/agent_service/config.py apps/agent/src/agent_service/skill_runtime_types.py apps/agent/src/agent_service/skill_artifact_repository.py apps/agent/src/agent_service/skill_materializer.py apps/agent/tests/test_config.py apps/agent/tests/test_skill_artifact_repository.py apps/agent/tests/test_skill_artifact_repository_postgres.py apps/agent/tests/test_skill_materializer.py
git commit -m "feat(agent): prepare reviewed skill generations"
```

### Task 4: 实现 generation 读写租约和原子 coordinator

**Files:**
- Create: `apps/agent/src/agent_service/skill_runtime_slot.py`
- Create: `apps/agent/src/agent_service/skill_generation_coordinator.py`
- Create: `apps/agent/src/agent_service/skill_run_lease_middleware.py`
- Create: `apps/agent/tests/test_skill_runtime_slot.py`
- Create: `apps/agent/tests/test_skill_generation_coordinator.py`
- Create: `apps/agent/tests/test_skill_run_lease_middleware.py`

- [ ] **Step 1: 写 run lease ASGI 测试**

只对 `POST /agents/maduoduo/runs` 和 canonical trailing-slash 变体获取读租约；租约覆盖完整 streaming response，直到最后一个 `http.response.body more_body=false`。覆盖并发 run、客户端取消、下游异常、send 异常、非目标路由和 writer 等待期间不允许新 run 入场。

Run: `uv --directory apps/agent run pytest tests/test_skill_run_lease_middleware.py -q`

Expected: FAIL，middleware 尚不存在。

- [ ] **Step 2: 实现公平、可取消的 generation 租约**

`SkillGenerationLease` 维护 active readers、writer pending 和 condition；writer pending 后新 reader 排队，避免激活饥饿。read context 的 `finally` 必须释放；write acquire 使用配置的 activation drain timeout，失败/取消后唤醒等待者。

另提供 `close_and_drain(timeout)`：原子关闭 reader gate、拒绝新 run，并等待已有 reader；shutdown timeout 后不删除仍可能使用的 generation，容器退出交给 tmpfs 回收。覆盖重复 close、等待中取消和 timeout。

Run: `uv --directory apps/agent run pytest tests/test_skill_run_lease_middleware.py -q`

Expected: PASS。

- [ ] **Step 3: 写 coordinator 状态机失败测试**

新增具体 `SkillRuntimeSlot`，只持有预构造的 `(Skills | None, GenerationHandle)` 引用。`commit_prepared(prepared)` 是 `@final` 同步方法，只做固定 slots tuple assignment，不调用 callback、property setter、日志或 allocator-heavy 转换。coordinator 不接受可由调用方实现的任意 Protocol。

```python
@final
class SkillRuntimeSlot:
    def commit_prepared(self, prepared: PreparedSkillGeneration) -> GenerationHandle | None: ...
```

覆盖 prepare/digest/load 失败、drain timeout、CAS conflict、明确的 DB rollback、commit 前连接失败、commit 已成功但响应丢失、commit 结果无法判定、mark-failed failure、空集合、成功切换、旧目录清理、取消以及两个 activate 并发。确定的 pre-commit 失败必须保持旧 slot/active pointer/generation；成功路径断言 DB commit 到 `commit_prepared()` 之间没有 await、文件、网络或数据库调用。

测试只在运行时 monkeypatch concrete class method，模拟 DB commit 后引用交换抛出异常：coordinator 必须永久关闭 run gate、标 capability degraded、保留 generation、抛 `FatalSkillRuntimeDivergence` 让上层触发 supervisor restart，绝不能释放 gate 后继续用旧内存状态；生产构造器不暴露 fault callback。

Run: `uv --directory apps/agent run pytest tests/test_skill_generation_coordinator.py -q`

Expected: FAIL，coordinator 尚不存在。

- [ ] **Step 4: 实现两阶段 prepare/activate**

`prepare(set_id)` 先用 `load_set_snapshot()` 在写锁外完成。进入写租约并 drain 后，repository `activate()` 调用数据库函数，在事务内重验 published 集合并 CAS；收到确定 commit 成功后只做预先验证过的 concrete slot 引用赋值和 generation handle 更新，再释放锁。旧 generation 在无租约后删除。

repository 必须区分确定 rollback/函数错误与 `ActivationCommitUnknown`（commit 调用中连接断开或响应丢失）。结果不确定时 writer gate 保持关闭，coordinator 用新连接调用 `reconcile_agent_skill_activation`；该函数先取得同一 advisory lock，保证原 CAS transaction 已完成，再返回 active pointer/target state：

1. 若 active set 是目标 set 且 version=`expected+1`，视为已提交，立即 `commit_prepared()`；
2. 若仍是原 set/version（首次激活则仍无 pointer/version 0），视为未提交，按普通 storage failure 清候选并尝试 mark failed；
3. 若读到其他 set/version，或新连接仍超时/失败，永久关闭 run gate、capability=`degraded`、保留两代文件并抛 `FatalSkillRuntimeDivergence`，等待 supervisor 重启按数据库恢复。

判定期间不允许新 run，也不允许第二个 activate 入场；不得盲目重试 CAS。

失败用 `mark_agent_skill_set_failed` 写稳定 code：`ARTIFACT_DIGEST_MISMATCH|SKILL_LOAD_FAILED|ACTIVATION_VERSION_CONFLICT|ACTIVATION_DRAIN_TIMEOUT|ACTIVATION_CANCELLED|STORAGE_UNAVAILABLE`；取消发生在 commit 前时清理候选并尝试标 failed，旧运行时不变；DB commit 一旦成功，外部取消必须被 shield 到 slot commit 完成。记录失败本身失败时只写脱敏日志，不覆盖原错误或旧运行时。

若 `mark_failed()` 返回 false，仍保持 writer gate，必须再次调用同锁 reconcile：目标 set 已 active/version=`expected+1` 时完成 slot commit；pointer 仍旧且 target state=`failed` 时才可保留旧 slot 并释放；其他状态或无法读取一律进入永久 degraded/fatal 分支。禁止“逐个加载并保留成功项”。

Run: `uv --directory apps/agent run pytest tests/test_skill_generation_coordinator.py tests/test_skill_run_lease_middleware.py -q`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/agent/src/agent_service/skill_runtime_slot.py apps/agent/src/agent_service/skill_generation_coordinator.py apps/agent/src/agent_service/skill_run_lease_middleware.py apps/agent/tests/test_skill_runtime_slot.py apps/agent/tests/test_skill_generation_coordinator.py apps/agent/tests/test_skill_run_lease_middleware.py
git commit -m "feat(agent): atomically swap skill generations"
```

### Task 5: 接入 Agent control API、默认 Agent 和启动恢复

**Files:**
- Create: `apps/agent/src/agent_service/control_auth.py`
- Create: `apps/agent/src/agent_service/skill_control_auth.py`
- Create: `apps/agent/src/agent_service/skill_control_api.py`
- Modify: `apps/agent/src/agent_service/model_control_api.py`
- Modify: `apps/agent/src/agent_service/default_agent.py`
- Modify: `apps/agent/src/agent_service/app.py`
- Create: `apps/agent/tests/test_control_auth.py`
- Create: `apps/agent/tests/test_skill_control_auth.py`
- Create: `apps/agent/tests/test_skill_control_api.py`
- Modify: `apps/agent/tests/test_model_control_api.py`
- Modify: `apps/agent/tests/test_default_agent.py`
- Modify: `apps/agent/tests/test_app.py`

- [ ] **Step 1: 写共享 control dispatcher 和 Skill assertion 失败测试**

当前 `ModelControlAuthMiddleware` 会接管整个 `/internal/control/`。新增 dispatcher 必须按精确路由把 model-config 请求交给原 authenticator，把 skills 请求交给新 authenticator，未知 control route 在读取 body 前拒绝；保留 `CONTROL_PATH_PREFIX` 和 `ModelControlAuthMiddleware` 兼容 export，现有模型控制测试不得改成宽松断言。

Skill HMAC domain 固定 `ai-agent-platform:skill-control-assertion:v1`，仍使用 `AGENT_CONFIG_CONTROL_KEY` 但派生 key 不同。Agent/Web 共享固定映射：

| Route | action | target | permission | assurance | nonce |
| --- | --- | --- | --- | --- | --- |
| GET status | `skill_runtime_status` | `maduoduo` | `admin:assistant:skills` | `session` | 5 秒内存 read nonce |
| POST activate | `skill_runtime_activate` | `maduoduo:{setId}:{expectedActivationVersion}` | `admin:assistant:skills:configure` | `password+mfa`，`assuredAt<=600s` | DB mutation nonce |

activate payload 还绑定 actor、requestId 和 canonical UUID nonce。action/target/permission 任一不符都在读取 body 前失败。

Run: `uv --directory apps/agent run pytest tests/test_control_auth.py tests/test_skill_control_auth.py tests/test_model_control_api.py -q`

Expected: FAIL，新 dispatcher/authenticator 尚不存在。

- [ ] **Step 2: 实现 dispatcher、authenticator 和私有 API**

新增：

```text
GET  /internal/control/skills/status
POST /internal/control/skills/activate
```

status 返回 `unconfigured|ready|activating|degraded`、active set ID、activation version、摘要列表；activate body 最多 8 KiB，只含 assertion 已绑定的 set/version，调用 coordinator 并返回最终状态。Bearer/assertion、no-store、错误大小和 pre-body 行为沿用模型控制标准；稳定错误不带路径、源码或内部异常。

Run: `uv --directory apps/agent run pytest tests/test_control_auth.py tests/test_skill_control_auth.py tests/test_skill_control_api.py tests/test_model_control_api.py -q`

Expected: PASS，模型控制 API 无回归。

- [ ] **Step 3: 写默认 Agent、启动恢复和 readiness 测试**

更新说明：码多多只能使用当前已激活且经过审核的 Skill 工具；没有工具时必须如实说明。移除永久“你没有工具”的矛盾文案，但不放宽页面/内部数据能力。测试 `tools=None` 且无活动集合时仍没有工具；有候选时 Agno 2.7.2 暴露精确三项 `get_skill_instructions`、`get_skill_reference`、`get_skill_script`，执行脚本通过 `get_skill_script(..., execute=True)`。

启动恢复覆盖：确认数据库可达且无 pointer 时才是 `unconfigured` 且 ready；合法 pointer 在全局 readiness 成功前完成物化=`ready`；runtime DB 连接失败/超时、active view 查询失败、artifact 缺失/摘要错误/LocalSkills 失败时一律 liveness 200、readiness 503、capability=`degraded`，不能静默退成无 Skill。

Run: `uv --directory apps/agent run pytest tests/test_default_agent.py tests/test_app.py -q`

Expected: FAIL，default agent/app 尚未装配 skills runtime。

- [ ] **Step 4: 装配 lifespan、runtime target 和 lease middleware**

Agent app 只创建一个 Skill runtime repository/materializer/coordinator；构造 `maduoduo` 后用 concrete `SkillRuntimeSlot` 更新 `agent.skills`。startup recovery 完成前 readiness 不成功；shutdown 先 `close_and_drain(SKILL_SHUTDOWN_DRAIN_TIMEOUT_SECONDS)`，成功才删除 generations，再关闭 runtime repository；drain timeout 时 readiness 保持 degraded、保留 generation 让容器 tmpfs 回收，不冒险删除仍被 run 使用的文件。取消时使用现有 shielded ordered cleanup 风格。

Run: `uv --directory apps/agent run pytest tests/test_default_agent.py tests/test_app.py tests/test_skill_control_api.py tests/test_model_control_api.py -q`

Expected: PASS；模型动态激活和 Skill 激活可独立工作；shutdown drain timeout 不悬挂、不提前删 generation。

- [ ] **Step 5: 提交**

```bash
git add apps/agent/src/agent_service/control_auth.py apps/agent/src/agent_service/skill_control_auth.py apps/agent/src/agent_service/skill_control_api.py apps/agent/src/agent_service/model_control_api.py apps/agent/src/agent_service/default_agent.py apps/agent/src/agent_service/app.py apps/agent/tests/test_control_auth.py apps/agent/tests/test_skill_control_auth.py apps/agent/tests/test_skill_control_api.py apps/agent/tests/test_model_control_api.py apps/agent/tests/test_default_agent.py apps/agent/tests/test_app.py
git commit -m "feat(agent): restore and activate reviewed skills"
```

## Chunk 3: Web 编排、后台配置与验收

### Task 6: 建立 Web runtime 合同和两个私有客户端

**Files:**
- Modify: `apps/web/src/features/assistant/admin-skill-contract.ts`
- Modify: `apps/web/src/features/assistant/admin-skill-contract.test.ts`
- Modify: `apps/web/src/server/assistant/skill-registry-client.ts`
- Modify: `apps/web/src/server/assistant/skill-registry-client.test.ts`
- Create: `apps/web/src/server/assistant/agent-skill-control-client.ts`
- Create: `apps/web/src/server/assistant/agent-skill-control-client.test.ts`
- Modify: `apps/web/src/server/auth/audit.ts`
- Modify: `apps/web/src/server/auth/audit.test.ts`

- [ ] **Step 1: 写严格 set/runtime 合同和签名测试**

合同新增 candidate/history/active set、diff、runtime capability、activation version 和稳定错误码；拒绝额外字段、重复 revision、非 canonical UUID/int、超过 32 items。Registry client 增加 list/create/rollback；Agent client 增加 status/activate。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/features/assistant/admin-skill-contract.test.ts src/server/assistant/skill-registry-client.test.ts src/server/assistant/agent-skill-control-client.test.ts`

Expected: FAIL，新合同/client 尚不存在。

- [ ] **Step 2: 实现私有客户端和 assertion**

Registry candidate mutation 与 Agent activate 分别生成独立 requestId/nonce，均签 configure+recent MFA；不得把 Registry control key 发给 Agent，或把 Agent control key发给 Registry。Agent URL 复用现有私有 AgentOS origin，固定超时：status 2 秒、activate 45 秒；response 上限 64 KiB、no-store、严格 media type。

client 的 action/target/permission/assurance/nonce 必须逐项匹配 Task 2 与 Task 5 表格；合同测试用相同 canonical fixture 同时验证 Web signer、Registry verifier 和 Agent verifier，禁止三份自由拼字符串。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/features/assistant/admin-skill-contract.test.ts src/server/assistant/skill-registry-client.test.ts src/server/assistant/agent-skill-control-client.test.ts`

Expected: PASS。

- [ ] **Step 3: 扩展平台审计并验证脱敏**

新增 `assistant.skill_activation_requested/completed`，metadata 只含 agentId、setId、expected/final activationVersion、item count、requestId、result/error code；不含 revision 文件、源码、generation path 或 assertion。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/auth/audit.test.ts`

Expected: 首次 FAIL；实现后 PASS。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/features/assistant/admin-skill-contract.ts apps/web/src/features/assistant/admin-skill-contract.test.ts apps/web/src/server/assistant/skill-registry-client.ts apps/web/src/server/assistant/skill-registry-client.test.ts apps/web/src/server/assistant/agent-skill-control-client.ts apps/web/src/server/assistant/agent-skill-control-client.test.ts apps/web/src/server/auth/audit.ts apps/web/src/server/auth/audit.test.ts
git commit -m "feat(skills): add runtime activation clients"
```

### Task 7: 实现 activate/rollback 命令层和 Admin BFF

**Files:**
- Modify: `apps/web/src/server/assistant/admin-skill-commands.ts`
- Modify: `apps/web/src/server/assistant/admin-skill-commands.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/runtime/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/runtime/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/skill-sets/activate/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/skill-sets/activate/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/skill-sets/[setId]/rollback/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/skill-sets/[setId]/rollback/route.test.ts`

- [ ] **Step 1: 写编排失败测试**

activate 请求固定 `{revisionIds, expectedActivationVersion, idempotencyKey}`；rollback 固定 `{expectedActivationVersion,idempotencyKey}`。两者要求 trusted mutation、configure 权限、最近密码+TOTP。覆盖 Registry create 成功但 Agent activate 失败、Agent timeout/CAS conflict、重复提交、stale version、空集合、自审 actor 无关、completed failure 审计。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/assistant/admin-skill-commands.test.ts src/app/api/v1/admin/assistant/skills/runtime src/app/api/v1/admin/assistant/skills/skill-sets`

Expected: FAIL，命令/路由尚未实现。

- [ ] **Step 2: 实现串行编排，不伪造分布式事务**

命令先调用 Registry 创建/克隆 candidate，再调用 Agent activate。Agent 失败时返回稳定失败和 set ID，不能删除 candidate、不能把页面旧 active 改掉；是否 failed 由 Agent runtime function 决定。相同 idempotency key 重试复用 candidate，并再次读取 Agent status 决定是否需要 activate。

runtime GET 并行读取 Registry set metadata 和 Agent status；二者 set/version 不一致时返回 `capability=degraded`，不能用任一方覆盖另一方。

- [ ] **Step 3: 跑 BFF 绿灯和相关回归**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/assistant/admin-skill-commands.test.ts src/app/api/v1/admin/assistant/skills`

Expected: PASS；read 用户只能看 runtime/list，只有 super_admin 能 mutation；所有响应 no-store。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/server/assistant/admin-skill-commands.ts apps/web/src/server/assistant/admin-skill-commands.test.ts apps/web/src/app/api/v1/admin/assistant/skills/runtime apps/web/src/app/api/v1/admin/assistant/skills/skill-sets
git commit -m "feat(skills): orchestrate agent skill activation"
```

### Task 8: 在后台加入码多多 Skill 配置 UI

**Files:**
- Create: `apps/web/src/components/admin/assistant-skill-configuration-panel.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-configuration-panel.test.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-set-diff.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-set-diff.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-registry-panel.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-registry-panel.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-capability-roadmap.tsx`
- Modify: `apps/web/src/components/admin/assistant-capability-roadmap.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.css`
- Modify: `apps/web/src/app/admin/assistant/page.tsx`
- Modify: `apps/web/src/app/admin/assistant/page.test.tsx`

- [ ] **Step 1: 写配置行为和可访问性失败测试**

测试只列 published revision；每个 Skill 只能选一个 revision；显示当前 activation version、active/candidate/history 和新增/升级/降级/移除 diff；无 configure 权限不显示激活/清空/回滚；mutation 前 MFA；激活中禁用重复提交；失败保留旧 active；成功响应后再次 GET runtime 才显示运行中。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/admin/assistant-skill-configuration-panel.test.tsx src/components/admin/assistant-skill-set-diff.test.tsx src/components/admin/assistant-skill-registry-panel.test.tsx src/components/admin/assistant-admin-page.test.tsx`

Expected: FAIL，新 panel 尚不存在。

- [ ] **Step 2: 实现配置 panel 和页面数据装配**

RegistryPanel 继续负责库/审核；ConfigurationPanel 独立负责 Agent binding。页面并行加载 Skill list、set metadata、Agent runtime status；任一运行时来源失败或不一致显示 degraded。roadmap 改为“Registry + 码多多运行时已接入 / Git 导入待接”。

- [ ] **Step 3: 完成样式并跑 UI 绿灯**

复用现有 token；状态不仅靠颜色；diff 使用语义列表；错误 aria-live；MFA dialog focus 可回收；不得把脚本内容带进配置 panel DOM。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/admin/assistant-skill-configuration-panel.test.tsx src/components/admin/assistant-skill-set-diff.test.tsx src/components/admin/assistant-skill-registry-panel.test.tsx src/components/admin/assistant-admin-page.test.tsx src/components/admin/assistant-capability-roadmap.test.tsx src/app/admin/assistant/page.test.tsx`

Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/admin/assistant-skill-configuration-panel.tsx apps/web/src/components/admin/assistant-skill-configuration-panel.test.tsx apps/web/src/components/admin/assistant-skill-set-diff.tsx apps/web/src/components/admin/assistant-skill-set-diff.test.tsx apps/web/src/components/admin/assistant-skill-registry-panel.tsx apps/web/src/components/admin/assistant-skill-registry-panel.test.tsx apps/web/src/components/admin/assistant-admin-page.tsx apps/web/src/components/admin/assistant-admin-page.test.tsx apps/web/src/components/admin/assistant-capability-roadmap.tsx apps/web/src/components/admin/assistant-capability-roadmap.test.tsx apps/web/src/components/admin/assistant-admin-page.css apps/web/src/app/admin/assistant/page.tsx apps/web/src/app/admin/assistant/page.test.tsx
git commit -m "feat(skills): add maduoduo skill configuration UI"
```

### Task 9: 部署 executable tmpfs 和 runtime 数据库边界

**Files:**
- Modify: `apps/agent/Dockerfile`
- Modify: `compose.yaml`
- Modify: `.env.example`
- Modify: `infra/docker/run-agent-with-secret-env.sh`
- Create: `infra/docker/verify-agent-skill-tmpfs.py`
- Modify: `packages/database/src/deployment-contracts.test.ts`

- [ ] **Step 1: 写部署合同失败测试**

断言 Agent 新增独立 `skill_registry_runtime_database_url` Secret，只注入 Agent；`/run/aap-skills:rw,exec,nosuid,nodev,size=64m,uid=10001,gid=10001,mode=0700` 是唯一 executable tmpfs；根文件系统只读、`/tmp` noexec、非 root、cap drop、no-new-privileges、资源/PID 限制不变。Web/Registry 不挂载 runtime DSN，Agent 不挂载 Registry manager/control/source key。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: FAIL，Agent 尚无 Skill runtime 部署合同。

- [ ] **Step 2: 实现 Compose 和镜像目录合同**

镜像只创建空 `/run/aap-skills` mount point，并复制 root-owned `0555` 自检脚本。运行时必须验证它是 tmpfs、UID/GID=10001、mode=0700、当前 Agent UID 可写且允许执行，禁止退回 `/tmp` 或工作区目录。`run-agent-with-secret-env.sh` 在 drop privilege 前做 mount/owner/mode 检查，不复制制品。

- [ ] **Step 3: 跑 deployment contract 和容器 smoke**

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Run: `docker compose config --quiet`

Run: `docker compose run --rm --no-deps --user 10001:10001 --entrypoint python agent /opt/aap/verify-agent-skill-tmpfs.py`

Expected: 三条命令均 PASS；自检实际在 tmpfs 创建 `0700` POSIX sh、执行并清除；配置中 Agent 只连接 `backend + model_egress`，没有 Git Secret/网络。

- [ ] **Step 4: 提交**

```bash
git add apps/agent/Dockerfile compose.yaml .env.example infra/docker/run-agent-with-secret-env.sh infra/docker/verify-agent-skill-tmpfs.py packages/database/src/deployment-contracts.test.ts
git commit -m "feat(agent): isolate executable skill generations"
```

### Task 10: 把 runtime schema、Agent 单测和 tmpfs smoke 接入 CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `packages/database/src/deployment-contracts.test.ts`

- [ ] **Step 1: 写 CI/部署 fixture 合同失败测试**

CI 必须运行 schema v2 migration 两次、runtime role integration、Agent materializer/coordinator/middleware/启动恢复测试、Agent image 中 allowlist import、Task 9 的 executable tmpfs smoke；真实 PostgreSQL DSN 缺失不得被当作通过。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: FAIL，CI 尚未纳入 runtime gates。

- [ ] **Step 2: 更新 CI 并跑合同绿灯**

CI 使用明确 job/step name，给 Agent/Registry 注入隔离 runtime/manager DSN；tmpfs smoke 必须运行真实容器命令，不能只 grep Compose。现有模型控制、AgentOS 和 Web jobs 不删除或改成 allow-failure。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/ci.yml package.json packages/database/src/deployment-contracts.test.ts
git commit -m "ci(skills): enforce runtime activation gates"
```

### Task 11: 运行确定性 activation 与故障 E2E

**Files:**
- Create: `apps/web/e2e/admin-skill-runtime.spec.ts`
- Create: `docs/testing/fixtures/skill-runtime-corruption.sql`
- Create: `docs/testing/run-assistant-skill-runtime-e2e.sh`

- [ ] **Step 1: 写 E2E 并确认红灯**

在独立 Compose project 中：管理员 A 上传包含 SKILL.md、reference、Python 和 POSIX sh 的 deterministic Skill；管理员 B MFA 后发布；B 激活；真实 `/agents/maduoduo/runs` 能看到精确三项 Skill 工具，并分别读取 instruction/reference、执行两个安全脚本。再覆盖损坏 candidate 保留旧 set、同 candidate 并发 activate、并发长 run 激活等待、drain timeout、空集合、历史回滚、Agent 重启恢复相同摘要、活动 artifact 损坏后 readiness 503。

Run: `sh docs/testing/run-assistant-skill-runtime-e2e.sh`

Expected: FAIL，runner/spec 尚不存在。

- [ ] **Step 2: 实现隔离故障注入和 E2E runner**

E2E 使用 deterministic model，不调用外部模型/Git；脚本只写 `/run/aap-skills` 测试目录并验证 Agent 用户权限。损坏制品只能由测试 runner 使用隔离 project 的 PostgreSQL superuser 注入：先验证 Compose project label 和数据库名以 `aap_skill_runtime_e2e_` 开头、停止 Agent，再在一个 transaction 中临时 disable artifact 表 user trigger、只翻转 fixture revision 的一个 byte、立即 re-enable。fixture 自带数据库名前缀 guard；trap 无条件销毁整套 volumes。禁止增加生产 corruption API、生产 bypass role 或常驻 trigger 开关。

Run: `sh docs/testing/run-assistant-skill-runtime-e2e.sh`

Expected: `Assistant Skill Runtime E2E passed`；trap 后 project 容器/网络/卷为空，宿主机无 Skill 解压目录。

- [ ] **Step 3: 提交**

```bash
git add apps/web/e2e/admin-skill-runtime.spec.ts docs/testing/fixtures/skill-runtime-corruption.sql docs/testing/run-assistant-skill-runtime-e2e.sh
git commit -m "test(skills): verify atomic activation failures"
```

### Task 12: 扩展加密 backup/restore 到 active Skill 集合

**Files:**
- Modify: `infra/docker/restore-drill.sh`
- Modify: `infra/docker/README.md`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Create: `docs/testing/run-assistant-skill-backup-restore.sh`

- [ ] **Step 1: 写 schema v2 恢复合同失败测试**

断言 restore drill 验证 set/items/active pointer 行数、active items 全部 published、activation version、artifact SHA-256；恢复后必须启动 Agent 并确认 runtime status 的 set/version/digest 与备份前完全一致。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: FAIL，Plan A restore drill 只覆盖 revision/artifact。

- [ ] **Step 2: 实现 v2 restore drill 和独立 runner**

runner 创建并激活 deterministic set，记录数据库与 Agent status snapshot，调用现有加密 backup，恢复到隔离数据库，验证 relational/digest invariants，再让隔离 Agent 使用恢复库启动。不得输出 archive、源码、数据库 Secret 或解密 key。

- [ ] **Step 3: 运行真实恢复验收**

Precondition: 已导出 `infra/docker/README.md` 声明的隔离 backup/restore secrets，Docker 可用。

Run: `sh docs/testing/run-assistant-skill-backup-restore.sh`

Expected: `Assistant Skill backup/restore passed`；恢复 Agent status 与备份前 set/version/digest 完全相同，trap 后零容器/网络/卷残留。

- [ ] **Step 4: 提交**

```bash
git add infra/docker/restore-drill.sh infra/docker/README.md packages/database/src/deployment-contracts.test.ts docs/testing/run-assistant-skill-backup-restore.sh
git commit -m "test(skills): restore active skill sets"
```

### Task 13: 完成交付文档和全量回归

**Files:**
- Create: `docs/testing/assistant-skill-runtime-acceptance.md`
- Modify: `docs/testing/README.md`
- Modify: `apps/agent/src/agent_service/skills/README.md`

- [ ] **Step 1: 写运行与风险文档**

记录环境变量、状态/错误合同、恢复命令、故障排查和验收证据。必须明确“审核过的脚本可执行，但 LocalSkills 不是沙箱”，列出环境变量读取、模型出口、文件与资源消耗风险；不得宣称安全隔离。

- [ ] **Step 2: 跑完整门禁**

```bash
uv --directory packages/skill-core run pytest -q
uv --directory packages/skill-core run ruff check .
uv --directory packages/skill-core run mypy src tests
uv --directory apps/skill-registry run pytest -q -rs
uv --directory apps/skill-registry run ruff check .
uv --directory apps/skill-registry run mypy src tests
uv --directory apps/agent run pytest -q -rs
uv --directory apps/agent run ruff check .
uv --directory apps/agent run mypy src tests
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Run: `sh docs/testing/run-assistant-skill-runtime-e2e.sh`

Run: `sh docs/testing/run-assistant-skill-backup-restore.sh`

Expected: 全部 PASS；PostgreSQL integration 无 skip；当前动态模型、会话和 assistant runtime E2E 无回归。

- [ ] **Step 3: 提交**

```bash
git add docs/testing/assistant-skill-runtime-acceptance.md docs/testing/README.md apps/agent/src/agent_service/skills/README.md
git commit -m "docs(skills): document reviewed skill execution"
```

## Plan B completion checkpoint

- 只有 `published` exact revision 能进入 candidate；
- Agent 对整个集合做摘要复验、等值 LocalSkills 加载和原子 CAS；
- 失败、取消、超时和损坏都保留旧 active set；
- 新 run 不会在 activation 中拿到混合 generation；
- 重启按数据库 active pointer 恢复，损坏时 readiness 失败关闭；
- 空集合能显式关闭全部 Skill；
- 脚本可执行风险已明确，本阶段没有沙箱。

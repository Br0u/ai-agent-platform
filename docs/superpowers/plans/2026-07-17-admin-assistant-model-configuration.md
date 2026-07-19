# AI 助理后台动态模型配置 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `/admin/assistant` 中安全管理六家云模型配置，并在测试成功后让“码多多”无需重启原子切换活动模型。

**Architecture:** 复用现有 AgentOS 单 Agent 闭环。Web 继续负责 workforce 鉴权、recent MFA、平台审计和 BFF；Agent 新增独立配置控制面，使用专用 PostgreSQL schema、AES-256-GCM、Endpoint allowlist 和稳定模型槽持久化并激活动态配置。部署总开关和 env bootstrap 继续保留，Skill、Knowledge、Tools 与本地算力只保留诚实入口。

**Tech Stack:** Python 3.13、FastAPI、Agno 2.7.2、psycopg 3、cryptography、PostgreSQL 18、Next.js 16、React 19、TypeScript 5.9、Drizzle ORM、Vitest、Pytest、Playwright、Docker Compose。

**Spec:** `docs/superpowers/specs/2026-07-17-admin-assistant-model-configuration-design.md`

---

## File responsibility map

### Agent control plane

- `apps/agent/src/agent_service/model_config_types.py` — Provider 配置、状态、revision 和脱敏 DTO；不读环境、不访问数据库。
- `apps/agent/src/agent_service/model_endpoint_catalog.py` — 官方 Endpoint 和部署 allowlist 的解析、规范化与 Provider 匹配。
- `apps/agent/src/agent_service/model_config_crypto.py` — AES-256-GCM seal/open；不负责持久化。
- `apps/agent/src/agent_service/model_config_schema.py` — `agent_control` schema 的版本化 SQL 常量。
- `apps/agent/src/agent_service/model_config_migrate.py` — 一次性控制面迁移入口。
- `apps/agent/src/agent_service/model_runtime_types.py` — `ManagedModel` 所有权与幂等异步关闭合同。
- `apps/agent/src/agent_service/model_config_repository.py` — 仓储 Protocol、PostgreSQL 实现、乐观锁、活动指针和 control event 事务。
- `apps/agent/src/agent_service/model_verifier.py` — 候选模型的一次性无工具验证；CLI 与 Admin 共用。
- `apps/agent/src/agent_service/model_runtime_slot.py` — 稳定 Agent 内的模型 delegate 快照和热切换。
- `apps/agent/src/agent_service/model_control_service.py` — 保存、测试、激活、reveal 的用例编排。
- `apps/agent/src/agent_service/model_control_auth.py` — 独立 Bearer、短期 assertion 和一次性 nonce 验证。
- `apps/agent/src/agent_service/model_control_api.py` — 内部 FastAPI DTO、错误映射和薄路由。

### Web control plane

- `apps/web/src/features/assistant/admin-model-config-contract.ts` — 浏览器/BFF 的严格版本化 DTO 与运行时 guards。
- `apps/web/src/server/assistant/agent-model-control-client.ts` — 复用 AgentOS transport 的私有控制客户端与脱敏错误分类。
- `apps/web/src/server/assistant/admin-model-config-commands.ts` — recent MFA、权限、requested/completed 审计和 Agent 命令协调。
- `apps/web/src/server/http/require-trusted-mutation.ts` — Admin mutation 的可信 Origin、fetch metadata 和 content type 前置检查。
- `apps/web/src/app/api/v1/admin/assistant/model-configs/**` — GET/PUT/test-and-activate/reveal 的薄 route handlers。
- `apps/web/src/components/admin/assistant-model-config-panel.tsx` — 云 Provider 列表与编辑面板。
- `apps/web/src/components/admin/use-model-key-reveal.ts` — reveal、30 秒倒计时与生命周期清空。
- `apps/web/src/components/admin/assistant-capability-roadmap.tsx` — 本地算力、Skill、Knowledge、Tools 的诚实预留卡片。

### Deployment and acceptance

- `infra/postgres/04-agent-control-roles.sql` / `.sh` — 控制面 migrator/runtime 角色。
- `compose.yaml` / `compose.e2e.yaml` — Secret、角色 bootstrap、迁移依赖和私有网络。
- `docs/testing/run-assistant-runtime-e2e.sh` — 动态配置确定性验收与泄漏扫描。
- `apps/web/e2e/assistant-runtime.spec.ts` — 管理配置、失败不切换、成功热切换、重启恢复、reveal 权限与清理。

## Chunk 1: Agent-owned configuration control plane

### Task 1: Seed independent Admin permissions and typed audit events

**Files:**
- Modify: `packages/database/src/seed-access-control.ts`
- Modify: `packages/database/src/seed-access-control.test.ts`
- Modify: `packages/database/src/seed-access-control.integration.test.ts`
- Modify: `apps/web/src/server/auth/audit.ts`
- Modify: `apps/web/src/server/auth/audit.test.ts`

- [ ] **Step 1: Write failing permission seed tests**

Assert both keys exist, only `super_admin` receives them by default, and the existing `admin` role keeps only `admin:assistant`:

```ts
expect(permissionKeys).toContain("admin:assistant:configure");
expect(permissionKeys).toContain("admin:assistant:secret:reveal");
expect([...repository.grants.get("workforce:super_admin")!]).toEqual(
  expect.arrayContaining([
    "admin:assistant:configure",
    "admin:assistant:secret:reveal",
  ]),
);
const adminGrants = [...repository.grants.get("workforce:admin")!];
expect(adminGrants).not.toContain("admin:assistant:configure");
expect(adminGrants).not.toContain("admin:assistant:secret:reveal");
```

- [ ] **Step 2: Run permission tests to verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/database exec vitest run \
  src/seed-access-control.test.ts src/seed-access-control.integration.test.ts
```

Expected: FAIL because the two permissions are absent.

- [ ] **Step 3: Add the permission definitions and grants**

Add exact permission names/descriptions and grant them only to `super_admin`; do not infer authorization from role names in later handlers.

- [ ] **Step 4: Write failing audit schema tests**

Add requested/completed events with bounded metadata:

```ts
type AssistantModelAuditMetadata = {
  provider: "openai" | "anthropic" | "google" | "dashscope" | "deepseek" | "minimax";
  modelId: string;
  endpointId: string;
  revision: number;
  requestId: string;
  result: "requested" | "success" | "failure";
};
```

Test exact-key rejection for `apiKey`, `lastFour`, `ciphertext`, `baseUrl`, `prompt`, `response` and raw error fields.

- [ ] **Step 5: Run audit tests to verify RED**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/auth/audit.test.ts`

Expected: FAIL because assistant model events and target type are absent.

- [ ] **Step 6: Implement bounded assistant audit schemas**

Add target type `assistant_model_config` and the eight spec events. Keep metadata parsers explicit; do not use a generic arbitrary-record pass-through.

- [ ] **Step 7: Run focused tests and static checks**

Run:

```bash
pnpm --filter @ai-agent-platform/database exec vitest run src/seed-access-control.test.ts
pnpm --filter @ai-agent-platform/database exec vitest run src/seed-access-control.integration.test.ts
pnpm --filter @ai-agent-platform/web exec vitest run src/server/auth/audit.test.ts
pnpm --filter @ai-agent-platform/database typecheck
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: all exit 0. The seed tests assert the complete permission count and exact grant matrix for every workforce role, not only the two new positive grants.

- [ ] **Step 8: Commit**

```bash
git add packages/database/src/seed-access-control.ts \
  packages/database/src/seed-access-control.test.ts \
  packages/database/src/seed-access-control.integration.test.ts \
  apps/web/src/server/auth/audit.ts apps/web/src/server/auth/audit.test.ts
git commit -m "feat(assistant): 增加模型配置权限与审计事件"
```

### Task 2: Provision isolated `agent_control` roles and schema migration

**Files:**
- Create: `infra/postgres/04-agent-control-roles.sql`
- Create: `infra/postgres/04-agent-control-roles.sh`
- Create: `apps/agent/src/agent_service/model_config_schema.py`
- Create: `apps/agent/src/agent_service/model_config_migrate.py`
- Create: `apps/agent/tests/test_model_config_migrate.py`
- Create: `apps/agent/tests/test_model_config_migrate_postgres.py`
- Create: `packages/database/src/agent-control-role-boundary.integration.test.ts`
- Modify: `apps/agent/src/agent_service/config.py`
- Modify: `apps/agent/tests/test_config.py`

- [ ] **Step 1: Write failing control migration settings tests**

Require credentialed async psycopg URLs and hide them in validation output:

```python
settings = ControlMigrationSettings.model_validate({
    "AGENT_CONTROL_MIGRATOR_DATABASE_URL": MIGRATOR_URL,
})
assert settings.database_url.get_secret_value() == MIGRATOR_URL
```

Runtime settings must accept `AGENT_CONTROL_DATABASE_URL`, `MODEL_CONFIG_ENCRYPTION_KEY`, `AGENT_CONFIG_CONTROL_KEY`, and `MODEL_ENDPOINTS_FILE`; all secret fields use `SecretStr`, `repr=False`, and existing URL validation.

The encryption key is exactly 64 lowercase hex characters (`openssl rand -hex 32`), decoded to exactly 32 bytes. Control and AgentOS bearer keys must each contain at least 32 bytes and must not be equal.

- [ ] **Step 2: Run config tests to verify RED**

Run: `uv --directory apps/agent run pytest tests/test_config.py -q`

Expected: FAIL because control settings do not exist.

- [ ] **Step 3: Add strict control settings and key-separation validation**

Keep the deployment kill switch. Relax only the old coupling that required env Provider/Model/Key whenever `AGENT_ENABLED=true`; expose a separate optional `bootstrap_model` resolved only when all legacy fields are present. Reject a partial bootstrap tuple, a malformed encryption key, and `AGENT_CONFIG_CONTROL_KEY == OS_SECURITY_KEY` with fixed validation messages that omit inputs.

- [ ] **Step 4: Write failing schema and role tests**

Assert SQL creates these exact columns and constraints:

```sql
CREATE TABLE agent_control.model_configs (
  id uuid PRIMARY KEY,
  provider varchar(16) NOT NULL
    CHECK (provider IN ('openai','anthropic','google','dashscope','deepseek','minimax')),
  model_id varchar(128) NOT NULL,
  endpoint_id varchar(64) NOT NULL,
  api_key_ciphertext bytea NOT NULL,
  api_key_nonce bytea NOT NULL CHECK (octet_length(api_key_nonce) = 12),
  api_key_last_four varchar(4) NOT NULL CHECK (char_length(api_key_last_four) = 4),
  encryption_key_version smallint NOT NULL CHECK (encryption_key_version = 1),
  revision bigint NOT NULL CHECK (revision >= 1),
  is_current boolean NOT NULL,
  test_status varchar(16) NOT NULL CHECK (test_status IN ('untested','passed','failed')),
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, revision)
);

CREATE UNIQUE INDEX model_configs_one_current_per_provider
  ON agent_control.model_configs(provider) WHERE is_current;

CREATE TABLE agent_control.active_model_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  model_config_id uuid NOT NULL REFERENCES agent_control.model_configs(id) ON DELETE RESTRICT,
  config_revision bigint NOT NULL CHECK (config_revision >= 1),
  activation_version bigint NOT NULL CHECK (activation_version >= 1),
  activated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_control.control_events (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL,
  assertion_nonce uuid NOT NULL UNIQUE,
  actor_user_id uuid NOT NULL,
  action varchar(48) NOT NULL,
  provider varchar(16) NOT NULL,
  model_id varchar(128) NOT NULL,
  endpoint_id varchar(64) NOT NULL,
  config_revision bigint NOT NULL CHECK (config_revision >= 0),
  result varchar(24) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Add a migrator-owned `BEFORE UPDATE` trigger on `model_configs`. It rejects changes to `id`, Provider, Model ID, Endpoint ID, ciphertext, nonce, last four, key version, revision and `created_at`, and rejects `is_current: false -> true`; only current-head retirement and test/timestamp fields may change.

Assert `ai_agent_control_migrator` owns the schema/tables/function/trigger. Runtime grants are exact:

```sql
GRANT USAGE ON SCHEMA agent_control TO ai_agent_control;
GRANT SELECT, INSERT, UPDATE ON agent_control.model_configs TO ai_agent_control;
GRANT SELECT, INSERT, UPDATE ON agent_control.active_model_config TO ai_agent_control;
GRANT SELECT, INSERT ON agent_control.control_events TO ai_agent_control;
REVOKE ALL ON SCHEMA agent_control FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA agent_control FROM PUBLIC;
```

No runtime `DELETE`; no `UPDATE` on `control_events`; no Web, main runtime, backup or Agno role grants. Do not add broad default privileges.

- [ ] **Step 5: Run migration tests to verify RED**

Run: `uv --directory apps/agent run pytest tests/test_model_config_migrate.py -q`

Expected: FAIL because migration files are absent.

- [ ] **Step 6: Implement table and index SQL constants**

`model_config_schema.py` owns schema version `1`, the three complete table definitions above, the partial current-head index, immutable-revision trigger and an idempotent schema-version table. No runtime string interpolation.

- [ ] **Step 7: Implement exact revoke/grant SQL constants**

Add the grants shown in Step 4 as literal statements. Unit tests compare normalized statements and prove no runtime `DELETE`, control-event `UPDATE`, `PUBLIC`, Web, backup, main runtime or Agno access is introduced.

- [ ] **Step 8: Implement the one-shot migration runner**

`model_config_migrate.py` reads only `ControlMigrationSettings`, applies version `1` in one transaction, verifies the three tables plus grants, and prints only `Agent control migration complete.` or a fixed failure message.

- [ ] **Step 9: Implement the SQL role bootstrap**

Create only `ai_agent_control_migrator` and `ai_agent_control`, rotate both passwords on every bootstrap, and grant database `CONNECT` only. Schema/table grants remain in the migrator SQL above.

- [ ] **Step 10: Implement the hardened role-bootstrap wrapper**

The shell wrapper accepts exact environment names, uses `psql -v ON_ERROR_STOP=1`, never echoes secrets, and works in the existing read-only bootstrap container.

- [ ] **Step 11: Add runtime positive role-boundary tests**

`agent-control-role-boundary.integration.test.ts` must query `information_schema.role_table_grants` and actively prove:

- control runtime can select/insert/update config and active pointer;
- control runtime can insert/select, but not update/delete, control events;

- [ ] **Step 12: Add negative role-boundary tests**

Actively prove:

- control runtime cannot create/drop schema or tables;
- Web/main runtime, backup and Agno roles cannot read any `agent_control` table.

- [ ] **Step 13: Run unit and optional PostgreSQL integration tests**

Run:

```bash
uv --directory apps/agent run pytest \
  tests/test_config.py tests/test_model_config_migrate.py -q
AGENT_CONTROL_MIGRATOR_DATABASE_URL="$AGENT_CONTROL_MIGRATOR_DATABASE_URL" \
  uv --directory apps/agent run pytest tests/test_model_config_migrate_postgres.py -q
pnpm --filter @ai-agent-platform/database exec vitest run \
  src/agent-control-role-boundary.integration.test.ts
```

Expected: unit tests pass; each integration suite passes with its explicit role URLs or reports one intentional skip naming the missing variables.

- [ ] **Step 14: Commit**

```bash
git add infra/postgres/04-agent-control-roles.sql \
  infra/postgres/04-agent-control-roles.sh \
  apps/agent/src/agent_service/model_config_schema.py \
  apps/agent/src/agent_service/model_config_migrate.py \
  apps/agent/src/agent_service/config.py \
  apps/agent/tests/test_config.py \
  apps/agent/tests/test_model_config_migrate.py \
  apps/agent/tests/test_model_config_migrate_postgres.py \
  packages/database/src/agent-control-role-boundary.integration.test.ts
git commit -m "feat(agent): 增加模型控制面数据库边界"
```

### Task 3: Add typed model configuration and Endpoint allowlist

**Files:**
- Create: `apps/agent/src/agent_service/model_config_types.py`
- Create: `apps/agent/src/agent_service/model_endpoint_catalog.py`
- Create: `apps/agent/src/agent_service/model_runtime_types.py`
- Create: `apps/agent/tests/test_model_config_types.py`
- Create: `apps/agent/tests/test_model_endpoint_catalog.py`
- Create: `apps/agent/tests/test_model_runtime_types.py`
- Modify: `apps/agent/src/agent_service/model_registry.py`
- Modify: `apps/agent/tests/test_model_registry.py`

- [ ] **Step 1: Write failing domain validation tests**

Cover exact Provider enum, bounded model ID, revision, status and metadata-only response. API Keys must contain 8–4096 non-whitespace characters so `last_four` is always exactly four characters:

```python
config = ModelConfigDraft(
    provider="deepseek",
    model_id="deepseek-chat",
    endpoint_id="deepseek-official",
    api_key=SecretStr("secret-key-value"),
    expected_revision=0,
)
assert "secret-key-value" not in repr(config)
```

- [ ] **Step 2: Write failing Endpoint catalog tests**

Test all six official IDs, provider mismatch, duplicate IDs, userinfo/query/fragment, wildcard hosts, HTTP, `localhost`, `*.localhost`, single-label local names, IPv4 loopback/private/link-local, IPv6 `::1`/ULA/link-local, non-regular or group/world-writable files and malformed JSON. The public snapshot exposes `id`, `label`, `provider` only, never raw URL.

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
uv --directory apps/agent run pytest \
  tests/test_model_config_types.py tests/test_model_endpoint_catalog.py -q
```

Expected: import/definition failures.

- [ ] **Step 4: Implement immutable domain types**

Use frozen dataclasses/Pydantic models with `extra="forbid"` and hidden inputs. Keep the secret-bearing command type separate from metadata DTOs:

```python
@dataclass(frozen=True, slots=True)
class StoredModelConfigMetadata:
    provider: ModelProvider
    model_id: str
    endpoint_id: str
    api_key_last_four: str
    revision: int
    test_status: TestStatus
```

- [ ] **Step 5: Implement Endpoint catalog**

Official URLs remain code-owned. `MODEL_ENDPOINTS_FILE` may add deployment-approved HTTPS endpoints only from a regular root/Agent-owned file that is not group/world writable and resides on the read-only runtime filesystem, after strict URL validation. Resolve URLs only inside Agent; Admin input remains an Endpoint ID.

- [ ] **Step 6: Write failing `ManagedModel` ownership tests**

Define this exact cross-module contract in `model_runtime_types.py`:

```python
@dataclass(slots=True)
class ManagedModel:
    model: Model
    close_callback: Callable[[], Awaitable[None]]

    async def aclose(self) -> None:
        """Call close_callback at most once, including concurrent calls."""
```

Tests cover concurrent `aclose()`, callback failure sanitization and exactly-once close. This type owns SDK/httpx clients; slot reference counts remain Task 8's responsibility.

- [ ] **Step 7: Implement `ManagedModel` and run its tests**

Run: `uv --directory apps/agent run pytest tests/test_model_runtime_types.py -q`

Expected: PASS with the callback invoked once.

- [ ] **Step 8: Write failing OpenAI-compatible registry tests**

For OpenAI, DashScope/Qwen, DeepSeek and MiniMax, assert the catalog URL reaches the exact Agno SDK field and returned value is `ManagedModel`. Inject sync/async `httpx` clients with `follow_redirects=False`.

- [ ] **Step 9: Implement OpenAI-compatible managed factories**

Add `build_managed_model(settings: ActiveModelSettings) -> ManagedModel` while keeping existing `build_model(settings: ActiveModelSettings) -> Model` behavior for current catalog and smoke callers. The compatibility wrapper delegates construction and returns `.model`; do not change existing call sites in this commit.

- [ ] **Step 10: Write failing Anthropic/Google registry tests**

Assert Anthropic `base_url` and Google locked `HttpOptions.base_url`, `httpx_client` and `httpx_async_client`. A `MockTransport` returning 307 must receive exactly one request and surface a sanitized Provider failure rather than following `Location`.

- [ ] **Step 11: Implement Anthropic and Google managed factories**

Wire approved URLs into both SDKs and return the same `ManagedModel` ownership contract. The callback closes every owned sync/async SDK or HTTP client and never closes injected test clients.

- [ ] **Step 12: Run registry redirect and compatibility tests**

Run: `uv --directory apps/agent run pytest tests/test_model_registry.py -q`

- [ ] **Step 13: Run focused tests, ruff and mypy**

Run:

```bash
uv --directory apps/agent run pytest \
  tests/test_model_config_types.py tests/test_model_endpoint_catalog.py -q
uv --directory apps/agent run pytest \
  tests/test_model_runtime_types.py tests/test_model_registry.py -q
uv --directory apps/agent run ruff check src/agent_service/model_config_types.py \
  src/agent_service/model_endpoint_catalog.py src/agent_service/model_runtime_types.py \
  src/agent_service/model_registry.py \
  tests/test_model_config_types.py tests/test_model_endpoint_catalog.py \
  tests/test_model_runtime_types.py tests/test_model_registry.py
uv --directory apps/agent run mypy src/agent_service/model_config_types.py \
  src/agent_service/model_endpoint_catalog.py src/agent_service/model_runtime_types.py \
  src/agent_service/model_registry.py
```

Expected: all exit 0.

- [ ] **Step 14: Commit**

```bash
git add apps/agent/src/agent_service/model_config_types.py \
  apps/agent/src/agent_service/model_endpoint_catalog.py \
  apps/agent/src/agent_service/model_runtime_types.py \
  apps/agent/tests/test_model_config_types.py \
  apps/agent/tests/test_model_endpoint_catalog.py \
  apps/agent/tests/test_model_runtime_types.py \
  apps/agent/src/agent_service/model_registry.py \
  apps/agent/tests/test_model_registry.py
git commit -m "feat(agent): 定义动态模型配置与端点目录"
```

### Task 4: Encrypt model API keys with authenticated context

**Files:**
- Modify: `apps/agent/pyproject.toml`
- Modify: `apps/agent/uv.lock`
- Create: `apps/agent/src/agent_service/model_config_crypto.py`
- Create: `apps/agent/tests/test_model_config_crypto.py`

- [ ] **Step 1: Add direct `cryptography` dependency**

Run: `uv --directory apps/agent add 'cryptography>=46.0.5,<47'`

Expected: `pyproject.toml` and `uv.lock` change; do not rely on a transitive dependency.

- [ ] **Step 2: Write failing AES-GCM tests**

Test round-trip, random 12-byte nonce, strict 64-lowercase-hex-to-32-byte master-key decoding, AAD binding to config ID/Provider/revision/key version, tamper failure, wrong-key failure, unknown key version failure, 0–7-character/whitespace/over-4096-character secret rejection and no secret in repr/error/captured logs.

- [ ] **Step 3: Run crypto tests to verify RED**

Run: `uv --directory apps/agent run pytest tests/test_model_config_crypto.py -q`

Expected: FAIL because `ModelConfigCipher` is absent.

- [ ] **Step 4: Implement the minimal cipher**

```python
@dataclass(frozen=True, slots=True)
class SealedSecret:
    ciphertext: bytes
    nonce: bytes
    key_version: int
    last_four: str

class ModelConfigCipher:
    def seal(self, *, config_id: UUID, provider: ModelProvider,
             revision: int, secret: SecretStr) -> SealedSecret:
        raise NotImplementedError
    def open(self, *, config_id: UUID, provider: ModelProvider,
             revision: int, sealed: SealedSecret) -> SecretStr:
        raise NotImplementedError
```

Catch cryptography exceptions and raise one fixed `ModelConfigCryptoError` without chaining raw values.

`open()` accepts only `key_version == 1`; any other version fails closed before AES-GCM is called. The decoder rejects uppercase hex, prefixes, padding, newlines and all non-64-character inputs.

- [ ] **Step 5: Run focused tests and dependency audit**

Run:

```bash
uv --directory apps/agent run pytest tests/test_model_config_crypto.py -q
uv --directory apps/agent run ruff check src/agent_service/model_config_crypto.py \
  tests/test_model_config_crypto.py
uv --directory apps/agent run mypy src/agent_service/model_config_crypto.py
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/pyproject.toml apps/agent/uv.lock \
  apps/agent/src/agent_service/model_config_crypto.py \
  apps/agent/tests/test_model_config_crypto.py
git commit -m "feat(agent): 加密持久化模型密钥"
```

### Task 5: Implement model configuration reads and draft saves

**Files:**
- Create: `apps/agent/src/agent_service/model_config_repository.py`
- Create: `apps/agent/tests/test_model_config_repository.py`
- Create: `apps/agent/tests/test_model_config_repository_postgres.py`

- [ ] **Step 1: Write failing read/save repository tests with a fake connection**

Cover first revision insert, current-head replacement with newly sealed bytes, revision CAS, one current head per Provider, metadata-only list and exact active-revision reads. The Protocol exposes use-case operations rather than a generic query API:

```python
class ModelConfigRepository(Protocol):
    async def list_metadata(self) -> list[StoredModelConfigMetadata]:
        raise NotImplementedError
    async def save_draft(
        self, command: SaveSealedConfig, event: ControlEvent
    ) -> StoredModelConfigMetadata:
        raise NotImplementedError
    async def load_sealed(self, provider: ModelProvider) -> StoredSealedConfig:
        raise NotImplementedError
    async def load_active(self) -> StoredActiveConfig | None:
        raise NotImplementedError
```

- [ ] **Step 2: Run repository tests to verify RED**

Run: `uv --directory apps/agent run pytest tests/test_model_config_repository.py -q`

Expected: FAIL because the repository is absent.

- [ ] **Step 3: Implement current-head metadata reads**

Open short-lived async psycopg connections from the validated control URL. `list_metadata` selects only `is_current=true` and no ciphertext/nonce columns.

- [ ] **Step 4: Implement exact active-revision reads**

`load_active` joins `active_model_config.model_config_id` to the immutable row and verifies `config_revision` matches. It never substitutes the Provider's newer current head.

- [ ] **Step 5: Implement first draft insert**

Use parameter binding only. A Provider without a head inserts revision `1`, `is_current=true`, `test_status='untested'`.

- [ ] **Step 6: Implement current-head replacement with CAS**

Lock the current head, require `expected_revision`, mark it non-current and insert `revision + 1` as current. Never update the old row's model/endpoint/ciphertext fields. Map unique/revision conflicts to fixed domain errors.

- [ ] **Step 7: Re-encrypt an omitted Key for the new revision**

Define the repository boundary now: every inserted revision must contain newly sealed bytes bound to its new config ID/revision. The repository rejects a replacement command without them and never copies old ciphertext/nonce. Task 11 performs the omitted-Key decrypt-and-reseal orchestration.

- [ ] **Step 8: Insert the save event in the same transaction**

`save_draft` inserts exactly one sanitized event with the command assertion nonce. If event insertion fails or nonce already exists, roll back both head changes. There is no public generic `append_control_event` method.

- [ ] **Step 9: Add PostgreSQL current-head/CAS tests**

Test concurrent draft updates (one success, one conflict), exactly one current head and old revision immutability.

- [ ] **Step 10: Add persistence and secrecy integration tests**

Test event-failure rollback, nonce replay rejection, metadata projection omitting sealed columns, DB-at-rest absence of a fixture API key and active pointer still loading rev1 after saving rev2 for the same Provider.

- [ ] **Step 11: Run focused and optional integration tests**

Run:

```bash
uv --directory apps/agent run pytest tests/test_model_config_repository.py -q
AGENT_CONTROL_DATABASE_URL="$AGENT_CONTROL_DATABASE_URL" \
  uv --directory apps/agent run pytest tests/test_model_config_repository_postgres.py -q
```

Expected: unit tests pass; integration passes with explicit DB URL or reports one intentional skip.

- [ ] **Step 12: Commit**

```bash
git add apps/agent/src/agent_service/model_config_repository.py \
  apps/agent/tests/test_model_config_repository.py \
  apps/agent/tests/test_model_config_repository_postgres.py
git commit -m "feat(agent): 持久化模型配置草稿"
```

### Task 6: Add atomic test-result, activation and reveal transactions

**Files:**
- Modify: `apps/agent/src/agent_service/model_config_repository.py`
- Modify: `apps/agent/tests/test_model_config_repository.py`
- Modify: `apps/agent/tests/test_model_config_repository_postgres.py`

- [ ] **Step 1: Write failing failed-test transaction tests**

`record_failed_test` must lock the exact Provider/revision. If it remains current, set `test_status='failed'`, set `last_tested_at`, and insert exactly one failure event in one transaction. If a newer head exists, leave both revisions unchanged and insert one conflict event consuming the assertion nonce. It must not touch the active pointer.

- [ ] **Step 2: Implement `record_failed_test` and run its tests**

Run: `uv --directory apps/agent run pytest tests/test_model_config_repository.py -q -k failed_test`

Expected: PASS; duplicate nonce and stale revision roll back status changes.

- [ ] **Step 3: Write failing atomic activation tests**

Define one operation:

```python
async def commit_test_and_activation(
    command: CommitVerifiedActivation,
    event: ControlEvent,
) -> ActiveConfigPointer:
    raise NotImplementedError
```

It must lock the config and singleton pointer, verify the config is still the Provider's current head plus the expected config revision/global activation version, mark test passed, update/insert the active pointer with `activation_version + 1`, and insert one success event in the same transaction. Superseded immutable revisions remain available for old active-pointer recovery.

- [ ] **Step 4: Implement atomic activation and run its tests**

Run: `uv --directory apps/agent run pytest tests/test_model_config_repository.py -q -k activation`

Expected: PASS; cross-Provider concurrent activations serialize by global activation version, with one conflict instead of DB/memory divergence.

- [ ] **Step 5: Write failing reveal-result transaction tests**

Repository flow is two-phase by design:

1. `load_for_reveal(provider, revision)` reads sealed data without consuming the nonce.
2. After decryption succeeds, `commit_reveal_success(provider, revision, event)` locks/rechecks the row and inserts the success event before plaintext can be returned.
3. After decryption fails, `commit_reveal_failure(provider, revision, event)` inserts a failure event with the same request nonce.

`commit_reveal_success` returns a typed `committed | stale` result. On a stale revision it inserts one sanitized `conflict` event and consumes the nonce in the same transaction; the service then discards the already-decrypted plaintext. Test success event before return, accurate decryption-failure event, event-write failure preventing return, stale revision conflict recording and one nonce consumed exactly once.

- [ ] **Step 6: Implement reveal-result transactions**

Do not record success before decryption. Do not return sealed data from metadata APIs. Both result methods accept fixed error/result categories only.

- [ ] **Step 7: Run repository unit and PostgreSQL integration suites**

Run:

```bash
uv --directory apps/agent run pytest tests/test_model_config_repository.py -q
AGENT_CONTROL_DATABASE_URL="$AGENT_CONTROL_DATABASE_URL" \
  uv --directory apps/agent run pytest tests/test_model_config_repository_postgres.py -q
```

Expected: all unit tests pass; integration passes with explicit URL or intentionally skips once.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/agent_service/model_config_repository.py \
  apps/agent/tests/test_model_config_repository.py \
  apps/agent/tests/test_model_config_repository_postgres.py
git commit -m "feat(agent): 原子记录模型测试与激活"
```

## Chunk 2: Agent runtime, authorization and internal API

### Task 7: Extract one reusable Provider verifier

**Files:**
- Create: `apps/agent/src/agent_service/model_verifier.py`
- Create: `apps/agent/tests/test_model_verifier.py`
- Modify: `apps/agent/src/agent_service/provider_smoke.py`
- Modify: `apps/agent/tests/test_provider_smoke.py`

- [ ] **Step 1: Write failing invocation-boundary tests**

Test exactly one non-streaming invocation, no tools/session/storage, 50-second maximum, no retries and cancellation. The verifier accepts `ManagedModel`, invokes `.model`, and leaves closing to its caller.

- [ ] **Step 2: Write failing response-validation tests**

Return success only for a protocol-valid response with non-empty content after trimming. Empty, whitespace, malformed or wrong-type responses map internally to `provider_unreachable`; the content is discarded and never logged.

- [ ] **Step 3: Run verifier tests to verify RED**

Run: `uv --directory apps/agent run pytest tests/test_model_verifier.py -q`

Expected: FAIL because the shared verifier does not exist.

- [ ] **Step 4: Implement one bounded invocation**

```python
class ModelVerificationResult(NamedTuple):
    ok: bool
    category: VerificationCategory

async def verify_model(managed: ManagedModel, *, timeout_seconds: int) -> ModelVerificationResult:
    """Execute one fixed probe and discard all model content."""
```

Use one fixed internal prompt, `asyncio.timeout`, and no Agent/Tool/Skill/Knowledge/session wrapper.

- [ ] **Step 5: Implement result validation and error mapping**

Validate non-empty content, then discard it. Map Provider exceptions to existing sanitized categories. Do not log prompt, output, URL, status body or exception text.

- [ ] **Step 6: Refactor provider smoke CLI onto the shared verifier**

Switch the CLI to `build_managed_model`, keep stdout exactly `<provider>/<model-id>: verified`, keep one Provider per process, and call `await managed.aclose()` in `finally`.

- [ ] **Step 7: Run verifier and smoke suites**

Run:

```bash
uv --directory apps/agent run pytest \
  tests/test_model_verifier.py tests/test_provider_smoke.py -q
```

Expected: all pass; no real network call occurs.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/agent_service/model_verifier.py \
  apps/agent/tests/test_model_verifier.py \
  apps/agent/src/agent_service/provider_smoke.py \
  apps/agent/tests/test_provider_smoke.py
git commit -m "refactor(agent): 复用模型供应商验证器"
```

### Task 8: Implement the managed hot-swappable model slot

**Files:**
- Create: `apps/agent/src/agent_service/model_runtime_slot.py`
- Create: `apps/agent/tests/test_model_runtime_slot.py`

- [ ] **Step 1: Assert the locked Agno 2.7.2 model contract in a failing test**

The wrapper must implement exactly the six locked abstract methods:

```python
assert Model.__abstractmethods__ == {
    "invoke", "ainvoke", "invoke_stream", "ainvoke_stream",
    "_parse_provider_response", "_parse_provider_response_delta",
}
```

- [ ] **Step 2: Write failing activation-state tests**

Test dormant unavailable, activate/deactivate, global activation-version monotonicity and sanitized failures. Provider config revision remains metadata and must not order cross-Provider activation.

- [ ] **Step 3: Write failing in-flight snapshot tests**

Test old sync/async calls finishing on the old handle, new calls using the new handle, streaming early-close/cancellation and one handle captured per invocation.

- [ ] **Step 4: Run slot tests to verify RED**

Run: `uv --directory apps/agent run pytest tests/test_model_runtime_slot.py -q`

Expected: FAIL because `ModelRuntimeSlot` is absent.

- [ ] **Step 5: Implement the slot entry and activation state**

Use this private state shape under one short-held lock:

```python
@dataclass(slots=True)
class _SlotEntry:
    managed: ManagedModel
    activation_version: int
    metadata: RuntimeModelMetadata
    in_flight: int = 0
    retired: bool = False
```

The slot also owns one async cleanup queue, a reaper task and its owning event loop. `start()` creates them inside FastAPI lifespan before reconciliation. `activate()` atomically swaps entries only for a strictly newer global activation version. `deactivate()` retires the current entry. Neither method performs Provider I/O under the lock.

- [ ] **Step 6: Implement sync delegates**

Capture one entry and increment `in_flight` before `invoke`/`invoke_stream`; release it in `finally` or generator close. Delegate the locked Agno response parsers without holding the slot lock across Provider work.

- [ ] **Step 7: Run sync delegate tests**

Run: `uv --directory apps/agent run pytest tests/test_model_runtime_slot.py -q -k 'sync or activation'`

Expected: PASS; old sync work completes on its captured entry.

- [ ] **Step 8: Implement async delegates**

Capture one handle for `ainvoke` and `ainvoke_stream`. Match Agno 2.7.2 iterator and cancellation semantics exactly; do not share a mutable per-request handle field on the slot.

- [ ] **Step 9: Run async delegate tests**

Run: `uv --directory apps/agent run pytest tests/test_model_runtime_slot.py -q -k 'async or stream'`

Expected: PASS for normal completion, exception, cancellation and early stream close.

- [ ] **Step 10: Implement cross-thread retired-client cleanup**

When any sync/async release makes a retired entry reach zero, enqueue it exactly once. Sync paths use the stored loop's `call_soon_threadsafe`; they never call async cleanup directly. The reaper awaits `managed.aclose()` outside the slot lock. `shutdown()` retires the active entry, waits for in-flight zero, drains the queue, stops the reaper and fails with a fixed cleanup error on timeout. Tests cover a sync invocation completing on a worker thread, one close, and shutdown drain.

- [ ] **Step 11: Run slot tests, ruff and mypy**

Run:

```bash
uv --directory apps/agent run pytest tests/test_model_runtime_slot.py -q
uv --directory apps/agent run ruff check src/agent_service/model_runtime_slot.py \
  tests/test_model_runtime_slot.py
uv --directory apps/agent run mypy src/agent_service/model_runtime_slot.py
```

Expected: all exit 0 and every retired fake client closes exactly once.

- [ ] **Step 12: Commit**

```bash
git add apps/agent/src/agent_service/model_runtime_slot.py \
  apps/agent/tests/test_model_runtime_slot.py
git commit -m "feat(agent): 增加可管理的模型热切换槽"
```

### Task 9: Compose stable 码多多 and reconcile startup state

**Files:**
- Modify: `apps/agent/src/agent_service/default_agent.py`
- Modify: `apps/agent/tests/test_default_agent.py`
- Modify: `apps/agent/src/agent_service/catalog.py`
- Modify: `apps/agent/tests/test_catalog.py`
- Modify: `apps/agent/src/agent_service/app.py`
- Modify: `apps/agent/tests/test_app.py`

- [ ] **Step 1: Write failing stable-catalog tests**

When `AGENT_ENABLED=true`, assert one `maduoduo` is registered around a dormant slot even with no env model. Valid env bootstrap activates source `deployment`; `AGENT_ENABLED=false` keeps the existing empty catalog.

- [ ] **Step 2: Implement stable Agent/catalog composition**

Pass the slot to `build_default_agent`; return a catalog containing the slot and a dynamic status provider instead of a frozen capability string.

- [ ] **Step 3: Write failing dynamic-precedence tests**

Cover this precedence table:

```text
dynamic active valid     -> activate DB model/source dynamic
dynamic active corrupt   -> slot empty + capability degraded; never bootstrap
no dynamic + bootstrap   -> activate env model/source deployment
neither                  -> slot empty + capability placeholder
control DB unavailable   -> degraded when dynamic state cannot be determined
```

Also assert active DB `activation_version` is passed to the slot and that constructed handles are closed on reconciliation failure.

- [ ] **Step 4: Write failing immutable-revision recovery tests**

Activate Provider rev1, save rev2 as the current untested head, then recreate the application. Reconciliation must load the active pointer's rev1 row. Repeat after marking rev2 failed. In both cases rev1 serves and rev2 is not built.

- [ ] **Step 5: Implement dynamic active reconciliation**

Load the active pointer, decrypt, resolve Endpoint and build the managed model before serving requests. Dynamic active presence suppresses bootstrap even when decryption/build fails.

- [ ] **Step 6: Implement bootstrap/no-model reconciliation**

Only when no dynamic active pointer exists, activate a complete env bootstrap. Otherwise leave the slot placeholder/degraded according to the precedence table.

- [ ] **Step 7: Write failing lifespan ordering tests**

Prove reconciliation finishes before the first request is accepted, startup errors become the fixed degraded state, and shutdown waits for active/retired handle cleanup.

- [ ] **Step 8: Wire reconciliation into FastAPI lifespan**

Call `slot.start()` before reconciliation and before AgentOS accepts traffic. On shutdown, call `slot.shutdown()` to drain active/retired handles, then close repository connections. Do not hide startup failure details in capability, but keep external messages fixed.

- [ ] **Step 9: Write failing dynamic health tests**

Health must read slot capability on every request and reflect activate/deactivate without application reconstruction.

- [ ] **Step 10: Implement dynamic health status**

Replace frozen catalog capability reads with the slot's current safe capability only; keep public health messages fixed.

- [ ] **Step 11: Add internal runtime-status metadata**

Add a provider used later by `/internal/control/model-configs/runtime-status`; it returns source, Provider, Model ID, config revision, activation version and capability, never Key/URL/errors.

- [ ] **Step 12: Run Agent composition suites**

Run:

```bash
uv --directory apps/agent run pytest \
  tests/test_model_runtime_slot.py tests/test_default_agent.py \
  tests/test_catalog.py tests/test_app.py -q
```

Expected: all pass, including disabled-mode backward compatibility.

- [ ] **Step 13: Commit**

```bash
git add apps/agent/src/agent_service/model_runtime_slot.py \
  apps/agent/tests/test_model_runtime_slot.py \
  apps/agent/src/agent_service/default_agent.py \
  apps/agent/tests/test_default_agent.py \
  apps/agent/src/agent_service/catalog.py apps/agent/tests/test_catalog.py \
  apps/agent/src/agent_service/app.py apps/agent/tests/test_app.py
git commit -m "feat(agent): 启动时恢复码多多活动模型"
```

### Task 10: Authenticate internal control commands before body parsing

**Files:**
- Create: `apps/agent/src/agent_service/model_control_auth.py`
- Create: `apps/agent/tests/test_model_control_auth.py`
- Create: `docs/testing/fixtures/model-control-assertion-v1.json`

- [ ] **Step 1: Write failing dedicated Bearer tests**

Reject missing/duplicate Authorization headers, wrong scheme/key and reuse of `OS_SECURITY_KEY`. Tests must prove rejection occurs without calling the downstream body receiver.

- [ ] **Step 2: Write failing assertion grammar/signature tests**

The canonical assertion contains exact actor UUID, permission, request UUID, action, Provider, `issuedAt` epoch seconds, `expiresAt` epoch seconds and nonce UUID. Sign with HMAC-SHA256 under a key derived from `AGENT_CONFIG_CONTROL_KEY` using a fixed domain label. Reject extra/missing fields, duplicate JSON keys, non-integer epochs and invalid signatures.

- [ ] **Step 3: Add one public cross-language golden vector**

Store canonical payload, a clearly labeled non-production test key and expected base64url signature in `docs/testing/fixtures/model-control-assertion-v1.json`. Agent tests consume the file; no runtime code reads it.

- [ ] **Step 4: Write failing assertion time-window tests**

Accept only when all are true, with injected integer `now`:

```text
issuedAt < expiresAt
expiresAt - issuedAt <= 5
issuedAt - 2 <= now
now <= expiresAt + 2
```

Test exact boundaries and one second outside each boundary.

- [ ] **Step 5: Write failing permission/action binding tests**

The only valid mapping is:

```text
save              -> admin:assistant:configure
test_and_activate -> admin:assistant:configure
reveal            -> admin:assistant:secret:reveal
```

Reject action, Provider or permission mismatches before body parsing. GET list/runtime-status use the dedicated Bearer only and accept no assertion header.

- [ ] **Step 6: Run auth tests to verify RED**

Run: `uv --directory apps/agent run pytest tests/test_model_control_auth.py -q`

Expected: FAIL because the auth module is absent.

- [ ] **Step 7: Implement canonical parsing and HMAC verification**

Use strict JSON/base64url grammar, reject duplicate keys and compare signatures in constant time. Return a typed assertion only after grammar/signature success.

- [ ] **Step 8: Implement time and route-policy verification**

Apply the four exact time inequalities and the route mapping from Steps 3–4. Authentication completes before the API parses secret-bearing DTOs; nonce uniqueness is consumed later by the repository event transaction.

- [ ] **Step 9: Run auth tests, ruff and mypy**

Run:

```bash
uv --directory apps/agent run pytest tests/test_model_control_auth.py -q
uv --directory apps/agent run ruff check src/agent_service/model_control_auth.py \
  tests/test_model_control_auth.py
uv --directory apps/agent run mypy src/agent_service/model_control_auth.py
```

Expected: all exit 0.

- [ ] **Step 10: Commit**

```bash
git add apps/agent/src/agent_service/model_control_auth.py \
  apps/agent/tests/test_model_control_auth.py \
  docs/testing/fixtures/model-control-assertion-v1.json
git commit -m "feat(agent): 认证内部模型配置命令"
```

### Task 11: Orchestrate save, test-and-activate, reveal and reconciliation

**Files:**
- Create: `apps/agent/src/agent_service/model_control_service.py`
- Create: `apps/agent/tests/test_model_control_service.py`

- [ ] **Step 1: Write failing list and new-Key save tests**

Cover metadata list, save with new Key, revision conflict, Endpoint mismatch, bootstrap read-only metadata and deployment kill switch.

- [ ] **Step 2: Implement list and new-Key save orchestration**

Order: validate command → resolve Endpoint → allocate new config ID/revision → seal the new Key → `save_draft` transaction/event. Return metadata only.

- [ ] **Step 3: Write failing omitted-Key replacement tests**

When a save omits Key, load/decrypt the current head, re-seal it with the new config ID/revision/random nonce and zero the local reference in `finally`. Assert old ciphertext is not copied and old active revision remains decryptable.

- [ ] **Step 4: Implement omitted-Key decrypt-and-reseal**

Reject if no current Key exists. Never return plaintext or `SecretStr` from the service method; pass only the new `SealedSecret` to the repository.

- [ ] **Step 5: Write failing concurrent verification tests**

Start candidates for two Providers and prove Provider network verification overlaps while no activation lock is held. Each candidate uses `build_managed_model` and closes on every non-success path.

- [ ] **Step 6: Implement candidate load/build/verify outside the lock**

Load exact current revision, decrypt, resolve Endpoint, build and call `verify_model(managed)`. Do not read the global activation version yet.

- [ ] **Step 7: Write failing failed-verification tests**

Provider failure calls only `record_failed_test`, closes the candidate and leaves active pointer/slot unchanged.

- [ ] **Step 8: Implement failed-verification persistence**

Map only fixed categories into the event/result. If result persistence conflicts or fails, still close the candidate and return a safe storage/conflict error.

- [ ] **Step 9: Write failing activation serialization tests**

Start two verified candidates for different Providers. They may perform network verification concurrently, but a single service `_activation_lock` must serialize:

```text
read current global activation version
commit_test_and_activation(expected global version)
slot.activate(returned global activation version)
```

Assert final DB pointer and slot Provider/activation version match. Config revision and global activation version are separate fields.

- [ ] **Step 10: Implement successful activation under one service lock**

Acquire the lock only after verification. Re-read global active version, call atomic repository commit, then call the deterministic in-memory `slot.activate()` with the same verified `ManagedModel` and returned global activation version.

- [ ] **Step 11: Handle activation conflict and crash boundary**

If repository conflicts, close the candidate and return a fixed conflict. `slot.activate()` performs no I/O and cannot reject the repository-returned next version while the service lock is held. If the process exits after DB commit, the process stops serving and Task 9 reconciliation restores DB state on restart.

- [ ] **Step 12: Write failing reveal decrypt-result tests**

Test exact sequence:

```text
load sealed revision -> decrypt
decrypt failure -> commit failure event -> fixed error
decrypt success -> commit success event with revision recheck -> return SecretStr
```

If event commit fails or revision changes, discard plaintext and do not return it. The assertion nonce appears in exactly one result event.

- [ ] **Step 13: Implement reveal result sequencing**

Keep decrypted `SecretStr` in one local scope. Commit success before return; on decrypt failure commit failure; on stale success commit conflict and discard. Never include Key in exception chaining.

- [ ] **Step 14: Write failing safe runtime-status tests**

Expose metadata-only status with source, Provider, Model ID, config revision, global activation version and capability. No URL, last four, ciphertext, raw errors or timestamps are required by this endpoint.

- [ ] **Step 15: Implement safe runtime status**

Read the slot snapshot only; do not query/decrypt config rows on a status request.

- [ ] **Step 16: Run focused service tests**

Run:

```bash
uv --directory apps/agent run pytest tests/test_model_control_service.py -q
uv --directory apps/agent run ruff check src/agent_service/model_control_service.py \
  tests/test_model_control_service.py
uv --directory apps/agent run mypy src/agent_service/model_control_service.py
```

Expected: all exit 0; cross-Provider concurrent activation ends with DB/slot agreement.

- [ ] **Step 17: Commit**

```bash
git add apps/agent/src/agent_service/model_control_service.py \
  apps/agent/tests/test_model_control_service.py
git commit -m "feat(agent): 编排动态模型配置与激活"
```

### Task 12: Expose thin internal model control routes

**Files:**
- Create: `apps/agent/src/agent_service/model_control_api.py`
- Create: `apps/agent/tests/test_model_control_api.py`
- Modify: `apps/agent/src/agent_service/app.py`
- Modify: `apps/agent/tests/test_app.py`

- [ ] **Step 1: Write failing list/status route tests**

Cover list and runtime-status exact response keys, bounded size, `no-store`, dedicated Bearer and absence of assertion requirement.

- [ ] **Step 2: Write failing mutation DTO tests**

For save, test-and-activate and reveal, reject wrong content type, extra keys, oversized body, invalid Provider and assertion route mismatch before service calls.

- [ ] **Step 3: Write failing fixed error-map tests**

Map each domain failure exactly:

```text
validation_error          400
endpoint_not_allowed      400
configuration_conflict    409
credential_rejected       422
model_not_found           422
provider_unreachable      502
provider_timeout          504
control_disabled          503
storage_unavailable       503
encryption_unavailable    503
assistant_unavailable     503
```

Missing/invalid dedicated Bearer is 401; an invalid, expired or route-mismatched assertion is 403. Response JSON never includes exception text, URL, Key, last four or assertion content.

- [ ] **Step 4: Run API tests to verify RED**

Run: `uv --directory apps/agent run pytest tests/test_model_control_api.py -q`

Expected: FAIL because routes are absent.

- [ ] **Step 5: Implement metadata-only GET routes**

Mount `GET /internal/control/model-configs` and `GET /internal/control/model-configs/runtime-status`; return version `1`, `Cache-Control: no-store`, bounded JSON and no secret-bearing fields.

- [ ] **Step 6: Implement save route**

Mount `PUT /internal/control/model-configs/{provider}`. Require the assertion mapping `save -> admin:assistant:configure`, parse the strict DTO, call the service and map fixed errors.

- [ ] **Step 7: Implement test-and-activate route**

Mount `POST /internal/control/model-configs/{provider}/test-and-activate`. Require `test_and_activate -> admin:assistant:configure` and call the service with the exact asserted actor/request/nonce.

- [ ] **Step 8: Implement reveal route**

`POST /internal/control/model-configs/{provider}/reveal-key` requires `reveal -> admin:assistant:secret:reveal` and returns the one Key field only after service success. Set `Cache-Control: no-store, private`, `Pragma: no-cache`, and never serialize exception/repr state.

- [ ] **Step 9: Compose pre-body authentication in `create_app`**

Authenticate `/internal/control/*` with `AGENT_CONFIG_CONTROL_KEY` in ASGI middleware before calling any request body receiver. Keep health/AgentOS on `OS_SECURITY_KEY`.

- [ ] **Step 10: Compose injectable control dependencies**

Inject repository/cipher/endpoint catalog/verifier/slot/service for tests and use the Task 9 lifespan reconciliation. Fail app construction on partial control settings; the deployment kill switch returns `control_disabled` for mutations.

- [ ] **Step 11: Run focused Agent suites and secret scans**

Run:

```bash
uv --directory apps/agent run pytest \
  tests/test_model_control_api.py tests/test_app.py -q
uv --directory apps/agent run ruff check .
uv --directory apps/agent run mypy src tests
```

Expected: all exit 0; fixture secrets do not appear in captured stdout/stderr, JSON, health or runtime status.

- [ ] **Step 12: Commit**

```bash
git add apps/agent/src/agent_service/model_control_api.py \
  apps/agent/tests/test_model_control_api.py \
  apps/agent/src/agent_service/app.py apps/agent/tests/test_app.py
git commit -m "feat(agent): 提供内部模型配置控制面"
```

## Chunk 3: Web control client, authorization and BFF

### Task 13: Define the strict Web contract and private Agent control client

**Files:**
- Create: `apps/web/src/features/assistant/admin-model-config-contract.ts`
- Create: `apps/web/src/features/assistant/admin-model-config-contract.test.ts`
- Create: `apps/web/src/server/assistant/agent-model-control-client.ts`
- Create: `apps/web/src/server/assistant/agent-model-control-client.test.ts`
- Read: `docs/testing/fixtures/model-control-assertion-v1.json`
- Modify: `apps/web/src/server/assistant/agentos-transport.ts`
- Modify: `apps/web/src/server/assistant/agentos-transport.test.ts`

- [ ] **Step 1: Write failing browser-contract tests**

Define exact Provider values, status values and a metadata-only snapshot:

```ts
type AdminModelProvider =
  | "openai" | "anthropic" | "google"
  | "dashscope" | "deepseek" | "minimax";

type AdminModelConfigItem = {
  provider: AdminModelProvider;
  displayName: string;
  modelId: string | null;
  endpointId: string | null;
  revision: number | null;
  testStatus: "not_configured" | "untested" | "passed" | "failed";
  lastTestedAt: string | null;
  apiKey: null | { configured: true; lastFour: string };
  activeRevision: number | null;
};
```

The snapshot contains exactly six items in fixed order, Provider-scoped safe Endpoint options, runtime metadata, `canConfigure`, `canReveal`, `controlEnabled` and `version: "1"`. Guards reject extra fields, URLs, ciphertext, nonce, Key-like fields and non-ISO timestamps.

- [ ] **Step 2: Implement browser DTOs and exact runtime guards**

Keep mutation input types separate: save accepts Model ID, Endpoint ID, optional new Key and expected revision; test/reveal accept exact revision. Export no type that permits a URL or arbitrary Provider.

- [ ] **Step 3: Run contract tests**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/features/assistant/admin-model-config-contract.test.ts`

Expected: PASS and fixture secrets are absent from serialized metadata fixtures.

- [ ] **Step 4: Write failing reusable transport-extension tests**

Extend the existing private transport only enough to support `PUT` and these per-request headers: `Content-Type`, `X-Agent-Control-Assertion`, `X-Request-Id`. Tests reject caller overrides of `Authorization`/`Accept`, redirects, path escapes, response overflow and any header value containing controls.

- [ ] **Step 5: Implement the narrow transport extension**

Keep existing AgentOS defaults, timeouts, manual redirects, bounded response reading, abort handling and error sanitization unchanged. Merge only the allowlisted headers after validation.

- [ ] **Step 6: Run existing and new transport tests**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/assistant/agentos-transport.test.ts`

Expected: all previous tests and new PUT/header tests pass.

- [ ] **Step 7: Write failing control-client settings tests**

Resolve the same exact `AGENTOS_INTERNAL_URL`, but use `AGENT_CONFIG_CONTROL_KEY`. Require at least 32 UTF-8 bytes, valid Bearer grammar and inequality with `OS_SECURITY_KEY`; error messages contain no values.

- [ ] **Step 8: Write failing assertion-signing tests**

Generate canonical JSON with the Task 10 fields, integer clock, UUID nonce and five-second lifetime. Derive HMAC-SHA256 using the same fixed domain label as Agent. Tests compare a cross-language golden vector and prove Key/assertion values never enter errors or logs.

- [ ] **Step 9: Implement control settings and assertion signer**

The caller supplies actor, exact permission/action/Provider/request ID. The signer supplies issued/expiry/nonce. It cannot sign an unsupported permission/action pair.

- [ ] **Step 10: Write failing client method tests**

Cover metadata list, runtime status, save, test-and-activate and reveal. Assert GET sends only Bearer/request ID; mutations send their exact assertion and bounded JSON. Validate exact response shape and map transport/status failures to fixed client codes without body text.

- [ ] **Step 11: Implement the five private client methods**

Use 5 seconds for reads/saves/reveal and 55 seconds for test-and-activate. Accept only `application/json`, fixed statuses and 64 KiB responses. Reveal returns `{ key: string }` only to its immediate caller and never caches it.

- [ ] **Step 12: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run \
  src/features/assistant/admin-model-config-contract.test.ts \
  src/server/assistant/agentos-transport.test.ts \
  src/server/assistant/agent-model-control-client.test.ts
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: all exit 0.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/features/assistant/admin-model-config-contract.ts \
  apps/web/src/features/assistant/admin-model-config-contract.test.ts \
  apps/web/src/server/assistant/agentos-transport.ts \
  apps/web/src/server/assistant/agentos-transport.test.ts \
  apps/web/src/server/assistant/agent-model-control-client.ts \
  apps/web/src/server/assistant/agent-model-control-client.test.ts
git commit -m "feat(assistant): 增加动态模型配置控制客户端"
```

### Task 14: Enforce mutation security, recent MFA and dual audit sequencing

**Files:**
- Create: `apps/web/src/server/http/require-trusted-mutation.ts`
- Create: `apps/web/src/server/http/require-trusted-mutation.test.ts`
- Create: `apps/web/src/server/assistant/admin-model-config-commands.ts`
- Create: `apps/web/src/server/assistant/admin-model-config-commands.test.ts`
- Modify: `apps/web/src/server/assistant/assistant-rate-limit.ts`
- Modify: `apps/web/src/server/assistant/assistant-rate-limit.test.ts`

- [ ] **Step 1: Write failing trusted-mutation tests**

Require an exact `Origin` from `resolveAuthEnvironment().trustedOrigins`. If `Sec-Fetch-Site` is present it must equal `same-origin`. Require media type `application/json` with optional UTF-8 charset. Reject missing/untrusted/null origins, duplicate Origin, cross-site fetch metadata and other media types before reading the body.

- [ ] **Step 2: Implement `requireTrustedJsonMutation()`**

Return one fixed `MutationRequestError` code. Do not derive trust from `Host`, forwarded headers or request body.

- [ ] **Step 3: Add a dedicated reveal rate-limit scope**

Write failing tests, then add `admin-key-reveal` with 5 attempts per 10 minutes keyed by authoritative actor ID. Keep the existing anonymous/customer/admin-test quotas unchanged.

- [ ] **Step 4: Write failing authorization-before-body tests**

Save and test-and-activate require `requireSensitiveWorkforceAction("admin:assistant:configure")`; reveal requires `admin:assistant:secret:reveal`. All use the existing 600-second password/TOTP assurance. Guard rejection must occur before body parsing, Agent calls or audit metadata construction.

Define an opaque context that route handlers cannot construct themselves:

```ts
type AuthorizedModelCommand = {
  readonly __brand: unique symbol;
  actor: WorkforceActor;
  requestId: string;
  action: "save" | "test_and_activate" | "reveal";
};
```

`authorize(request, action)` performs trusted Origin/content type first, then exact sensitive permission/MFA, and returns this context. Only after it resolves may a route call `readBoundedJson`; command methods require the context.

- [ ] **Step 5: Write failing save audit-sequence tests**

Exact order is `save_requested audit -> Agent save -> saved success/failure audit`. Requested-audit failure prevents Agent work. Every safe Agent failure writes the completed failure event. Completed-audit failure returns `storage_unavailable`; remote result remains authoritative and is visible after refresh. Neither audit input may contain Key, last four, URL, assertion or raw error.

- [ ] **Step 6: Implement save command coordination**

Generate one request ID, sign one `save` assertion after authorization, call the client once and return metadata only.

- [ ] **Step 7: Write failing safe metadata-preflight tests**

For test-and-activate and reveal, call the metadata-only Agent list once after authorization/MFA and before requested audit. Select the Provider and require the requested revision to equal its current revision; use its authoritative Model ID/Endpoint ID for audit. A missing/stale/unavailable preflight returns a fixed conflict/unavailable error and sends no mutation or reveal request.

- [ ] **Step 8: Implement metadata preflight**

Return only `{ provider, modelId, endpointId, revision }` to the coordinator. Drop last four and other list fields; do not cache across commands.

- [ ] **Step 9: Write failing test-and-activate audit tests**

Before Agent call write `model_config_test_requested` then `model_config_activation_requested`. After a successful activation write `tested(success)` then `activated(success)`; after any safe Agent failure write both completed events with the same fixed failure category. No automatic fallback call is permitted.

- [ ] **Step 10: Implement test-and-activate coordination**

After the safe preflight, use one signed `test_and_activate` assertion and one mutation request. If requested auditing fails, make no mutation call. If completed auditing fails after remote success, return `storage_unavailable` and require UI refresh rather than attempting rollback.

- [ ] **Step 11: Write failing reveal fail-closed tests**

Exact order: Origin/content type -> permission/MFA -> reveal limiter -> safe metadata preflight -> requested audit -> Agent reveal -> completed audit -> return Key. Any requested/completed audit failure, client failure or serialization failure discards plaintext and returns a fixed error. Test success and failure audits and prove all captured calls/logs exclude Key.

- [ ] **Step 12: Implement reveal coordination**

Keep plaintext in one local variable, construct the final response only after completed audit succeeds, and clear the reference in `finally`. Do not retry reveal with the same nonce.

- [ ] **Step 13: Run command/security suites**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run \
  src/server/http/require-trusted-mutation.test.ts \
  src/server/assistant/assistant-rate-limit.test.ts \
  src/server/assistant/admin-model-config-commands.test.ts
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: all exit 0, including auth/audit failures before secret-bearing work.

- [ ] **Step 14: Commit**

```bash
git add apps/web/src/server/http/require-trusted-mutation.ts \
  apps/web/src/server/http/require-trusted-mutation.test.ts \
  apps/web/src/server/assistant/assistant-rate-limit.ts \
  apps/web/src/server/assistant/assistant-rate-limit.test.ts \
  apps/web/src/server/assistant/admin-model-config-commands.ts \
  apps/web/src/server/assistant/admin-model-config-commands.test.ts
git commit -m "feat(assistant): 保护模型配置高风险命令"
```

### Task 15: Expose versioned Admin model-configuration routes

**Files:**
- Create: `apps/web/src/app/api/v1/admin/assistant/model-configs/handler.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/model-configs/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/model-configs/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/model-configs/[provider]/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/model-configs/[provider]/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/model-configs/[provider]/test-and-activate/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/model-configs/[provider]/test-and-activate/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/model-configs/[provider]/reveal-key/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/model-configs/[provider]/reveal-key/route.test.ts`

- [ ] **Step 1: Write failing metadata-list route tests**

GET requires only `admin:assistant`, calls the private client, combines exact actor permissions into `canConfigure/canReveal`, and returns six safe Provider entries with `Cache-Control: no-store`. Agent failure returns safe 503 without internal URL/body.

- [ ] **Step 2: Implement the list loader and GET route**

Export `loadAdminModelConfigSnapshot(actor)` for server-page reuse. Route module exports GET only.

- [ ] **Step 3: Write failing save route boundary tests**

Assert `authorize(request, "save")` completes trusted-origin/content-type and sensitive guard before `readBoundedJson(8 * 1024)`. Parse exact keys, exact Provider slug, Model ID, Endpoint ID, optional Key and expected revision. Cover 400, 401, 403, 409, 413-equivalent validation response, 422 and 503 without echoing input; every response has `no-store`.

- [ ] **Step 4: Implement the save route**

Delegate only to Task 14's save command. Return version `1`, request ID and safe config metadata; always `no-store`.

- [ ] **Step 5: Write failing test-and-activate route tests**

Require `authorize(request, "test_and_activate")` before body read, then exact revision and no Key/model/endpoint fields. Cover Origin/content type/body bound, 55-second downstream timeout mapping, configuration conflict and Provider failure without changing response schema; every response has `no-store`.

- [ ] **Step 6: Implement test-and-activate route**

Delegate once to the command coordinator and return active/runtime metadata only.

- [ ] **Step 7: Write failing reveal route tests**

Require `authorize(request, "reveal")` before body read. Cover Origin/content type/body bound, permission, 600-second recent assurance, separate limiter, `AUTH_REAUTH_REQUIRED`/`AUTH_MFA_REQUIRED` mapping to versioned `reauth_required` with `redirectTo: "/staff/re-auth"`, conflict and audit failure. Assert `Cache-Control: no-store, private` and `Pragma: no-cache` on every status.

- [ ] **Step 8: Implement the reveal route**

Return exact `{ version, requestId, key }` only on success. Never include Key in an error response or handler-level diagnostic.

- [ ] **Step 9: Run all Admin route tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run \
  src/app/api/v1/admin/assistant/model-configs/route.test.ts \
  src/app/api/v1/admin/assistant/model-configs/[provider]/route.test.ts \
  src/app/api/v1/admin/assistant/model-configs/[provider]/test-and-activate/route.test.ts \
  src/app/api/v1/admin/assistant/model-configs/[provider]/reveal-key/route.test.ts
```

Expected: all exit 0; each route module exports only its intended method.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/api/v1/admin/assistant/model-configs
git commit -m "feat(assistant): 提供后台模型配置接口"
```

### Task 16: Merge dynamic runtime truth into the existing Admin page loader

**Files:**
- Modify: `apps/web/src/features/assistant/admin-assistant-contract.ts`
- Modify: `apps/web/src/features/assistant/admin-assistant-contract.test.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/status/handler.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/status/route.test.ts`

- [ ] **Step 1: Write failing dynamic status contract tests**

Extend Admin-only runtime metadata with source `none | deployment | dynamic`, Provider/Model ID/config revision/activation version as nullable fields, and test status. Exact guards reject Key, last four, Endpoint URL/ID and error detail.

- [ ] **Step 2: Implement the version-1 safe status extension**

Keep public assistant status unchanged. Admin status remains version `1` because fields are added inside its owned snapshot before release.

- [ ] **Step 3: Write failing status-loader truth-table tests**

Merge existing readiness/circuit/persistence inspection with control runtime status. Cover dynamic available, deployment bootstrap, placeholder, control DB degraded and Agent control unreachable. Dynamic failure must not silently display deployment fallback.

- [ ] **Step 4: Implement dynamic Admin status loading**

Call readiness and control status independently. Preserve fixed external messages; never expose client error/body. Model service card derives from slot capability and dynamic metadata.

- [ ] **Step 5: Run status tests and typecheck**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run \
  src/features/assistant/admin-assistant-contract.test.ts \
  src/app/api/v1/admin/assistant/status/route.test.ts
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/assistant/admin-assistant-contract.ts \
  apps/web/src/features/assistant/admin-assistant-contract.test.ts \
  apps/web/src/app/api/v1/admin/assistant/status/handler.ts \
  apps/web/src/app/api/v1/admin/assistant/status/route.test.ts
git commit -m "feat(assistant): 接入动态模型运行状态"
```

## Chunk 4: Existing Admin page model configuration UI

### Task 17: Load and render the six-Provider cloud model panel

**Files:**
- Modify: `apps/web/src/app/admin/assistant/page.tsx`
- Modify: `apps/web/src/app/admin/assistant/page.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.test.tsx`
- Create: `apps/web/src/components/admin/assistant-model-config-panel.tsx`
- Create: `apps/web/src/components/admin/assistant-model-config-panel.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.css`

- [ ] **Step 1: Write failing server-page loader tests**

After one `requirePermission("admin:assistant")`, load status, sessions and `loadAdminModelConfigSnapshot(actor)`. Guard rejection performs no load. Rendered HTML/serialized props contain no fixture Key, ciphertext, nonce, full URL or assertion.

- [ ] **Step 2: Implement existing-page data composition**

Pass `modelConfigs` into `AssistantAdminPage`; do not add a route or top-level navigation item. Keep the existing status, test console and session data sources.

- [ ] **Step 3: Write failing Provider-list truth tests**

Render OpenAI, Claude, Gemini, Qwen, DeepSeek and MiniMax in fixed order. Test these exact distinctions:

```text
no current head                         -> 未配置
current untested                        -> 已配置
current failed                          -> 测试失败
current revision == active revision     -> 已启用
same Provider active on older revision  -> 当前草稿未启用 · 运行 rev N
current failed + older active revision  -> 当前草稿测试失败 · 仍运行 rev N
deployment source, no dynamic head      -> 部署配置正在运行 · 后台 Key 不可查看
```

- [ ] **Step 4: Implement Provider selection and safe summaries**

Use buttons/tabs with visible selected and active markers. Show last tested time and Key `已配置 · 末四位` only. Never place metadata in data attributes, titles or analytics payloads beyond safe DTO fields.

- [ ] **Step 5: Write failing form-boundary tests**

Provider is read-only. Model ID and approved Endpoint ID are controlled fields. Endpoint uses only supplied options. Key input is optional for update, never prefilled, and clears on Provider switch/unmount/`pagehide`/page hidden. Expected revision comes from snapshot, not a hidden user-editable field. Those lifecycle events also abort an in-flight save and a late response cannot update the newly selected Provider.

- [ ] **Step 6: Implement the Provider editor**

Use semantic labels, inline bounded validation and a password-style new-Key input. Do not offer Base URL input. Display current revision and active revision separately.

- [ ] **Step 7: Write failing save interaction tests**

The JSON body goes only through `PUT /api/v1/admin/assistant/model-configs/{provider}`. Test the actual method/path, pending state, double-submit prevention, lifecycle abort, late-response discard, 409 refresh prompt, re-auth redirect, safe failure text and success snapshot replacement. The Key field clears on every settled or lifecycle-aborted request and never enters console/error snapshots.

- [ ] **Step 8: Implement save and metadata refresh**

Use `fetch` with same-origin credentials, `cache: "no-store"`, JSON content type and a local AbortController. On success use returned safe metadata, then refresh list once to align runtime/current-head state.

- [ ] **Step 9: Write failing test-and-activate interactions**

Disable action without a saved current revision. Test pending state up to the BFF timeout, failure preserving old active marker, success moving the active marker without page reload, and conflict requiring refresh.

- [ ] **Step 10: Implement test-and-activate**

Send only current revision. Never retry Provider work automatically. Announce result through an `aria-live` region without Provider raw error text.

- [ ] **Step 11: Enforce read-only capability states**

Tests cover `canConfigure=false`, `controlEnabled=false` and deployment bootstrap. Deployment source does not make the dynamic panel read-only: when `canConfigure && controlEnabled`, the user may save/test the first dynamic head, but bootstrap Key is never prefilled or revealable. Keep safe Provider/runtime metadata observable under `admin:assistant`.

- [ ] **Step 12: Place the panel in the approved page order**

Insert cloud configuration after existing service/runtime status and before the test console. Keep one page heading and existing `/admin/assistant` URL.

- [ ] **Step 13: Add responsive and accessible panel styles**

Use the existing Admin visual language. Desktop uses Provider rail + editor; narrow screens stack them. Preserve keyboard focus, visible focus rings, 44px action targets, readable status text and reduced-motion behavior.

- [ ] **Step 14: Run page/panel tests and typecheck**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run \
  src/app/admin/assistant/page.test.tsx \
  src/components/admin/assistant-admin-page.test.tsx \
  src/components/admin/assistant-model-config-panel.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: all exit 0 and no secret sentinel appears in snapshots/errors.

- [ ] **Step 15: Commit**

```bash
git add apps/web/src/app/admin/assistant/page.tsx \
  apps/web/src/app/admin/assistant/page.test.tsx \
  apps/web/src/components/admin/assistant-admin-page.tsx \
  apps/web/src/components/admin/assistant-admin-page.test.tsx \
  apps/web/src/components/admin/assistant-model-config-panel.tsx \
  apps/web/src/components/admin/assistant-model-config-panel.test.tsx \
  apps/web/src/components/admin/assistant-admin-page.css
git commit -m "feat(assistant): 在现有后台管理云模型"
```

### Task 18: Add temporary plaintext Key reveal with complete browser cleanup

**Files:**
- Create: `apps/web/src/components/admin/use-model-key-reveal.ts`
- Create: `apps/web/src/components/admin/use-model-key-reveal.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-model-config-panel.tsx`
- Modify: `apps/web/src/components/admin/assistant-model-config-panel.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.css`

- [ ] **Step 1: Write failing 30-second lifecycle tests**

With fake timers, reveal success stores plaintext only in hook state and clears it at exactly 30 seconds. Repeated reveal replaces the value and deadline; manual hide clears immediately.

- [ ] **Step 2: Write failing browser-event cleanup tests**

Clear on Provider change, `pagehide`, `visibilitychange` to hidden and component unmount. Abort in-flight reveal on each event and discard a late response. Assert localStorage/sessionStorage/indexedDB/query caches are never called.

- [ ] **Step 3: Implement `useModelKeyReveal()`**

Expose only `reveal(provider, revision)`, `hide()`, `plaintext`, `secondsRemaining`, `status` and safe error. Keep timer/AbortController refs private and clear both in one idempotent function.

- [ ] **Step 4: Write failing permission and re-auth tests**

No reveal control renders when `canReveal=false`, `controlEnabled=false`, no dynamic saved Key exists or the runtime source is deployment-only. A versioned `reauth_required` response navigates only to exact `/staff/re-auth`; permission/rate/storage errors remain fixed inline messages.

- [ ] **Step 5: Implement reveal UI**

Show the saved Key as ordinary selectable plaintext only after success, with countdown and manual hide. The response uses POST and `cache: "no-store"`. Never put Key in an input default value, URL, attribute, toast history or thrown error.

- [ ] **Step 6: Write failing copy-warning tests**

Before copy, display: `复制后由操作系统剪贴板负责保管，30 秒隐藏不会清除剪贴板。` Copy only on explicit click. Do not schedule or claim clipboard clearing.

- [ ] **Step 7: Implement explicit copy action**

Call `navigator.clipboard.writeText` only while plaintext exists. Report success/failure without including copied content.

- [ ] **Step 8: Run hook and panel suites**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run \
  src/components/admin/use-model-key-reveal.test.tsx \
  src/components/admin/assistant-model-config-panel.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: all exit 0; after every cleanup path the secret sentinel is absent from the DOM.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/admin/use-model-key-reveal.ts \
  apps/web/src/components/admin/use-model-key-reveal.test.tsx \
  apps/web/src/components/admin/assistant-model-config-panel.tsx \
  apps/web/src/components/admin/assistant-model-config-panel.test.tsx \
  apps/web/src/components/admin/assistant-admin-page.css
git commit -m "feat(assistant): 支持限时查看模型密钥"
```

### Task 19: Preserve honest Skill, Knowledge, Tools and local-compute entries

**Files:**
- Create: `apps/web/src/components/admin/assistant-capability-roadmap.tsx`
- Create: `apps/web/src/components/admin/assistant-capability-roadmap.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.css`

- [ ] **Step 1: Write failing roadmap-content tests**

Render four separate cards in this order:

```text
本地算力       预留 / 未连接  Ollama、vLLM、OpenAI-compatible、自有模型仓库
Skill 加载     未接入         未来按 Agno Skills loader 接入
知识库         未接入         未来承载文档、网页内容和检索
网页与操作工具 未接入         未来承载外部动作、审批和浏览器操作
```

- [ ] **Step 2: Prove entries cannot trigger work**

Buttons are disabled or absent; rendering/click attempts produce no fetch, navigation, file scan, health probe, localhost request or analytics event. `local` is not added to Provider choices.

- [ ] **Step 3: Implement the roadmap component**

Keep each capability independent; do not group Skill, Knowledge and Tools under model configuration. Use honest status labels and no fake counts.

- [ ] **Step 4: Reorder the existing page sections**

Final order: service/runtime status -> cloud model configuration -> roadmap cards -> protected test console -> read-only runtime contract -> session persistence. Remove the old duplicate disabled `Skill 管理` navigation button.

- [ ] **Step 5: Add page-level accessibility regression tests**

Assert one H1, unique H2 names, logical tab order, disabled roadmap actions, form labels, live regions and no secret-bearing accessible name.

- [ ] **Step 6: Run component suites and lint**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run \
  src/components/admin/assistant-capability-roadmap.test.tsx \
  src/components/admin/assistant-admin-page.test.tsx
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/admin/assistant-capability-roadmap.tsx \
  apps/web/src/components/admin/assistant-capability-roadmap.test.tsx \
  apps/web/src/components/admin/assistant-admin-page.tsx \
  apps/web/src/components/admin/assistant-admin-page.test.tsx \
  apps/web/src/components/admin/assistant-admin-page.css
git commit -m "feat(assistant): 保留后续能力真实入口"
```

## Chunk 5: Deployment, deterministic acceptance and release evidence

### Task 20: Wire isolated roles, Secrets, migration and Endpoint policy into Compose

**Files:**
- Create: `infra/agent/model-endpoints.json`
- Modify: `compose.yaml`
- Modify: `.env.example`
- Modify: `apps/agent/Dockerfile`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Modify: `infra/docker/README.md`

- [ ] **Step 1: Write failing Compose secret-boundary tests**

Add fixture files and assert this exact visibility matrix:

```text
agent-control-bootstrap: owner DB + two control-role password Secrets
agent-control-migrate:   control migrator URL only
agent:                   control runtime URL + encryption Key + control Key
web:                     control Key only
db/migrate/backup/proxy: none of encryption Key/control Key/control URLs
```

The Agent still receives its existing Agno URL and `OS_SECURITY_KEY`; Web still receives `OS_SECURITY_KEY`. Assert `AGENT_CONFIG_CONTROL_KEY` is a different Secret source from `OS_SECURITY_KEY`.

- [ ] **Step 2: Write failing startup-order tests**

Require:

```text
db healthy
  -> agent-control-bootstrap completed
  -> agent-control-migrate completed
  -> agent may start
```

Agent also continues to wait for `agent-migrate`. Neither Web nor Agent may run a migrator credential at runtime.

- [ ] **Step 3: Write failing network/filesystem tests**

Agent remains un-published, read-only and attached to backend + model egress. The Endpoint catalog exists only in the Agent image at `/etc/aap/model-endpoints.json`, owned by root and mode `0644`; it is absent from Web and cannot be changed in the read-only runtime container. Control DB services use backend only. Existing public proxy boundary remains unchanged.

- [ ] **Step 4: Add the deployment-owned Endpoint file**

Commit version `1` with an empty custom-endpoint list; the six official endpoints remain code-owned. Copy it into the Agent runtime image as root-owned `0644`. Custom deployment endpoints require editing this deployment file and rebuilding the Agent image. Do not add localhost/private endpoints or secrets.

- [ ] **Step 5: Add control role bootstrap and migration services**

Mount the Task 2 SQL/wrapper into a hardened PostgreSQL bootstrap container. Run `python -m agent_service.model_config_migrate` in a one-shot Agent image with only `AGENT_CONTROL_MIGRATOR_DATABASE_URL`.

- [ ] **Step 6: Attach runtime Secrets to Agent and Web**

Agent receives `AGENT_CONTROL_DATABASE_URL`, 64-lowercase-hex `MODEL_CONFIG_ENCRYPTION_KEY`, `AGENT_CONFIG_CONTROL_KEY` and `MODEL_ENDPOINTS_FILE`. Web receives only `AGENT_CONFIG_CONTROL_KEY`. Preserve all existing Secret-file loading through `run-with-secret-env.sh`.

- [ ] **Step 7: Add `.env.example` contracts**

Document separate role passwords/URLs and `_FILE` paths. Show `openssl rand -hex 32` for encryption/control credentials and state control Key must differ from OS key. Keep actual values out of tracked files.

- [ ] **Step 8: Update deployment-order documentation**

Document both platform/Agno/control migrations, least-privilege ownership, dynamic-over-bootstrap precedence and the fact that backup intentionally excludes `agent_control` secrets.

- [ ] **Step 9: Run rendered Compose and deployment-contract tests**

Run:

```bash
pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts
docker compose --env-file .env.example config --quiet
```

Expected: tests pass and Compose renders without printing fixture Secret contents. If local `.env.example` placeholders cannot satisfy Docker file mounts, use the fixture-backed Vitest renderer as the authoritative render check and record the intentional direct-render limitation.

- [ ] **Step 10: Commit**

```bash
git add infra/agent/model-endpoints.json compose.yaml .env.example apps/agent/Dockerfile \
  packages/database/src/deployment-contracts.test.ts infra/docker/README.md
git commit -m "feat(agent): 部署动态模型控制面"
```

### Task 21: Extend deterministic container acceptance through the real control plane

**Files:**
- Modify: `compose.e2e.yaml`
- Modify: `apps/agent/tests/e2e_agent/app.py`
- Modify: `apps/agent/tests/e2e_agent/deterministic_model.py`
- Modify: `packages/database/src/seed-auth-e2e.ts`
- Modify: `packages/database/src/auth-e2e-tools.test.ts`
- Modify: `apps/web/e2e/auth-fixtures.ts`
- Modify: `apps/web/e2e/assistant-runtime.spec.ts`
- Modify: `docs/testing/run-assistant-runtime-e2e.sh`
- Modify: `packages/database/src/deployment-contracts.test.ts`

- [ ] **Step 1: Add a dedicated E2E super-admin identity**

Write failing seed tests, then add `modelAdmin` with only the `super_admin` role plus two signed workforce sessions: one current with `mfa_verified_at=now()`, one older than 10 minutes. Add `E2E_MODEL_ADMIN_SESSION_TOKEN` and `E2E_MODEL_ADMIN_STALE_SESSION_TOKEN` to fixture validation. Do not elevate the existing `admin` role/user.

- [ ] **Step 2: Extend browser fixture credentials**

Expose the two tokens only through `auth-fixtures.ts`; include them in protected-value scans. Existing auth fixtures and tests remain unchanged.

- [ ] **Step 3: Write failing deterministic managed-model tests**

The acceptance builder returns a real `ManagedModel` wrapping `DeterministicModel`. Model IDs prefixed `e2e-fail-` return an empty verification response; other IDs verify and answer with a stable ID-specific marker. Close callback records exactly one close without network access.

- [ ] **Step 4: Inject only the model builder into the real Agent app**

Use Task 12's dependency seam to inject only the managed-model builder. Retain the production verifier unchanged, plus real control auth, repository, encryption, Endpoint catalog, activation lock, runtime slot, AgentOS and startup reconciliation. Thus `e2e-fail-` is rejected by the real non-empty-response verification path. Remove the old fixed acceptance catalog shortcut when dynamic mode is under test.

- [ ] **Step 5: Add E2E control Secrets and database URLs**

The runner generates fresh control role passwords/URLs, 64-hex encryption Key and independent control Key in its mode-0600 temp secret directory. Compose E2E mounts them through the production wiring. Every generated value and path is added to the protected-pattern file before containers start.

- [ ] **Step 6: Write failing authorization/re-auth browser tests**

Existing admin can view safe metadata but receives 403 and sees no save/reveal controls. Current modelAdmin can configure/reveal. Stale modelAdmin receives `reauth_required` and navigates to `/staff/re-auth`. No test assigns the new permissions to `admin`.

- [ ] **Step 7: Write failing six-Provider save tests**

Through `/admin/assistant`, save one current head for all six Providers using official Endpoint IDs and six unique fixture Keys. Append every full Key and its unique last four to separate protected-pattern ledgers before submission. Assert last four appears only in the authorized list/page DTO; Web audit, Agent events and logs contain neither full Key nor last four.

- [ ] **Step 8: Write failing failure-preserves-old tests**

Activate OpenAI rev1 and verify a public/Admin test answer marker. Save an `e2e-fail-` rev2 for OpenAI, attempt activation, and assert rev1 remains the active runtime. Restart Agent and assert the immutable rev1 pointer still restores and answers.

- [ ] **Step 9: Write failing successful hot-switch tests**

Activate a valid Qwen revision and assert the next run uses its marker while the Agent container ID/start time did not change during activation. Then restart Agent intentionally and assert Qwen restores from the dynamic pointer.

- [ ] **Step 10: Add conflict, kill-switch and reveal tests**

Cover stale revision 409, `AGENT_ENABLED=false` read-only control, reveal plaintext display, explicit copy warning, and 30-second DOM cleanup using Playwright's browser clock. Bootstrap Key is never revealable.

- [ ] **Step 11: Assert honest roadmap behavior**

Skill, Knowledge, Tools and local-compute cards show their approved unavailable labels. Install request listeners and prove interacting with the page produces no capability-specific API, localhost or health-probe request.

- [ ] **Step 12: Add database/audit/log leak assertions**

Query through authorized test roles to prove current/old revisions and one active pointer; full fixture Keys are absent from textual DB columns, Web audit, Agent control events, browser console, HTTP error bodies and all container logs. Separately assert each unique last four is absent from both audit layers and container logs while allowed in the model-config list/page DTO. Ciphertext exists and differs across re-sealed revisions.

- [ ] **Step 13: Extend zero-residue cleanup checks**

Keep existing ownership lock and trap cleanup. Assert no E2E containers, volumes, networks, local images, temp Secret files, dynamic-pattern files or lock directory remain after success and injected failure.

- [ ] **Step 14: Run deterministic acceptance**

Run:

```bash
RUN_ASSISTANT_RUNTIME_E2E=true \
  ./docs/testing/run-assistant-runtime-e2e.sh
```

Expected: placeholder, dynamic control, failed-candidate, hot-switch, restart-recovery, reveal and cleanup phases all pass without external Provider credentials or network calls.

- [ ] **Step 15: Commit**

```bash
git add compose.e2e.yaml \
  apps/agent/tests/e2e_agent/app.py \
  apps/agent/tests/e2e_agent/deterministic_model.py \
  packages/database/src/seed-auth-e2e.ts \
  packages/database/src/auth-e2e-tools.test.ts \
  apps/web/e2e/auth-fixtures.ts \
  apps/web/e2e/assistant-runtime.spec.ts \
  docs/testing/run-assistant-runtime-e2e.sh \
  packages/database/src/deployment-contracts.test.ts
git commit -m "test(assistant): 验收动态模型配置闭环"
```

### Task 22: Publish operator guidance and collect full release evidence

**Files:**
- Modify: `apps/web/src/content/deployment.mdx`
- Modify: `docs/testing/assistant-runtime-acceptance.md`
- Modify: `docs/testing/model-provider-smoke.md`
- Modify: `README.md`

- [ ] **Step 1: Write the migration and rollback runbook**

Document Secret generation, role bootstrap, control migration, deployment kill switch, no-dynamic/bootstrap behavior, first Admin activation, failed candidate behavior and restart recovery. Rollback means activating another Provider's current tested head or saving/testing the desired settings as a new revision; old immutable revisions are internal recovery records, not selectable UI entries.

- [ ] **Step 2: Document Key and Endpoint operations**

Explain AES master-key replacement is forbidden without a future migration tool, plaintext reveal requires recent password/TOTP and is browser-visible for 30 seconds, clipboard cannot be recalled, and custom cloud Endpoints require deployment-file changes plus restart/reconciliation. Local addresses remain rejected.

- [ ] **Step 3: Document honest capability scope**

State Skill, Knowledge, Tools/web actions and local compute are visible roadmap entries only. Link the Agno references from the spec and pin behavioral claims to local Agno 2.7.2.

- [ ] **Step 4: Preserve real Provider smoke as explicit evidence**

Update smoke docs so env bootstrap CLI verification and Admin dynamic verification share the verifier but remain credential-gated, one Provider per process and outside default CI. Keep `adapter-tested` distinct from `real-API verified`.

- [ ] **Step 5: Run all Python verification**

Run:

```bash
uv --directory apps/agent lock --check
uv --directory apps/agent run pytest -q
uv --directory apps/agent run ruff check .
uv --directory apps/agent run mypy src tests
```

Expected: all exit 0; PostgreSQL/real-Provider suites may skip only on their documented missing variables.

- [ ] **Step 6: Run all TypeScript verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts
```

Expected: all exit 0.

- [ ] **Step 7: Run deterministic Docker acceptance again**

Run: `RUN_ASSISTANT_RUNTIME_E2E=true ./docs/testing/run-assistant-runtime-e2e.sh`

Expected: exit 0 and zero residual resources. Do not run real Provider smoke without explicitly supplied credentials.

- [ ] **Step 8: Run tracked-file secret and scope checks**

Run:

```bash
git diff --check
git status --short
rg -n 'MODEL_CONFIG_ENCRYPTION_KEY=|AGENT_CONFIG_CONTROL_KEY=|sk-[A-Za-z0-9]' \
  --glob '!docs/superpowers/**' --glob '!**/*.test.*' --glob '!**/e2e/**' .
```

Expected: no tracked credential value; only intended feature files are modified. Preserve unrelated user changes.

- [ ] **Step 9: Request final code review and resolve findings**

Use `superpowers:requesting-code-review` against the implementation base. Fix every High/Medium correctness or security finding, rerun the affected focused suites, then rerun Steps 5–8.

- [ ] **Step 10: Commit documentation/evidence updates**

```bash
git add apps/web/src/content/deployment.mdx \
  docs/testing/assistant-runtime-acceptance.md \
  docs/testing/model-provider-smoke.md README.md
git commit -m "docs(assistant): 记录动态模型配置运维验收"
```

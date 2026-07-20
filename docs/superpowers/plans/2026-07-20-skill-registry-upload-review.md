# Skill Registry、ZIP 上传与双人审核 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成可从后台上传 ZIP、生成不可变 Skill revision、自动校验并由另一名管理员审核发布的 Skill Registry，但本阶段不让码多多加载 Skill。

**Architecture:** 新建独立 Python `skill-registry` 内部服务，使用独立 PostgreSQL `skill_registry` schema；抽出 `packages/skill-core` 作为 Registry 与后续 Agent 共用的安全归档和 Agno 2.7.2 校验包。Web 继续负责 workforce session、权限、MFA 和平台审计，通过带 HMAC assertion 的私有客户端调用 Registry。

**Tech Stack:** Python 3.13、Agno 2.7.2、FastAPI、psycopg 3、Pydantic、PostgreSQL 18、Next.js 16、React 19、TypeScript 5.9、Vitest、Pytest、Docker Compose。

---

**Spec:** `docs/superpowers/specs/2026-07-20-maduoduo-skill-registry-design.md`

**Out of scope:** Agent LocalSkills 加载/激活、Git Provider、OAuth/Token、对象存储、公开 Marketplace。

## Chunk 1: Registry、上传与审核

### File map

| Boundary | Files | Responsibility |
| --- | --- | --- |
| Shared package | `packages/skill-core/**` | ZIP 限额、路径安全、canonical ZIP、Agno manifest 校验、静态检查；不得包含数据库或 HTTP |
| Registry service | `apps/skill-registry/src/skill_registry/**` | 配置、HMAC 认证、migration、repository、上传/审核服务、内部 API |
| Registry tests | `apps/skill-registry/tests/**` | unit、API、PostgreSQL integration；真实 DB 缺失时明确 skip |
| PostgreSQL bootstrap | `infra/postgres/05-skill-registry-roles.{sql,sh}` | migrator/manager/runtime 三角色和 schema owner |
| Web contract/BFF | `apps/web/src/features/assistant/admin-skill-contract.ts`、`apps/web/src/server/assistant/*skill*`、`apps/web/src/app/api/v1/admin/assistant/skills/**` | 严格响应解析、权限/MFA、审计、上传和审核路由 |
| Admin UI | `apps/web/src/components/admin/assistant-skill-registry-panel*` | Skill 列表、ZIP 上传、revision 文件/检查结果、批准/拒绝 |
| Deployment | `compose.yaml`、`.env.example`、`.github/workflows/ci.yml`、`infra/docker/*` | 服务、Secret、备份、CI 和部署合同 |

### Task 1: 建立共享 `skill-core` 包和安全 ZIP 合同

**Files:**
- Create: `packages/skill-core/pyproject.toml`
- Create: `packages/skill-core/uv.lock`
- Create: `packages/skill-core/src/skill_core/__init__.py`
- Create: `packages/skill-core/src/skill_core/types.py`
- Create: `packages/skill-core/src/skill_core/archive.py`
- Create: `packages/skill-core/src/skill_core/manifest.py`
- Create: `packages/skill-core/src/skill_core/scanner.py`
- Create: `packages/skill-core/src/skill_core/diff.py`
- Create: `packages/skill-core/tests/conftest.py`
- Create: `packages/skill-core/tests/test_archive.py`
- Create: `packages/skill-core/tests/test_manifest.py`
- Create: `packages/skill-core/tests/test_scanner.py`
- Create: `packages/skill-core/tests/test_diff.py`
- Modify: `package.json`

- [ ] **Step 1: 写归档负向测试**

覆盖：绝对路径、`..`、NUL、规范化重复/大小写冲突、symlink、hardlink、device、加密 ZIP、nested archive、超过 5 MiB 压缩体、20 MiB 解压体、128 文件、2 MiB 单文件、8 层路径、160 字节文件名、多个 Skill 根和缺少 `SKILL.md`。

```python
@pytest.mark.parametrize(
    ("entry", "code"),
    [
        ("../escape.py", "ARCHIVE_UNSAFE_PATH"),
        ("/absolute.py", "ARCHIVE_UNSAFE_PATH"),
        ("demo/vendor.zip", "ARCHIVE_UNSUPPORTED_FILE"),
    ],
)
def test_rejects_unsafe_entries(entry: str, code: str, zip_factory) -> None:
    with pytest.raises(SkillPackageError) as error:
        canonicalize_skill_zip(zip_factory({entry: b"x"}))
    assert error.value.code == code
```

- [ ] **Step 2: 运行测试确认失败**

Run: `uv --directory packages/skill-core run pytest tests/test_archive.py -q`

Expected: FAIL，`skill_core.archive` 尚不存在。

- [ ] **Step 3: 实现不可变限制和 canonical ZIP**

`types.py` 固定公开合同：

```python
MAX_ARCHIVE_BYTES = 5 * 1024 * 1024
MAX_EXTRACTED_BYTES = 20 * 1024 * 1024
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_FILES = 128
MAX_PATH_DEPTH = 8
MAX_PATH_BYTES = 160

@dataclass(frozen=True, slots=True)
class CanonicalSkillPackage:
    slug: str
    archive: bytes
    sha256: str
    compressed_size: int
    extracted_size: int
    files: tuple[SkillFile, ...]
    manifest: SkillManifest
    findings: tuple[ScanFinding, ...]
```

`archive.py` 必须流式累计真实解压字节，拒绝特殊文件，再以 UTF-8 路径排序、固定时间戳 `1980-01-01T00:00:00` 和固定权限重新压缩。不要调用 `extractall()`。

- [ ] **Step 4: 写 Agno manifest 测试并确认红灯**

测试合法 `SKILL.md`、目录名/name 不一致、额外 frontmatter、空 description、非 UTF-8 reference/script、非 Python3/POSIX sh shebang、二进制文件。

Run: `uv --directory packages/skill-core run pytest tests/test_manifest.py -q`

Expected: FAIL，manifest parser 尚不存在。

- [ ] **Step 5: 实现锁定版本的 manifest 校验并跑绿灯**

`pyproject.toml` 精确固定 `agno==2.7.2`，生成并提交 `uv.lock`。实现直接调用该版本 `validate_skill_directory()` 和 `LocalSkills(..., validate=True)`，再转换为自己的冻结 DTO；不要复制 Agno parser。

Run: `uv --directory packages/skill-core run pytest tests/test_manifest.py -q`

Expected: PASS。

- [ ] **Step 6: 写静态检查和文本 diff 测试并确认红灯**

`scanner.py` 只产生确定性 finding，不声称安全：`possible_secret`、`private_key`、`network_access`、`subprocess`、`environment_read`、`dynamic_code`、`filesystem_write`、`unsupported_import`、`external_url`。依赖合同为 `scan(package, allowed_python_modules=...)`：Python import 取 dotted name 第一段，与 `sys.stdlib_module_names ∪ allowed_python_modules` 比较；允许列表唯一来源是后续创建的 `infra/agent/skill-runtime-imports.json`。`diff.py` 只对 UTF-8 文本按规范路径生成 unified diff，限制总输出 512 KiB，并明确标记 added/deleted/binary。

Run: `uv --directory packages/skill-core run pytest tests/test_scanner.py tests/test_diff.py -q`

Expected: FAIL，scanner/diff 尚未实现。

- [ ] **Step 7: 实现 scanner/diff 并跑完整绿灯**

finding 固定按 `(path, line, code)` 排序且不包含疑似 Secret 原文；`unsupported_import` 是发布阻断 finding。diff 只用于审核展示，不写回 revision。

Run: `uv --directory packages/skill-core run pytest -q`

Expected: 全部 PASS。

- [ ] **Step 8: 加入质量命令并提交**

在根 `package.json` 新增 `skill-core:test/lint/typecheck`，分别调用 Pytest、Ruff、Mypy。

```bash
git add package.json packages/skill-core
git commit -m "feat(skills): add safe skill package core"
```

### Task 2: 创建 Registry 数据库角色和 schema v1

**Files:**
- Create: `infra/postgres/05-skill-registry-roles.sql`
- Create: `infra/postgres/05-skill-registry-roles.sh`
- Create: `apps/skill-registry/pyproject.toml`
- Create: `apps/skill-registry/uv.lock`
- Create: `apps/skill-registry/src/skill_registry/__init__.py`
- Create: `apps/skill-registry/src/skill_registry/config.py`
- Create: `apps/skill-registry/src/skill_registry/schema.py`
- Create: `apps/skill-registry/src/skill_registry/migrate.py`
- Create: `apps/skill-registry/tests/test_config.py`
- Create: `apps/skill-registry/tests/test_schema.py`
- Create: `apps/skill-registry/tests/test_migrate.py`
- Create: `apps/skill-registry/tests/test_migrate_postgres.py`
- Create: `packages/database/src/skill-registry-role-boundary.integration.test.ts`

- [ ] **Step 1: 写配置和角色 bootstrap 失败测试**

要求三个 DSN 精确使用 `postgresql+psycopg_async`，Secret 不进入 repr；角色为 `ai_agent_skill_registry_migrator`、`ai_agent_skill_registry_manager`、`ai_agent_skill_registry_runtime`，全部 `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`。

Run: `uv --directory apps/skill-registry run pytest tests/test_config.py tests/test_schema.py -q`

Expected: FAIL，模块/SQL 尚不存在。

- [ ] **Step 2: 实现服务包和 schema v1 literal SQL**

`pyproject.toml` 通过 `[tool.uv.sources]` 引用 `../../packages/skill-core`；运行依赖只包含 FastAPI、psycopg、Pydantic Settings、uvicorn 和本地 `skill-core`。

schema v1 创建：

```text
skill_registry.schema_versions
skill_registry.skills
skill_registry.skill_revisions
skill_registry.skill_revision_artifacts
skill_registry.skill_revision_files
skill_registry.skill_control_events
```

`skill_control_events` 至少包含 `request_id UUID NOT NULL`、`assertion_nonce UUID`、actor、event type、target ID、稳定 result/error code 和时间戳；mutation 事件的 `assertion_nonce` 必填，read 事件允许为空。

关键约束：

```sql
UNIQUE (slug); -- 永久保留 identity，归档后也不复用名称
UNIQUE (skill_id, revision_no);
UNIQUE (skill_id, artifact_sha256);
UNIQUE (assertion_nonce);
CHECK (state IN ('pending_review','published','rejected','archived'));
CHECK (source_type IN ('upload','github','gitlab','gitcode'));
CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$');
CHECK (compressed_size BETWEEN 1 AND 5242880);
CHECK (extracted_size BETWEEN 1 AND 20971520);
CHECK (file_count BETWEEN 1 AND 128);
```

加入 trigger：

- `skills.slug/created_by/created_at` 不可更新，只允许设置一次 `archived_at`；
- revision 内容字段不可更新，状态只允许 `pending_review -> published|rejected`、`published -> archived`；
- `skill_revision_artifacts` 和 `skill_revision_files` 禁止 UPDATE/DELETE；
- `skill_control_events` 禁止 UPDATE/DELETE，mutation event 与对应 upload/review 业务变更必须在同一事务插入，唯一 nonce 冲突映射为 replay；
- manager 仅有所需 SELECT/INSERT 和状态列 UPDATE，无 DELETE/TRUNCATE/DDL；runtime 在 v1 没有表权限；backup 获得 SELECT。

永久 `UNIQUE(slug)` 是并发唯一真源，服务层只负责把 constraint violation 映射为 `SKILL_NAME_CONFLICT`，不得先查后插作为唯一保护。

- [ ] **Step 3: 运行 unit migration 测试**

Run: `uv --directory apps/skill-registry run pytest tests/test_config.py tests/test_schema.py tests/test_migrate.py -q`

Expected: PASS；重复 migration 仍为 version 1。

- [ ] **Step 4: 运行真实 PostgreSQL 角色测试**

Precondition: 已导出 `SKILL_REGISTRY_TEST_DATABASE_URL`、`SKILL_REGISTRY_MIGRATOR_DATABASE_URL`、`SKILL_REGISTRY_DATABASE_URL`、`SKILL_REGISTRY_RUNTIME_DATABASE_URL` 四个测试 DSN。

Run: `uv --directory apps/skill-registry run pytest tests/test_migrate_postgres.py -q`

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/skill-registry-role-boundary.integration.test.ts`

Expected: manager 可创建/审核、不能修改 artifact/file/revision 正文或删除；并发同 slug 只有一条成功；同 mutation nonce 只有一个事务成功且失败事务无业务残留；runtime v1 不能读表；backup 只读；其他平台/Agno/Agent-control 角色无权限。缺环境时测试输出明确 SKIPPED，不算验收通过。

- [ ] **Step 5: 提交**

```bash
git add apps/skill-registry infra/postgres/05-skill-registry-roles.sql infra/postgres/05-skill-registry-roles.sh packages/database/src/skill-registry-role-boundary.integration.test.ts
git commit -m "feat(skills): add registry schema and role boundary"
```

### Task 3: 实现 PostgreSQL artifact store、上传和双人审核服务

**Files:**
- Create: `apps/skill-registry/src/skill_registry/types.py`
- Create: `apps/skill-registry/src/skill_registry/artifact_store.py`
- Create: `apps/skill-registry/src/skill_registry/repository.py`
- Create: `apps/skill-registry/src/skill_registry/service.py`
- Create: `apps/skill-registry/tests/test_artifact_store.py`
- Create: `apps/skill-registry/tests/test_repository.py`
- Create: `apps/skill-registry/tests/test_repository_postgres.py`
- Create: `apps/skill-registry/tests/test_service.py`

- [ ] **Step 1: 写 artifact store 和事务失败测试**

定义可替换接口：

```python
class SkillArtifactStore(Protocol):
    async def put(self, revision_id: UUID, artifact: CanonicalSkillPackage) -> None: ...
    async def get(self, revision_id: UUID, expected_sha256: str) -> bytes: ...

class SkillRegistryRepository(Protocol):
    async def create_upload_revision(self, command: CreateUploadRevision) -> StoredRevision: ...
    async def review_revision(self, command: ReviewRevision) -> StoredRevision: ...
    async def list_skills(self) -> tuple[SkillSummary, ...]: ...
    async def get_revision(self, skill_id: UUID, revision_id: UUID) -> StoredRevision: ...
    async def list_revision_files(self, revision_id: UUID) -> tuple[StoredFile, ...]: ...
    async def find_previous_published(self, revision: StoredRevision) -> StoredRevision | None: ...
```

测试 artifact、revision、file index、event 必须同事务成功；任一步失败零残留；相同 Skill+digest 幂等返回已有 revision；不同 Skill 同名返回 `SKILL_NAME_CONFLICT`。查询测试必须覆盖列表、详情、文件索引、上一 published revision、artifact 摘要复验、canonical ZIP 内安全单文件读取和摘要不匹配失败。

服务构造器必须显式注入不可变 `ScanPolicy(allowed_python_modules=frozenset(...))`；测试分别注入空集合和固定测试集合，禁止 service 从环境或全局变量隐式取允许列表。

- [ ] **Step 2: 运行测试确认失败**

Run: `uv --directory apps/skill-registry run pytest tests/test_artifact_store.py tests/test_repository.py tests/test_service.py -q`

Expected: FAIL，接口尚未实现。

- [ ] **Step 3: 实现上传服务**

服务入口保持窄接口：

```python
async def upload_zip(
    self,
    *,
    actor: UUID,
    request_id: UUID,
    assertion_nonce: UUID,
    archive: bytes,
    target_skill_id: UUID | None,
) -> RevisionDetail:
    package = canonicalize_skill_zip(archive)
    findings = scan(
        package,
        allowed_python_modules=self._scan_policy.allowed_python_modules,
    )
    package = replace(package, findings=findings)
    command = CreateUploadRevision(
        actor=actor,
        request_id=request_id,
        assertion_nonce=assertion_nonce,
        package=package,
        target_skill_id=target_skill_id,
    )
    return await self._repository.create_upload_revision(command)
```

新 Skill 使用 manifest name 建 identity；给现有 Skill 加 revision 时要求 target slug 与 manifest name 相同。最终 findings 与 artifact/revision/file/event 同事务写入；测试断言 allowlist 外 import 产生 `unsupported_import`，allowlist 内 import 不产生该 finding。成功状态固定 `pending_review`；原始 ZIP 不存储。

- [ ] **Step 4: 写审核材料、attestation 和并发审核测试并确认红灯**

详情必须返回 manifest license、Python import/可用性摘要、全部 findings、脚本和 reference 索引，以及与上一 published revision 的受限文本 diff。review request 精确包含：

```json
{
  "decision":"approve",
  "expectedState":"pending_review",
  "reason":null,
  "attestations":{
    "contentReviewed":true,
    "usageRightsConfirmed":true,
    "executionRiskAccepted":true,
    "independentReviewerConfirmed":true
  }
}
```

Run: `uv --directory apps/skill-registry run pytest tests/test_repository.py tests/test_service.py -q`

Expected: FAIL，查询 bundle/attestation/审核状态机尚未完成。

- [ ] **Step 5: 实现查询 bundle、审核状态机和双人规则**

`get_revision_detail()` 每次先通过 artifact store 重验 SHA，再从 canonical ZIP 按索引读取；`get_file_text()` 拒绝索引外/非 UTF-8/摘要不一致路径。`review_revision()` 必须在锁住 revision 后检查：state 仍为 `pending_review`、`reviewer != created_by`、`expected_state` 匹配、四项 attestation 全为 true，且没有 `unsupported_import` 或 `private_key` finding。`possible_secret`、`network_access`、`subprocess`、`environment_read`、`dynamic_code`、`filesystem_write`、`external_url` 只警告并交给人工审核，不自动阻断。approve 设置 `published`；reject 要求 1–500 字拒绝原因。数据库 trigger 作为第二道防线。

Run: `uv --directory apps/skill-registry run pytest tests/test_service.py tests/test_repository.py -q`

Expected: PASS，包括上一 published diff、license/dependency 摘要、并发审核只有一个成功、自审固定 `REVIEW_SELF_APPROVAL_DENIED`、attestation 缺失固定 `VALIDATION_ERROR`、`unsupported_import`/`private_key` 无法批准、`possible_secret` 经完整人工确认后可批准。

- [ ] **Step 6: 运行 PostgreSQL integration**

Precondition: `SKILL_REGISTRY_DATABASE_URL` 指向专用本地测试库。

Run: `uv --directory apps/skill-registry run pytest tests/test_repository_postgres.py -q`

Expected: PASS；重算 canonical ZIP SHA-256 等于数据库摘要。

- [ ] **Step 7: 提交**

```bash
git add apps/skill-registry/src/skill_registry apps/skill-registry/tests
git commit -m "feat(skills): store and review immutable revisions"
```

### Task 4: 建立 Registry 私有认证和 HTTP API

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/config.py`
- Modify: `apps/skill-registry/src/skill_registry/artifact_store.py`
- Modify: `apps/skill-registry/src/skill_registry/repository.py`
- Modify: `apps/skill-registry/src/skill_registry/service.py`
- Create: `apps/skill-registry/src/skill_registry/auth.py`
- Create: `apps/skill-registry/src/skill_registry/api.py`
- Create: `apps/skill-registry/src/skill_registry/app.py`
- Modify: `apps/skill-registry/tests/test_artifact_store.py`
- Modify: `apps/skill-registry/tests/test_repository.py`
- Modify: `apps/skill-registry/tests/test_service.py`
- Create: `apps/skill-registry/tests/test_auth.py`
- Create: `apps/skill-registry/tests/test_api.py`
- Create: `apps/skill-registry/tests/test_app.py`
- Modify: `apps/skill-registry/tests/test_config.py`

- [ ] **Step 1: 写 pre-body 认证测试**

HMAC domain 固定 `ai-agent-platform:skill-registry-assertion:v1`，所有 GET 和 mutation 都必须带 actor assertion；upload 示例 payload 精确包含：

```json
{"action":"upload","actor":"<uuid>","assurance":"session","assuredAt":null,"expiresAt":1,"issuedAt":0,"nonce":"<uuid>","permission":"admin:assistant:skills:upload","requestId":"<uuid>","target":"new"}
```

review assertion 必须为 `assurance="password+mfa"` 且 `assuredAt` 在当前时间前 600 秒内。测试缺/重复 Bearer、错 key、非 canonical JSON/base64url、过期、未来、action-permission/target 不匹配、缺失或陈旧 MFA assurance、nonce replay，且认证失败时 ASGI `receive()` 从未被调用。

- [ ] **Step 2: 实现认证器和 middleware**

动作表：

```text
list             -> admin:assistant:skills
detail/file      -> admin:assistant:skills:review
upload           -> admin:assistant:skills:upload
review           -> admin:assistant:skills:review + password+mfa assurance
```

Bearer 与 assertion 使用同一 `SKILL_REGISTRY_CONTROL_KEY`，但 HMAC 使用派生 key；TTL 最多 5 秒。单进程 bounded nonce cache 拒绝 5 秒窗口内 read replay，mutation 还由 `skill_control_events.assertion_nonce UNIQUE` 做持久防重放。Registry 信任 Web 签发的 actor/assurance，但独立检查 canonical assertion、权限映射、资源 target、时间窗和双人规则。

Run: `uv --directory apps/skill-registry run pytest tests/test_auth.py -q`

Expected: PASS。

- [ ] **Step 3: 写 API 合同测试**

内部路由：

```text
GET  /internal/skills
POST /internal/skills/uploads?targetSkillId=<optional UUID>   application/zip
GET  /internal/skills/{skillId}/revisions/{revisionId}
GET  /internal/skills/{skillId}/revisions/{revisionId}/files/{filePath:path}
POST /internal/skills/{skillId}/revisions/{revisionId}/review
```

列表只返回名称、revision 状态、来源类型、摘要前缀、创建/审核元数据，不返回路径、源码、findings 或 diff。详情响应包含 license、dependency summary、findings、上一 published 文本 diff 和四项 attestation schema，因此 detail/file assertion 必须具备 review 权限。上传 body 硬上限 5 MiB，逐 chunk 读取；文件正文响应只允许文件索引内 UTF-8 文本，最大 2 MiB；所有响应 `Cache-Control: no-store`，错误只返回稳定 code。

Run: `uv --directory apps/skill-registry run pytest tests/test_api.py -q`

Expected: FAIL，router 尚未实现。

- [ ] **Step 4: 实现 API 和 lifespan**

`repository.py`/`service.py` 补上 API 所需的有界分页和 response DTO 映射，`artifact_store.py` 只允许按已验证索引读取文件；API 不得自行拼 SQL 或解 ZIP。`config.py` 要求 `SKILL_RUNTIME_IMPORTS_FILE` 指向 root-owned `0644` JSON，严格拒绝 symlink、额外字段、重复/未排序模块名和相对路径；`app.py` 在 lifespan 只读取一次该文件、构造冻结 `ScanPolicy` 并注入唯一 service，关闭时释放 pool。测试用临时只读 manifest 证明 allowlist 确实改变 upload findings。`/internal/health/live` 不探 DB，`/internal/health/ready` 做 2 秒 `SELECT 1`。不要公开 OpenAPI/docs，不发布宿主机端口。

Run: `uv --directory apps/skill-registry run pytest tests/test_config.py tests/test_service.py tests/test_api.py tests/test_app.py -q`

Expected: PASS；ZIP、源码、数据库 URL 和 control key 不出现在错误/日志。

- [ ] **Step 5: 提交**

```bash
git add apps/skill-registry/src/skill_registry apps/skill-registry/tests
git commit -m "feat(skills): expose protected registry API"
```

### Task 5: 增加 Web 权限、审计合同和严格 Registry 客户端

**Files:**
- Modify: `packages/database/src/seed-access-control.ts:56-119`
- Modify: `packages/database/src/seed-access-control.test.ts`
- Modify: `apps/web/src/server/auth/audit.ts`
- Modify: `apps/web/src/server/auth/audit.test.ts`
- Create: `apps/web/src/features/assistant/admin-skill-contract.ts`
- Create: `apps/web/src/features/assistant/admin-skill-contract.test.ts`
- Create: `apps/web/src/server/assistant/skill-registry-client.ts`
- Create: `apps/web/src/server/assistant/skill-registry-client.test.ts`

- [ ] **Step 1: 写权限 seed 和审计 schema 失败测试**

新增五项权限：read、upload、connections、review、configure。`workforce:admin` 获得 read+upload；`super_admin` 获得全部；其他角色均无。模型专属权限矩阵不得变化。审计测试先声明新的 target/event/严格 metadata，并验证 ZIP、源码、文件名、拒绝全文无法进入 metadata。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/seed-access-control.test.ts`

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/auth/audit.test.ts`

Expected: 两条命令均 FAIL，权限矩阵和审计 event 尚未实现。

- [ ] **Step 2: 实现 seed 并更新审计 schema**

新增 target `assistant_skill_revision`，事件 `assistant.skill_upload_requested/completed`、`assistant.skill_review_requested/completed`。metadata 只允许 `skillId`、`revisionId`、`revisionNo`、摘要前 12 位、requestId、result；禁止 filename、源码和扫描原文。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/seed-access-control.test.ts`

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/auth/audit.test.ts`

Expected: PASS。

- [ ] **Step 3: 写严格 TypeScript 合同测试**

合同固定 version `1`、四个 revision state、`upload` source、文件 kind/finding code、license/dependency/diff、四项 review attestations 和权限 flags。测试 prototype pollution、getter、symbol key、重复/额外字段、过大数组、非 canonical timestamp/UUID/SHA。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/features/assistant/admin-skill-contract.test.ts src/server/assistant/skill-registry-client.test.ts`

Expected: FAIL，contract/client 尚不存在。

- [ ] **Step 4: 实现 Registry 客户端**

`resolveSkillRegistrySettings()` 要求 `SKILL_REGISTRY_INTERNAL_URL` 为私有 HTTP origin，control key 至少 32 字节且不得等于 `OS_SECURITY_KEY`/`AGENT_CONFIG_CONTROL_KEY`。客户端为 list/detail/file/upload/review 全部签 actor/permission/target assertion；detail/file 使用 review 权限，review mutation 额外签发 `password+mfa` assurance 和 `assuredAt`。使用固定超时、响应大小、media type 和 no-store 校验；错误统一为 `SkillRegistryClientError(code)`。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/features/assistant/admin-skill-contract.test.ts src/server/assistant/skill-registry-client.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/database/src/seed-access-control.ts packages/database/src/seed-access-control.test.ts apps/web/src/server/auth/audit.ts apps/web/src/server/auth/audit.test.ts apps/web/src/features/assistant/admin-skill-contract.ts apps/web/src/features/assistant/admin-skill-contract.test.ts apps/web/src/server/assistant/skill-registry-client.ts apps/web/src/server/assistant/skill-registry-client.test.ts
git commit -m "feat(skills): add admin permissions and registry client"
```

### Task 6: 实现 Web 命令层和 Admin BFF 路由

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/server/http/read-bounded-multipart.ts`
- Create: `apps/web/src/server/http/read-bounded-multipart.test.ts`
- Create: `apps/web/src/server/assistant/admin-skill-commands.ts`
- Create: `apps/web/src/server/assistant/admin-skill-commands.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/handler.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/uploads/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/uploads/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/revisions/[revisionId]/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/revisions/[revisionId]/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/revisions/[revisionId]/files/[...path]/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/revisions/[revisionId]/files/[...path]/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/revisions/[revisionId]/review/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/revisions/[revisionId]/review/route.test.ts`

- [ ] **Step 1: 写命令授权和审计失败测试**

上传要求 trusted mutation + `admin:assistant:skills:upload`；审核要求 trusted JSON mutation + `admin:assistant:skills:review` + 最近 600 秒密码/TOTP。使用一次性 `AuthorizedSkillCommand` WeakMap token，30 秒后失效。测试请求/完成审计成对写入，Registry 失败也必须写 completed failure。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/assistant/admin-skill-commands.test.ts`

Expected: FAIL，命令层尚不存在。

- [ ] **Step 2: 实现命令层**

```ts
authorize(request, "upload" | "review"): Promise<AuthorizedSkillCommand>
upload(context, { archive, targetSkillId }): Promise<RevisionSummary>
review(context, { skillId, revisionId, decision, reason, expectedState }): Promise<RevisionSummary>
```

review input 还必须携带四项全为 true 的 `attestations`。授权 context 保存最近 assurance 时间并传给 Registry signer；`File`/ArrayBuffer 在 `finally` 中清引用；审计不得包含文件名、ZIP、源码或拒绝原因全文。

- [ ] **Step 3: 写受限 multipart parser 和路由负向测试并确认红灯**

新增并锁定 `@fastify/busboy`。`read-bounded-multipart.ts` 从 `Readable.fromWeb(request.body)` 逐 chunk 解析，只接受一个 `archive` file 和最多一个 `targetSkillId` text；累计原始 body 上限 `5 MiB + 64 KiB`，archive 上限 5 MiB，超限立即 destroy parser/stream，禁止 `request.formData()`。覆盖 customer/workforce 无权限、只有 read 无法访问 detail/file、stale MFA、自审 403、错误/缺失 boundary、重复字段、非 ZIP、Content-Length 超限、chunk 后超限、extra JSON key、错误 UUID/文件 path、Registry 502/503、no-store。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/http/read-bounded-multipart.test.ts src/server/assistant/admin-skill-commands.test.ts src/app/api/v1/admin/assistant/skills`

Expected: FAIL，parser/routes 尚不存在。

- [ ] **Step 4: 实现 route/handler**

外部上传经 bounded parser 得到一个 archive buffer 和可选 target UUID；Web 内存转发，不写磁盘。列表 GET 要求 `admin:assistant:skills`；revision detail/file GET 要求 `admin:assistant:skills:review`；各自签精确 assertion。catch-all file path 逐 segment 编码后传 Registry，不拼接本地路径。公共错误文案不泄漏内部原因。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/http/read-bounded-multipart.test.ts src/server/assistant/admin-skill-commands.test.ts src/app/api/v1/admin/assistant/skills`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/server/http/read-bounded-multipart.ts apps/web/src/server/http/read-bounded-multipart.test.ts apps/web/src/server/assistant/admin-skill-commands.ts apps/web/src/server/assistant/admin-skill-commands.test.ts apps/web/src/app/api/v1/admin/assistant/skills
git commit -m "feat(skills): add protected upload and review BFF"
```

### Task 7: 在 `/admin/assistant` 接入真实 Skill 库 UI

**Files:**
- Create: `apps/web/src/components/admin/assistant-skill-registry-panel.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-registry-panel.test.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-upload-dialog.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-upload-dialog.test.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-revision-detail.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-revision-detail.test.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-review-dialog.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-review-dialog.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.tsx:3-18,31-35,132-136`
- Modify: `apps/web/src/components/admin/assistant-admin-page.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-capability-roadmap.tsx`
- Modify: `apps/web/src/components/admin/assistant-capability-roadmap.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.css`
- Modify: `apps/web/src/app/admin/assistant/page.tsx:1-89`
- Modify: `apps/web/src/app/admin/assistant/page.test.tsx`

- [ ] **Step 1: 写 UI 行为测试**

测试：只有 read 权限可以加载列表 snapshot 但不能请求/展开 revision detail；上传后显示 `pending_review` 而不是“已启用”；无 upload/review 权限隐藏动作；审核者能查看文件树、finding、脚本、digest、创建人、license、dependency summary 和相对上一 published revision 的 diff；创建者不可见批准按钮；批准前四项 attestation 必须逐项确认；拒绝必须输入原因；API 失败保留旧 snapshot；不渲染 HTML/Markdown。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/admin/assistant-skill-registry-panel.test.tsx src/components/admin/assistant-skill-upload-dialog.test.tsx src/components/admin/assistant-skill-revision-detail.test.tsx src/components/admin/assistant-skill-review-dialog.test.tsx src/components/admin/assistant-admin-page.test.tsx`

Expected: FAIL，panel/prop 尚不存在。

- [ ] **Step 3: 实现 Panel 和页面装配**

`AdminAssistantPage` 与 status/sessions/models 并行加载 Skill snapshot；失败时返回 `{ capability: "degraded", skills: [] }`，不能伪造空库正常。Panel 只负责 snapshot/选择/刷新；UploadDialog 只负责 ZIP 表单；RevisionDetail 只负责只读 manifest、license、dependency、diff、finding 和安全文件查看；ReviewDialog 只负责四项 attestation、批准/拒绝。Panel 顺序放在模型配置后、roadmap 前。Skill roadmap 卡改成“Registry 已接入 / Agent 运行时待接”，其他卡不变。

- [ ] **Step 4: 加样式并跑可访问性断言**

使用现有 `assistant-admin-page.css` token；文件查看器用 `<pre>` 纯文本；状态不能只靠颜色；dialog/表单具备 label、focus 和 aria-live。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/admin/assistant-skill-registry-panel.test.tsx src/components/admin/assistant-skill-upload-dialog.test.tsx src/components/admin/assistant-skill-revision-detail.test.tsx src/components/admin/assistant-skill-review-dialog.test.tsx src/components/admin/assistant-admin-page.test.tsx src/components/admin/assistant-capability-roadmap.test.tsx src/app/admin/assistant/page.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/admin/assistant-skill-registry-panel.tsx apps/web/src/components/admin/assistant-skill-registry-panel.test.tsx apps/web/src/components/admin/assistant-skill-upload-dialog.tsx apps/web/src/components/admin/assistant-skill-upload-dialog.test.tsx apps/web/src/components/admin/assistant-skill-revision-detail.tsx apps/web/src/components/admin/assistant-skill-revision-detail.test.tsx apps/web/src/components/admin/assistant-skill-review-dialog.tsx apps/web/src/components/admin/assistant-skill-review-dialog.test.tsx apps/web/src/components/admin/assistant-admin-page.tsx apps/web/src/components/admin/assistant-admin-page.test.tsx apps/web/src/components/admin/assistant-capability-roadmap.tsx apps/web/src/components/admin/assistant-capability-roadmap.test.tsx apps/web/src/components/admin/assistant-admin-page.css apps/web/src/app/admin/assistant/page.tsx apps/web/src/app/admin/assistant/page.test.tsx
git commit -m "feat(skills): add admin skill library and review UI"
```

### Task 8: 部署 Registry 容器并锁定运行依赖允许列表

**Files:**
- Create: `apps/skill-registry/Dockerfile`
- Create: `infra/agent/skill-runtime-imports.json`
- Modify: `compose.yaml`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Modify: `packages/database/src/deployment-contracts.test.ts`

- [ ] **Step 1: 先写 deployment contract 失败测试**

断言 bootstrap/migrate/registry 的 Secret、depends_on、只读根、非 root、cap drop、tmpfs noexec、backend-only、无 ports；Web 只拿 internal URL/control key，不拿 Registry DB；Agent 不拿 Registry Secret。断言 Registry 镜像内只有 root 拥有且 `0644` 的 `/etc/aap/skill-runtime-imports.json`，环境变量 `SKILL_RUNTIME_IMPORTS_FILE` 指向它。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: FAIL，Compose 尚无 Registry。

- [ ] **Step 2: 实现镜像和 Compose**

`skill-registry` 常驻容器使用 UID/GID 10002、只读根、`/tmp:rw,noexec,nosuid,nodev,size=64m`、512 MiB、1 CPU、256 PID，只接 `backend`。启动顺序：role bootstrap -> migrate -> registry -> web。所有 Secret 通过 `run-with-secret-env.sh` 注入。

允许列表文件固定合同：

```json
{"version":1,"pythonModules":["agno","cryptography","pydantic"]}
```

列表按字典序排列，只能通过代码评审变更；Compose 把 Task 4 已实现的 `SKILL_RUNTIME_IMPORTS_FILE` 指向该镜像内文件。CI 后续必须在 Agent 镜像中逐项 import，防止“审核允许但运行环境不存在”。

- [ ] **Step 3: 跑 deployment contract 绿灯**

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: PASS；Compose 中无 Registry 宿主端口和宿主目录挂载。

- [ ] **Step 4: 提交**

```bash
git add apps/skill-registry/Dockerfile infra/agent/skill-runtime-imports.json compose.yaml .env.example .gitignore .dockerignore packages/database/src/deployment-contracts.test.ts
git commit -m "feat(skills): deploy internal skill registry"
```

### Task 9: 把 `skill_registry` 纳入加密备份和恢复演练

**Files:**
- Modify: `infra/docker/backup.sh`
- Modify: `infra/docker/restore-drill.sh`
- Modify: `infra/docker/README.md`
- Modify: `packages/database/src/deployment-contracts.test.ts`

- [ ] **Step 1: 先写备份合同失败测试**

断言备份明确包含 `--schema=skill_registry`，恢复演练比较 schema version、revision/artifact/file 行数和每个 artifact 的 SHA-256；脚本及日志不得输出 archive bytea。继续断言短生命周期的 `agent_control` 不进入备份。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: FAIL，备份/恢复脚本尚未覆盖 Registry。

- [ ] **Step 2: 更新加密备份和 restore drill**

`backup.sh` 增加 `--schema=skill_registry`；restore drill 在隔离数据库中恢复后验证 schema version、revision/artifact/file 行数，并在数据库内计算 SHA-256 与记录摘要比较，不把 archive 拉到 stdout。README 明确 `agent_control` 仍排除、`skill_registry` 必须保留。

- [ ] **Step 3: 跑合同和隔离恢复演练**

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: PASS。

Precondition: 已导出当前 `infra/docker/README.md` 声明的 backup/restore drill 测试 Secret 和隔离数据库变量。

Run: `sh infra/docker/restore-drill.sh`

Expected: 输出 Registry 行数与 digest 验证通过；退出后隔离容器、网络、卷为零残留。

- [ ] **Step 4: 提交**

```bash
git add infra/docker/backup.sh infra/docker/restore-drill.sh infra/docker/README.md packages/database/src/deployment-contracts.test.ts
git commit -m "feat(skills): back up immutable skill revisions"
```

### Task 10: 接入 CI、纵向 E2E 和交付文档

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Create: `apps/web/e2e/admin-skill-registry.spec.ts`
- Create: `docs/testing/run-skill-registry-e2e.sh`
- Modify: `docs/testing/README.md`
- Modify: `apps/agent/src/agent_service/skills/README.md`

- [ ] **Step 1: 先写 CI fixture 合同失败测试**

断言 CI 生成 Registry migrator/manager/runtime 三角色密码和 DSN、独立 control key；bootstrap/migrate 各跑两次；执行真实 role boundary、Registry Pytest/Ruff/Mypy、两个 Python lock cache、Registry image smoke；在 Agent 镜像中逐项 import `skill-runtime-imports.json`。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: FAIL，CI 尚未提供完整 fixture 和质量门。

- [ ] **Step 2: 更新 CI fixture 和质量门**

`setup-uv` cache glob 同时包含 `packages/skill-core/uv.lock` 和 `apps/skill-registry/uv.lock`。CI 的 PostgreSQL integration 不能因缺 DSN 被 skip；镜像 smoke 验证非 root、只读文件系统、无宿主端口和 `/internal/health/ready`。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: PASS。

- [ ] **Step 3: 写 E2E，先确认缺少完整闭环**

E2E 使用两名真实权限不同的 workforce actor：A=`workforce:admin`（read+upload），B=`workforce:super_admin`（read+review+recent password/TOTP）。A 上传合法 Skill 并看到 pending；A 无 review 权限且不能自审；B 完成 MFA 后发布；重启 Registry 后 revision/digest 不变；备份/恢复后 artifact SHA 一致。脚本使用独立 Compose project 和 trap 清理容器/网络/卷。

Run: `sh docs/testing/run-skill-registry-e2e.sh`

Expected: FAIL，E2E spec/runner 尚未完成。

- [ ] **Step 4: 完成 E2E runner 和文档并跑绿灯**

README 明确本计划只交付“库+审核”，Agent 仍不加载 Skill，下一计划才接 LocalSkills。测试 fixture 只生成最小 SKILL.md 和脚本，不从互联网下载。

Run: `sh docs/testing/run-skill-registry-e2e.sh`

Expected: `Skill Registry E2E passed`，随后 `docker compose -p "$SKILL_REGISTRY_E2E_PROJECT" ps -aq` 无输出。

- [ ] **Step 5: 跑完整门禁**

```bash
uv --directory packages/skill-core run pytest -q
uv --directory packages/skill-core run ruff check .
uv --directory packages/skill-core run mypy src tests
uv --directory apps/skill-registry run pytest -q -rs
uv --directory apps/skill-registry run ruff check .
uv --directory apps/skill-registry run mypy src tests
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Expected: 全部通过；任何 PostgreSQL skip 必须在真实集成环境补跑后才能交付。

- [ ] **Step 6: 提交**

```bash
git add .github/workflows/ci.yml package.json packages/database/src/deployment-contracts.test.ts apps/web/e2e/admin-skill-registry.spec.ts docs/testing/run-skill-registry-e2e.sh docs/testing/README.md apps/agent/src/agent_service/skills/README.md
git commit -m "test(skills): verify registry delivery end to end"
```

## Plan A completion checkpoint

- 后台能上传、查看、双人审核和发布不可变 revision；
- Agent 仍不加载任何 Skill，页面明确标记“运行时待接”；
- `skill_registry` 已纳入真实加密备份/恢复；
- Git Provider、Token 和外网能力仍不存在；
- 所有错误、日志和审计不包含 ZIP、源码、脚本输出或 Secret。

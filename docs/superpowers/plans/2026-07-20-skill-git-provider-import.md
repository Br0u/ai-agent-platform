# Skill GitHub、GitLab 与 GitCode 导入 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员可从 GitHub、GitLab 和 GitCode 的公开或已授权私有仓库导入固定 commit 下的 Skill 目录，产出与浏览器 ZIP 完全相同的不可变 `pending_review` revision；检查更新、重新导入、凭据吊销都不绕过审核或自动激活。

**Architecture:** Skill Registry 增加加密 Provider connection、source 和持久 import job；所有外部请求由固定 adapter 构造并强制经过专用 Git egress proxy。Provider 下载结果先归一化为受限 Skill 包，再复用 Plan A 的 canonicalize/scan/revision transaction。Web 不获得 Git 外网或持久化 Token，Agent 不获得 Git 凭据。

**Tech Stack:** Python 3.13、FastAPI、psycopg 3、cryptography AES-256-GCM、HTTPX、PostgreSQL 18、Next.js 16、React 19、TypeScript 5.9、Squid forward proxy、Docker Compose、Vitest、Pytest。

---

**Spec:** `docs/superpowers/specs/2026-07-20-maduoduo-skill-registry-design.md`

**Depends on:** Plan A Registry/审核闭环已交付；Plan B 是否已部署不阻塞导入，但未发布 revision 仍不能绑定 Agent。

**Out of scope:** 任意 clone URL、shell `git clone`、SSH key、GitLab deploy token、GitCode OAuth、自动 webhook、定时自动导入、自动审核/发布/激活、通用 Marketplace。

**External references:**

- [GitHub repository archive API](https://docs.github.com/en/rest/repos/contents) 返回 302，私有仓库下载 URL 临时有效；[GitHub App installation token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation) 短期生成并通过 Authorization header 使用。
- [GitLab repository archive API](https://docs.gitlab.com/api/repositories/) 支持固定 `sha + path`；[GitLab token scopes](https://docs.gitlab.com/security/tokens/access_token_scopes/) 区分 `read_api`、`read_repository` 和 deploy token 能力。
- [GitCode API authentication](https://docs.gitcode.com/en/docs/guide/) 支持 Authorization/PRIVATE-TOKEN header；[GitCode repository API](https://docs.gitcode.com/v1-docs/en/docs/repos/) 提供 commit/tree/raw-file 能力。
- [Next.js instrumentation](https://nextjs.org/docs/pages/api-reference/file-conventions/instrumentation) 提供 `onRequestError` 外层服务端错误 hook；实现只记录脱敏字段。

## Chunk 1: Schema、凭据与安全传输

### Task 1: 创建 schema v3 的 connection、source、job 和 check 表

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/schema.py`
- Modify: `apps/skill-registry/src/skill_registry/migrate.py`
- Modify: `apps/skill-registry/tests/test_schema.py`
- Modify: `apps/skill-registry/tests/test_migrate.py`
- Modify: `apps/skill-registry/tests/test_migrate_postgres.py`
- Modify: `infra/postgres/05-skill-registry-roles.sql`
- Modify: `infra/postgres/05-skill-registry-roles.sh`
- Modify: `packages/database/src/skill-registry-role-boundary.integration.test.ts`

- [ ] **Step 1: 写 schema v3 失败测试**

新增：

```text
skill_registry.git_provider_connections
skill_registry.git_connection_flows
skill_registry.skill_sources
skill_registry.skill_import_jobs
skill_registry.skill_source_checks
skill_registry.skill_command_receipts
skill_registry.skill_revision_origins
```

不再把完整 Git 来源塞进 revision。v3 新建 origins 并为现有 upload revision 回填一个 origin；每个 revision 必须且只能有一个 origin，保存 revision/source/import job/当时 canonical owner+repo/path/ref/commit/actor/source type，Git commit 必须是 40 或 64 位 lowercase hex。数据库以 `UNIQUE(origin.revision_id)` 保证至多一个，并在 revision/origin 两侧安装 `DEFERRABLE INITIALLY DEFERRED` constraint trigger，于事务提交时保证每个 revision 恰好一个 origin；迁移先在同一事务回填再启用验证。迁移删除 Plan A 的 `UNIQUE(skill_id,artifact_sha256)`：不同上传/来源即使 artifact 相同也创建独立 `pending_review` revision，各自走许可证和四项 attestation 审核；只有同一 actor+idempotency+fingerprint 或恢复同一 succeeded job 才返回原 revision。

Run: `uv --directory apps/skill-registry run pytest tests/test_schema.py tests/test_migrate.py -q`

Expected: FAIL，schema version 仍为 2。

- [ ] **Step 2: 实现字段、唯一性和状态机**

connections 固定 provider/host/auth type/external account or installation ID、credential ciphertext/nonce/`encryption_key_id`/独立递增 `credential_version`/expiry/last4、active/revoked timestamps，以及 `refresh_state=idle|refreshing|reauthorization_required`、refresh claim token/lease/started_at；GitHub App connection 不存 credential ciphertext。credential 只能由专用 rotation transaction 同时替换 ciphertext+nonce+encryption key ID+expiry 并 CAS `credential_version+1`，其他 identity 字段不可变。

flows 存 state SHA-256、actor、workforce session ID SHA-256、开始时 MFA `assured_at`、provider/redirect URI、PKCE method/challenge、`verifier_ciphertext`/随机 nonce/`flow_encryption_key_id`/独立 `flow_version`、10 分钟 expiry/used_at 和成功后的 `result_connection_id`。GitHub App flow 的 verifier 字段为空但仍绑定 session/state/MFA。首次 callback 在同一事务写 connection/event、used_at/result；响应丢失时，同 actor/session/state 的 callback 只返回既有 connection，不重复交换 code，不同绑定或无结果的 replay 失败。

sources 以 Provider/host/stable repository ID/Skill path/`tracked_ref` 作为不可变 identity，设置 `UNIQUE(provider,host,stable_repository_id,skill_path,tracked_ref)`，不绑定长期 credential；canonical owner/repo、`coordinate_version` 和 updated_at 只能由受限 `refresh_repository_coordinates()` 在 Provider 重新解析为同一 stable ID 后 CAS 更新，并写 control event，origin 仍保留导入当时坐标。每次 job/check 单独引用当次 connection，便于吊销后换新连接而不复制 source。job 固定 `queued|running|succeeded|failed|cancelled`、connection ID、requested ref、resolved commit、attempt、`next_attempt_at`、lease owner/until、actor、`idempotency_key UUID`、request fingerprint、result revision/error code，并设置 `UNIQUE(actor,idempotency_key)`。checks 保存 actor/source/connection/tracked ref/remote commit/idempotency key/fingerprint/check time，设置 `UNIQUE(actor,idempotency_key)`，不创建 revision。另建不可变 `skill_command_receipts`，以 `(actor,action,idempotency_key)` 唯一保存 ZIP upload、connection create/revoke 与 job cancel 的 fingerprint/result，响应丢失重试返回原结果，不同 fingerprint 返回 409。

connection/source identity/origin 不可改；connection 只允许 active→revoked、受控 credential CAS 或 refresh claim 状态机，source 只允许上述同 stable ID 的坐标 CAS；job trigger 只允许合法状态迁移，成功 job 的 result revision/commit 不可再改；events/jobs/checks/origins/receipts 禁止删除。manager 通过最小列权限或受限函数读取 credential ciphertext 并执行工作；backup 只读密文；runtime 和其他角色不能读 connection/source/job/origin credential 列。

Run: `uv --directory apps/skill-registry run pytest tests/test_schema.py tests/test_migrate.py -q`

Expected: PASS；重复 migration 仍为 version 3，回填 origin 幂等；缺 origin/重复 origin 都在 commit 时失败，revision+origin 同事务成功。

- [ ] **Step 3: 写并运行真实 PostgreSQL 角色测试**

Precondition: 已导出 Skill Registry migrator/manager/runtime/owner 测试 DSN。

Run: `uv --directory apps/skill-registry run pytest tests/test_migrate_postgres.py -q`

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/skill-registry-role-boundary.integration.test.ts`

Expected: PASS；同 idempotency key 不同 fingerprint 被拒绝；密文/nonce/encryption key ID 不能单独更新；manager 能通过限定边界取得密文，backup 只读密文，runtime/其他角色拒绝；相同 artifact 的不同 Git 来源得到两个独立 pending revision 且各自只有一个 origin；缺 DSN 的 SKIPPED 不算通过。

- [ ] **Step 4: 提交**

```bash
git add apps/skill-registry/src/skill_registry/schema.py apps/skill-registry/src/skill_registry/migrate.py apps/skill-registry/tests/test_schema.py apps/skill-registry/tests/test_migrate.py apps/skill-registry/tests/test_migrate_postgres.py infra/postgres/05-skill-registry-roles.sql infra/postgres/05-skill-registry-roles.sh packages/database/src/skill-registry-role-boundary.integration.test.ts
git commit -m "feat(skills): add git import persistence"
```

### Task 2: 实现独立凭据加密和 connection flow

**Files:**
- Modify: `apps/skill-registry/pyproject.toml`
- Modify: `apps/skill-registry/uv.lock`
- Modify: `apps/skill-registry/src/skill_registry/config.py`
- Create: `apps/skill-registry/src/skill_registry/source_crypto.py`
- Create: `apps/skill-registry/src/skill_registry/source_connection_repository.py`
- Create: `apps/skill-registry/src/skill_registry/source_connection_service.py`
- Create: `apps/skill-registry/src/skill_registry/source_key_rotation.py`
- Create: `apps/skill-registry/src/skill_registry/source_logging.py`
- Modify: `apps/skill-registry/tests/test_config.py`
- Create: `apps/skill-registry/tests/test_source_crypto.py`
- Create: `apps/skill-registry/tests/test_source_connection_repository.py`
- Create: `apps/skill-registry/tests/test_source_connection_service.py`
- Create: `apps/skill-registry/tests/test_source_key_rotation.py`
- Create: `apps/skill-registry/tests/test_source_logging.py`

- [ ] **Step 1: 写 Secret、connection/flow 加密和脱敏失败测试**

新增 root-owned `SKILL_SOURCE_ENCRYPTION_KEYS_FILE`，严格 JSON keyring 只允许一个 active key 和最多一个 previous key，每项为 key ID + 32-byte base64；另有 GitHub App ID/private-key file、GitLab.com OAuth client ID/secret file、GitCode PAT connection 能力。所有 Secret 不进入 repr、validation error、traceback、structured log 或 health；每个 key 必须与模型/Registry control/backup key 不同。

Run: `uv --directory apps/skill-registry run pytest tests/test_config.py tests/test_source_crypto.py tests/test_source_logging.py -q`

Expected: FAIL，配置/crypto 尚不存在。

- [ ] **Step 2: 实现 AES-256-GCM envelope**

新增并锁定 `cryptography>=46.0.5,<47`。connection credential AAD 固定 canonical `{kind:"connection",connectionId,provider,host,authType,encryptionKeyId,credentialVersion}`；PKCE flow 在 connection 创建前使用独立 AAD `{kind:"oauth_flow",flowId,provider,sessionHash,redirectUri,encryptionKeyId,flowVersion}`，禁止拿 connection envelope 加密 verifier。两类每次写都生成随机 96-bit nonce，密文与 tag 原样存储。读取按 row key ID 选择 active/previous；未知 key ID 失败关闭。解密只返回短生命周期 `SecretStr` context，`finally` 丢弃引用；明确 Python 不能保证内存可靠清零。connection 错误统一 `SOURCE_CREDENTIAL_UNAVAILABLE`，flow 错误统一 `SOURCE_FLOW_UNAVAILABLE`，不区分 key/ciphertext/tag。

Run: `uv --directory apps/skill-registry run pytest tests/test_config.py tests/test_source_crypto.py tests/test_source_logging.py -q`

Expected: PASS，包括 connection/flow cross-copy、wrong AAD/key/nonce/tag、active/previous 读取和未知 key ID。

- [ ] **Step 3: 写 key rotation 与 refresh 竞争失败测试**

覆盖 active/previous 分批轮换、中断续跑、未知 key、并发 refresh claim、rotation 跳过 claimed connection、claim owner 崩溃、未过期 PKCE flow 重加密、used/expired flow verifier 清除和旧 key 退役。

Run: `uv --directory apps/skill-registry run pytest tests/test_source_key_rotation.py -q`

Expected: FAIL，rotation/claim repository 尚不存在。

- [ ] **Step 4: 实现可恢复 key rotation**

轮换流程固定：部署 keyring 加入新 active/保留旧 previous → 运行 `python -m skill_registry.source_key_rotation` 分批锁行、跳过 `refresh_state=refreshing` 的 connection、用旧 key解密并以 connection AAD/新 nonce/CAS credential_version 重加密；同一 runner 还以 flow AAD/新 nonce/CAS flow_version 重加密所有未使用且未过期的 verifier。callback 成功事务和 expiry reaper 都清空 flow verifier ciphertext/nonce/key ID，只保留 hash/actor/session/result 审计元数据。验证旧 key ID 的 connection 行与 live flow 行都为 0 后，下一部署才移除 previous。进程中断可续跑；没有 previous key 时禁止启动重加密。

Run: `uv --directory apps/skill-registry run pytest tests/test_source_crypto.py tests/test_source_key_rotation.py -q`

Expected: PASS；rotation 不会抢占正在刷新凭据的 connection，previous 移除前不存在仍需解密的旧-key flow。

- [ ] **Step 5: 提交 crypto 和 key rotation**

```bash
git add apps/skill-registry/pyproject.toml apps/skill-registry/uv.lock apps/skill-registry/src/skill_registry/config.py apps/skill-registry/src/skill_registry/source_crypto.py apps/skill-registry/src/skill_registry/source_connection_repository.py apps/skill-registry/src/skill_registry/source_key_rotation.py apps/skill-registry/src/skill_registry/source_logging.py apps/skill-registry/tests/test_config.py apps/skill-registry/tests/test_source_crypto.py apps/skill-registry/tests/test_source_key_rotation.py apps/skill-registry/tests/test_source_logging.py
git commit -m "feat(skills): encrypt and rotate source credentials"
```

- [ ] **Step 6: 写 connection service 和 refresh single-flight 失败测试**

支持：GitHub App installation metadata；GitLab.com OAuth start/callback 或 `read_api` project access token；部署允许列表内自建 GitLab 的 `read_api` token；GitCode Authorization Bearer/PRIVATE-TOKEN PAT。GitCode OAuth 和 GitLab deploy token 固定拒绝。

OAuth/App start 生成 256-bit state并绑定 actor、workforce session hash、开始时 `password+mfa assuredAt<=600s`、provider、精确 redirect URI、10 分钟 expiry。GitLab 同时生成 PKCE verifier 和 `S256` challenge；verifier 只用 flow envelope 存储，callback token exchange 必须提交同一 verifier。GitHub callback 验证 session/state 后只接收 installation ID。GitLab callback 首次消费 state，通过注入的 `OAuthTokenExchanger` Protocol 交换 code 并加密 refresh/access token，Task 5 再接真实实现；事务同时保存 result connection ID 并清空 verifier envelope。相同 actor/session/state 的响应丢失重试返回该结果且不再次交换 code，其他 replay 失败。GitHub installation token 永不入库。手工 Token 仅存密文和末四位。

refresh 测试用计数 fake exchanger 证明同一 connection 的两个 worker 只能有一个获得 DB claim 且 Provider refresh 只调用一次。claim 事务先把 `refresh_state=refreshing`、随机 claim token、started_at 和 60 秒 lease 持久化，再允许外部请求；成功后只有 claim owner 能以 credential_version CAS 写新 token 并清 claim。进程在 claim 后任一点崩溃，lease 到期都转 `reauthorization_required`，绝不再次提交可能已失效的旧 refresh token，需管理员重连。

Run: `uv --directory apps/skill-registry run pytest tests/test_source_connection_repository.py tests/test_source_connection_service.py -q`

Expected: FAIL，repository/service 尚不存在。

- [ ] **Step 7: 实现 connection transaction、single-flight refresh 和吊销**

create/callback/revoke 与 event/command receipt 在同一事务；同外部 account+host 只能有一个 active connection。manual create/revoke 接收 idempotency key，same key+fingerprint 返回原结果，same key+different fingerprint 返回 409。OAuth access token 只能由上述 DB single-flight owner 刷新；key rotation 跳过 claim，成功 token rotation 与 claim 清理同事务。只有尚未发出 HTTP request 的本地失败可清 claim 回 idle；请求一旦发出，任何 timeout/断流/非成功响应或进程崩溃都视为 refresh token 状态不确定并进入 reauthorization required，绝不自动重放。吊销后任何新 job 拒绝，历史 revision 不变。OAuth code、state 原文、Token、GitHub JWT/installation token 不写数据库、审计或日志。

Run: `uv --directory apps/skill-registry run pytest tests/test_source_connection_repository.py tests/test_source_connection_service.py -q`

Expected: PASS；并发 callback 只有一个写入/一次 token exchange，同绑定的响应丢失重试返回原 connection，其他过期/replay state 失败；并发 refresh 的 Provider 调用次数恰为 1；claim owner 崩溃后进入 reauthorization required。

- [ ] **Step 8: 提交 connection flow**

```bash
git add apps/skill-registry/src/skill_registry/source_connection_repository.py apps/skill-registry/src/skill_registry/source_connection_service.py apps/skill-registry/tests/test_source_connection_repository.py apps/skill-registry/tests/test_source_connection_service.py
git commit -m "feat(skills): add provider connection flows"
```

### Task 3: 建立 Provider adapter、固定 URL 和有界 HTTP transport

**Files:**
- Modify: `apps/skill-registry/pyproject.toml`
- Modify: `apps/skill-registry/uv.lock`
- Modify: `apps/skill-registry/src/skill_registry/config.py`
- Create: `apps/skill-registry/src/skill_registry/providers/__init__.py`
- Create: `apps/skill-registry/src/skill_registry/providers/types.py`
- Create: `apps/skill-registry/src/skill_registry/providers/url_policy.py`
- Create: `apps/skill-registry/src/skill_registry/providers/transport.py`
- Create: `apps/skill-registry/src/skill_registry/providers/package.py`
- Create: `apps/skill-registry/tests/providers/test_url_policy.py`
- Create: `apps/skill-registry/tests/providers/test_transport.py`
- Create: `apps/skill-registry/tests/providers/test_package.py`
- Modify: `apps/skill-registry/tests/test_config.py`

- [ ] **Step 1: 写 URL/SSRF/响应限制负向测试**

拒绝用户 URL、HTTP、userinfo、fragment、非 443 port、Unicode/punycode 混淆、尾点、IP literal、localhost、`.local`、私网/loopback/link-local/multicast/reserved DNS 结果、DNS 多答案含任一禁用 IP、自动 redirect、压缩/响应超限和非预期 media type。

Run: `uv --directory apps/skill-registry run pytest tests/providers/test_url_policy.py tests/providers/test_transport.py -q`

Expected: FAIL，provider core 尚不存在。

- [ ] **Step 2: 实现窄 Provider 协议和 transport**

```python
class SkillSourceProvider(Protocol):
    async def resolve_repository(self, request: RepositoryRequest) -> RepositoryIdentity: ...
    async def resolve_stored_repository(self, source: StoredSource) -> RepositoryIdentity: ...
    async def resolve_ref(self, repository: RepositoryIdentity, ref: str) -> CommitIdentity: ...
    async def fetch_skill(self, repository: RepositoryIdentity, commit: CommitIdentity, path: SkillPath) -> ProviderPackage: ...
    async def check_ref(self, source: StoredSource) -> CommitIdentity: ...
```

`resolve_stored_repository()` 优先使用 Provider 支持的 stable-ID endpoint 刷新 canonical coordinates；Provider 无此能力时按当前坐标解析，坐标失效返回稳定错误，并允许管理员通过新的分字段 import 请求证明新坐标仍是同一 stable ID 后受控更新。

新增并锁定 `httpx==0.28.1`。config 严格解析私有 HTTP proxy origin、root-owned CA path，以及必填 `SKILL_GIT_ALLOWED_HOSTS_FILE`；该 JSON 以 provider 分组列出 exact hostname，由 Task 13 同一份只读挂载同时提供给 Registry URL policy 和 egress proxy，禁止再用环境变量或后台配置维护第二份 host 列表。transport `trust_env=False`，只使用必填 `SKILL_GIT_HTTPS_PROXY=http://git-egress-proxy:3128`；URL 只能由 adapter 的 typed builder 生成。禁止自动 redirect；默认零 redirect。JSON 1 MiB、archive 5 MiB、单 raw file 2 MiB、累计 raw 20 MiB、固定 connect/read/total timeout；stream 超限立即关闭。

- [ ] **Step 3: 写 Provider package 归一化失败测试**

用精确 archive fixture 覆盖固定顶层目录、目标 Skill path、多个 Skill 根、submodule/LFS pointer、special file、点段、深度和大小边界。

Run: `uv --directory apps/skill-registry run pytest tests/providers/test_package.py -q`

Expected: FAIL，package selector 尚不存在。

- [ ] **Step 4: 实现 Provider archive 归一化**

严格识别 Provider 固定顶层目录，选取精确 Skill path 后构造内存 ZIP，再调用 Plan A canonicalizer；拒绝 path 为空/绝对/点段/超过 8 层、选中多个 Skill 根、submodule/LFS pointer、special file 和 path 外逃。不得把未选目录写临时磁盘。

Run: `uv --directory apps/skill-registry run pytest tests/providers/test_url_policy.py tests/providers/test_transport.py tests/providers/test_package.py -q`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/skill-registry/pyproject.toml apps/skill-registry/uv.lock apps/skill-registry/src/skill_registry/config.py apps/skill-registry/src/skill_registry/providers apps/skill-registry/tests/providers apps/skill-registry/tests/test_config.py
git commit -m "feat(skills): add bounded provider transport"
```

## Chunk 2: 三个 Provider adapter 与 durable worker

### Task 4: 实现 GitHub App/public archive adapter

**Files:**
- Modify: `apps/skill-registry/pyproject.toml`
- Modify: `apps/skill-registry/uv.lock`
- Create: `apps/skill-registry/src/skill_registry/providers/github.py`
- Create: `apps/skill-registry/tests/providers/test_github.py`
- Create: `apps/skill-registry/tests/fixtures/providers/github/repository.json`
- Create: `apps/skill-registry/tests/fixtures/providers/github/commit.json`
- Create: `apps/skill-registry/tests/fixtures/providers/github/installation-token.json`
- Create: `apps/skill-registry/tests/fixtures/providers/github/skill.zip`

- [ ] **Step 1: 写官方响应形状和 redirect 失败测试**

固定 `api.github.com`、`Accept: application/vnd.github+json`、`X-GitHub-Api-Version: 2026-03-10` 和平台 User-Agent：repository metadata 得到 stable numeric ID，stored source 可经 `GET /repositories/{id}` 刷新 canonical owner/repo；`GET /repos/{owner}/{repo}/commits/{ref}` 得到 full SHA；`GET /repos/{owner}/{repo}/zipball/{sha}` 必须恰好返回一次 302。Location 只允许 `https://codeload.github.com/{owner}/{repo}/legacy.zip/{fullSha}` 或 `/zip/{fullSha}`，owner/repo/SHA 必须与已验证请求逐 segment 相等、443、无 userinfo/fragment；第二跳绝不转发 Authorization。其他 status/host/path/多跳全部失败。

Run: `uv --directory apps/skill-registry run pytest tests/providers/test_github.py -q`

Expected: FAIL，GitHub adapter 尚不存在。

- [ ] **Step 2: 实现 public 与 GitHub App 认证**

新增并锁定 `PyJWT[crypto]==2.13.0`。公开 repo 无 header。私有 repo 使用部署 private key 生成最多 10 分钟 App JWT，再 POST installation access token，请求显式限定 `repository_ids=[stableRepositoryId]` 和只读 `permissions={contents:"read",metadata:"read"}`，响应也必须验证目标 repo/权限；token 只在 API first hop 的 `Authorization: Bearer` 中存在、最多 1 小时、内存使用后丢弃。临时 codeload URL 可带 Provider 签名 query，但完整 Location 不记录、不审计、不持久化。

- [ ] **Step 3: 实现固定 commit 下载并跑绿灯**

adapter 重新确认 metadata stable ID 与 connection installation 可访问 repo，archive 使用 full commit SHA，不用 branch zipball。复用 Task 3 package selector 和 Plan A 限额。

Run: `uv --directory apps/skill-registry run pytest tests/providers/test_github.py tests/providers/test_package.py -q`

Expected: PASS；日志捕获中没有 JWT、installation token、signed Location。

- [ ] **Step 4: 提交**

```bash
git add apps/skill-registry/pyproject.toml apps/skill-registry/uv.lock apps/skill-registry/src/skill_registry/providers/github.py apps/skill-registry/tests/providers/test_github.py apps/skill-registry/tests/fixtures/providers/github
git commit -m "feat(skills): import fixed github revisions"
```

### Task 5: 实现 GitLab.com 与受控自建 GitLab adapter

**Files:**
- Create: `apps/skill-registry/src/skill_registry/providers/gitlab.py`
- Modify: `apps/skill-registry/src/skill_registry/source_connection_service.py`
- Create: `apps/skill-registry/tests/providers/test_gitlab.py`
- Modify: `apps/skill-registry/tests/test_source_connection_service.py`
- Create: `apps/skill-registry/tests/fixtures/providers/gitlab/project.json`
- Create: `apps/skill-registry/tests/fixtures/providers/gitlab/commit.json`
- Create: `apps/skill-registry/tests/fixtures/providers/gitlab/oauth-token.json`
- Create: `apps/skill-registry/tests/fixtures/providers/gitlab/skill.zip`

- [ ] **Step 1: 写 GitLab URL、scope 和 archive 测试**

GitLab.com 固定 `gitlab.com/api/v4`；自建 host 必须在 `SKILL_GIT_ALLOWED_HOSTS_FILE` 的 `gitlab` 分组，只允许 `https://{host}/api/v4`，不可由后台动态放行。project metadata 固化 numeric ID，stored source 可经 `/projects/{numericId}` 刷新 canonical path；commit endpoint 把 ref 解析 full SHA；archive 固定 `repository/archive.zip?sha=<full>&path=<encoded>&include_lfs_blobs=false`。

Run: `uv --directory apps/skill-registry run pytest tests/providers/test_gitlab.py -q`

Expected: FAIL，GitLab adapter 尚不存在。

- [ ] **Step 2: 实现只读 API 凭据和 self-managed 限制**

公开 project 匿名；私有仅接受 OAuth/project token 的 `read_api` 或支持 Code Download 的 fine-grained permission，经 `Authorization: Bearer` 或 `PRIVATE-TOKEN` header 使用。明确拒绝 deploy token、只含 Git clone 能力的 token 和任意 Basic URL credential。自建 CA 只能由部署级 root-owned CA bundle 配置。

实现 Task 2 的 GitLab.com `OAuthTokenExchanger`：authorization/token endpoints 固定，不接受 discovery URL；client secret、code、refresh token 只放 form body，不进 URL/日志；要求返回 scope 至少含 `read_api`，否则不创建 connection。到期前 60 秒刷新必须先走 Task 2 的数据库 single-flight claim，再以 credential version CAS 提交；禁止 adapter 自行 refresh。自建 GitLab 一期只支持手工 read_api token，不动态注册 OAuth client。

- [ ] **Step 3: 实现 archive 下载并跑绿灯**

默认不接受跨 host redirect；同 host canonical redirect 最多一次且重新走 URL policy，Authorization 只在同 origin保留。429 解析 bounded `Retry-After`，映射 retryable `SOURCE_RATE_LIMITED`。

Run: `uv --directory apps/skill-registry run pytest tests/providers/test_gitlab.py tests/providers/test_package.py -q`

Expected: PASS；ref/path/query 编码严格匹配 fixture，Token 不出 URL。

- [ ] **Step 4: 提交**

```bash
git add apps/skill-registry/src/skill_registry/providers/gitlab.py apps/skill-registry/src/skill_registry/source_connection_service.py apps/skill-registry/tests/providers/test_gitlab.py apps/skill-registry/tests/test_source_connection_service.py apps/skill-registry/tests/fixtures/providers/gitlab
git commit -m "feat(skills): import fixed gitlab revisions"
```

### Task 6: 实现 GitCode tree/raw-file adapter

**Files:**
- Create: `apps/skill-registry/src/skill_registry/providers/gitcode.py`
- Create: `apps/skill-registry/tests/providers/test_gitcode.py`
- Create: `apps/skill-registry/tests/fixtures/providers/gitcode/repository.json`
- Create: `apps/skill-registry/tests/fixtures/providers/gitcode/commit.json`
- Create: `apps/skill-registry/tests/fixtures/providers/gitcode/tree-page-1.json`
- Create: `apps/skill-registry/tests/fixtures/providers/gitcode/tree-page-2.json`
- Create: `apps/skill-registry/tests/fixtures/providers/gitcode/SKILL.md`
- Create: `apps/skill-registry/tests/fixtures/providers/gitcode/run.py`

- [ ] **Step 1: 写 GitCode commit/tree/raw 合同测试**

固定 `https://api.gitcode.com/api/v5`；metadata 保存 stable repo ID；一期 ref 只接受 branch 或 full commit SHA，`GET /repos/{owner}/{repo}/commits/{ref}` 返回 full SHA；tree 使用该 SHA，最多 3 页、每页 100、总 entry 256、file 128；每个 raw 请求继续使用 full SHA。

Run: `uv --directory apps/skill-registry run pytest tests/providers/test_gitcode.py -q`

Expected: FAIL，GitCode adapter 尚不存在。

- [ ] **Step 2: 实现 header-only PAT 和有界文件抓取**

公开仓库匿名能力以真实 200 为准；私有 PAT 只放 `Authorization: Bearer` 或 `PRIVATE-TOKEN` header，禁止文档同时支持的 `access_token` query。递归 tree 必须证明结果未 truncated；只下载 Skill path 内普通 blob，按 deterministic path 顺序，单文件/累计限额由 Task 3 transport执行。

- [ ] **Step 3: 归一化并跑绿灯**

raw 内容组装为 ProviderPackage 后复用 canonicalizer/scanner；404/401/403/429/5xx 映射稳定错误，响应正文不透传。

Run: `uv --directory apps/skill-registry run pytest tests/providers/test_gitcode.py tests/providers/test_package.py -q`

Expected: PASS；测试断言 URL/query 永远没有 token，分页缺页/重复 path/类型异常均失败。

- [ ] **Step 4: 提交**

```bash
git add apps/skill-registry/src/skill_registry/providers/gitcode.py apps/skill-registry/tests/providers/test_gitcode.py apps/skill-registry/tests/fixtures/providers/gitcode
git commit -m "feat(skills): import fixed gitcode revisions"
```

### Task 7: 实现可恢复 import job worker 和检查更新

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/artifact_store.py`
- Modify: `apps/skill-registry/src/skill_registry/repository.py`
- Modify: `apps/skill-registry/src/skill_registry/service.py`
- Create: `apps/skill-registry/src/skill_registry/import_repository.py`
- Create: `apps/skill-registry/src/skill_registry/import_service.py`
- Create: `apps/skill-registry/src/skill_registry/import_worker.py`
- Modify: `apps/skill-registry/src/skill_registry/app.py`
- Modify: `apps/skill-registry/tests/test_artifact_store.py`
- Modify: `apps/skill-registry/tests/test_repository.py`
- Modify: `apps/skill-registry/tests/test_service.py`
- Create: `apps/skill-registry/tests/test_import_repository.py`
- Create: `apps/skill-registry/tests/test_import_repository_postgres.py`
- Create: `apps/skill-registry/tests/test_import_service.py`
- Create: `apps/skill-registry/tests/test_import_worker.py`
- Modify: `apps/skill-registry/tests/test_app.py`

- [ ] **Step 1: 写 claim/lease/retry/crash 失败测试**

claim 使用短事务 `FOR UPDATE SKIP LOCKED` 领取 `next_attempt_at<=now()` 的 queued 或 lease 已过期的 running job，设置 worker UUID、60 秒 lease、attempt+1 后立即 commit；网络期间不持有行锁。heartbeat 每 20 秒延长，worker 取消后不伪造 success。用户 cancel 只允许 own queued job；running/succeeded job 固定冲突。失败测试同时覆盖 shared writer 不能内部 commit、finalize 任一点失败全部回滚、相同 artifact 的不同 import 各建 pending revision、同一 succeeded job 恢复幂等、rename/transfer 只有 stable ID 相同才更新坐标，以及 ZIP upload 响应丢失用同一 idempotency key 只创建一个 revision/origin。

Run: `uv --directory apps/skill-registry run pytest tests/test_import_repository.py tests/test_import_service.py tests/test_import_worker.py -q`

Expected: FAIL，repository/service/worker 尚不存在。

- [ ] **Step 2: 实现 durable job 状态机**

retryable 仅为 timeout/连接中断/429/Provider 5xx，最多 3 次，退避 5/30/120 秒并尊重 1–120 秒 Retry-After；auth/not-found/ref/path/schema/scan/size 永不自动重试。connection revoked 后 queued job 失败；running job 每个 Provider 请求前复验 connection active。

- [ ] **Step 3: 抽取 upload/import 共用 transaction writer**

先把 Plan A `service.py` 的 upload 写入抽成接受调用方事务的 shared revision writer；`repository.py` 和 `artifact_store.py` 的写方法必须使用显式传入的同一 psycopg connection，不得内部 commit 或新开连接。v3 upload 额外要求 UUID idempotency key，以 `(actor,"upload",key)` 和 canonical `{targetSkillId,rawArchiveSha256}` fingerprint 查询 `skill_command_receipts`；同 fingerprint 返回原 revision，不同 fingerprint 409。首次 upload 在一个事务内写 revision/files/artifact/findings、唯一 upload origin、event 和 receipt；任一失败全部回滚。import 不复制 SQL。

worker resolve repo/ref/fetch 后，把 lease token、source metadata + canonical package 交给 `finalize_import()`；它在一个事务内锁住仍由当前 worker 持有的 running job，调用 shared writer 写 revision/files/artifact/findings，再写 source/唯一 origin/event 和 job succeeded/result revision。每个新 import job 即使 artifact 与已有 published/rejected/archived revision 相同，也创建独立 `pending_review` revision；只有同一 idempotent job 或 crash 后读取已 succeeded job 才返回原 revision，绝不向旧 revision 追加 origin。

模拟 finalize commit 成功但响应丢失：worker 重新读取 job 已是 succeeded 并返回既有 revision，不重跑 Provider、不造重复版本；若 transaction rollback，job 保持 running 直到 lease 恢复。

- [ ] **Step 4: 实现坐标 refresh 和幂等 `check_ref`，但不导入**

check 读取 source 固化的 `tracked_ref`，请求必须显式提供本次 `connectionId|null` 和 `idempotencyKey`；先按当前坐标 resolve repository。若 owner/repo 已 rename/transfer，adapter 支持 stable-ID lookup 时用该 ID 取得 canonical coordinates；否则管理员可从通用 import 表单提交新 owner/repo，service 解析后命中同一 stable ID。两条路径都只有在 Provider 返回原 stable ID 时，才以 `coordinate_version` CAS 更新 canonical owner/repo 并写 event；origin 中的历史坐标不改。stable ID 不同则 `SOURCE_IDENTITY_MISMATCH`，因此 source 不会因旧坐标失效而永久锁死，也不会被换绑到另一个仓库。

check 只调用 adapter resolve ref 并以 actor+idempotency+fingerprint 写 `skill_source_checks`；相同 fingerprint 返回原结果，不同 fingerprint 返回 409。commit 变化返回 `updateAvailable=true`，不得创建 job/revision/origin。重新导入走 `/internal/sources/{sourceId}/imports`，使用 source identity/tracked ref + 新 connection/idempotency key创建新 job，不能在 check 内隐式执行。

- [ ] **Step 5: 运行 unit/PostgreSQL/app lifecycle 测试**

Run: `uv --directory apps/skill-registry run pytest tests/test_artifact_store.py tests/test_repository.py tests/test_service.py tests/test_import_repository.py tests/test_import_service.py tests/test_import_worker.py tests/test_app.py -q`

Run: `uv --directory apps/skill-registry run pytest tests/test_import_repository_postgres.py -q`

Expected: PASS；两个 worker 不重复领取，shutdown 停止 claim、等待当前 bounded request、释放 lease。缺真实 DSN 的 SKIPPED 不算通过。

- [ ] **Step 6: 提交**

```bash
git add apps/skill-registry/src/skill_registry/artifact_store.py apps/skill-registry/src/skill_registry/repository.py apps/skill-registry/src/skill_registry/service.py apps/skill-registry/src/skill_registry/import_repository.py apps/skill-registry/src/skill_registry/import_service.py apps/skill-registry/src/skill_registry/import_worker.py apps/skill-registry/src/skill_registry/app.py apps/skill-registry/tests/test_artifact_store.py apps/skill-registry/tests/test_repository.py apps/skill-registry/tests/test_service.py apps/skill-registry/tests/test_import_repository.py apps/skill-registry/tests/test_import_repository_postgres.py apps/skill-registry/tests/test_import_service.py apps/skill-registry/tests/test_import_worker.py apps/skill-registry/tests/test_app.py
git commit -m "feat(skills): process durable git imports"
```

## Chunk 3: Registry/Web API、后台与部署

### Task 8: 暴露 connection、import 和 check 私有 API

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/auth.py`
- Modify: `apps/skill-registry/src/skill_registry/types.py`
- Modify: `apps/skill-registry/src/skill_registry/repository.py`
- Modify: `apps/skill-registry/src/skill_registry/service.py`
- Modify: `apps/skill-registry/src/skill_registry/api.py`
- Modify: `apps/skill-registry/tests/test_auth.py`
- Modify: `apps/skill-registry/tests/test_repository.py`
- Modify: `apps/skill-registry/tests/test_service.py`
- Modify: `apps/skill-registry/tests/test_api.py`

- [ ] **Step 1: 写 action/target/pre-body 合同测试**

| Route family | action | target | permission | assurance |
| --- | --- | --- | --- | --- |
| list connections/sources/jobs | `source_list` | provider or `all` | `admin:assistant:skills` | session |
| connection start/token | `source_connection_mutate` | provider path segment | `admin:assistant:skills:connections` | password+mfa ≤600s |
| connection revoke | `source_connection_mutate` | `connection:{connectionId}` | connections | password+mfa ≤600s |
| OAuth callback | `source_connection_callback` | provider path segment | connections | session + bound flow assurance |
| create job | `source_import` | `source:new` | `admin:assistant:skills:upload` | session |
| reimport source | `source_reimport` | source ID | upload | session |
| get own job | `source_job_read` | job ID | upload | session |
| cancel own queued job | `source_job_cancel` | job ID | upload | session |
| check source | `source_check` | source ID | upload | session |

保持 Plan A 的 HMAC domain `ai-agent-platform:skill-registry-assertion:v1`，但把 verifier/signer 改为 action-discriminated exact schema：只有本计划新增的 `source_*` JSON mutation 必须额外含 64-hex `bodySha256`；Plan A upload/review 和 Plan B candidate/rollback assertion 字段完全不变，回归 fixture 必须继续通过。v3 upload multipart 新增必填 UUID `idempotencyKey` 字段，但不把 multipart body digest 塞进 assertion；Registry 流式计算 raw archive SHA-256 并由 service receipt 提供持久幂等。pre-body middleware 只能验证 bearer、action、permission、路由可得 target、actor/session、时间/MFA、nonce 和 digest 字段格式；通过后逐 chunk 读取 bounded raw body，先比较 source JSON 的 SHA-256，再严格解析 schema。这样 source 正文中的 owner/repo/ref/path/connection/idempotency key 全被签名，但不伪称 pre-body 已解析正文。read 使用 5 秒 nonce cache，mutation 使用 DB event nonce。

Run: `uv --directory apps/skill-registry run pytest tests/test_auth.py -q`

Expected: FAIL，动作表尚未加入。

- [ ] **Step 2: 实现认证扩展并写 API 红灯**

Run: `uv --directory apps/skill-registry run pytest tests/test_auth.py tests/test_api.py -q`

Expected: auth PASS、API FAIL，新 routes 尚未实现。

- [ ] **Step 3: 实现私有 API 和严格 response**

新增 `/internal/source-connections/{provider}`、`/oauth/start/{provider}`、`/oauth/callback/{provider}`、`/{id}/revoke`、`/internal/imports`、`/internal/sources/{sourceId}/imports`、`/imports/{jobId}`、`/imports/{jobId}/cancel`、`/sources/{sourceId}/check`。所有 source-specific/connection/provider target 均从 path 取得；通用 create target 固定 `source:new`，正文只由 digest 绑定。manual connection create/revoke/job cancel 请求都含 idempotency key，并经 command receipt 实现 same fingerprint 原结果/different fingerprint 409；OAuth callback 通过绑定 flow 的 result connection 支持同 session 响应丢失重试，但绝不重复 token exchange。

Token body 最大 8 KiB；所有 no-store；connection 只返回 ID/provider/host/account/last4/state，不回显 credential；job error 只返回稳定 code。cancel 只改变 own queued job，running/succeeded 返回 409，但已成功 cancel 的同一 idempotent retry 返回原结果。check body 固定 `{connectionId,idempotencyKey}`，ref 只从 source tracked_ref 读取。

现有 upload endpoint 同步要求 multipart `idempotencyKey`，把 raw archive digest、actor 和 target skill 交给 Task 7 receipt；同 key 响应丢失重试返回原 revision。旧客户端缺 key 返回明确 400，不在删除 artifact 唯一约束后静默创建重复 revision。

upload 权限 actor 只能读取自己创建的 job；review/configure actor 可读全部。OAuth callback 必须匹配 start actor/session 和一次性 flow，Web 不能伪造新 actor。

现有 revision detail DTO/查询扩展 `origins[]`；每项显示 source type、provider、导入当时 owner/repo/path/tracked ref/full commit、import actor/time 和由 revision state 派生的 review state。upload backfill 也必须显示 upload actor/time。列表只给摘要，review 权限的 detail 才给完整来源；API 不动态查询远端。

Run: `uv --directory apps/skill-registry run pytest tests/test_auth.py tests/test_repository.py tests/test_service.py tests/test_api.py -q`

Expected: PASS，包括 stale MFA、state replay、revoked connection、越权 job read 和日志泄漏负例。

- [ ] **Step 4: 提交**

```bash
git add apps/skill-registry/src/skill_registry/auth.py apps/skill-registry/src/skill_registry/types.py apps/skill-registry/src/skill_registry/repository.py apps/skill-registry/src/skill_registry/service.py apps/skill-registry/src/skill_registry/api.py apps/skill-registry/tests/test_auth.py apps/skill-registry/tests/test_repository.py apps/skill-registry/tests/test_service.py apps/skill-registry/tests/test_api.py
git commit -m "feat(skills): expose protected git import APIs"
```

### Task 9: 建立 Web source 合同、Registry 客户端和审计

**Files:**
- Modify: `apps/web/src/features/assistant/admin-skill-contract.ts`
- Modify: `apps/web/src/features/assistant/admin-skill-contract.test.ts`
- Modify: `apps/web/src/server/assistant/skill-registry-client.ts`
- Modify: `apps/web/src/server/assistant/skill-registry-client.test.ts`
- Modify: `apps/web/src/server/auth/audit.ts`
- Modify: `apps/web/src/server/auth/audit.test.ts`

- [ ] **Step 1: 写合同、签名和脱敏失败测试**

固定 provider/auth/connection/source/job/error DTO，限制数组、字符串、owner/repo/ref/path，source response 必须包含 immutable identity 和 `trackedRef`；revision detail 新增有界 `origins[]`，严格包含导入当时坐标、full commit、actor/time 和 derived review state。ZIP upload contract 新增 UUID idempotency key，client 必须原样放入 Registry multipart，响应丢失重试不得生成新 key。拒绝 clone URL、任意 host、unknown field 和 Registry 宽松响应。测试 Registry mutation assertion 的 action/route target/actor/session/nonce/`bodySha256` 与 Task 8 完全一致，body 变化一字节就导致 digest 不同，并用 Plan A upload/review、Plan B candidate/rollback fixtures 证明旧 action 不要求 digest。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/features/assistant/admin-skill-contract.test.ts src/server/assistant/skill-registry-client.test.ts src/server/auth/audit.test.ts`

Expected: FAIL，新 DTO、source action 和审计事件尚未实现。

- [ ] **Step 2: 实现窄客户端和审计词表**

client 对 bounded JSON body 先序列化一次并计算 SHA-256，再以相同 bytes 发给 Registry；禁止从正文派生 action/target。所有 response strict parse、`Cache-Control: no-store`，Provider/Registry 错误正文不透传。audit 新增 connection/import/check requested/completed；metadata 只含 provider、connection/source/job/revision ID、commit prefix、requestId、result/error code，不含 repo 私有路径、Skill path、ref 原文、OAuth code/state、Token/last4。

- [ ] **Step 3: 跑绿灯**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/features/assistant/admin-skill-contract.test.ts src/server/assistant/skill-registry-client.test.ts src/server/auth/audit.test.ts`

Expected: PASS；测试捕获的 header/body/log 不含任何 fixture Secret。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/features/assistant/admin-skill-contract.ts apps/web/src/features/assistant/admin-skill-contract.test.ts apps/web/src/server/assistant/skill-registry-client.ts apps/web/src/server/assistant/skill-registry-client.test.ts apps/web/src/server/auth/audit.ts apps/web/src/server/auth/audit.test.ts
git commit -m "feat(skills): add git source web contracts"
```

### Task 10: 实现 connection/OAuth 命令与 Admin BFF

**Files:**
- Modify: `apps/web/src/server/assistant/admin-skill-commands.ts`
- Modify: `apps/web/src/server/assistant/admin-skill-commands.test.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/skills/uploads/route.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/skills/uploads/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/connections/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/connections/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/connections/oauth/start/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/connections/oauth/start/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/connections/oauth/callback/[provider]/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/connections/oauth/callback/[provider]/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/connections/[connectionId]/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/connections/[connectionId]/route.test.ts`
- Modify: `apps/web/src/instrumentation.ts`
- Modify: `apps/web/src/instrumentation.test.ts`
- Create: `apps/web/src/server/http/redacted-request-error.ts`
- Create: `apps/web/src/server/http/redacted-request-error.test.ts`
- Modify: `infra/nginx/nginx.conf`
- Modify: `packages/database/src/deployment-contracts.test.ts`

- [ ] **Step 1: 写 connection 权限、OAuth cookie 和日志失败测试**

connection start/token/revoke 要 trusted JSON、connections permission 和 recent password+TOTP；manual create/revoke body 含 idempotency key，安全重试依赖 Task 8 receipt，不复用 HMAC nonce；callback 必须有当前 workforce session。start 设置 `__Host-aap-skill-source-state` cookie：Secure、HttpOnly、SameSite=Lax、Path=/、Max-Age=600、无 Domain，并以应用 key 签名加密 `{provider,state,actorId,sessionHash,redirectUri,issuedAt}`；callback 校验 cookie、provider、session、actor 和 Registry flow 后一次性清除。OAuth code/state/Token 不得进入应用日志。

Nginx access format 从 `$request` 改为只记录 `$request_method $uri $server_protocol`，并从所有自定义 access/upstream 格式删除 `$request_uri`、`$args`、`$is_args` 和 `$http_referer`。OAuth callback 精确 location 单独使用安全 access format，并把 Nginx 内建 error log 指向 `/dev/null` 的 `crit` 级 sink，避免 upstream failure 把完整 request line 写入 error log；其他 location 保留现有 error log。

Web 使用 Next.js 16 官方 `instrumentation.ts` 的 `onRequestError` 作为外层错误边界，委托新 `redacted-request-error.ts`；它只记录 method、去 `?/#` 后的 pathname、静态 routePath、error digest 和稳定类别，禁止记录 raw `request.path`、headers/Referer、error message/stack/cause。callback route 内预期错误同样只交给该 redactor，不调用 `console.*` 传原 Error。OAuth callback 响应始终带 `Referrer-Policy: no-referrer`，先清 cookie 再跳转到不含 query 的后台 path。测试把 fixture code/state 同时塞入 query、Referer、Error message/cause，覆盖成功、route throw 和 upstream unavailable，断言 Nginx access/error、`onRequestError` logger 和 redirect 响应均无 Secret。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/instrumentation.test.ts src/server/http/redacted-request-error.test.ts src/server/assistant/admin-skill-commands.test.ts src/app/api/v1/admin/assistant/skills/connections`

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: FAIL，connection routes/cookie 和 query-free access log 尚未实现。

- [ ] **Step 2: 实现 connection 命令和路由**

manual Token body 最大 8 KiB；OAuth code/state/Token 只在当前 request 内并在 `finally` 丢弃引用。命令只调用 Task 9 client，不写数据库、文件或环境，不把 Token 传给 React props。所有响应 no-store；connection 只返回 ID/provider/host/account/last4/state。GitCode 一期只接受 manual PAT，GitLab.com OAuth 使用 PKCE，GitHub 只接收 App installation callback。

- [ ] **Step 3: 跑绿灯**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/instrumentation.test.ts src/server/http/redacted-request-error.test.ts src/server/assistant/admin-skill-commands.test.ts src/app/api/v1/admin/assistant/skills/connections`

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: PASS，包括 cookie 篡改/过期、session 或 actor 不匹配、stale MFA、callback 日志泄漏负例；同 session 的响应丢失 replay 返回原 connection，其他 replay 失败。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/server/assistant/admin-skill-commands.ts apps/web/src/server/assistant/admin-skill-commands.test.ts apps/web/src/app/api/v1/admin/assistant/skills/connections apps/web/src/instrumentation.ts apps/web/src/instrumentation.test.ts apps/web/src/server/http/redacted-request-error.ts apps/web/src/server/http/redacted-request-error.test.ts infra/nginx/nginx.conf packages/database/src/deployment-contracts.test.ts
git commit -m "feat(skills): add provider connection BFF"
```

### Task 11: 实现 import/check/cancel 命令与 Admin BFF

**Files:**
- Modify: `apps/web/src/server/assistant/admin-skill-commands.ts`
- Modify: `apps/web/src/server/assistant/admin-skill-commands.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/imports/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/imports/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/imports/[jobId]/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/imports/[jobId]/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/imports/[jobId]/cancel/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/imports/[jobId]/cancel/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/sources/[sourceId]/imports/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/sources/[sourceId]/imports/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/sources/[sourceId]/check/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/sources/[sourceId]/check/route.test.ts`

- [ ] **Step 1: 写 import/check/job 权限失败测试**

ZIP upload BFF 要求浏览器提交 UUID idempotency key，验证后原样转发，自己不得在每次 HTTP request 重生 key；同一用户动作的 timeout/响应丢失重试由 UploadDialog 复用 key，新的上传动作才生成新 key。imports POST 固定 `{provider,connectionId?,owner,repo,ref,path,idempotencyKey}`；source reimport 使用 path `/sources/{sourceId}/imports`，body 固定 `{connectionId?,idempotencyKey}`，ref/path 只从 source 的 `tracked_ref`/identity 读取；check 固定 `{connectionId,idempotencyKey}`；cancel 固定 `{idempotencyKey}`。import/check 要 upload permission；actor 只能读/取消自己创建的 queued job，review/configure 可读全部；running/succeeded cancel 返回 409。轮询 GET 不自动重放 mutation，新的 reimport 用户动作生成新 key，响应丢失的同一次动作保留原 key重试。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/assistant/admin-skill-commands.test.ts src/app/api/v1/admin/assistant/skills/uploads/route.test.ts src/app/api/v1/admin/assistant/skills/imports src/app/api/v1/admin/assistant/skills/sources`

Expected: FAIL，import/source routes 尚未实现。

- [ ] **Step 2: 实现导入命令和路由**

严格绑定 Task 8 的 route-derived target 与 body digest；check 只返回 remote commit 是否变化，不创建 revision；成功 import 只展示 `pending_review`，不发布或激活。所有响应 no-store，错误只暴露稳定 code。

- [ ] **Step 3: 跑绿灯**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/server/assistant/admin-skill-commands.test.ts src/app/api/v1/admin/assistant/skills/uploads/route.test.ts src/app/api/v1/admin/assistant/skills/imports src/app/api/v1/admin/assistant/skills/sources`

Expected: PASS，包括 body 篡改、重复 idempotency、越权 job read/cancel、revoked connection 和日志泄漏负例。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/server/assistant/admin-skill-commands.ts apps/web/src/server/assistant/admin-skill-commands.test.ts apps/web/src/app/api/v1/admin/assistant/skills/uploads/route.ts apps/web/src/app/api/v1/admin/assistant/skills/uploads/route.test.ts apps/web/src/app/api/v1/admin/assistant/skills/imports apps/web/src/app/api/v1/admin/assistant/skills/sources
git commit -m "feat(skills): add git import BFF"
```

### Task 12: 在 Skill 库加入连接、导入和更新 UI

**Files:**
- Create: `apps/web/src/components/admin/assistant-skill-connection-dialog.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-connection-dialog.test.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-import-dialog.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-import-dialog.test.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-import-jobs.tsx`
- Create: `apps/web/src/components/admin/assistant-skill-import-jobs.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-upload-dialog.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-upload-dialog.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-revision-detail.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-revision-detail.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-registry-panel.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-registry-panel.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-capability-roadmap.tsx`
- Modify: `apps/web/src/components/admin/assistant-capability-roadmap.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.css`

- [ ] **Step 1: 写 UI 行为和泄漏失败测试**

测试 provider/公开或 connection 选择、分字段 owner/repo/ref/path、禁止 URL；连接权限隐藏凭据动作；Token field 不回填/不进入 DOM snapshot；job queued/running/succeeded/failed/cancelled，只有 queued 显示取消；成功只显示 pending_review；检查更新不自动导入；reimport 明确确认；连接吊销不影响历史 revision。UploadDialog 在一次选择+提交动作开始时生成 UUID idempotency key，timeout/响应丢失后的“重试”复用，成功/明确失败/选择新文件后才清除并为新动作生成 key。RevisionDetail 对 review 用户展示全部 origin：Provider、导入时 owner/repo/path/tracked ref/full commit、导入人/时间和 revision 审核状态；普通 read 用户不能展开这些私有坐标。相同 artifact 的两个来源显示为两个独立待审 revision，不能把新来源伪装为已发布。

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/admin/assistant-skill-connection-dialog.test.tsx src/components/admin/assistant-skill-import-dialog.test.tsx src/components/admin/assistant-skill-import-jobs.test.tsx src/components/admin/assistant-skill-upload-dialog.test.tsx src/components/admin/assistant-skill-revision-detail.test.tsx src/components/admin/assistant-skill-registry-panel.test.tsx`

Expected: FAIL，新 UI 尚不存在。

- [ ] **Step 2: 实现拆分组件和可访问性**

ConnectionDialog 只处理 OAuth/manual token；ImportDialog 只处理 source fields；ImportJobs 只轮询可见 job。关闭/提交后重置敏感 input；状态不仅靠颜色；MFA/OAuth 弹窗 focus 可回收；错误不展示 Provider response body。

- [ ] **Step 3: 跑 UI 绿灯**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/admin/assistant-skill-connection-dialog.test.tsx src/components/admin/assistant-skill-import-dialog.test.tsx src/components/admin/assistant-skill-import-jobs.test.tsx src/components/admin/assistant-skill-upload-dialog.test.tsx src/components/admin/assistant-skill-revision-detail.test.tsx src/components/admin/assistant-skill-registry-panel.test.tsx src/components/admin/assistant-capability-roadmap.test.tsx`

Expected: PASS；roadmap 显示“ZIP + 三方 Git 导入已接入”，不写 Marketplace。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/admin/assistant-skill-connection-dialog.tsx apps/web/src/components/admin/assistant-skill-connection-dialog.test.tsx apps/web/src/components/admin/assistant-skill-import-dialog.tsx apps/web/src/components/admin/assistant-skill-import-dialog.test.tsx apps/web/src/components/admin/assistant-skill-import-jobs.tsx apps/web/src/components/admin/assistant-skill-import-jobs.test.tsx apps/web/src/components/admin/assistant-skill-upload-dialog.tsx apps/web/src/components/admin/assistant-skill-upload-dialog.test.tsx apps/web/src/components/admin/assistant-skill-revision-detail.tsx apps/web/src/components/admin/assistant-skill-revision-detail.test.tsx apps/web/src/components/admin/assistant-skill-registry-panel.tsx apps/web/src/components/admin/assistant-skill-registry-panel.test.tsx apps/web/src/components/admin/assistant-capability-roadmap.tsx apps/web/src/components/admin/assistant-capability-roadmap.test.tsx apps/web/src/components/admin/assistant-admin-page.css
git commit -m "feat(skills): add git import administration UI"
```

### Task 13: 部署专用 Git egress proxy 和 Secret 边界

**Files:**
- Create: `infra/git-egress-proxy/Dockerfile`
- Create: `infra/git-egress-proxy/squid.conf`
- Create: `infra/git-egress-proxy/entrypoint.sh`
- Create: `infra/git-egress-proxy/allowed-hosts.json`
- Modify: `apps/skill-registry/Dockerfile`
- Modify: `compose.yaml`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Create: `docs/testing/compose.skill-git-egress-acceptance.yaml`
- Create: `docs/testing/run-skill-git-egress-acceptance.sh`

- [ ] **Step 1: 写网络/Secret/proxy 合同失败测试**

Registry 只连接 internal `backend + git_fetch`；proxy 连接 internal `git_fetch + git_egress`；只有 proxy 有外网网络。Web/Agent 不连接 git_fetch/git_egress。root-owned `allowed-hosts.json` 固定包含按 provider 分组的 `api.github.com`、`codeload.github.com`、`gitlab.com`、`api.gitcode.com`，自建 GitLab 只能经部署变更追加；同一文件只读挂载到 Registry 的 `SKILL_GIT_ALLOWED_HOSTS_FILE` 和 proxy，禁止两边各维护一份。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: FAIL，proxy/network/Secrets 尚不存在。

- [ ] **Step 2: 实现 Squid allowlist 和 DNS/IP 拒绝**

entrypoint 严格解析同一 `allowed-hosts.json` 并生成 Squid ACL；只允许 CONNECT 443 和 exact dstdomain；先拒绝解析到 loopback/private/link-local/multicast/reserved IP，再允许 host；禁用缓存、请求/响应正文日志和 query 日志，日志仅保留脱敏 host/status/bytes。proxy 非 root、read-only、cap drop、no-new-privileges、tmpfs cache/run、资源/PID 限制，无宿主端口。文件不存在、权限过宽、格式错误、重复或未知 provider 时 Registry 与 proxy 都失败关闭。

- [ ] **Step 3: 注入 Registry 专属 Secret**

只有 Registry 挂载 source encryption key、GitHub private key、GitLab OAuth secret/自建 CA；Web/Agent/proxy 均不挂载。Registry 使用 proxy URL，不能通过 `HTTP_PROXY/HTTPS_PROXY` 环境继承；worker 健康不因 Provider 互联网暂时失败而影响 Registry read API readiness。

- [ ] **Step 4: 跑 Docker egress acceptance**

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Run: `sh docs/testing/run-skill-git-egress-acceptance.sh`

Expected: PASS；Registry direct HTTPS、HTTP、未允许 host、IP literal、private DNS 和恶意 redirect 全被拒绝；允许 host 只能经 proxy；测试后零临时容器/网络/卷。

- [ ] **Step 5: 提交**

```bash
git add infra/git-egress-proxy apps/skill-registry/Dockerfile compose.yaml .env.example .gitignore .dockerignore packages/database/src/deployment-contracts.test.ts docs/testing/compose.skill-git-egress-acceptance.yaml docs/testing/run-skill-git-egress-acceptance.sh
git commit -m "feat(skills): isolate git provider egress"
```

## Chunk 4: E2E、恢复和交付

### Task 14: 建立离线 Provider contract 纵向 E2E

**Files:**
- Modify: `apps/skill-registry/Dockerfile`
- Create: `apps/web/e2e/admin-skill-git-import.spec.ts`
- Create: `apps/skill-registry/tests/e2e_app.py`
- Create: `docs/testing/fixtures/provider-contract-server.py`
- Create: `docs/testing/compose.skill-git-import-e2e.yaml`
- Create: `docs/testing/run-skill-git-import-e2e.sh`

- [ ] **Step 1: 写纵向 E2E 红灯**

每个 Provider：公开导入→job succeeded→pending_review→创建者自审失败→另一管理员 MFA 发布；ZIP upload/import/check/manual connection/revoke/cancel 的相同 idempotency key 不重复且不同 fingerprint 返回 409，模拟 ZIP commit 成功但响应丢失只得到一个 revision/upload origin；commit change 只显示 update；显式 reimport 生成新 pending revision；两个来源产生相同 artifact 仍是两个独立待审 revision 和各自 origin。Token connection 验证密文 at rest、吊销后新 job 失败、历史 revision 可审阅。全过程不激活 Agent。

Run: `sh docs/testing/run-skill-git-import-e2e.sh`

Expected: FAIL，专用 fixture app/Compose 尚不存在。

- [ ] **Step 2: 实现仅测试 Provider contract server 和镜像 target**

fixture 按官方响应形状精确模拟 GitHub 302+固定第二跳、GitLab sha+path archive、GitCode commit+分页 tree+raw，以及 401/404/429/5xx/断流。Registry Dockerfile 新增显式 acceptance target，只有该 target 复制 `tests/e2e_app.py`；生产 target 不复制 tests/server，生产 app/config 无 fixture transport 切换开关。

`compose.skill-git-import-e2e.yaml` 使用独立 project/network/volume，并由 acceptance target 启动 fixture transport；fixture server 启动时同时验证 test-only image label、project name 和显式 test mode。测试不得改写生产 allowlist，也不得访问公网。

- [ ] **Step 3: 跑绿灯并验证零泄漏/零残留**

Run: `sh docs/testing/run-skill-git-import-e2e.sh`

Expected: `Skill Git Import E2E passed`；日志与数据库 dump 不含 fixture Token/OAuth code/JWT；trap 后无临时容器、网络或卷。

- [ ] **Step 4: 提交**

```bash
git add apps/skill-registry/Dockerfile apps/web/e2e/admin-skill-git-import.spec.ts apps/skill-registry/tests/e2e_app.py docs/testing/fixtures/provider-contract-server.py docs/testing/compose.skill-git-import-e2e.yaml docs/testing/run-skill-git-import-e2e.sh
git commit -m "test(skills): add offline provider import E2E"
```

### Task 15: 把 Git 导入门禁接入 CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `packages/database/src/deployment-contracts.test.ts`

- [ ] **Step 1: 写 CI 合同红灯**

合同要求 CI 运行 schema v3/真实角色测试、crypto、三个 adapter 精确 fixture、worker crash/retry、Web BFF、proxy build/deny acceptance 和 Task 14 离线 E2E；真实 PostgreSQL tests 不允许 skip。CI 不调用真实 Provider，不接收生产 Token。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: FAIL，workflow 尚未覆盖完整门禁。

- [ ] **Step 2: 增加脚本和 workflow job**

package script 只包装已提交 runner；workflow 使用隔离 Compose project，给 proxy acceptance 与 E2E 设置超时，失败和成功都执行清理。CI fixture Secret 固定为无生产价值的测试值，并对日志做泄漏断言。

- [ ] **Step 3: 跑合同绿灯**

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: PASS；合同能在删除任一 gate、允许 PostgreSQL skip 或引用 live Provider 时失败。

- [ ] **Step 4: 提交**

```bash
git add .github/workflows/ci.yml package.json packages/database/src/deployment-contracts.test.ts
git commit -m "ci(skills): gate git provider imports"
```

### Task 16: 扩展备份恢复到来源、job 和加密 connection

**Files:**
- Modify: `infra/docker/restore-drill.sh`
- Modify: `infra/docker/README.md`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Create: `docs/testing/run-skill-source-backup-restore.sh`

- [ ] **Step 1: 写恢复合同和 keyring 生命周期失败测试**

恢复后验证 connection/未过期 flow/source/job/check/command receipt/`skill_revision_origins` 行数、FK、`encryption_key_id`、`flow_encryption_key_id` 与独立 credential/flow version 完整保留。数据库备份包含密文/nonce/key ID 但绝不包含 keyring；缺 keyring 或错误 key 时密文仍在但统一解密失败。恢复 active+previous keyring 后旧行可解密并能创建新离线 fixture job。任何输出不得打印密文、nonce、last4、PKCE verifier 或 Token。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: FAIL，restore drill 尚未覆盖 v3。

- [ ] **Step 2: 实现隔离恢复、重加密和旧 key 退役验证**

Run: `sh docs/testing/run-skill-source-backup-restore.sh`

Expected: `Skill source backup/restore passed`；缺失/错误 key 固定失败，active+previous keyring 恢复后可读；运行 Task 2 的 resumable rotation 后所有 credential 和 live flow 转为 active key、credential/flow version 单调增加，used/expired verifier 已清除，再移除 previous 仍可解密。历史 published/active revision 不依赖远端仓库仍可用；trap 后零残留。

- [ ] **Step 3: 提交**

```bash
git add infra/docker/restore-drill.sh infra/docker/README.md packages/database/src/deployment-contracts.test.ts docs/testing/run-skill-source-backup-restore.sh
git commit -m "test(skills): restore encrypted git sources"
```

### Task 17: 完成 live smoke 指南、风险文档和全量回归

**Files:**
- Create: `docs/testing/skill-provider-live-smoke.md`
- Create: `docs/testing/run-skill-provider-live-smoke.sh`
- Modify: `docs/testing/README.md`
- Modify: `apps/agent/src/agent_service/skills/README.md`

- [ ] **Step 1: 写人工 live smoke 和运维边界**

runner 接受部署级 owner/repo/ref/path 和 connection ID，不接受 Token 参数；Token 必须已在后台连接。分别验证一个受控私有 GitHub/GitLab/GitCode fixture repo，并记录 commit/revision digest，不纳入普通 CI。GitCode 必须真实证明 PAT 只通过 Authorization/PRIVATE-TOKEN header 即可完成 commit/tree/raw；公开库 smoke 不能替代。文档明确 Provider API/权限可能变化，升级前需重跑。

- [ ] **Step 2: 跑完整门禁**

```bash
uv --directory packages/skill-core run pytest -q
uv --directory packages/skill-core run ruff check .
uv --directory packages/skill-core run mypy src tests
uv --directory apps/skill-registry run pytest -q -rs
uv --directory apps/skill-registry run ruff check .
uv --directory apps/skill-registry run mypy src tests
uv --directory apps/agent run pytest -q -rs
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
sh docs/testing/run-skill-git-egress-acceptance.sh
sh docs/testing/run-skill-git-import-e2e.sh
sh docs/testing/run-skill-source-backup-restore.sh
```

Expected: 全部 PASS；PostgreSQL integration 无 skip；ZIP 上传、审核、运行时加载、模型动态控制和会话无回归。

- [ ] **Step 3: 在部署验收环境跑 live smoke**

Precondition: 三个受控 fixture repo 和后台 connection 已配置。

Run: `sh docs/testing/run-skill-provider-live-smoke.sh`

Expected: 三个私有 Provider 都返回固定 commit 和 pending_review revision；若 GitCode header-only 私库接口不兼容，必须禁用 private GitCode 并将 Plan C 标为未完整交付，禁止退回 query token。环境未配置时明确 NOT RUN，不能计为交付通过。

- [ ] **Step 4: 提交**

```bash
git add docs/testing/skill-provider-live-smoke.md docs/testing/run-skill-provider-live-smoke.sh docs/testing/README.md apps/agent/src/agent_service/skills/README.md
git commit -m "docs(skills): document provider import operations"
```

## Plan C completion checkpoint

- GitHub/GitLab/GitCode 只通过固定 API adapter 导入，不接受 clone URL；
- Provider ref 先解析 full commit，每个 revision 的 immutable origin 保存 exact source；
- 所有导入复用 Plan A canonicalize、scan、双人审核和不可变 artifact；
- connection 凭据加密、不可回显，GitHub installation token/JWT 不持久化；
- Registry 无直连外网，只有专用 proxy 可访问固定 host；
- 检查更新和重新导入都不自动发布或激活；
- worker 崩溃/重试不重复造 revision；
- 三个 Provider live smoke 是发布验收条件，不以 CI fixture 冒充真实兼容性。

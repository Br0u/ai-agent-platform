# Agent Hardening and Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available and authorized) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Agent 直接导航和运行 deadline 缺口，降低页面上下文与站点目录开销，并清理后台、lint 和事实文档漂移。

**Architecture:** 保留当前单 Agent、无持久化、结构化最终答案和现有六家云 Provider 边界。所有行为修改都落在现有 Web BFF 共享边界，不新增依赖、缓存层、Provider 或兼容路径；公网 HTTP Endpoint 按用户要求完全不改。

**Tech Stack:** Next.js 16、TypeScript、Vitest、Agno AgentOS、ESLint、Docker Compose。

---

## Scope

本计划包含：

- 直接导航复用现有 `validatedNavigation()` 可达性校验；
- AgentOS 流请求使用不可续期的总 deadline；
- 页面链接上限由 64 收紧到 16，目的页验证始终使用 2 秒共享 deadline，开发页请求最多 5 秒；
- 站点目录改为去重后的扁平条目，删除同一路径在 navigation/pages/solutions 中重复注入；
- 明确结构化答案必须完整验证后才可公开，禁止为了伪流式输出削弱 CoT 边界；
- 忽略 `.next.nosync/**`、修正后台状态文案、模型 ID 提示和项目事实文档；
- 重建当前源码服务并完成真实浏览器验收。

本计划不包含：

- 用户明确排除的公网明文 HTTP Endpoint 修改；
- 现有规格明确列为非目标的模型列表自动发现、本地 Provider、RAG、多 Agent、Workflow 和持久化聊天历史。

## Chunk 1: Correctness and runtime bounds

### Task 1: Validate direct navigation reachability

**Files:**

- Modify: `apps/web/src/server/assistant/agentos-assistant-provider.ts`
- Test: `apps/web/src/server/assistant/agentos-assistant-provider.test.ts`

- [x] **Step 1: Write the failing tests**

增加两条测试：直接导航必须调用 `pageResolver.exists()`；目的页不可达时不返回死按钮，并回退到普通 Agent 回答。

- [x] **Step 2: Run RED**

Run: `node_modules/.bin/vitest run src/server/assistant/agentos-assistant-provider.test.ts`

Expected: FAIL，因为直接分支当前未调用 `exists()`。

- [x] **Step 3: Implement the minimum fix**

直接分支调用现有 `validatedNavigation()`。仅在校验成功时短路返回；失败时继续执行普通 Agent，不新增第二套校验函数。

- [x] **Step 4: Run GREEN**

Run: `node_modules/.bin/vitest run src/server/assistant/agentos-assistant-provider.test.ts`

Expected: PASS。

### Task 2: Enforce one absolute AgentOS stream deadline

**Files:**

- Modify: `apps/web/src/server/assistant/agentos-transport.ts`
- Test: `apps/web/src/server/assistant/agentos-transport.test.ts`

- [x] **Step 1: Replace the idle-renewal test with a failing total-deadline test**

流每 75ms 产生一个 chunk、`timeoutMs=100` 时，100ms 必须中止；外部 abort、响应大小和清理语义保持不变。

- [x] **Step 2: Run RED**

Run: `node_modules/.bin/vitest run src/server/assistant/agentos-transport.test.ts`

Expected: FAIL，因为当前每个 chunk 会续期。

- [x] **Step 3: Reuse the request-path deadline pattern**

在一次 `stream()` 生命周期创建一个 timer/deadline promise，fetch 和每次 read 都与同一 promise race；finally 只清理一次 timer。

- [x] **Step 4: Run GREEN**

Run: `node_modules/.bin/vitest run src/server/assistant/agentos-transport.test.ts`

Expected: PASS。

## Chunk 2: Context and prompt cost

### Task 3: Bound page-context work

**Files:**

- Modify: `apps/web/src/server/assistant/public-page-context.ts`
- Modify: `apps/web/src/server/assistant/assistant-runtime.ts`
- Test: `apps/web/src/server/assistant/public-page-context.test.ts`
- Test: `apps/web/src/server/assistant/assistant-runtime.test.ts`

- [x] **Step 1: Write failing bound tests**

断言最多验证 16 个唯一链接；自定义/开发请求 timeout 大于 2 秒时，目的页验证仍在固定 2 秒共享 deadline 中结束；开发页请求在 5 秒截止。

- [x] **Step 2: Run RED**

Run: `node_modules/.bin/vitest run src/server/assistant/public-page-context.test.ts src/server/assistant/assistant-runtime.test.ts`

Expected: FAIL，当前为 64 条且开发 deadline 会扩到 30 秒。

- [x] **Step 3: Apply fixed constants**

将 `PUBLIC_PAGE_LINKS_MAX` 改为 16；目的页共享 deadline 不再随单请求 timeout 扩张；开发 resolver timeout 改为 5 秒。不增加缓存，继续每次匿名读取。

- [x] **Step 4: Run GREEN**

Run: `node_modules/.bin/vitest run src/server/assistant/public-page-context.test.ts src/server/assistant/assistant-runtime.test.ts`

Expected: PASS。

### Task 4: Remove duplicate site-catalog prompt payload

**Files:**

- Modify: `apps/web/src/server/assistant/agentos-assistant-provider.ts`
- Test: `apps/web/src/server/assistant/agentos-assistant-provider.test.ts`
- Test: `apps/web/src/server/assistant/assistant-content-filter.test.ts`

- [x] **Step 1: Write failing prompt-shape and safety tests**

断言 `publicSiteCatalog` 是按 href 去重的扁平数组、每个条目只含安全的 label/href/可选 description；结构化答案在 JSON 完整前不得发出任何 answer delta。

- [x] **Step 2: Run RED**

Run: `node_modules/.bin/vitest run src/server/assistant/agentos-assistant-provider.test.ts src/server/assistant/assistant-content-filter.test.ts`

Expected: prompt-shape test FAIL；安全缓冲测试保持 PASS。

- [x] **Step 3: Flatten and deduplicate existing data**

复用 `portalNavigation`、`routeRegistry`、`industrySolutionCatalog`，以 href 为 key 生成一个扁平目录。保留结构化答案完整校验，不实现 partial JSON 直通。

- [x] **Step 4: Run GREEN**

Run: `node_modules/.bin/vitest run src/server/assistant/agentos-assistant-provider.test.ts src/server/assistant/assistant-content-filter.test.ts`

Expected: PASS。

## Chunk 3: Admin and tooling truth

### Task 5: Fix admin copy and model-ID guidance

**Files:**

- Modify: `apps/web/src/components/admin/assistant-admin-page.tsx`
- Modify: `apps/web/src/components/admin/assistant-model-config-panel.tsx`
- Test: `apps/web/src/components/admin/assistant-admin-page.test.tsx`
- Test: `apps/web/src/components/admin/assistant-model-config-panel.test.tsx`

- [x] **Step 1: Write failing UI tests**

测试只读区显示“当前运行合同”，不再显示“待接入”；Model ID 旁明确说明需要填写供应商或部署方给出的精确 ID，系统不会自动发现列表。

- [x] **Step 2: Run RED**

Run: `node_modules/.bin/vitest run src/components/admin/assistant-admin-page.test.tsx src/components/admin/assistant-model-config-panel.test.tsx`

Expected: FAIL。

- [x] **Step 3: Change copy only**

不改变表单协议、Provider enum 或后端控制面。

- [x] **Step 4: Run GREEN**

Run: `node_modules/.bin/vitest run src/components/admin/assistant-admin-page.test.tsx src/components/admin/assistant-model-config-panel.test.tsx`

Expected: PASS。

### Task 6: Restore local lint repeatability and current facts

**Files:**

- Modify: `apps/web/eslint.config.mjs`
- Modify: `docs/design/product-facts.md`

- [x] **Step 1: Ignore the `.next.nosync` development cache**

不引入新脚本，不删除开发缓存。

- [x] **Step 2: Update project facts**

把“安全占位、无生产模型”的旧状态改为当前单 Agent、动态模型、Skill、无持久化页面记忆事实，并标记自动模型发现等仍为非目标。

- [x] **Step 3: Verify lint and format**

Run: `node_modules/.bin/eslint . --max-warnings=0`

Run: `node_modules/.bin/prettier --check src/server/assistant src/components/admin eslint.config.mjs ../../docs/design/product-facts.md ../../docs/superpowers/plans/2026-08-20-agent-hardening-optimization.md`

Expected: PASS。

## Chunk 4: Verification and runtime acceptance

### Task 7: Full verification and current-source runtime

**Files:** none expected beyond prior tasks.

- [x] **Step 1: Run Web Agent-targeted and production checks**

Run the complete Agent/Web assistant test set, Web typecheck, Web lint, Web build and `git diff --check`.

- [x] **Step 2: Run Agent checks**

Run Agent pytest, Ruff and mypy even though Agent source is unchanged, because runtime rebuild crosses the Web/Agent protocol boundary.

- [x] **Step 3: Rebuild current-source services**

Rebuild Agent and Skill Registry from this worktree, start Web from this worktree, and verify health/version through current ports. Do not change `infra/agent/model-endpoints.json`.

- [ ] **Step 4: Run browser acceptance**

Verify ordinary answer, page-aware answer, Skill query, valid navigation, dead-navigation fallback, and no CoT/raw structured envelope in the UI.

Current runtime has no active model configuration. Browser acceptance therefore verified the healthy placeholder status, safe user-facing unavailable message and absence of internal/raw output; model-backed answer, Skill and navigation cases remain covered by the Agent/Web automated suites but cannot be live-verified until a model is configured.

- [x] **Step 5: Inspect final diff and branch state**

Run `git status --short --branch`, `git diff --check`, and review every changed path. Preserve `main` and unrelated files.

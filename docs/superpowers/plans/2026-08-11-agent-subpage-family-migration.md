# Agent Subpage Family Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将低保真原型中的企业知识助手、智能问数助手、视频理解助手和企业复杂任务自动化引擎四页逐字迁移到现有 Next.js 官网，同时保留现有一体机页面、站点外壳和唯一 Agent 聊天入口。

**Architecture:** 四页新增独立类型化内容模块，复用现有 `PlatformPage` 和默认 dense 的 `PlatformPageDetail`。原型中的聊天示例、数据卡、流程演示和业务场景使用现有 visual/demo/cards/flow/business 字段表达；四个精确 App Router 页面覆盖动态 scaffold，不新增页面 DSL、运行时 HTML 解析或旧路由兼容层。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、CSS、Vitest、Testing Library、Playwright。

---

## 已确认边界与路由

| 原型 ID | 原型行 | 正式 URL | H1 | 正文 sections |
| --- | ---: | --- | --- | ---: |
| `agent-knowledge` | 1254–1265 | `/product/agent-knowledge` | 企业知识助手：把企业文档、制度、经验变成随时可问的智能库 | 6 |
| `agent-data` | 1266–1274 | `/product/data-agent` | 智能问数助手：不用写 SQL，问一句就能拿到数据答案 | 5 |
| `agent-video` | 1275–1284 | `/product/agent-video` | 视频理解与智能视觉助手：让视频从「被观看」变成「可理解」 | 5 |
| `agent-orchestration` | 1285–1297 | `/product/agent-orchestration` | 企业复杂任务自动化引擎：把多步骤业务变成一条自动流程 | 5 |

- 四页均有 business 业务场景，原型没有独立最终 CTA，内容对象也不得补 CTA。
- 原型自页链接转换为对应正式 URL + hash；13 个实际目标为 `agent-k-{qa,processing,kb,graph}`、`agent-data-{qa,metric,source}`、`agent-video-{search,monitor,device}`、`agent-orch-{ai,chatflow,workflow}`。
- 能力底座链接：`knowledge` → `/product/knowledge`，`knowledge-metrics` → `/product/knowledge-metrics`。
- 方案与案例只映射到现站真实可达目标：
  - `knowledge-service` → `/solutions/knowledge-service`
  - `document-intelligence` → `/solutions#knowledge`
  - `data-insight` → `/solutions/finance-data`
  - `video-intelligence` → `/solutions#vision`
  - `process-automation` → `/solutions/process-automation`
  - `multi-agent` → `/solutions/enterprise-multi-agent`
  - `case-pending-enterprise-knowledge` → `/cases`
- `/product/knowledge-agent` 是现有智能导办一体机，`/product/video-agent` 是现有视觉检索一体机，`/product/office-agent` 是现有办公智能体矩阵；三者不修改、不重定向。
- 不修改 `SiteShell`、`FloatingChatWidget`、导航结构和聊天接口；仅移除已有“数据智能体”入口的 `placeholder` 状态，使它与本批 live 路由一致；不伪造截图、案例或未在原型出现的内容。

## 文件职责

| 文件 | 责任 |
| --- | --- |
| `apps/web/src/components/agent-subpage-content.ts` | 四页完整原型原文、slug、正式 URL 与查询 |
| `apps/web/src/components/agent-subpage-content.test.ts` | 用完整对象字面量锁定所有文本、演示、锚点和链接 |
| `apps/web/src/components/agent-subpage-family.test.tsx` | 验证 dense 渲染、区块、演示、锚点和聊天边界 |
| `apps/web/src/app/product/{agent-knowledge,data-agent,agent-video,agent-orchestration}/page.tsx` | 四个薄页面与 metadata |
| `apps/web/src/config/routes.ts` / `routes.test.ts` | 四个精确 public/live 路由 |
| `apps/web/src/config/navigation.ts` / `navigation.test.ts` | 仅同步已有“数据智能体”入口的开放状态 |
| `apps/web/e2e/agent-subpage-family.spec.ts` | 状态、内链/hash、响应式、Agent 和截图验收 |

## Chunk 1: Exact content contract

### Task 1: 锁定四页全部原型内容

**Files:**

- Create: `apps/web/src/components/agent-subpage-content.test.ts`
- Create: `apps/web/src/components/agent-subpage-content.ts`

- [x] **Step 1: 先写完整对象失败测试**

```ts
expect(agentSubpageSlugs).toStrictEqual([
  "agent-knowledge",
  "data-agent",
  "agent-video",
  "agent-orchestration",
]);
expect(getAgentSubpage("agent-knowledge")?.hero.title).toBe(
  "企业知识助手：把企业文档、制度、经验变成随时可问的智能库",
);
expect(getAgentSubpage("data-agent")?.hero.title).toBe(
  "智能问数助手：不用写 SQL，问一句就能拿到数据答案",
);
expect(getAgentSubpage("agent-video")?.hero.title).toBe(
  "视频理解与智能视觉助手：让视频从「被观看」变成「可理解」",
);
expect(getAgentSubpage("agent-orchestration")?.hero.title).toBe(
  "企业复杂任务自动化引擎：把多步骤业务变成一条自动流程",
);
expect(getAgentSubpage("unknown")).toBeUndefined();
```

四页各使用完整对象字面量 `toStrictEqual`，逐字覆盖原型对应行中所有实现字段和顺序：Hero eyebrow/title/lead/tags/actions/visual；每个 section 的 id、标题、lead、body、cards、points、flow、note、visual/demo/actions；business 的聊天/数据/流程演示、points、values、reason、workflow、outcomes、scenes 和精确链接。不得使用快照、部分匹配或丢弃微型界面中的可见文字，包括输入框 placeholder、`发送`、数据卡中的 `华东区` / `约 1.28 亿元` / `同比增长 12%` / `数据来源`，以及编排流程中的 `执行完成 ✓`。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/agent-subpage-content.test.ts
```

- [x] **Step 3: 用现有 `PlatformPage` 实现最小内容模块**

使用 `] as const satisfies readonly PlatformPage[]`，查询函数显式返回 `PlatformPage | undefined`。知识页恰好 6 个 sections，其他三页恰好 5 个；四页都有 business 且 `cta` 为 `undefined`。聊天示例进入 demo/messages，原型列表进入 points，流程演示进入 flow；不修改共享类型和渲染器。

- [x] **Step 4: 运行 GREEN 与静态门槛**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/agent-subpage-content.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
```

- [x] **Step 5: 提交内容合同**

```bash
git add apps/web/src/components/agent-subpage-content.ts apps/web/src/components/agent-subpage-content.test.ts
git diff --cached --check
git commit -m "feat(agents): 锁定四个智能体子页原型内容"
```

## Chunk 2: Explicit routes and dense rendering

### Task 2: 注册四页并复用高密度产品详情渲染器

**Files:**

- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Modify: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/config/navigation.test.ts`
- Create: `apps/web/src/components/agent-subpage-family.test.tsx`
- Create: `apps/web/src/app/product/agent-knowledge/page.tsx`
- Create: `apps/web/src/app/product/data-agent/page.tsx`
- Create: `apps/web/src/app/product/agent-video/page.tsx`
- Create: `apps/web/src/app/product/agent-orchestration/page.tsx`

- [x] **Step 1: 写路由与渲染失败测试**

路由测试将四个精确 URL 注册在 `/product/[slug]` 前，状态为 public/live，并同步 `requiredRoutes` 顺序；`/product/agent-unknown` 仍匹配动态 scaffold。导航测试精确查找 `label === "数据智能体"` 且 `href === "/product/data-agent"` 的既有项，断言其不再含 `status: "placeholder"`；不改标签、顺序或导航结构。组件测试遍历四页，断言唯一 H1、正确 section 数量、business 存在、CTA 不存在、13 个自页链接目标 ID 可定位、关键演示和正式链接可见、默认 dense、页面内部没有 `.floating-assistant`。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/navigation.test.ts src/config/route-files.test.ts src/components/agent-subpage-family.test.tsx
```

- [x] **Step 3: 注册路由并创建四个薄页面入口**

路由标题分别为 `企业知识助手`、`智能问数助手`、`视频理解助手`、`复杂任务自动化引擎`。每个页面只做固定 slug 查询、metadata 和 `<PlatformPageDetail page={page} />`；不复制文案，不传 `dense={false}`。导航只删除“数据智能体”既有项上的 `status: "placeholder"`，其余结构与条目不动。

- [x] **Step 4: 运行本批和共享回归**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/agent-subpage-content.test.ts src/components/agent-subpage-family.test.tsx src/components/coding-subpage-family.test.tsx src/components/capability-foundation-family.test.tsx src/components/model-subpage-family.test.tsx src/components/platform-center-detail.test.tsx src/config/routes.test.ts src/config/navigation.test.ts src/config/route-files.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
```

- [x] **Step 5: 提交路由与页面**

```bash
git add apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/config/navigation.ts apps/web/src/config/navigation.test.ts apps/web/src/components/agent-subpage-family.test.tsx apps/web/src/app/product/agent-knowledge apps/web/src/app/product/data-agent apps/web/src/app/product/agent-video apps/web/src/app/product/agent-orchestration
git diff --cached --check
git commit -m "feat(agents): 迁移四个智能体子页面"
```

## Chunk 3: Browser and release gates

### Task 3: 完成四页浏览器验收

**Files:**

- Create: `apps/web/e2e/agent-subpage-family.spec.ts`
- Modify only on concrete browser failure: `apps/web/src/components/product-portal.css`
- Modify: `docs/superpowers/plans/2026-08-11-agent-subpage-family-migration.md`

- [x] **Step 1: 写真实浏览器验收**

- 四页返回 200，显示精确 H1、正确 section 数量、business，且没有 CTA。
- main 内全部正式内链状态 `<400`；所有同源 hash 实际导航后 URL 保留 hash、目标存在且进入视口，包括跨页 `/solutions#knowledge` 与 `/solutions#vision`。
- reduced-motion 下在 1440×1000、768×1024、390×844 无横向溢出，标题、区块、演示完整可见。
- 全部 card grid 与带 demo 的 section frame 在桌面保持多栏、390px 折回单栏。
- 四页在 1440 与 390 均只有 shell 的一个 Agent launcher，可打开和关闭码多多，页面内无重复入口。
- 捕获四页 1440 与 390 全页截图到 `artifacts/playwright/agent-subpages/`；截图前删除旧文件并断言 200 与精确 H1。
- 现有 `/product/knowledge-agent`、`/product/video-agent`、`/product/office-agent` 各返回 200、URL 保持原路径不重定向；完整 H1 分别精确保持为 `华鲲元启智能导办一体机`、`华鲲元启视觉检索一体机`、`AI Agent PlatformOffice Agent 办公智能体矩阵`（办公页既有主标题为 `办公智能体矩阵`）。只做路径/H1 回归，不修改旧页组合标题，也不增加截图或完整响应式矩阵。

- [x] **Step 2: build 后运行本批 E2E**

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/agent-subpage-family.spec.ts --project=desktop
```

若有布局失败，只做最小 CSS 根因修复，重新 build 并重跑本批；共享 CSS 修改后重跑 model、capability-foundation、coding desktop E2E；若修改的是非 dense 选择器，再同时重跑 product-portal-family 与 platform-center desktop E2E。

- [x] **Step 3: 运行完整 Web 门槛**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/agent-subpage-family.spec.ts --project=desktop
```

- [x] **Step 4: 范围检查并提交验收**

```bash
git status --short
git diff --name-only cc06bf6...HEAD
git add apps/web/e2e/agent-subpage-family.spec.ts docs/superpowers/plans/2026-08-11-agent-subpage-family-migration.md
# 仅当浏览器 RED 实际触发 CSS 修复时再执行：
git add apps/web/src/components/product-portal.css
git diff --cached --check
git commit -m "test(agents): 验收四个智能体子页面"
```

## 验收定义

1. 原型 1254–1297 行四页的全部可见文案、顺序、演示和链接通过完整内容合同。
2. 四个新语义路由为 live，13 个自页锚点和全部正式内链真实可达；现有三类一体机页面未修改。
3. 四页使用高信息密度产品详情节奏，桌面多栏、移动端单栏。
4. `SiteShell`、`FloatingChatWidget` 和 Agent 行为未修改，页面内没有第二个聊天入口。
5. 三档响应式、reduced-motion、完整 Web 门槛和本批 E2E 通过。

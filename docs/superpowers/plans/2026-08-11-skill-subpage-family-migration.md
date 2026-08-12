# Skill Subpage Family Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将低保真原型中的编程类、应用类和办公类技能三页逐字迁移到现有 Next.js 官网，保持产品详情的信息密度、站点外壳和唯一 Agent 聊天入口。

**Architecture:** 三页新增独立类型化内容模块，复用现有 `PlatformPage` 与默认 dense 的 `PlatformPageDetail`。原型的技能详情本来是独立 section，直接以原有 tag 作为 section eyebrow、原有标题作为 section title，保留 5/4/4 个正文区块与全部 DOM id；四组能力使用 cards，`它解决`使用 section.note，右栏的示意标题/截图槽位/预留说明使用现有 demo.title/messages/note，业务演示和 CTA 使用 business/cta。不新增图片、页面 DSL、依赖、兼容层或共享渲染器改动。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、CSS、Vitest、Testing Library、Playwright。

---

## 已确认边界与路由

| 原型 ID | 原型行 | 正式 URL | H1 | 正文 sections |
| --- | ---: | --- | --- | ---: |
| `skills-programming` | 1486–1514 | `/product/skills-programming` | 编程类技能：让研发与工程更省心 | 5 |
| `skills-application` | 1515–1536 | `/product/skills-application` | 应用类技能：让业务应用更可靠 | 4 |
| `skills-office` | 1537–1559 | `/product/skills-office` | 办公类技能：让日常工作更高效 | 4 |

- 三页均有 business 与独立 CTA；CTA 保留“申请体验 / 商务咨询 / 返回技能中心”。
- 13 个正文 section id 全部保留：编程 `skills-programming-{position,caps}` + `sk-{eval,dify,aiknow}`；应用 `skills-application-{position,caps}` + `sk-{video,agentguard}`；办公 `skills-office-{position,caps}` + `sk-{meeting,hello}`。
- 原型正式动作只映射现有 live 目标：`model-assets` → `/product/model-assets`，`agent-orchestration` → `/product/agent-orchestration`，`agent-video` → `/product/agent-video`，`governance` → `/product/governance`，`app-writing` → `/product/app-writing`，`skills` → `/product/skills`。
- 不修改 `SiteShell`、`FloatingChatWidget`、导航结构、聊天接口、共享类型、共享渲染器或 CSS；不伪造技能、截图、案例或原型未出现的内容。

## 文件职责

| 文件 | 责任 |
| --- | --- |
| `apps/web/src/components/skill-subpage-content.ts` | 三页完整原型原文、slug、正式 URL 与查询 |
| `apps/web/src/components/skill-subpage-content.test.ts` | 完整对象字面量锁定全部技能详情、演示、section id 和链接 |
| `apps/web/src/components/skill-subpage-family.test.tsx` | 验证真实薄页面、dense 渲染、区块、CTA 和聊天边界 |
| `apps/web/src/app/product/{skills-programming,skills-application,skills-office}/page.tsx` | 三个薄页面与 metadata |
| `apps/web/src/config/routes.ts` / `routes.test.ts` | 三个精确 public/live 路由 |
| `apps/web/e2e/skill-subpage-family.spec.ts` | 状态、内链、响应式、Agent 和截图验收 |

## Chunk 1: Exact content contract

### Task 1: 锁定三页全部原型内容

**Files:**

- Create: `apps/web/src/components/skill-subpage-content.test.ts`
- Create: `apps/web/src/components/skill-subpage-content.ts`

- [x] **Step 1: 先写完整对象失败测试**

导出 slug 顺序严格为 `skills-programming`、`skills-application`、`skills-office`。三页使用完整对象字面量 `toStrictEqual`，逐字覆盖 Hero、5/4/4 个正文 sections、7 个技能详情、business、cta、全部动作与顺序；不得快照或部分匹配。

特别锁定：

- 每个技能详情的原有 tag/title/lead/body、4 条能力、`它解决`、visual 示意与 `此处预留真实界面截图位置`；
- 业务演示 header/messages/input `输入你的需求…`/`发送`；
- 编程 `已生成对比报告，给出选型建议。`、`已生成工作流 DSL，可直接导入。`；
- 应用 `已创建布控任务，开始轮询预警。`、`已扫描完成，生成安全健康报告。`；
- 办公 `已生成纪要与 5 条任务清单。`、`已按示例完成技能包结构与发布流程演示。`。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/skill-subpage-content.test.ts
```

- [x] **Step 3: 用现有 `PlatformPage` 实现最小内容模块**

使用 `] as const satisfies readonly PlatformPage[]`，查询函数显式返回 `PlatformPage | undefined`。技能详情 section 的 eyebrow 直接使用原型 tag，title/lead/body 使用原文；4 组“能力标题 + 描述”分别进入 4 张 cards，`它解决`进入 section.note。原型右栏的示意标题进入 demo.title，截图素材槽位全文进入 demo.messages，`此处预留真实界面截图位置`进入 demo.note；不得把这些字段合并、丢弃或新增文案。

- [x] **Step 4: 运行 GREEN 与静态门槛**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/skill-subpage-content.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
```

- [x] **Step 5: 提交内容合同**

```bash
git add apps/web/src/components/skill-subpage-content.ts apps/web/src/components/skill-subpage-content.test.ts
git diff --cached --check
git commit -m "feat(skills): 锁定三个技能子页原型内容"
```

## Chunk 2: Explicit routes and dense rendering

### Task 2: 注册三页并复用高密度详情渲染器

**Files:**

- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Create: `apps/web/src/components/skill-subpage-family.test.tsx`
- Create: `apps/web/src/app/product/skills-programming/page.tsx`
- Create: `apps/web/src/app/product/skills-application/page.tsx`
- Create: `apps/web/src/app/product/skills-office/page.tsx`

- [x] **Step 1: 写路由、真实页面接线与渲染失败测试**

路由测试在 `/product/[slug]` 前按上述顺序注册三个精确 public/live URL，并同步 `requiredRoutes`；`/product/skills-unknown` 仍匹配动态 scaffold。组件测试表驱动导入三个真实 Page 与 metadata，明确断言 metadata title/description 等于 hero title/lead；渲染真实 Page 断言唯一精确 H1、5/4/4 sections、business/CTA、13 个 DOM id、关键 visual/正式链接、默认 dense，整个 render container 无 `.floating-assistant`。微型 UI 的所有 Testing Library 文本匹配都必须属于 business 内唯一的 `platform-page-demo`，不能只落在技能详情 demo。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/route-files.test.ts src/components/skill-subpage-family.test.tsx
```

- [x] **Step 3: 注册路由并创建三个薄页面入口**

路由标题分别为 `编程类技能`、`应用类技能`、`办公类技能`。每页只做固定 slug 查询、metadata title/description 和 `<PlatformPageDetail page={page} />`；不复制正文、不传 `dense={false}`、不增加页面内聊天入口。

- [x] **Step 4: 运行本批和共享回归**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/skill-subpage-content.test.ts src/components/skill-subpage-family.test.tsx src/components/application-subpage-family.test.tsx src/components/agent-subpage-family.test.tsx src/components/coding-subpage-family.test.tsx src/components/capability-foundation-family.test.tsx src/components/model-subpage-family.test.tsx src/components/platform-center-detail.test.tsx src/config/routes.test.ts src/config/route-files.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
```

- [x] **Step 5: 提交路由与页面**

```bash
git add apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/components/skill-subpage-family.test.tsx apps/web/src/app/product/skills-programming apps/web/src/app/product/skills-application apps/web/src/app/product/skills-office
git diff --cached --check
git commit -m "feat(skills): 迁移三个技能子页面"
```

## Chunk 3: Browser and release gates

### Task 3: 完成三页浏览器验收

**Files:**

- Create: `apps/web/e2e/skill-subpage-family.spec.ts`
- Modify only on concrete browser failure: `apps/web/src/components/product-portal.css`
- Modify: `docs/superpowers/plans/2026-08-11-skill-subpage-family-migration.md`

- [x] **Step 1: 写真实浏览器验收**

- 三页 200、精确唯一 H1、5/4/4 sections、business/CTA、dense 与唯一 shell Agent；全页 demo 总数按编程/应用/办公精确为 `4 / 3 / 3`，且每页唯一 `.product-portal-business` 内恰有 1 个可见 business demo。
- main 全部同源链接状态 `<400`；显式要求每页对应正式目标集合存在并可达。三页原型没有自页 hash 动作，不伪造 hash 链接；13 个原型 section id 直接断言 DOM 存在。
- reduced-motion 下 1440×1000、768×1024、390×844 无横向溢出，全部 section/visual/demo/business/CTA 可见。
- 每页 card grid 数量 `> 0` 且全部可见，1440 多栏、390 单栏；groups 精确为 0。带 demo 的技能详情 section 按编程/应用/办公精确为 `3 / 2 / 2`，全部 frame 可见并在 1440 双栏、390 单栏；每页 `.product-portal-business` 恰好 1 个，1440 双栏、390 单栏。所有集合先断言精确数量或 `> 0`，禁止空集合伪通过。
- 1440/390 三页只有一个 Agent launcher，可打开/关闭码多多，内容内无重复入口。
- 生成 `artifacts/playwright/skill-subpages/{skills-programming,skills-application,skills-office}-{1440,390}.png` 六张 fullPage 截图；每次先删旧，截图前断言 200、精确 H1和 fonts.ready。

- [x] **Step 2: build 后运行本批 E2E**

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/skill-subpage-family.spec.ts --project=desktop
```

只在真实布局 RED 时做最小 CSS 根因修复；如修改共享 CSS，重跑 application、agent、coding、capability-foundation、model desktop E2E；若非 dense selector，再加 product-portal-family 与 platform-center。

- [x] **Step 3: 运行完整 Web 门槛**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/skill-subpage-family.spec.ts --project=desktop
```

- [x] **Step 4: 范围检查并提交验收**

```bash
git status --short
git diff --name-only 6606610...HEAD
git add apps/web/e2e/skill-subpage-family.spec.ts docs/superpowers/plans/2026-08-11-skill-subpage-family-migration.md
# 仅当浏览器 RED 实际触发 CSS 修复时再执行：
git add apps/web/src/components/product-portal.css
git diff --cached --check
git commit -m "test(skills): 验收三个技能子页面"
```

## 验收定义

1. 原型 1486–1559 行三页全部可见文案、顺序、7 个技能详情、演示和链接通过完整合同。
2. 三个新语义路由 live，13 个原型 DOM id 与全部正式内链真实可达，动态 scaffold 保留。
3. 三页保持技能详情应有的信息密度，桌面多栏、移动端单栏。
4. `SiteShell`、`FloatingChatWidget` 和 Agent 行为未修改，页面内没有第二个聊天入口。
5. 三档响应式、reduced-motion、完整 Web 门槛和本批 E2E 通过。

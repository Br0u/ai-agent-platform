# Coding Subpage Family Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将低保真原型的项目管理、会话管理、移动接入和编程规范四个编程中心子页逐字迁移到现有 Next.js 官网，并保持高信息密度产品布局、现有站点外壳和唯一 Agent 聊天入口。

**Architecture:** 四页新增独立类型化内容模块，复用现有 `PlatformPage` 与默认 dense 的 `PlatformPageDetail`。原型中的项目工作台、会话、终端和代码校验演示用现有 `hero.visual.messages`、`section.demo`、cards、flow、business 表达，不复制原型内联 DOM/CSS；四个精确 App Router 页面覆盖动态 scaffold。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、CSS、Vitest、Testing Library、Playwright。

---

## 已确认边界与路由

| 原型 ID | 原型行 | 正式 URL | H1 |
| --- | ---: | --- | --- |
| `coding-project` | 881–962 | `/product/coding-project` | 让 AI 持续理解你的开发项目 |
| `coding-session` | 963–1022 | `/product/coding-session` | 让开发上下文不断线 |
| `coding-mobile` | 1023–1109 | `/product/coding-mobile` | 让智能编程，接入你的每一种开发环境 |
| `coding-standard` | 1110–1188 | `/product/coding-standard` | 让代码质量，有标准可依 |

- 每页完整保留 Hero、6 个正文区块、业务场景和最终 CTA 的全部可见原文与顺序。
- 原型链接转换：四个 coding ID → 对应 `/product/coding-*`；`coding` → `/product/coding`；`governance` → `/product/governance`；`model` → `/product/model`；`model-deploy` → `/product/model-deploy`；`trial` → `/trial`；联系主题保留查询参数。
- 原型 `private-yuanqi` 没有独立正式方案页，映射到解决方案总览中真实存在的私有化锚点 `/solutions#private`，不新增不存在的详情路由。
- 自页锚点保留为正式 URL hash，例如 `/product/coding-project#cp-org`；每个目标 section 必须有对应 `id`。
- 不修改 `SiteShell`、`FloatingChatWidget`、聊天接口、导航和已有产品页；不新增运行时 HTML 解析、兼容层或页面 DSL。

## 文件职责

| 文件 | 责任 |
| --- | --- |
| `apps/web/src/components/coding-subpage-content.ts` | 四页完整原型内容、正式 URL、slug 与查询 |
| `apps/web/src/components/coding-subpage-content.test.ts` | 逐字锁定页面对象、演示、锚点、链接和 CTA |
| `apps/web/src/components/coding-subpage-family.test.tsx` | 验证共享 dense 渲染、区块、演示、锚点和聊天边界 |
| `apps/web/src/app/product/{coding-project,coding-session,coding-mobile,coding-standard}/page.tsx` | 四个静态页面和 metadata |
| `apps/web/src/config/routes.ts` / `routes.test.ts` | 四个精确 `live` 路由 |
| `apps/web/e2e/coding-subpage-family.spec.ts` | 状态、内链、锚点、响应式、Agent 和截图验收 |

## Chunk 1: Exact content contract

### Task 1: 锁定四页全部原型内容

**Files:**

- Create: `apps/web/src/components/coding-subpage-content.test.ts`
- Create: `apps/web/src/components/coding-subpage-content.ts`

- [x] **Step 1: 先写完整对象失败测试**

精确锁定 slug、H1 和未知查询：

```ts
expect(codingSubpageSlugs).toStrictEqual([
  "coding-project",
  "coding-session",
  "coding-mobile",
  "coding-standard",
]);
expect(getCodingSubpage("coding-project")?.hero.title).toBe(
  "让 AI 持续理解你的开发项目",
);
expect(getCodingSubpage("coding-session")?.hero.title).toBe("让开发上下文不断线");
expect(getCodingSubpage("coding-mobile")?.hero.title).toBe(
  "让智能编程，接入你的每一种开发环境",
);
expect(getCodingSubpage("coding-standard")?.hero.title).toBe(
  "让代码质量，有标准可依",
);
expect(getCodingSubpage("unknown")).toBeUndefined();
```

对四个页面分别使用完整对象字面量 `toStrictEqual`，逐字覆盖原型对应行中的每个字段与顺序：Hero eyebrow/title/lead/tags/actions/演示全部文本；6 个 sections 的 id、eyebrow、title、lead、body、cards、points、answer、flow、note、visual、demo 与 actions；business 的 points、values、demo、reason、workflow、outcomes、scenes 和 links；最终 CTA 标题、说明、按钮顺序与精确 href。不得使用快照或只测数量，不得丢弃原型模拟界面中的可见文字。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/coding-subpage-content.test.ts
```

- [x] **Step 3: 用现有 `PlatformPage` 实现最小内容模块**

四页使用 `satisfies readonly PlatformPage[]`。每页 `sections` 恰好 6 项，业务场景使用 `business`，结尾使用 `cta`。split showcase 的说明进入 section body，四项优势进入 cards，右侧演示进入 demo；Hero 的模拟界面文本进入 `hero.visual.messages`。不得修改共享类型或渲染器，除非 RED 测试证明原型存在现有类型无法表达的可见内容。

- [x] **Step 4: 运行 GREEN、typecheck、lint 与 format**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/coding-subpage-content.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
```

- [x] **Step 5: 提交内容合同**

```bash
git add apps/web/src/components/coding-subpage-content.ts apps/web/src/components/coding-subpage-content.test.ts
git diff --cached --check
git commit -m "feat(coding): 锁定四个编程子页原型内容"
```

## Chunk 2: Explicit routes and dense rendering

### Task 2: 注册四页并复用现有产品详情渲染器

**Files:**

- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Create: `apps/web/src/components/coding-subpage-family.test.tsx`
- Create: `apps/web/src/app/product/coding-project/page.tsx`
- Create: `apps/web/src/app/product/coding-session/page.tsx`
- Create: `apps/web/src/app/product/coding-mobile/page.tsx`
- Create: `apps/web/src/app/product/coding-standard/page.tsx`

- [x] **Step 1: 写路由与渲染失败测试**

路由测试断言四个精确 URL 在 `/product/[slug]` 前且为 `public/live`，`/product/coding-unknown` 仍为动态 scaffold，并同步 `requiredRoutes` 顺序。组件测试遍历四页，断言：唯一 H1；恰好 6 个 section；business 和 CTA 存在；12 个自页链接目标 section id 可定位；Hero/section/business 演示文字可见；内部链接精确；`main.platform-center--dense` 存在；页面内部没有 `.floating-assistant`。原型仅用于包裹 business、且没有任何链接指向的 `*-demo-value` id 不扩展共享类型。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/route-files.test.ts src/components/coding-subpage-family.test.tsx
```

- [x] **Step 3: 注册路由并创建四个薄页面入口**

每个页面只做固定 slug 查询、metadata 和 `<PlatformPageDetail page={page} />`；不复制文案，不传 `dense={false}`，不改共享渲染器。

- [x] **Step 4: 运行本批和共享回归**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/coding-subpage-content.test.ts src/components/coding-subpage-family.test.tsx src/components/capability-foundation-family.test.tsx src/components/model-subpage-family.test.tsx src/components/platform-center-detail.test.tsx src/config/routes.test.ts src/config/route-files.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
```

- [x] **Step 5: 提交页面与路由**

```bash
git add apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/components/coding-subpage-family.test.tsx apps/web/src/app/product/coding-project apps/web/src/app/product/coding-session apps/web/src/app/product/coding-mobile apps/web/src/app/product/coding-standard
git diff --cached --check
git commit -m "feat(coding): 迁移四个编程子页面"
```

## Chunk 3: Browser and release gates

### Task 3: 完成四页浏览器验收

**Files:**

- Create: `apps/web/e2e/coding-subpage-family.spec.ts`
- Modify only on concrete browser failure: `apps/web/src/components/product-portal.css`
- Modify: `docs/superpowers/plans/2026-08-10-coding-subpage-family-migration.md`

- [x] **Step 1: 写真实浏览器验收**

- 四页返回 200、显示精确 H1、6 个 section、business 与 CTA。
- main 内全部正式内链状态 `<400`；对所有带 hash 的同源链接实际导航到目标页并断言对应 ID 元素存在，包括跨页 `/solutions#private`。
- reduced-motion 下，在 1440×1000、768×1024、390×844 三档无横向溢出，标题、区块、演示完整可见。
- 默认 dense；桌面 section/card 使用至少双栏表达高信息密度，390px 折回单栏。
- 桌面和移动端只有 shell 的一个 Agent launcher，四页均可打开与关闭码多多。
- 捕获四页 1440 与 390 全页截图到 `artifacts/playwright/coding-subpages/`。

- [x] **Step 2: build 后运行本批 E2E**

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/coding-subpage-family.spec.ts --project=desktop
```

若有布局失败，只做最小 CSS 修复，重新 build 并重跑本批；共享 CSS 修改后还必须重跑 `model-subpage-family.spec.ts` 与 `capability-foundation-family.spec.ts` desktop 项目；若修改未限定在 `.platform-center--dense`，再重跑 `platform-center-family.spec.ts`。

- [x] **Step 3: 运行完整 Web 门槛**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/coding-subpage-family.spec.ts --project=desktop
```

- [x] **Step 4: 范围检查并提交验收**

```bash
git status --short
git diff --name-only 6870fa2...HEAD
git add apps/web/src/components/product-portal.css apps/web/e2e/coding-subpage-family.spec.ts docs/superpowers/plans/2026-08-10-coding-subpage-family-migration.md
git diff --cached --check
git commit -m "test(coding): 验收四个编程子页面"
```

## 验收定义

1. 原型 881–1188 行四页的全部可见文案、顺序、演示和链接通过完整内容合同。
2. 四个精确路由为 live，自页锚点和全部内部链接可达。
3. 四页默认使用高信息密度产品详情布局，桌面多栏、移动端单栏。
4. 现有 `SiteShell`、`FloatingChatWidget` 和 Agent 行为未修改，页面内无重复聊天入口。
5. 三档响应式、reduced-motion、完整 Web 门槛和本批 E2E 通过。

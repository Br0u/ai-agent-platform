# Product Portal Family Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将低保真原型的产品总览、独立产品中心、码多多 2.0、AIPPT 和 AISHREK 迁移到现有 Next.js 官网，保留原文、现有 `SiteShell` 和唯一 Agent 聊天入口。

**Architecture:** `/product` 使用独立总览组件，`/product/standalone` 使用独立产品中心组件，三个独立产品详情共享一个类型化渲染器和一份 CSS。原型中由脚本注入的产品侧边目录、返回条不重复实现，导航继续由当前站点 Header / 产品菜单承担。旧 `/product` 与 `/product/code-agent` 实现被直接替换，不保留兼容层。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、CSS、Vitest、Testing Library、Playwright。

---

## 已确认边界

- 内容基准：`/Users/brou/Downloads/华鲲官网首期低保真原型.html` 中 `products`、`key-products`、`mdd-2`、`aippt`、`aishrek` 五个页面。
- 正式 URL 映射：
  - `products` → `/product`
  - `key-products` → `/product/standalone`
  - `mdd-2` → `/product/code-agent`
  - `aippt` → `/product/aippt`
  - `aishrek` → `/product/aishrek`
- 首页已使用的 `/product/code-agent` 和 `/product/aishrek` 不改 URL。
- 原型中未进入本批的元启子中心使用语义路由（如 `/product/model`、`/product/knowledge`、`/product/agents`），仍由已有 `/product/[slug]` scaffold 承接，不伪装成本批已完成页面。
- 原型中的产品截图、架构图和界面图继续保留“素材槽位 / 示意”文案，不伪造真实产品截图。
- 原型原文中“七大中心 / 六大中心”的不一致先如实保留，不擅自校改；上线前由业务确认口径。
- 不复制原型 `.float`，不在页面内新增聊天按钮；只使用 `SiteShell` 已有的码多多入口。
- 不新增依赖，不接入下载、试用、商务或产品后台 API。

## 文件职责

| 文件                                                         | 责任                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `apps/web/src/components/product-portal-content.ts`          | 五个产品页面的原型原文、URL 映射和类型                              |
| `apps/web/src/components/product-portal-content.test.ts`     | 锁定标题、摘要、标签、能力、流程、场景与 CTA                        |
| `apps/web/src/components/product-portal-overview.tsx`        | 渲染 `/product` 双路径、三个问题、全链路、平台中心与独立产品        |
| `apps/web/src/components/product-portal-overview.test.tsx`   | 锁定产品总览内容、链接和无重复聊天入口                              |
| `apps/web/src/components/standalone-product-center.tsx`      | 渲染独立产品矩阵、选型表和与元启关系                                |
| `apps/web/src/components/standalone-product-center.test.tsx` | 锁定三个产品、选型表和 CTA                                          |
| `apps/web/src/components/standalone-product-detail.tsx`      | 按 slug 渲染码多多 2.0、AIPPT、AISHREK 的共通信息结构               |
| `apps/web/src/components/standalone-product-detail.test.tsx` | 锁定三个详情页结构、数量、原文与 CTA                                |
| `apps/web/src/components/product-portal.css`                 | 五个页面共用的浅蓝画布、玻璃卡片、蓝紫按钮、响应式与 reduced-motion |
| `apps/web/src/app/product/page.tsx`                          | 产品总览 metadata 与入口                                            |
| `apps/web/src/app/product/standalone/page.tsx`               | 独立产品中心 metadata 与入口                                        |
| `apps/web/src/app/product/code-agent/page.tsx`               | 码多多 2.0 metadata 与入口                                          |
| `apps/web/src/app/product/aippt/page.tsx`                    | AIPPT metadata 与入口                                               |
| `apps/web/src/app/product/aishrek/page.tsx`                  | AISHREK metadata 与入口                                             |
| `apps/web/src/config/routes.ts`                              | 将四个显式产品路由标记为 live，保留其他动态模块为 scaffold          |
| `apps/web/e2e/product-portal-family.spec.ts`                 | 五页 200、原型标题、内链、响应式与 Agent 入口验收                   |

## 将被直接移除的旧路径

- `apps/web/src/components/product-sections.tsx`
- `apps/web/src/components/product.css`
- `apps/web/src/app/product/code-agent/code-agent.css`
- `apps/web/src/app/product/code-agent/mobius-strip.ts`
- `apps/web/src/app/product/code-agent/mobius-strip.test.ts`
- `apps/web/src/app/product/code-agent/mobius-strip-visual.tsx`
- `apps/web/src/app/product/code-agent/mobius-strip-visual.test.tsx`

---

## Chunk 1: Content and route contracts

### Task 1: 锁定五个产品页的原型内容

**Files:**

- Create: `apps/web/src/components/product-portal-content.test.ts`
- Create: `apps/web/src/components/product-portal-content.ts`

- [x] **Step 1: 先写五个页面的内容失败测试**

至少锁定：

```ts
expect(productOverview.hero.title).toBe(
  "让企业 AI 落地，深度建设与快速使用双路径",
);
expect(standaloneCenter.products.map((item) => item.slug)).toEqual([
  "code-agent",
  "aippt",
  "aishrek",
]);
expect(getStandaloneProduct("code-agent")?.hero.title).toBe(
  "企业级的智能编码产品，代码不出域、说需求就落地",
);
expect(getStandaloneProduct("unknown")).toBeUndefined();
```

三个详情页分别锁定 3 个产品介绍卡、4 个能力模块、核心体验流程、3 个应用场景和最终 CTA。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/product-portal-content.test.ts
```

Expected: FAIL，内容模块尚不存在。

- [x] **Step 3: 写最小类型化内容模块**

- 内容只从五个原型页面迁移，不使用现有旧 `/product` 或旧码多多页文案补写。
- 原型 `data-page` 统一转为正式 href；本批详情使用显式路由，后续元启子中心使用语义 scaffold 路由。
- 不为未知 slug 提供回退内容。

- [x] **Step 4: 运行内容测试并确认 GREEN**

- [x] **Step 5: 提交内容合同**

```bash
git add apps/web/src/components/product-portal-content.ts apps/web/src/components/product-portal-content.test.ts
git diff --cached --check
git commit -m "feat(products): 锁定原型产品页内容"
```

### Task 2: 注册显式产品路由和页面入口

**Files:**

- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Create: `apps/web/src/app/product/standalone/page.tsx`
- Create: `apps/web/src/app/product/aippt/page.tsx`
- Create: `apps/web/src/app/product/aishrek/page.tsx`

- [x] **Step 1: 先写路由失败测试**

在 `/product/[slug]` 前加入并锁定：

```ts
"/product/standalone",
"/product/code-agent",
"/product/aippt",
"/product/aishrek",
```

四个显式路由必须为 `live`；`/product/agent-studio` 继续匹配 `/product/[slug]` 且保持 `scaffold`。

- [x] **Step 2: 运行路由测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/route-files.test.ts
```

- [x] **Step 3: 注册路由并创建最小显式入口**

- [x] **Step 4: 运行路由测试并确认 GREEN**

- [x] **Step 5: 提交路由合同**

```bash
git add apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/app/product/standalone/page.tsx apps/web/src/app/product/aippt/page.tsx apps/web/src/app/product/aishrek/page.tsx
git diff --cached --check
git commit -m "feat(products): 注册独立产品路由"
```

## Chunk 2: Product overview and center

### Task 3: 替换产品总览页

**Files:**

- Create: `apps/web/src/components/product-portal-overview.test.tsx`
- Create: `apps/web/src/components/product-portal-overview.tsx`
- Create: `apps/web/src/components/product-portal.css`
- Modify: `apps/web/src/app/product/page.tsx`
- Delete: `apps/web/src/components/product-sections.tsx`
- Delete: `apps/web/src/components/product.css`

- [x] **Step 1: 写产品总览失败测试**

覆盖 Hero 原文、双路径标签、3 个核心问题、4 步落地链路、智能体重点卡、5 个非空元启中心、3 个独立产品和收口 CTA。页面内不得出现 `.floating-assistant`。

- [x] **Step 2: 运行测试并确认 RED**

- [x] **Step 3: 实现总览页与 metadata**

保留原型顺序：Hero → 三个问题 → 全链路 → 元启中心 → 独立产品 → 业务价值 → CTA。原型空的 `<article class="center-row">` 不渲染，因其不承载任何内容。

- [x] **Step 4: 写共用产品门户 CSS**

复用已批准的浅蓝画布、白色玻璃卡片、蓝紫 CTA，且覆盖 900px、700px、`prefers-reduced-motion`、无 `backdrop-filter` 回退。

- [x] **Step 5: 确认旧总览组件无其他调用后直接删除**

- [x] **Step 6: 运行页面测试、类型和 lint**

- [x] **Step 7: 提交产品总览**

```bash
git add apps/web/src/app/product/page.tsx apps/web/src/components/product-portal-overview.tsx apps/web/src/components/product-portal-overview.test.tsx apps/web/src/components/product-portal.css apps/web/src/components/product-sections.tsx apps/web/src/components/product.css
git diff --cached --check
git commit -m "feat(products): 迁移原型产品总览"
```

### Task 4: 实现独立产品中心

**Files:**

- Create: `apps/web/src/components/standalone-product-center.test.tsx`
- Create: `apps/web/src/components/standalone-product-center.tsx`
- Modify: `apps/web/src/app/product/standalone/page.tsx`

- [x] **Step 1: 写中心页失败测试**

覆盖 3 个产品卡、码多多“优先推荐”、4 列选型表、与元启的 2 种关系和 2 个收口 CTA。

- [x] **Step 2: 确认 RED 后实现语义表格与页面**

- [x] **Step 3: 运行页面、内容和类型测试**

- [x] **Step 4: 提交独立产品中心**

```bash
git add apps/web/src/components/standalone-product-center.tsx apps/web/src/components/standalone-product-center.test.tsx apps/web/src/app/product/standalone/page.tsx
git diff --cached --check
git commit -m "feat(products): 实现独立产品中心"
```

## Chunk 3: Three standalone product details

### Task 5: 用一个共享渲染器实现三个产品详情

**Files:**

- Create: `apps/web/src/components/standalone-product-detail.test.tsx`
- Create: `apps/web/src/components/standalone-product-detail.tsx`
- Modify: `apps/web/src/app/product/code-agent/page.tsx`
- Modify: `apps/web/src/app/product/aippt/page.tsx`
- Modify: `apps/web/src/app/product/aishrek/page.tsx`
- Delete: `apps/web/src/app/product/code-agent/code-agent.css`
- Delete: `apps/web/src/app/product/code-agent/mobius-strip.ts`
- Delete: `apps/web/src/app/product/code-agent/mobius-strip.test.ts`
- Delete: `apps/web/src/app/product/code-agent/mobius-strip-visual.tsx`
- Delete: `apps/web/src/app/product/code-agent/mobius-strip-visual.test.tsx`

- [x] **Step 1: 写三个详情页与未知 slug 失败测试**

每个产品必须覆盖：

- 唯一 H1、Hero 摘要、4 个价值标签和 2 个 CTA。
- 3 个产品介绍卡、4 个能力模块及其特性列表。
- 原型核心体验流程、素材槽位、业务价值、3 个应用场景和最终 CTA。
- 码多多额外覆盖安全与部署保障 4 项；AIPPT 与 AISHREK 不渲染该独有区域。
- 未知 slug 返回 `notFound()`，不回退到第一个产品。

- [x] **Step 2: 运行测试并确认 RED**

- [x] **Step 3: 实现最小共享渲染器**

共享的是原型中已经重复的结构：Hero、产品介绍、能力组、核心体验、业务场景、CTA。码多多独有的安全保障使用一个可选数组，不新建子类或插件系统。

- [x] **Step 4: 为三个显式页面生成原型 metadata**

- [x] **Step 5: 确认 Mobius 旧实现只有码多多旧页调用后直接删除**

- [x] **Step 6: 运行三个页面、内容、路由、类型和 lint 测试**

- [x] **Step 7: 提交三个详情页**

```bash
git add apps/web/src/components/standalone-product-detail.tsx apps/web/src/components/standalone-product-detail.test.tsx apps/web/src/app/product/code-agent apps/web/src/app/product/aippt/page.tsx apps/web/src/app/product/aishrek/page.tsx
git diff --cached --check
git commit -m "feat(products): 迁移三个独立产品详情"
```

## Chunk 4: Browser and release gates

### Task 6: 完成产品页族浏览器验收

**Files:**

- Create: `apps/web/e2e/product-portal-family.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-10-product-portal-family-migration.md`
- Modify: `docs/superpowers/plans/2026-08-10-home-linked-conversion-routes.md`

- [x] **Step 1: 写五页 E2E**

- 五个 URL 返回 200 并显示各自原型 H1。
- 五页的内部链接不得为 404 或 5xx。
- 1440×1000、768×1024、390×844 无横向溢出。
- 桌面和移动端都只有 shell 的一个 `.floating-assistant__launcher`，可打开、关闭码多多。
- 捕获 `/product`、`/product/code-agent`、`/product/aishrek` 的 1440 和 390 预览图到 `artifacts/playwright/product-portal/`。

- [x] **Step 2: 运行完整 web 门槛**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/product-portal-family.spec.ts e2e/home-reference-layout.spec.ts e2e/home-linked-routes.spec.ts --workers=2
```

Expected: 所有必须门槛退出码为 0；Playwright 仅允许已声明的 project-specific skip。

- [x] **Step 3: 检查范围和旧路径残留**

```bash
rg -n "product-sections|MobiusStripVisual|mobius-strip" apps/web/src
git diff --check
git status --short
git diff --name-only main...HEAD
```

Expected: 无旧页调用或兼容层；只有当前迁移分支范围的变更。

- [x] **Step 4: 标记两份计划并提交验收**

```bash
git add apps/web/e2e/product-portal-family.spec.ts docs/superpowers/plans/2026-08-10-product-portal-family-migration.md docs/superpowers/plans/2026-08-10-home-linked-conversion-routes.md
git diff --cached --check
git commit -m "test(products): 验收原型产品页族"
```

- [x] **Step 5: 下一批进入元启平台子中心**

下一份计划从原型 `model → knowledge → agents → applications → skills → coding → governance` 开始；先检查现有 `/product/[slug]` 与独立旧页，再决定是使用显式页面还是类型化动态渲染。

已由 `2026-08-10-platform-center-family-migration.md` 完成七个中心总览页；后续进入各中心子页面，现有独立旧页继续保留到对应页面逐一核对。

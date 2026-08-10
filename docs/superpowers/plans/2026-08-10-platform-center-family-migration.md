# Platform Center Family Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将低保真原型的模型、知识、智能体、行业应用、技能、编程和安全七个元启平台中心总览页迁移到现有 Next.js 官网，继续保留原文、现有 `SiteShell` 与唯一 Agent 聊天入口。

**Architecture:** 七个中心使用显式 `/product/*` 路由覆盖当前动态 scaffold，并共享一份只表达原型真实重复结构的类型化内容模块和服务端渲染器。已有 `product-portal.css` 继续承载已批准的浅蓝画布、玻璃卡片、蓝紫 CTA 与 reduced-motion；本批不迁移各中心子页，也不替换现有 `/product/knowledge-agent`、`/product/video-agent` 等独立旧页。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、CSS、Vitest、Testing Library、Playwright。

---

## 已确认边界

- 内容基准：`/Users/brou/Downloads/华鲲官网首期低保真原型.html` 中以下七个页面：
  - `model`：579–609 行 → `/product/model`
  - `knowledge`：756–788 行 → `/product/knowledge`
  - `agents`：1193–1253 行 → `/product/agents`
  - `applications`：1298–1327 行 → `/product/applications`
  - `skills`：1465–1485 行 → `/product/skills`
  - `coding`：851–880 行 → `/product/coding`
  - `governance`：1560–1584 行 → `/product/governance`
- 上述 URL 已由产品总览与方案详情使用；本批将它们从 `/product/[slug]` scaffold 提升为显式 `live` 页面。
- 本批只迁移七个中心总览。模型资产、模型训练、知识指标、智能体分类、行业应用子页、技能分类和编程子页继续由动态 scaffold 或现有显式页承接，下一批再逐页迁移，不能在本批伪装为完成。
- 不使用旧 `product-content.ts` 或 `module-detail.tsx` 中的补写文案填充原型；原型没有的内容不新增。
- 不删除 `product-content.ts`、`module-detail.tsx`、`module-detail.css`，因为它们仍被尚未迁移的 `/product/[slug]` 模块页调用；待最后一个调用迁走后整体删除。
- 原型中的界面图、架构图继续保留原文素材槽位，不伪造截图。
- 不新增页面内聊天按钮、侧栏目录、返回条或运行时 HTML 解析。

## 文件职责

| 文件                                                                                               | 责任                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `apps/web/src/components/platform-center-content.ts`                                               | 七个中心的原型原文、正式 URL、类型和 slug 查询                |
| `apps/web/src/components/platform-center-content.test.ts`                                          | 锁定标题、摘要、标签、能力、流程、场景、子页链接与 CTA        |
| `apps/web/src/components/platform-center-detail.tsx`                                               | 渲染七个中心真实重复的 Hero、定位、能力、流程、业务场景与 CTA |
| `apps/web/src/components/platform-center-detail.test.tsx`                                          | 锁定七页结构、可选区块、链接和未知 slug 404                   |
| `apps/web/src/components/product-portal.css`                                                       | 延用门户视觉，并补充七中心共用响应式样式                      |
| `apps/web/src/app/product/{model,knowledge,agents,applications,skills,coding,governance}/page.tsx` | 七个显式页面入口与 metadata                                   |
| `apps/web/src/config/routes.ts`                                                                    | 将七个精确路由注册为 `live`，保留其余动态路由为 `scaffold`    |
| `apps/web/e2e/platform-center-family.spec.ts`                                                      | 七页状态、原文标题、内链、响应式和 shell Agent 验收           |

## Chunk 1: Content and route contracts

### Task 1: 锁定七个中心的原型内容

**Files:**

- Create: `apps/web/src/components/platform-center-content.test.ts`
- Create: `apps/web/src/components/platform-center-content.ts`

- [ ] **Step 1: 先写内容失败测试**

至少锁定七个 slug 与 Hero 原文：

```ts
expect(platformCenterSlugs).toStrictEqual([
  "model",
  "knowledge",
  "agents",
  "applications",
  "skills",
  "coding",
  "governance",
]);

expect(getPlatformCenter("model")?.hero.title).toBe(
  "企业模型工程，从资产管理到上线服务",
);
expect(getPlatformCenter("knowledge")?.hero.title).toBe(
  "企业知识库：让企业文档变成 AI 能用的知识",
);
expect(getPlatformCenter("agents")?.hero.title).toBe(
  "让企业拥有懂知识、懂业务、懂流程的 AI 助手",
);
expect(getPlatformCenter("applications")?.hero.title).toBe(
  "成熟业务 AI 应用，拿来即用",
);
expect(getPlatformCenter("skills")?.hero.title).toBe(
  "可复用的业务技能，拿来即用",
);
expect(getPlatformCenter("coding")?.hero.title).toBe(
  "码多多：让智能编程走进企业日常开发",
);
expect(getPlatformCenter("governance")?.hero.title).toBe(
  "平台用得安全，权限管得清楚",
);
expect(getPlatformCenter("unknown")).toBeUndefined();
```

每页同时锁定原型实际存在的介绍、问题或能力卡、流程、业务价值、子页链接、素材槽位和 CTA 数量；可选区块不存在时保持 `undefined`，不填空对象。

- [ ] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/platform-center-content.test.ts
```

Expected: FAIL，内容模块尚不存在。

- [ ] **Step 3: 写最小类型化内容模块**

只建一个 `PlatformCenter` 类型，允许原型里确实缺失的区块为可选字段；不得创建插件系统、页面 DSL 或旧 `product-content.ts` 兼容适配器。所有 `data-page` 只转换为本计划已确认的语义 URL。

- [ ] **Step 4: 运行内容测试并确认 GREEN**

- [ ] **Step 5: 提交内容合同**

```bash
git add apps/web/src/components/platform-center-content.ts apps/web/src/components/platform-center-content.test.ts
git diff --cached --check
git commit -m "feat(centers): 锁定七个中心原型内容"
```

### Task 2: 注册七个显式中心路由

**Files:**

- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Create: `apps/web/src/app/product/model/page.tsx`
- Create: `apps/web/src/app/product/knowledge/page.tsx`
- Create: `apps/web/src/app/product/agents/page.tsx`
- Create: `apps/web/src/app/product/applications/page.tsx`
- Create: `apps/web/src/app/product/skills/page.tsx`
- Create: `apps/web/src/app/product/coding/page.tsx`
- Create: `apps/web/src/app/product/governance/page.tsx`

- [ ] **Step 1: 先更新路由失败测试**

在 `/product/[slug]` 前加入七个精确路由并断言：

```ts
for (const path of [
  "/product/model",
  "/product/knowledge",
  "/product/agents",
  "/product/applications",
  "/product/skills",
  "/product/coding",
  "/product/governance",
]) {
  expect(matchRoute(path)).toMatchObject({ path, status: "live" });
}
expect(matchRoute("/product/model-training")).toMatchObject({
  path: "/product/[slug]",
  status: "scaffold",
});
```

- [ ] **Step 2: 运行路由测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/route-files.test.ts
```

- [ ] **Step 3: 注册路由并创建最小页面入口**

七个 `page.tsx` 先从 `getPlatformCenter(slug)` 读取原型标题与 metadata；不得复制文案到页面文件。

- [ ] **Step 4: 运行路由测试并确认 GREEN**

- [ ] **Step 5: 提交路由合同**

```bash
git add apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/app/product/model apps/web/src/app/product/knowledge apps/web/src/app/product/agents apps/web/src/app/product/applications apps/web/src/app/product/skills apps/web/src/app/product/coding apps/web/src/app/product/governance
git diff --cached --check
git commit -m "feat(centers): 注册七个中心路由"
```

## Chunk 2: Shared center renderer

### Task 3: 用原型重复结构渲染七个中心

**Files:**

- Create: `apps/web/src/components/platform-center-detail.test.tsx`
- Create: `apps/web/src/components/platform-center-detail.tsx`
- Modify: `apps/web/src/components/product-portal.css`
- Modify: `apps/web/src/app/product/model/page.tsx`
- Modify: `apps/web/src/app/product/knowledge/page.tsx`
- Modify: `apps/web/src/app/product/agents/page.tsx`
- Modify: `apps/web/src/app/product/applications/page.tsx`
- Modify: `apps/web/src/app/product/skills/page.tsx`
- Modify: `apps/web/src/app/product/coding/page.tsx`
- Modify: `apps/web/src/app/product/governance/page.tsx`

- [ ] **Step 1: 写七页与未知 slug 失败测试**

每个中心必须覆盖：

- 唯一 H1、Hero 摘要、原型标签与两个 CTA。
- 原型实际存在的产品定位、问题、能力、流程和素材槽位；只对存在的区块断言。
- 原型业务价值和应用场景顺序。
- 所有中心与子页链接使用语义 URL。
- 页面内没有 `.floating-assistant`。
- 未知 slug 调用 `notFound()`，不回退到任意中心。

- [ ] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/platform-center-detail.test.tsx
```

- [ ] **Step 3: 实现最小共享服务端渲染器**

共享 Hero、Section heading、卡片、流程、场景与 CTA 这些七页原型中已存在的结构。使用普通条件渲染处理可选区块；不要再创建通用 Portal DSL，也不要给没有某区块的页面补文案。

- [ ] **Step 4: 扩展现有产品门户 CSS**

沿用 `product-portal.css` 的 token、按钮、卡片和素材槽位；只添加七中心需要的布局类。覆盖 900px、700px、无 `backdrop-filter` 与 `prefers-reduced-motion`。

- [ ] **Step 5: 替换七个最小页面入口并生成 metadata**

每页只传静态 slug：

```tsx
export default function ModelCenterPage() {
  return <PlatformCenterDetail slug="model" />;
}
```

- [ ] **Step 6: 运行内容、组件、路由、类型和 lint 测试**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/platform-center-content.test.ts src/components/platform-center-detail.test.tsx src/config/routes.test.ts src/config/route-files.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
```

- [ ] **Step 7: 提交七个中心页面**

```bash
git add apps/web/src/components/platform-center-detail.tsx apps/web/src/components/platform-center-detail.test.tsx apps/web/src/components/product-portal.css apps/web/src/app/product/model/page.tsx apps/web/src/app/product/knowledge/page.tsx apps/web/src/app/product/agents/page.tsx apps/web/src/app/product/applications/page.tsx apps/web/src/app/product/skills/page.tsx apps/web/src/app/product/coding/page.tsx apps/web/src/app/product/governance/page.tsx
git diff --cached --check
git commit -m "feat(centers): 迁移七个元启平台中心"
```

## Chunk 3: Browser and release gates

### Task 4: 完成七个中心浏览器验收

**Files:**

- Create: `apps/web/e2e/platform-center-family.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-10-platform-center-family-migration.md`
- Modify: `docs/superpowers/plans/2026-08-10-product-portal-family-migration.md`

- [ ] **Step 1: 写七页 E2E**

- 七个 URL 返回 200 并显示各自原型 H1。
- 七页内部链接不得为 404 或 5xx；尚未迁移的子页允许是明确 scaffold，但不能报错。
- 1440×1000、768×1024、390×844 无横向溢出。
- 桌面与移动端仍只有 shell 的一个 `.floating-assistant__launcher`，可打开和关闭码多多。
- 捕获 `/product/model`、`/product/agents`、`/product/coding` 的 1440 与 390 截图到 `artifacts/playwright/platform-centers/`。

- [ ] **Step 2: 运行完整 Web 门槛**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/platform-center-family.spec.ts e2e/product-portal-family.spec.ts e2e/home-reference-layout.spec.ts --workers=2
```

Expected: 所有必须门槛退出码为 0；Playwright 只允许声明过的 project-specific skip。若真实 `node:http` 测试因沙箱监听 `127.0.0.1` 报 `EPERM`，必须在获准的沙箱外重跑同一完整测试，不能改成跳过。

- [ ] **Step 3: 检查边界与旧动态页仍在使用的依赖**

```bash
rg -n "product-content|ModuleDetailPage|module-detail" apps/web/src
git diff --check
git status --short
git diff --name-only main...HEAD
```

Expected: 七个新显式路由不再经过 `ModuleDetailPage`；旧模块仍有真实调用，因此本批不删除相关文件。

- [ ] **Step 4: 标记计划并提交验收**

```bash
git add apps/web/e2e/platform-center-family.spec.ts docs/superpowers/plans/2026-08-10-platform-center-family-migration.md docs/superpowers/plans/2026-08-10-product-portal-family-migration.md
git diff --cached --check
git commit -m "test(centers): 验收七个元启平台中心"
```

- [ ] **Step 5: 下一批进入各中心子页面**

下一批按原型页面顺序迁移模型、知识、编程、智能体、应用、技能子页；先建立完整 URL 表并核对现有显式旧页，避免覆盖仍在使用的 `/product/knowledge-agent`、`/product/video-agent`、`/product/office-agent` 等页面。

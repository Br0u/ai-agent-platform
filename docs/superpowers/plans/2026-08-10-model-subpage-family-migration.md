# Model Subpage Family Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将低保真原型中的模型优化、任务中心、模型资产、模型训练、模型评估、数据准备和模型部署七个子页面迁移到现有 Next.js 官网，同时纠正原型智能体页面与现有独立产品的路由冲突。

**Architecture:** 七个模型子页继续使用当前产品门户的浅蓝画布、玻璃卡片、流程、表格、业务场景和 CTA 视觉，不再创建第二套渲染器。把当前页面结构类型移到独立类型文件，现有七中心和新的模型子页各自保留独立内容模块，并由同一个 `PlatformPageDetail` 服务端渲染器输出；七中心总览保留展示型节奏，产品详情默认启用独立的高密度布局，在桌面并排展示演示与能力矩阵、移动端折回单栏，避免所有页面都套用首页式大间距。模型任务、资产、训练和评估页真实存在的区块内演示使用一个可选 `demo` 字段复用现有对话面板。七个精确路由覆盖 `/product/[slug]` scaffold。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、CSS、Vitest、Testing Library、Playwright。

---

## 已确认边界与完整剩余 URL 表

- 内容基准：`/Users/brou/Downloads/华鲲官网首期低保真原型.html`。
- 当前批次只实现七个模型子页：

| 原型 ID              |  原型行 | 正式 URL                      | H1                                         |
| -------------------- | ------: | ----------------------------- | ------------------------------------------ |
| `model-optimization` |     501 | `/product/model-optimization` | 模型优化：数据、训练、评估，让模型更懂业务 |
| `model-task-center`  | 502–578 | `/product/model-task-center`  | 任务中心：模型任务统一管理                 |
| `model-assets`       | 610–647 | `/product/model-assets`       | 模型资产管理：让企业模型资产一条线管到底   |
| `model-training`     | 648–725 | `/product/model-training`     | 模型训练：让模型更贴合你的业务             |
| `model-evaluation`   | 726–742 | `/product/model-evaluation`   | 模型评估：效果好不好，用数据说话           |
| `model-data`         | 809–824 | `/product/model-data`         | 数据准备：训练效果从数据开始               |
| `model-deploy`       | 825–850 | `/product/model-deploy`       | 模型部署：让模型变成可调用的服务           |

- 后续批次使用以下已审计 URL，不再沿用早期计划中会覆盖正式产品的映射：

| 页面族   | 原型 ID → 正式 URL                                                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 能力底座 | `agent-knowledge-base` → `/product/agent-knowledge-base`；`knowledge-metrics` → `/product/knowledge-metrics`                                                                           |
| 编程     | `coding-project` → `/product/coding-project`；`coding-session` → `/product/coding-session`；`coding-mobile` → `/product/coding-mobile`；`coding-standard` → `/product/coding-standard` |
| 智能体   | `agent-knowledge` → `/product/agent-knowledge`；`agent-data` → `/product/data-agent`；`agent-video` → `/product/agent-video`；`agent-orchestration` → `/product/agent-orchestration`   |
| 行业应用 | `app-writing` → `/product/app-writing`；`app-bidding` → `/product/app-bidding`；`app-contract` → `/product/app-contract`                                                               |
| 技能     | `skills-programming` → `/product/skills-programming`；`skills-application` → `/product/skills-application`；`skills-office` → `/product/skills-office`                                 |

- `/product/knowledge-agent` 是现有“智能导办一体机”，`/product/video-agent` 是现有“视觉检索一体机”，`/product/office-agent` 是现有办公智能体矩阵；三者不是原型同名能力页，本轮及后续均保留，不覆盖、不做兼容跳转。
- `/product/hci` 与 `/product/tgdataxai` 也保持现状，它们不在原型 43 个页面的替换范围。
- 当前已迁移的首页和智能体中心中，指向原型企业知识助手、视频理解助手的链接改到新语义 URL；现有导航中“智能导办一体机”“视觉检索一体机”的链接保持原 URL。
- 原型文案逐字迁移；只转换 `data-page` 为上述正式 URL。缺失图片继续使用原文素材槽位，不伪造截图。
- 继续复用 `SiteShell` 与唯一 Agent 聊天入口；不新增页面内聊天、侧栏、返回条、HTML 运行时解析或旧路径兼容层。

## 文件职责

| 文件                                                                                                                                            | 责任                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `apps/web/src/components/platform-page-types.ts`                                                                                                | 当前中心与后续子页共同使用的唯一页面结构类型            |
| `apps/web/src/components/platform-center-content.ts`                                                                                            | 只保留七个中心总览内容与查询                            |
| `apps/web/src/components/model-subpage-content.ts`                                                                                              | 七个模型子页的原型原文、正式 URL 与 slug 查询           |
| `apps/web/src/components/model-subpage-content.test.ts`                                                                                         | 锁定七页标题、区块、卡片、流程、素材、链接和 CTA        |
| `apps/web/src/components/platform-center-detail.tsx`                                                                                            | 导出通用 `PlatformPageDetail`，同时保留中心 slug 包装器 |
| `apps/web/src/components/model-subpage-family.test.tsx`                                                                                         | 验证七页共享渲染结果、可选区块、链接与聊天边界          |
| `apps/web/src/components/product-portal.css`                                                                                                    | 仅在浏览器证据显示真实缺口时补模型子页布局，不预写样式  |
| `apps/web/src/app/product/{model-optimization,model-task-center,model-assets,model-training,model-evaluation,model-data,model-deploy}/page.tsx` | 七个显式页面与 metadata                                 |
| `apps/web/src/config/routes.ts`                                                                                                                 | 将七个精确路由注册为 `live`                             |
| `apps/web/e2e/model-subpage-family.spec.ts`                                                                                                     | 七页状态、内链、响应式、聊天入口与截图验收              |

## Chunk 1: Route audit and shared page contract

### Task 1: 纠正原型智能体链接与现有独立产品冲突

**Files:**

- Modify: `apps/web/src/components/platform-center-content.test.ts`
- Modify: `apps/web/src/components/platform-center-content.ts`
- Modify: `apps/web/src/components/home-content.test.ts`
- Modify: `apps/web/src/components/home-content.ts`

- [x] **Step 1: 先更新失败测试**

锁定原型企业知识助手和视频理解助手的新 URL：

```ts
expect(agentLinks).toContain("/product/agent-knowledge");
expect(agentLinks).toContain("/product/agent-video");
expect(agentLinks).not.toContain("/product/knowledge-agent");
expect(agentLinks).not.toContain("/product/video-agent");
```

导航配置与测试不修改，因为现有“智能导办一体机”“视觉检索一体机”仍使用旧 URL。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/platform-center-content.test.ts src/components/home-content.test.ts
```

- [x] **Step 3: 只替换原型内容模块中的相关目标 URL**

不新增重定向或兼容路由；动态 `/product/[slug]` 在对应页面迁移前继续提供明确 scaffold。

- [x] **Step 4: 运行测试并确认 GREEN**

- [x] **Step 5: 提交路由冲突修正**

```bash
git add apps/web/src/components/platform-center-content.ts apps/web/src/components/platform-center-content.test.ts apps/web/src/components/home-content.ts apps/web/src/components/home-content.test.ts
git diff --cached --check
git commit -m "fix(products): 区分原型助手与现有一体机路由"
```

### Task 2: 提取现有共享页面类型

**Files:**

- Create: `apps/web/src/components/platform-page-types.ts`
- Modify: `apps/web/src/components/platform-center-content.ts`
- Modify: `apps/web/src/components/platform-center-detail.tsx`

- [x] **Step 1: 运行现有中心内容与渲染测试作为重构基线**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/platform-center-content.test.ts src/components/platform-center-detail.test.tsx
```

- [x] **Step 2: 把 `PlatformCenter` 结构原样移动为 `PlatformPage`**

只移动类型，不改变字段、不新增 DSL。`slug` 改为 `string`，中心内容继续通过 `platformCenterSlugs` 锁定恰好七个总览页。

- [x] **Step 3: 让中心内容与渲染器改用 `PlatformPage`**

- [x] **Step 4: 运行同一测试与 typecheck，确认行为不变**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/platform-center-content.test.ts src/components/platform-center-detail.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
```

- [x] **Step 5: 提交共享类型重构**

```bash
git add apps/web/src/components/platform-page-types.ts apps/web/src/components/platform-center-content.ts apps/web/src/components/platform-center-detail.tsx
git diff --cached --check
git commit -m "refactor(products): 共享平台页面结构类型"
```

## Chunk 2: Model content and routes

### Task 3: 锁定七个模型子页原型内容

**Files:**

- Create: `apps/web/src/components/model-subpage-content.test.ts`
- Create: `apps/web/src/components/model-subpage-content.ts`

- [x] **Step 1: 先写内容失败测试**

至少锁定七个 slug、H1 和未知 slug：

```ts
expect(modelSubpageSlugs).toStrictEqual([
  "model-optimization",
  "model-task-center",
  "model-assets",
  "model-training",
  "model-evaluation",
  "model-data",
  "model-deploy",
]);
expect(getModelSubpage("model-training")?.hero.title).toBe(
  "模型训练：让模型更贴合你的业务",
);
expect(getModelSubpage("unknown")).toBeUndefined();
```

逐页锁定原型实际存在的介绍、问题、能力、锚点、流程、表格、素材槽位、区块内演示、业务场景、子页链接与 CTA 数量；不存在的业务场景或 CTA 保持 `undefined`。原型事实为：任务中心、资产、训练、评估页分别含 4、3、4、3 个区块内演示；模型评估页没有最终 CTA。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/model-subpage-content.test.ts
```

- [x] **Step 3: 用 `PlatformPage` 写最小内容模块**

不引用旧 `product-content.ts` 的补写文案，不引入页面 DSL、插件系统或运行时 HTML 解析。

- [x] **Step 4: 运行内容测试与 typecheck 并确认 GREEN**

- [x] **Step 5: 提交内容合同**

```bash
git add apps/web/src/components/model-subpage-content.ts apps/web/src/components/model-subpage-content.test.ts
git diff --cached --check
git commit -m "feat(models): 锁定七个模型子页原型内容"
```

### Task 4: 注册七个模型子页并复用共享渲染器

**Files:**

- Modify: `apps/web/src/config/routes.test.ts`
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/components/platform-center-detail.tsx`
- Create: `apps/web/src/components/model-subpage-family.test.tsx`
- Create: `apps/web/src/app/product/model-optimization/page.tsx`
- Create: `apps/web/src/app/product/model-task-center/page.tsx`
- Create: `apps/web/src/app/product/model-assets/page.tsx`
- Create: `apps/web/src/app/product/model-training/page.tsx`
- Create: `apps/web/src/app/product/model-evaluation/page.tsx`
- Create: `apps/web/src/app/product/model-data/page.tsx`
- Create: `apps/web/src/app/product/model-deploy/page.tsx`
- Modify only if required by a failing browser/layout check: `apps/web/src/components/product-portal.css`

- [x] **Step 1: 先写路由与渲染失败测试**

七个 URL 必须匹配自身 `live` 路由；`/product/model-unknown` 仍匹配 `/product/[slug]` scaffold。七页渲染测试锁定唯一 H1、原型区块顺序、素材槽位、语义链接、可选业务区块和页面内无 `.floating-assistant`。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/route-files.test.ts src/components/model-subpage-family.test.tsx
```

- [x] **Step 3: 从现有渲染器导出 `PlatformPageDetail` 并支持真实区块演示**

`PlatformCenterDetail` 继续只负责中心 slug 查询和未知 slug `notFound()`；`PlatformPageDetail` 只接收已确认的 `PlatformPage` 数据并渲染现有结构。仅给 `PlatformPage.sections[number]` 增加原型真实需要的可选 `demo`，复用现有 `.product-portal-demo`；没有演示的区块不渲染空容器。

- [x] **Step 4: 注册路由并创建七个静态页面**

每个 `page.tsx` 只读取自己的静态 slug、生成 metadata 并传给 `PlatformPageDetail`，不得复制文案。

- [x] **Step 5: 运行内容、组件、路由、类型和 lint 测试**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/model-subpage-content.test.ts src/components/model-subpage-family.test.tsx src/components/platform-center-content.test.ts src/components/platform-center-detail.test.tsx src/config/routes.test.ts src/config/route-files.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
```

- [x] **Step 6: 提交七个模型子页**

```bash
git add apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/components/platform-center-detail.tsx apps/web/src/components/model-subpage-family.test.tsx apps/web/src/components/product-portal.css apps/web/src/app/product/model-optimization apps/web/src/app/product/model-task-center apps/web/src/app/product/model-assets apps/web/src/app/product/model-training apps/web/src/app/product/model-evaluation apps/web/src/app/product/model-data apps/web/src/app/product/model-deploy
git diff --cached --check
git commit -m "feat(models): 迁移七个模型子页面"
```

## Chunk 3: Browser and release gates

### Task 5: 完成模型子页浏览器验收

**Files:**

- Create: `apps/web/e2e/model-subpage-family.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-10-model-subpage-family-migration.md`
- Modify: `docs/superpowers/plans/2026-08-10-platform-center-family-migration.md`

- [x] **Step 1: 写七页 E2E**

- 七个 URL 返回 200 并显示原型 H1。
- 七页内部链接不得为 404 或 5xx；后续未迁移子页允许明确 scaffold。
- 1440×1000、768×1024、390×844 无横向溢出。
- 桌面与移动端仍只有 shell 的一个 `.floating-assistant__launcher`，可打开和关闭码多多。
- 捕获 `/product/model-assets`、`/product/model-training`、`/product/model-deploy` 的 1440 与 390 截图到 `artifacts/playwright/model-subpages/`。

- [x] **Step 2: 运行完整 Web 门槛**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/model-subpage-family.spec.ts e2e/platform-center-family.spec.ts e2e/product-portal-family.spec.ts e2e/home-reference-layout.spec.ts --workers=2
```

若真实 `node:http` 或 Playwright WebServer 因沙箱监听 `127.0.0.1` 报 `EPERM`，必须在获准的沙箱外重跑同一完整命令，不能跳过。

- [x] **Step 3: 检查动态页与旧依赖边界**

```bash
rg -n "product-content|ModuleDetailPage|module-detail" apps/web/src
git diff --check
git status --short
```

七个模型子页不得再经过 `ModuleDetailPage`；其他尚未迁移页面仍在使用旧模块时不删除相关文件。

- [x] **Step 4: 标记计划并提交验收**

```bash
git add apps/web/e2e/model-subpage-family.spec.ts docs/superpowers/plans/2026-08-10-model-subpage-family-migration.md docs/superpowers/plans/2026-08-10-platform-center-family-migration.md
git diff --cached --check
git commit -m "test(models): 验收七个模型子页面"
```

- [x] **Step 5: 下一批进入能力底座与编程子页面**

先迁移 `/product/agent-knowledge-base`、`/product/knowledge-metrics`，再迁移四个编程子页；继续保留现有独立一体机和办公智能体页面。

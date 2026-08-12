# Application Subpage Family Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将低保真原型中的通用文本写作、投标智能助手和合同智能审查三页逐字迁移到现有 Next.js 官网，保持高信息密度、现有站点外壳和唯一 Agent 聊天入口。

**Architecture:** 三页新增独立类型化内容模块，复用现有 `PlatformPage` 和默认 dense 的 `PlatformPageDetail`。原型图片的可见 alt/槽位语义进入现有 visual 字段，不复制仓库外图片、不新增图片管线；聊天演示进入 demo，能力/流程/业务场景进入现有 cards/groups/flow/business，最终转化区进入 cta。原型的 trace groups 没有 tag/lead，唯一共享改动是把现有 `group.tag` / `group.lead` 改为可选并条件渲染，避免伪造空胶囊和空段落；不改变既有非空 group。三个精确 App Router 页面覆盖动态 scaffold，不新增页面 DSL 或兼容层。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、CSS、Vitest、Testing Library、Playwright。

---

## 已确认边界与路由

| 原型 ID | 原型行 | 正式 URL | H1 | 正文 sections |
| --- | ---: | --- | --- | ---: |
| `app-writing` | 1328–1368 | `/product/app-writing` | 通用文本写作：一句话起稿，AI 帮你写完全文 | 5 |
| `app-bidding` | 1369–1414 | `/product/app-bidding` | 投标智能助手：把投标从「加班赶」变成「有条理」 | 4 |
| `app-contract` | 1415–1464 | `/product/app-contract` | 合同智能审查：条款逐条核对，风险早发现 | 4 |

- 三页均有 business 和独立最终 CTA；CTA 保留“申请体验 / 商务咨询 / 返回行业应用中心”。
- 原型自页链接转换为正式 URL + hash；9 个唯一目标为 `writing-{caps,flow,trace}`、`bidding-{workflow,caps,trace}`、`contract-{workflow,caps,trace}`。`bidding-trace` 与 `contract-trace` 保留为能力保障 group 的 DOM id，不虚构额外顶层 section。
- `document-intelligence` 只映射到现站真实目标 `/solutions#knowledge`，`case-pending-enterprise-knowledge` 映射到 `/cases`，返回中心映射 `/product/applications`。
- 不修改 `SiteShell`、`FloatingChatWidget`、导航结构或聊天接口；共享类型/渲染器只做 `group.tag` / `group.lead` 可选与条件渲染这一处根因修复。不复制仓库外 JPG，不伪造截图、案例或原型未出现的内容。

## 文件职责

| 文件 | 责任 |
| --- | --- |
| `apps/web/src/components/application-subpage-content.ts` | 三页完整原型原文、slug、正式 URL 与查询 |
| `apps/web/src/components/application-subpage-content.test.ts` | 用完整对象字面量锁定全部文案、视觉标签、演示、锚点和链接 |
| `apps/web/src/components/platform-page-types.ts` / `platform-center-detail.tsx` / `platform-center-detail.test.tsx` | 允许原型没有 tag/lead 的 group，不渲染空占位 |
| `apps/web/src/components/application-subpage-family.test.tsx` | 验证真实薄页面、dense 渲染、区块、CTA、锚点和聊天边界 |
| `apps/web/src/app/product/{app-writing,app-bidding,app-contract}/page.tsx` | 三个薄页面与 metadata |
| `apps/web/src/config/routes.ts` / `routes.test.ts` | 三个精确 public/live 路由 |
| `apps/web/e2e/application-subpage-family.spec.ts` | 状态、内链/hash、响应式、Agent 和截图验收 |

## Chunk 1: Exact content contract

### Task 1: 锁定三页全部原型内容

**Files:**

- Create: `apps/web/src/components/application-subpage-content.test.ts`
- Create: `apps/web/src/components/application-subpage-content.ts`
- Modify: `apps/web/src/components/platform-page-types.ts`
- Modify: `apps/web/src/components/platform-center-detail.tsx`
- Modify: `apps/web/src/components/platform-center-detail.test.tsx`

- [x] **Step 1: 先写完整对象失败测试**

导出 slug 顺序严格为 `app-writing`、`app-bidding`、`app-contract`；三页各使用完整对象字面量 `toStrictEqual`，逐字覆盖 Hero eyebrow/title/lead/tags/actions/visual、所有 section/group/card/table/flow/visual、business 和 cta 的字段与顺序。不得使用快照或部分匹配。

特别锁定全部原型图片 alt/槽位文字、聊天 header/messages/input placeholder/`发送`，包括：

- 写作：`请输入你的写作要求…`、`通用文本写作助手`、`已上传 5 份相关文件`；
- 投标：`请输入你的问题…`、`智能投标助手`、`识别 3 个得分关键点与 2 处潜在风险`、`预计约 122 页`；
- 合同：`请输入你的审查问题…`、`合同智能审查助手`、`检测 19 处合同风险：常规 4 处、次要 12 处、重要 3 处`。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/application-subpage-content.test.ts
```

- [x] **Step 3: 用现有 `PlatformPage` 实现最小内容模块**

使用 `] as const satisfies readonly PlatformPage[]`，查询函数显式返回 `PlatformPage | undefined`。写作恰好 5 个普通 sections，投标与合同各 4 个；三页都有 business 与 cta。原型的 `bidding-trace`、`contract-trace` 使用现有 groups.id，省略原型不存在的 tag/lead；先在共享渲染器测试中证明无 tag/lead 的 group 不输出 `.product-portal-tag` 或直属空段落，再将这两个字段改为可选并条件渲染。图片只把 alt/可见语义放入 visual，不新增资源字段或复制图片。

- [x] **Step 4: 运行 GREEN 与静态门槛**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/application-subpage-content.test.ts
pnpm --filter @ai-agent-platform/web exec vitest run src/components/platform-center-detail.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
```

- [x] **Step 5: 提交内容合同**

```bash
git add apps/web/src/components/application-subpage-content.ts apps/web/src/components/application-subpage-content.test.ts apps/web/src/components/platform-page-types.ts apps/web/src/components/platform-center-detail.tsx apps/web/src/components/platform-center-detail.test.tsx
git diff --cached --check
git commit -m "feat(applications): 锁定三个行业应用子页原型内容"
```

## Chunk 2: Explicit routes and dense rendering

### Task 2: 注册三页并复用高密度详情渲染器

**Files:**

- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Create: `apps/web/src/components/application-subpage-family.test.tsx`
- Create: `apps/web/src/app/product/app-writing/page.tsx`
- Create: `apps/web/src/app/product/app-bidding/page.tsx`
- Create: `apps/web/src/app/product/app-contract/page.tsx`

- [x] **Step 1: 写路由、真实页面接线与渲染失败测试**

路由测试在 `/product/[slug]` 前按上述顺序注册三个精确 public/live URL，并同步 `requiredRoutes`；`/product/app-unknown` 仍匹配动态 scaffold。组件测试表驱动导入三个真实 Page 默认导出与 metadata，断言固定 slug 接线、唯一精确 H1、5/4/4 个普通 sections、business 与 CTA、9 个 href + DOM target、关键 demo/visual/正式链接、默认 dense、页面内部无 `.floating-assistant`；metadata 明确断言 `title === page.hero.title`、`description === page.hero.lead`。微型 UI 文字必须限定在 `platform-page-demo` 内查询。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/route-files.test.ts src/components/application-subpage-family.test.tsx
```

- [x] **Step 3: 注册路由并创建三个薄页面入口**

路由标题分别为 `通用文本写作`、`投标智能助手`、`合同智能审查`。每个页面只做固定 slug 查询、metadata title/description 和 `<PlatformPageDetail page={page} />`；不复制正文，不传 `dense={false}`，不新增页面内聊天入口。

- [x] **Step 4: 运行本批和共享回归**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/application-subpage-content.test.ts src/components/application-subpage-family.test.tsx src/components/agent-subpage-family.test.tsx src/components/coding-subpage-family.test.tsx src/components/capability-foundation-family.test.tsx src/components/model-subpage-family.test.tsx src/components/platform-center-detail.test.tsx src/config/routes.test.ts src/config/route-files.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
```

- [x] **Step 5: 提交路由与页面**

```bash
git add apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/components/application-subpage-family.test.tsx apps/web/src/app/product/app-writing apps/web/src/app/product/app-bidding apps/web/src/app/product/app-contract
git diff --cached --check
git commit -m "feat(applications): 迁移三个行业应用子页面"
```

## Chunk 3: Browser and release gates

### Task 3: 完成三页浏览器验收

**Files:**

- Create: `apps/web/e2e/application-subpage-family.spec.ts`
- Modify only on concrete browser failure: `apps/web/src/components/product-portal.css`
- Modify: `docs/superpowers/plans/2026-08-11-application-subpage-family-migration.md`

- [x] **Step 1: 写真实浏览器验收**

- 三页返回 200，显示精确唯一 H1、5/4/4 个普通 sections、business 和 CTA。
- main 内全部正式同源链接状态 `<400`；所有同源 hash 实际导航后 URL 保留 hash、目标存在且进入视口，包括跨页 `/solutions#knowledge`。
- reduced-motion 下在 1440×1000、768×1024、390×844 无横向溢出，标题、区块、视觉/演示完整可见。
- 三页 card grid 数量都必须 `> 0`，桌面保持多栏、390px 折回单栏。groups 容器数量按写作/投标/合同精确为 `0 / 1 / 1`，只对投标与合同实际存在的 groups 及其内部 card grid 做可见性和列数检查；`.platform-center-section--with-demo` 三页预期均为 `0`，不对不存在的 section demo frame 做列数循环。
- 三页 business demo 均存在；每页 `.product-portal-business` 恰好 1 个，桌面为双栏、390px 为单栏。所有集合先断言精确数量或 `> 0`，禁止空集合伪通过。
- 三页在 1440 与 390 均只有 shell 的一个 Agent launcher，可打开和关闭码多多，页面内无重复入口。
- 捕获三页 1440 与 390 全页截图到 `artifacts/playwright/application-subpages/`；截图前删除旧文件并断言 200、精确 H1与 fonts.ready。

- [x] **Step 2: build 后运行本批 E2E**

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/application-subpage-family.spec.ts --project=desktop
```

若有布局失败，只做最小 CSS 根因修复，重新 build 并重跑本批；共享 CSS 修改后重跑 agent、coding、capability-foundation、model desktop E2E；若修改非 dense 选择器，再同时重跑 product-portal-family 与 platform-center desktop E2E。

- [x] **Step 3: 运行完整 Web 门槛**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/application-subpage-family.spec.ts --project=desktop
```

- [x] **Step 4: 范围检查并提交验收**

```bash
git status --short
git diff --name-only ddf6f7d...HEAD
git add apps/web/e2e/application-subpage-family.spec.ts docs/superpowers/plans/2026-08-11-application-subpage-family-migration.md
# 仅当浏览器 RED 实际触发 CSS 修复时再执行：
git add apps/web/src/components/product-portal.css
git diff --cached --check
git commit -m "test(applications): 验收三个行业应用子页面"
```

## 验收定义

1. 原型 1328–1464 行三页的全部可见文案、顺序、视觉标签、演示和链接通过完整内容合同。
2. 三个新语义路由为 live，9 个自页锚点和全部正式内链真实可达，动态 scaffold 保留。
3. 三页保持产品详情应有的信息密度，桌面多栏、移动端单栏。
4. `SiteShell`、`FloatingChatWidget` 和 Agent 行为未修改，页面内没有第二个聊天入口。
5. 三档响应式、reduced-motion、完整 Web 门槛和本批 E2E 通过。

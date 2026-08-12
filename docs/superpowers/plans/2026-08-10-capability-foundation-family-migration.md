# Capability Foundation Family Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将低保真原型中的能力底座总览与数据源和指标两个页面迁移到现有 Next.js 官网，逐字保留内容并沿用高密度产品详情布局、现有站点外壳和唯一 Agent 聊天入口。

**Architecture:** 两页新增独立的类型化内容模块，继续复用现有 `PlatformPage` 与 `PlatformPageDetail`；两个显式 App Router 页面覆盖动态 scaffold。默认使用当前产品详情的 `platform-center--dense` 布局，不新增页面框架、运行时 HTML 解析、兼容路由或聊天组件；只有浏览器验收证明现有 CSS 不足时才做最小样式调整。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、CSS、Vitest、Testing Library、Playwright。

---

## 已确认边界与路由

- 内容基准：`/Users/brou/Downloads/华鲲官网首期低保真原型.html`。
- 本批只迁移：
  - `agent-knowledge-base`（743–755 行）→ `/product/agent-knowledge-base`
  - `knowledge-metrics`（789–808 行）→ `/product/knowledge-metrics`
- 已迁移的 `/product/knowledge` 企业知识库保持现状，不重复实现。
- 原型链接只做正式 URL 转换：
  - `knowledge` → `/product/knowledge`
  - `knowledge-metrics` → `/product/knowledge-metrics`
  - `agent-knowledge` → `/product/agent-knowledge`
  - `agent-data` → `/product/data-agent`
  - `applications` → `/product/applications`
  - `data-insight` 方案 → `/solutions/finance-data`（正式方案页没有原型中的场景锚点，不添加无效 hash）
  - `trial` → `/trial`
  - `contact` 保留原型咨询主题为查询参数。
- 原型素材槽位原文保留，不伪造界面截图。
- 不修改 `SiteShell`、`FloatingChatWidget`、聊天接口、导航或现有独立产品页。

## 文件职责

| 文件 | 责任 |
| --- | --- |
| `apps/web/src/components/capability-foundation-content.ts` | 两页原型原文、正式 URL、slug 列表和查询 |
| `apps/web/src/components/capability-foundation-content.test.ts` | 锁定标题、顺序、卡片、素材槽位、链接与 CTA |
| `apps/web/src/components/capability-foundation-family.test.tsx` | 验证共享渲染、高密度布局和聊天边界 |
| `apps/web/src/app/product/agent-knowledge-base/page.tsx` | 能力底座显式页面和 metadata |
| `apps/web/src/app/product/knowledge-metrics/page.tsx` | 数据源与指标显式页面和 metadata |
| `apps/web/src/config/routes.ts` | 将两个精确路由注册为 `live` |
| `apps/web/src/config/routes.test.ts` | 锁定精确路由优先于动态 scaffold |
| `apps/web/e2e/capability-foundation-family.spec.ts` | 两页状态、内链、响应式、密度和 Agent 验收 |

## Chunk 1: Content contract

### Task 1: 锁定两页原型内容

**Files:**

- Create: `apps/web/src/components/capability-foundation-content.test.ts`
- Create: `apps/web/src/components/capability-foundation-content.ts`

- [x] **Step 1: 先写内容失败测试**

测试至少精确锁定：

```ts
expect(capabilityFoundationSlugs).toStrictEqual([
  "agent-knowledge-base",
  "knowledge-metrics",
]);
expect(getCapabilityFoundation("agent-knowledge-base")?.hero.title).toBe(
  "能力底座：让智能体懂知识、懂数据",
);
expect(getCapabilityFoundation("knowledge-metrics")?.hero.title).toBe(
  "数据源与指标：让业务数据能被 AI 直接问数",
);
expect(getCapabilityFoundation("unknown")).toBeUndefined();
```

对 `getCapabilityFoundation("agent-knowledge-base")` 与 `getCapabilityFoundation("knowledge-metrics")` 使用完整对象字面量 `toStrictEqual`，逐字锁定每个字段：Hero 眉题、标题、摘要、标签、两个 CTA 的顺序与精确 href、素材槽位；每个 section 的 eyebrow、标题、lead、正文、tone、素材；所有 card 的标题、描述、points、素材、action 文案与 href；结尾 CTA 的标题、说明、按钮顺序和精确 href。能力底座页恰好 3 个内容区块；数据源与指标页恰好 4 个内容区块。测试字面量必须逐项来自原型 743–755、789–808 行，不使用快照，不得从旧 `product-content.ts` 补写内容。

特别锁定下列容易遗漏的原文与链接：

```ts
expect(getCapabilityFoundation("agent-knowledge-base")?.sections[0]).toStrictEqual({
  eyebrow: "01｜它是什么",
  title: "智能体「懂业务」的底气，来自知识与数据",
  lead: "助手不是空有模型，它依赖企业自己的知识与数据。",
  body: "能力底座由两条线组成：知识线把制度、产品资料、技术文档加工成 AI 可检索、可问答的知识；数据线把企业数据库、表格接入平台并开发成统一指标。知识让回答有依据，数据让问数有结果，共同支撑知识智能体与数据智能体。",
  visual: "知识线 + 数据线 → 智能体 关系示意图素材槽位",
});

expect(getCapabilityFoundation("knowledge-metrics")?.sections[3]).toStrictEqual({
  eyebrow: "04｜价值",
  title: "能带来什么",
  cards: [
    {
      title: "查数不排队",
      points: [
        "业务人员随问随答，不依赖提数排期",
        "从等报表到实时问数，决策更及时",
      ],
    },
    {
      title: "口径统一可信",
      points: [
        "指标口径固化，跨部门理解一致",
        "数据查询权限可控，合规有保障",
      ],
    },
  ],
  actions: [
    { label: "查看数据问答与分析方案 →", href: "/solutions/finance-data" },
  ],
});
```

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/capability-foundation-content.test.ts
```

Expected: FAIL，因为内容模块尚不存在。

- [x] **Step 3: 用现有 `PlatformPage` 写最小内容模块**

两页均使用 `satisfies readonly PlatformPage[]`。能力底座页第二节使用 `tone: "soft"`；每个素材槽位写入对应 card 或 section 的 `visual`；原型列表使用 `points`；所有按钮转换为上文确认的 URL。不要修改 `PlatformPage` 类型或共享渲染器，除非现有类型确实无法表达原型内容。

- [x] **Step 4: 运行内容测试与 typecheck 并确认 GREEN**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/capability-foundation-content.test.ts
pnpm --filter @ai-agent-platform/web typecheck
```

- [x] **Step 5: 提交内容合同**

```bash
git add apps/web/src/components/capability-foundation-content.ts apps/web/src/components/capability-foundation-content.test.ts
git diff --cached --check
git commit -m "feat(foundations): 锁定能力底座原型内容"
```

## Chunk 2: Routes and rendering

### Task 2: 注册两页并复用高密度详情渲染器

**Files:**

- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Create: `apps/web/src/components/capability-foundation-family.test.tsx`
- Create: `apps/web/src/app/product/agent-knowledge-base/page.tsx`
- Create: `apps/web/src/app/product/knowledge-metrics/page.tsx`

- [x] **Step 1: 先写路由与渲染失败测试**

路由测试断言两个精确 URL 为 `live`，且 `/product/foundation-unknown` 仍匹配 `/product/[slug]` scaffold。组件测试遍历两页并断言：唯一 H1；section 数量与内容对象一致；素材槽位与语义链接存在；结尾 CTA 存在；`main` 带 `platform-center--dense`；页面内不存在 `.floating-assistant`。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/route-files.test.ts src/components/capability-foundation-family.test.tsx
```

- [x] **Step 3: 注册精确路由并创建两个静态页面**

每个 `page.tsx` 只读取自己的静态 slug、生成 metadata 并传给现有 `PlatformPageDetail`：

```tsx
const page = getCapabilityFoundation("knowledge-metrics")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function KnowledgeMetricsPage() {
  return <PlatformPageDetail page={page} />;
}
```

能力底座页面使用同一模式。不得复制文案到页面文件，不得设置 `dense={false}`。

- [x] **Step 4: 运行本批及共享回归测试**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/capability-foundation-content.test.ts src/components/capability-foundation-family.test.tsx src/components/model-subpage-family.test.tsx src/components/platform-center-detail.test.tsx src/config/routes.test.ts src/config/route-files.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
```

- [x] **Step 5: 提交路由与页面**

```bash
git add apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/components/capability-foundation-family.test.tsx apps/web/src/app/product/agent-knowledge-base apps/web/src/app/product/knowledge-metrics
git diff --cached --check
git commit -m "feat(foundations): 迁移能力底座产品页"
```

## Chunk 3: Browser and release gates

### Task 3: 完成两页浏览器验收

**Files:**

- Create: `apps/web/e2e/capability-foundation-family.spec.ts`
- Modify only if browser evidence proves necessary: `apps/web/src/components/product-portal.css`
- Modify: `docs/superpowers/plans/2026-08-10-capability-foundation-family-migration.md`

- [x] **Step 1: 写两页 E2E**

覆盖：

- 两个 URL 返回 200 并显示原型 H1。
- 页面内部链接没有 404 或 5xx；尚未迁移的智能体页允许明确 scaffold。
- 1440×1000、768×1024、390×844 无横向溢出。
- 两页默认存在 `main.platform-center--dense`，桌面卡片维持产品详情信息密度，移动端折回单栏。
- 桌面和移动端都只有 shell 的一个 `.floating-assistant__launcher`，能够打开与关闭码多多。
- 捕获两页 1440 与 390 全页截图到 `artifacts/playwright/capability-foundations/`。

- [x] **Step 2: 运行 E2E；只按失败证据调整现有 CSS**

E2E 的导航辅助函数必须先调用 `page.emulateMedia({ reducedMotion: "reduce" })`；桌面项目内显式切换 1440×1000、768×1024、390×844 三个 viewport，并在每个宽度验证 H1 与全部内容区块可见。内链请求统一断言状态码 `< 400`。

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/capability-foundation-family.spec.ts --project=desktop
```

Expected: PASS。若只存在布局缺口，最小修改 `product-portal.css`，重新 build 后重跑 E2E；不得新增专属设计系统或首页式大间距。

- [x] **Step 3: 运行完整 Web 门槛**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/capability-foundation-family.spec.ts --project=desktop
```

- [x] **Step 4: 检查范围并提交验收证据**

```bash
git status --short
git diff --name-only 683616f...HEAD
git add apps/web/src/components/product-portal.css apps/web/e2e/capability-foundation-family.spec.ts docs/superpowers/plans/2026-08-10-capability-foundation-family-migration.md
git diff --cached --check
git commit -m "test(foundations): 验收能力底座产品页"
```

Expected: 只包含本批内容、页面、路由、测试、必要的现有产品 CSS 和计划文档；不包含 `SiteShell`、聊天组件、管理端或现有独立产品页改动。

## 验收定义

1. 两页原型 743–755、789–808 行的全部可见文案和顺序通过内容合同测试。
2. 两个精确路由为 `live`，内部正式链接可达。
3. 两页默认使用高密度产品详情布局，不退回首页式展示节奏。
4. `SiteShell` 与 `FloatingChatWidget` 未修改，现有 Agent 聊天入口仍可用且只有一个。
5. 桌面、平板、移动端无横向溢出，reduced-motion 下内容完整可见。
6. 未新增运行时 HTML 解析、页面 DSL、兼容层、虚构素材或未在原型出现的文案。

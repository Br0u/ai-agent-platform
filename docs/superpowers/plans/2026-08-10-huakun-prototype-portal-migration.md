# Huakun Prototype to Portal Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的《华鲲官网首期低保真原型.html》页面内容、信息结构和已确认视觉方向分批迁移到现有 Next.js 门户，同时保留现有站点外壳、Agent 聊天能力和正式站已上线功能。

**Architecture:** 原型 HTML 仅作为内容与视觉基准，不在运行时解析，也不把其中的覆盖式 CSS/DOM 脚本复制进正式站。正式实现继续使用现有 App Router、类型化内容模块、语义化 React 服务端组件和页面局部 CSS；`SiteShell`、`AppShell` 与 `FloatingChatWidget` 原样复用。首页先作为端到端样板，第二个页面族完成后再提取真正重复的门户视觉组件。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、CSS、Framer Motion（仅现有聊天组件）、Vitest、Testing Library、Playwright。

---

## 已确认事实与实施边界

- 视觉与内容基准：`/Users/brou/Downloads/华鲲官网首期低保真原型.html`。
- 原型包含 43 个 `.page` 页面区块；首页内容位于该文件第 54–125 行，全站视觉覆盖层从第 3233 行开始，动画增强脚本从第 4357 行开始。
- 正式站首页当前由 `apps/web/src/app/page.tsx` 组合六个区域，内容来自 `apps/web/src/components/home-content.ts`，视觉来自 `apps/web/src/components/home.css`。
- 正式站已经通过 `apps/web/src/components/site-shell/site-shell.tsx` 挂载 `FloatingChatWidget`。迁移不得复制原型里的 `.float`，不得重新设计聊天入口，不得改聊天接口、状态或交互。
- 正式站全局 token 已存在于 `packages/ui/src/tokens.css`；首页另有局部 token。第一阶段不修改全局 token，避免影响管理端、登录页和客户控制台。
- 原型的 `partners`、`pricing`、`solution-detail` 明确写着“待后续确认”；正式站 `/pricing` 已是可用计算器。不得用原型占位页覆盖现有可用功能。
- 原型引用的部分正式图片不存在。迁移不得伪造客户案例、产品截图、联系方式或产品能力；缺失素材必须在发布前由用户提供或明确批准替代方案。
- 当前 `main` 工作区存在与本任务无关的修改。执行本计划前必须创建独立 worktree，不能在当前脏工作区直接实施，也不能使用 `git add -A`。

## 迁移原则

1. 内容以原型为准，逐字迁移；只允许把 `data-page` 交互转换成正式 URL，不自行润色文案。
2. 路由以正式站可读 URL 为准，不保留原型内部 ID 兼容层；新路由必须先通过下表的确认门槛。
3. 复用现有 `AppShell`、导航、页脚、Agent Provider 和聊天浮窗，不复制它们。
4. 首页先落地；公共抽象至少在第二个页面族验证重复后才创建。
5. 每个页面族独立完成内容合同、渲染、响应式、无障碍、浏览器验收后再迁移下一个页面族。
6. “待后续确认”的原型内容不等于已批准删除正式站能力；此类页面保持现状，等待内容确认。

## 全页面迁移对照表

状态说明：`直接迁移` 表示路由和内容边界清晰；`需确认` 表示正式 URL 或内容仍需用户确认；`保持现状` 表示原型只有占位内容，不能覆盖当前正式功能。

| # | 原型页面 ID | 建议正式入口 | 处理方式 | 状态 |
|---:|---|---|---|---|
| 1 | `home` | `/` | 用原型首页四区结构替换当前六区首页，保留正式站外壳与聊天入口 | 直接迁移 |
| 2 | `products` | `/product` | 产品总览页 | 直接迁移 |
| 3 | `key-products` | `/product/key-products` | 独立产品中心；是否保留独立路由需确认 | 需确认 |
| 4 | `mdd-2` | `/product/code-agent` | 映射现有码多多路由 | 直接迁移 |
| 5 | `aippt` | `/product/aippt` | 新增 AI PPT 产品页 | 需确认 |
| 6 | `aishrek` | `/product/aishrek` | 新增 AISHREK 产品页 | 直接迁移 |
| 7 | `model-optimization` | `/product/model-optimization` | 模型优化总览 | 需确认 |
| 8 | `model-task-center` | `/product/model-task-center` | 模型任务中心 | 需确认 |
| 9 | `model` | `/product/model-engineering` | 模型工程总览；使用语义化 slug | 需确认 |
| 10 | `model-assets` | `/product/model-assets` | 模型资产管理 | 需确认 |
| 11 | `model-training` | `/product/model-training` | 模型训练 | 需确认 |
| 12 | `model-evaluation` | `/product/model-evaluation` | 模型评估 | 需确认 |
| 13 | `agent-knowledge-base` | `/product/agent-knowledge-base` | 智能体能力底座 | 需确认 |
| 14 | `knowledge` | `/product/knowledge-base` | 映射现有 Knowledge Base 路由 | 直接迁移 |
| 15 | `knowledge-metrics` | `/product/knowledge-metrics` | 数据源与指标 | 需确认 |
| 16 | `model-data` | `/product/model-data` | 数据准备 | 需确认 |
| 17 | `model-deploy` | `/product/model-deploy` | 模型部署；不与部署文档混为同一路由 | 需确认 |
| 18 | `coding` | `/product/coding` | 平台内智能编程中心，与独立产品码多多区分 | 需确认 |
| 19 | `coding-project` | `/product/coding/project` | 项目管理 | 需确认 |
| 20 | `coding-session` | `/product/coding/session` | 会话管理 | 需确认 |
| 21 | `coding-mobile` | `/product/coding/mobile` | 移动接入 | 需确认 |
| 22 | `coding-standard` | `/product/coding/standard` | 编程规范 | 需确认 |
| 23 | `agents` | `/product/agents` | 智能体中心总览 | 需确认 |
| 24 | `agent-knowledge` | `/product/knowledge-agent` | 映射现有知识智能体路由 | 直接迁移 |
| 25 | `agent-data` | `/product/data-agent` | 映射现有占位路由并补齐内容 | 直接迁移 |
| 26 | `agent-video` | `/product/video-agent` | 映射现有视频智能体路由 | 直接迁移 |
| 27 | `agent-orchestration` | `/product/workflow` | 映射现有 Workflow 路由 | 直接迁移 |
| 28 | `applications` | `/product/applications` | 成熟业务应用总览 | 需确认 |
| 29 | `app-writing` | `/product/office-agent/writing` | 办公智能体子页 | 需确认 |
| 30 | `app-bidding` | `/product/office-agent/bidding` | 办公智能体子页 | 需确认 |
| 31 | `app-contract` | `/product/office-agent/contract` | 办公智能体子页 | 需确认 |
| 32 | `skills` | `/product/skills` | 技能中心总览；不并入 Agent 聊天 Skill 管理后台 | 需确认 |
| 33 | `skills-programming` | `/product/skills/programming` | 编程类技能 | 需确认 |
| 34 | `skills-application` | `/product/skills/application` | 应用类技能 | 需确认 |
| 35 | `skills-office` | `/product/skills/office` | 办公类技能 | 需确认 |
| 36 | `governance` | `/product/governance` | 平台治理能力 | 需确认 |
| 37 | `solutions` | `/solutions` | 解决方案总览 | 直接迁移 |
| 38 | `solution-detail` | `/solutions/[slug]` | 使用原型动态方案内容创建独立详情路由；静态占位壳不能上线 | 直接迁移 |
| 39 | `downloads` | `/downloads` | 替换当前 placeholder 前必须确认下载资源、权限和真实文件 | 需确认 |
| 40 | `partners` | `/partners` | 原型只有“待确认”，当前不新增空正式页 | 保持现状 |
| 41 | `pricing` | `/pricing` | 保留当前可用价格计算器，原型占位不覆盖 | 保持现状 |
| 42 | `contact` | `/contact` | 保留价格查询参数能力，替换页面展示内容 | 直接迁移 |
| 43 | `trial` | `/trial` | 保留原型独立体验申请页面 | 直接迁移 |

## 公共组件清单

### 直接复用且不修改

| 现有组件 | 路径 | 迁移职责 |
|---|---|---|
| `AppShell` | `packages/ui/src/app-shell.tsx` | 品牌头部、门户导航、移动导航和页脚 |
| `SiteShell` | `apps/web/src/components/site-shell/site-shell.tsx` | 路由外壳、Agent Provider、页面切换动画 |
| `FloatingChatWidget` | `apps/web/src/components/ui/floating-chat-widget-shadcnui.tsx` | 现有 Agent 聊天入口与浮层，禁止重做 |
| `PortalNavigationLink` | `apps/web/src/components/site-shell/portal-navigation-link.tsx` | 门户导航跳转和激活态 |
| `HomeRevealObserver` | `apps/web/src/components/home-reveal.tsx` | 首页渐进式滚动出现，继续复用其 reduced-motion 和无 API 回退 |
| `HomeIcon` | `apps/web/src/components/home-icon.tsx` | 原型中可由现有 Lucide 图标表达的能力图标 |

### 首页阶段沿用的页面组件边界

| 组件 | 所在文件 | 对应原型区块 |
|---|---|---|
| `HomeHero` | `home-sections.tsx` | `#home-banner`，含主标题、标签、CTA 与两个独立产品卡 |
| `AgentCapabilityGrid` | `home-sections.tsx` | `#home-agents` 五类智能体 |
| `HomeSolutionGrid` | `home-sections.tsx` | `#home-solutions` 六个方案卡 |
| `HomeContactSection` | `home-sections.tsx` | `#home-contact-module` 联系信息与 CTA |

### 第二个页面族完成后再评估提取

- `PortalHero`
- `PortalSectionHeading`
- `PortalCardGrid`
- `PortalCTA`
- `PortalReveal`

只有当首页与产品页出现相同 DOM、相同响应式规则和相同交互时，才将它们提取到 `apps/web/src/components/portal/`。不要现在创建通用页面渲染器、JSON 驱动的万能区块、运行时 HTML 解析器、CMS 适配层或第二套聊天组件。

## 首页迁移文件图

| 文件 | 责任 |
|---|---|
| `apps/web/src/components/home-content.ts` | 原型首页全部固定文案、顺序、CTA 和正式 URL 映射 |
| `apps/web/src/components/home-content.test.ts` | 锁定原型首页内容与路由合同，防止迁移时擅改文案 |
| `apps/web/src/components/home-sections.tsx` | 四个语义化服务端区块，不包含视觉常量和客户端状态 |
| `apps/web/src/components/home.css` | 首页局部视觉、卡片、响应式、交互状态、动画与回退 |
| `apps/web/src/app/page.tsx` | 按 `hero → agents → solutions → contact` 顺序组合首页并挂载现有 reveal observer |
| `apps/web/src/app/page.test.tsx` | 区块顺序、内容、链接、交互元素和聊天边界合同 |
| `apps/web/e2e/home-reference-layout.spec.ts` | 桌面、平板、移动端、reduced-motion、溢出、图片和控制尺寸验收 |

不修改：`packages/ui/src/**`、`site-shell.tsx`、`floating-chat-widget-shadcnui.tsx` 及其 CSS/测试。

## Chunk 1: Execution gate and content contract

### Task 1: 创建隔离 worktree 并确认路由决定

**Files:**
- Read: `docs/superpowers/plans/2026-08-10-huakun-prototype-portal-migration.md`
- Read: `/Users/brou/Downloads/华鲲官网首期低保真原型.html:54-125`
- No source edits

- [x] **Step 1: 确认四个首页路由决定**

在实施前由用户明确确认：

1. AISHREK 使用 `/product/aishrek`。
2. 六个首页方案卡进入 `/solutions/[slug]` 独立详情。
3. “申请体验”保留独立 `/trial` 页面。
4. “商务合作邮箱待确认”“客服热线待确认”在开发预览原样保留，但正式发布前必须补齐。

Expected: 四项均有明确答案；没有答案就不开始写首页代码。

- [x] **Step 2: 创建专用 worktree**

```bash
git worktree add .worktrees/huakun-prototype-migration -b brou/huakun-prototype-migration main
```

Expected: 新 worktree 位于 `.worktrees/huakun-prototype-migration`；`.worktrees/` 已由仓库 `.gitignore` 忽略，当前工作区保持不变。

- [x] **Step 3: 记录执行基线**

```bash
git status --short --branch
pnpm --filter @ai-agent-platform/web exec vitest run src/components/home-content.test.ts src/app/page.test.tsx src/components/home-reveal.test.tsx src/components/site-shell/site-shell.test.tsx
```

Expected: worktree 初始状态干净；现有首页、reveal 和 shell 测试通过。

### Task 2: 用测试锁定原型首页内容

**Files:**
- Modify: `apps/web/src/components/home-content.test.ts`
- Modify: `apps/web/src/components/home-content.ts`

- [x] **Step 1: 先把现有内容测试改成新合同**

测试必须完整覆盖以下结构，所有文本逐字取自原型第 92–122 行：

```ts
expect(homeContent.hero).toStrictEqual({
  eyebrow: "华鲲 · 元启 AI 开发赋能平台",
  title: "一站式企业 AI 开发赋能平台，让 AI 能力真正落地业务",
  lead:
    "元启平台基于 LLMOPS 提供模型、知识、智能体、应用与治理的全栈能力，帮助企业快速构建专属智能体；码多多 2.0、AISHREK 等独立产品开箱即用。从能力建设到业务落地，覆盖企业 AI 全链路。",
  tags: ["模型全栈管理", "知识工程", "智能体构建", "流程编排", "行业应用"],
});

expect(homeContent.featuredProducts.map(({ badge, title, description }) => ({
  badge,
  title,
  description,
}))).toStrictEqual([
  {
    badge: "码",
    title: "码多多 2.0",
    description:
      "企业级智能编码产品：代码不出域、说需求就落地，支持私有化部署与 VS Code 双形态。",
  },
  {
    badge: "设",
    title: "AISHREK",
    description:
      "AI 机械设计工作台：导入即解读、对话改参数，覆盖机械设计到交付全流程。",
  },
]);

expect(homeContent.agents.items.map(({ title, description }) => ({ title, description })))
  .toStrictEqual([
    { title: "知识问答", description: "预置问答模板，关联企业知识库即配即用，回答有据可查。" },
    { title: "知识加工", description: "预置加工模板，上传资料即整理成可用内容，快速沉淀。" },
    { title: "知识图谱", description: "预置图谱模板，关联知识库生成图谱，即问即答。" },
    { title: "数据问答", description: "预置问数模板，关联数据源即可随问随答，口径统一。" },
    { title: "视频检索", description: "预置检索模板，接入视频即可检索与实时预警。" },
  ]);

expect(homeContent.solutions.items.map(({ category, title, description }) => ({
  category,
  title,
  description,
}))).toStrictEqual([
  { category: "通用场景", title: "企业知识问答与知识服务", description: "把企业知识转化为可检索、可问答、可持续维护的智能服务。" },
  { category: "通用场景", title: "业务流程自动化与智能协同", description: "把多步骤、跨系统的复杂业务编排成自动流程，自动执行、结果可控。" },
  { category: "政务", title: "政务知识问答与政策服务", description: "统一沉淀政务知识，为工作人员和服务对象提供可追溯的知识查询与问答。" },
  { category: "金融", title: "金融经营数据问答与业务分析", description: "授权用户用自然语言查询业务数据，辅助快速理解经营情况。" },
  { category: "医疗", title: "医院知识与制度问答", description: "统一管理院内制度与服务知识，为工作人员提供知识查询辅助。" },
  { category: "企业智能化", title: "多智能体复杂任务处理", description: "组合多个智能体协同完成跨系统的复杂任务，结果可控、可追溯。" },
]);

expect(homeContent.contact).toMatchObject({
  eyebrow: "联系我们",
  title: "与华鲲一起，把企业 AI 真正落地",
  lead:
    "无论是平台建设、方案选型还是独立产品体验，留下您的需求，我们的顾问将尽快与您联系。",
  address: "四川省成都市双流区新程南一路 19 号 · AI 创新中心 F6 栋",
  businessEmail: "商务合作邮箱待确认",
  hotline: "客服热线待确认",
  serviceHours: "工作日 9:00 – 18:00",
  note: "客户案例墙素材整理中，正式上线后以真实客户案例展示替换本区域。",
});
```

CTA 的 `href` 另做精确断言，值使用 Task 1 已确认的正式路由。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/home-content.test.ts
```

Expected: FAIL，因为当前 `home-content.ts` 仍是旧六区内容结构。

- [x] **Step 3: 用最小类型化对象替换旧内容**

`home-content.ts` 只导出页面实际使用的数据：

```ts
export const homeContent = {
  hero: { /* 原型固定文案与三个 CTA */ },
  featuredProducts: [/* 码多多 2.0、AISHREK */],
  agents: { eyebrow: "五大智能体能力", title: "五大智能体，快速搭建、即配即用", lead: "...", items: [/* 5 项 */] },
  solutions: { eyebrow: "高价值解决方案", title: "从通用场景到重点行业，AI 方案随需落地", lead: "...", items: [/* 6 项 */] },
  contact: { /* 原型固定联系内容 */ },
} as const;
```

删除旧首页不再使用的 `capabilities`、`platformLayers`、`enterpriseProofs`、`solutions`、`resources` 导出，不做兼容别名。

- [x] **Step 4: 运行测试并确认 GREEN**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/home-content.test.ts
```

Expected: PASS。

- [x] **Step 5: 提交内容合同**

```bash
git add apps/web/src/components/home-content.ts apps/web/src/components/home-content.test.ts
git diff --cached --check
git commit -m "feat(home): lock prototype homepage content"
```

## Chunk 2: Homepage vertical slice

### Task 3: 重建首页语义结构但保留站点外壳

**Files:**
- Modify: `apps/web/src/app/page.test.tsx`
- Modify: `apps/web/src/components/home-sections.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [x] **Step 1: 把页面结构测试改成四区合同**

```tsx
expect(
  Array.from(home.querySelectorAll(":scope > [data-home-region]"), (region) =>
    region.getAttribute("data-home-region"),
  ),
).toStrictEqual(["hero", "agents", "solutions", "contact"]);

expect(home.querySelectorAll(".home-featured-card")).toHaveLength(2);
expect(home.querySelectorAll(".home-agent-card")).toHaveLength(5);
expect(home.querySelectorAll(".home-solution-card")).toHaveLength(6);
expect(screen.getByRole("heading", {
  level: 1,
  name: "一站式企业 AI 开发赋能平台，让 AI 能力真正落地业务",
})).toBeVisible();
```

同时断言首页 DOM 中不存在 `.floating-assistant`；聊天浮窗属于 `SiteShell`，不能被复制进 `HomePage`。

- [x] **Step 2: 运行页面测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/app/page.test.tsx
```

Expected: FAIL，当前仍渲染六区首页。

- [x] **Step 3: 用四个服务端组件替换旧区块**

`home-sections.tsx` 只保留：

```tsx
export function HomeHero() { /* heading、tags、CTA、2 个 featured cards */ }
export function AgentCapabilityGrid() { /* 5 个 article */ }
export function HomeSolutionGrid() { /* 6 个 article/link */ }
export function HomeContactSection() { /* address、待确认字段、CTA、note */ }
```

使用 `Link` 处理正式路由；不要复制原型的 `onclick`、`data-page` 路由脚本或内联样式。所有按钮必须是实际链接或有明确行为的 `button`。

- [x] **Step 4: 更新首页组合顺序**

```tsx
export default function HomePage() {
  return (
    <main className="home" aria-label="华鲲元启门户首页">
      <div className="home-atmosphere" aria-hidden="true"><span /><span /><span /></div>
      <HomeHero />
      <AgentCapabilityGrid />
      <HomeSolutionGrid />
      <HomeContactSection />
      <HomeRevealObserver />
    </main>
  );
}
```

- [x] **Step 5: 运行页面和 shell 回归测试**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/app/page.test.tsx src/components/site-shell/site-shell.test.tsx src/components/ui/floating-chat-widget-shadcnui.test.tsx
```

Expected: 首页结构测试通过；现有聊天入口、Header 入口和门户 shell 测试保持通过。

- [x] **Step 6: 提交语义结构**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/page.test.tsx apps/web/src/components/home-sections.tsx
git diff --cached --check
git commit -m "feat(home): render prototype homepage structure"
```

### Task 4: 迁移已确认视觉与动画

**Files:**
- Modify: `apps/web/src/components/home.css`
- Modify: `apps/web/src/app/page.test.tsx`
- Modify: `apps/web/e2e/home-reference-layout.spec.ts`

- [ ] **Step 1: 先更新浏览器结构选择器**

把旧的 `.home-platform-*`、`.home-enterprise-*`、`.home-resource-*` 断言改为：

- Hero 两栏或单栏布局随断点变化。
- 2 个 featured card、5 个 agent card、6 个 solution card 无裁切。
- 桌面 1440×1000、平板 768×1024、移动 390×844 均无横向溢出。
- 所有链接/按钮可聚焦且最小点击尺寸 44×44。
- `prefers-reduced-motion: reduce` 下无位移、漂浮和 reveal 动画。
- Agent launcher 仍由 shell 渲染，位置和交互使用现有测试，不在本测试复制样式合同。

- [ ] **Step 2: 运行 E2E 并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts
```

Expected: FAIL，因为新 class 尚未实现。

- [ ] **Step 3: 删除旧首页不再使用的 CSS**

删除只服务于旧六区首页的 selector 和 keyframe；保留以下已批准视觉基线：

```css
.home {
  --home-canvas: #f4f7ff;
  --home-panel: rgb(255 255 255 / 76%);
  --home-panel-strong: rgb(255 255 255 / 88%);
  --home-ink: #101a42;
  --home-muted: #5f6b8c;
  --home-blue: #286cff;
  --home-violet: #7358ea;
}
```

继续使用白色玻璃卡片、蓝紫渐变主按钮、浅蓝画布、柔和阴影、圆角卡片和现有 atmosphere/reveal 机制。不要把独立 HTML 中针对所有标签的全局覆盖选择器复制进正式站。

- [ ] **Step 4: 为三个后续区块挂载 reveal 标记**

`agents`、`solutions`、`contact` 使用 `data-home-reveal="true"`；Hero 首屏直接出现。继续复用 `HomeRevealObserver`，不新增第二套 observer。

- [ ] **Step 5: 补齐响应式和降级规则**

至少覆盖：

```css
@media (max-width: 1179px) { /* hero 与 contact 改为单列 */ }
@media (max-width: 759px) { /* cards、间距、字号和 CTA 移动端规则 */ }
@media (prefers-reduced-motion: reduce) { /* 动画与 transform 归零 */ }
@supports not (backdrop-filter: blur(1px)) { /* 不透明浅色面板回退 */ }
```

- [ ] **Step 6: 运行首页单元测试和 E2E**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/home-content.test.ts src/components/home-reveal.test.tsx src/app/page.test.tsx
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts
```

Expected: 全部通过；桌面、平板、移动端没有横向溢出和控制裁切。

- [ ] **Step 7: 提交视觉实现**

```bash
git add apps/web/src/components/home.css apps/web/src/app/page.test.tsx apps/web/e2e/home-reference-layout.spec.ts
git diff --cached --check
git commit -m "feat(home): apply approved portal skin"
```

## Chunk 3: Verification and phased rollout

### Task 5: 完成首页发布门槛

**Files:**
- No new source files

- [ ] **Step 1: 运行完整 web 质量门槛**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
```

Expected: 所有命令退出码为 0；如出现与基线无关的失败，不得把页面标记为完成。

- [ ] **Step 2: 在真实浏览器验收首页与聊天入口**

检查 1440×1000、768×1024、390×844：

- 首页四区内容、顺序、文字和 CTA。
- Header 与浮动 Agent 入口均存在，打开、关闭、跳转 `/assistant` 正常。
- 无 JS error、page error、失败图片请求和横向溢出。
- 键盘焦点可见，44×44 点击目标达标。
- reduced-motion 下内容全部可见且无位移动画。

- [ ] **Step 3: 检查修改范围**

```bash
git status --short
git diff --name-only main...HEAD
```

Expected: 只包含本计划首页文件与计划文档；不得包含当前主工作区的 Skill Registry 或 Admin Assistant 并行修改。

- [ ] **Step 4: 首页验收后再规划产品页面族**

下一份计划从 `products`、`key-products`、`mdd-2`、`aippt`、`aishrek` 开始。此时比较首页与产品页真实重复代码，再决定是否创建 `apps/web/src/components/portal/` 公共组件；不要提前抽象。

## 验收定义

首页阶段只有同时满足以下条件才算完成：

1. 原型首页第 92–122 行的文案和顺序通过内容合同测试。
2. 首页正式 URL 均已确认且没有死链。
3. `SiteShell` 和 `FloatingChatWidget` 未修改，现有聊天回归测试通过。
4. 桌面、平板、移动端及 reduced-motion 浏览器验收通过。
5. 未引入运行时 HTML 解析、第二套设计系统、CMS 适配层或重复聊天组件。
6. 原型缺失的真实素材和联系方式在生产发布前已有明确处理结论。
7. 原型占位页面未覆盖正式站已经可用的价格、联系参数或其他业务能力。

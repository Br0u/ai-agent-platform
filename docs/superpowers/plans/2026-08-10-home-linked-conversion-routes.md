# Home-linked Conversion Routes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页已确认的 `/trial` 与六个 `/solutions/[slug]` 入口落成可访问、可验证且保持原型原文的正式 App Router 页面，消除首页当前 404。

**Architecture:** 方案详情使用一个动态 App Router 页面和一份类型化内容模块，按“通用方案 / 行业方案”分别渲染，不引入万能区块或运行时 HTML 解析。体验申请页使用独立客户端组件保留原型弹层、字段、演示验证码和本地成功态；不伪造服务端提交，正式短信/邮件与持久化接入前不得发布为真实申请能力。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、CSS、Vitest、Testing Library、Playwright。

---

## 已确认边界

- 内容基准：`/Users/brou/Downloads/华鲲官网首期低保真原型.html`。
- 首页已确认六个方案详情 URL：
  - `/solutions/knowledge-service`
  - `/solutions/process-automation`
  - `/solutions/government-knowledge`
  - `/solutions/finance-data`
  - `/solutions/healthcare-knowledge`
  - `/solutions/enterprise-multi-agent`
- 体验申请使用独立 `/trial`。
- `SiteShell`、`FloatingChatWidget`、全局 token 和现有 `/solutions` 总览本批不修改。
- 原型中的案例、客户、成果和素材占位不扩写；没有已授权内容时只保留原型边界说明。
- 体验验证码、提交成功仅是原型已定义的浏览器演示，不调用 API、不保存数据、不冒充真实发送。

## 文件职责

| 文件 | 责任 |
|---|---|
| `apps/web/src/components/solution-detail-content.ts` | 六个方案的原型原文、类型与 slug 查询 |
| `apps/web/src/components/solution-detail-content.test.ts` | 锁定六个 slug、标题、摘要、对象、问题、组成与流程 |
| `apps/web/src/app/solutions/[slug]/page.tsx` | 生成 metadata、404 非法 slug、渲染通用/行业详情 |
| `apps/web/src/app/solutions/[slug]/page.test.tsx` | 页面语义、链接、内容和非法 slug 合同 |
| `apps/web/src/app/solutions/[slug]/solution-detail.css` | 详情页局部视觉、响应式、焦点与 reduced-motion |
| `apps/web/src/components/trial-content.ts` | 体验页和弹层的原型固定文案 |
| `apps/web/src/components/trial-content.test.ts` | 锁定体验流程与字段文案 |
| `apps/web/src/components/trial-experience.tsx` | 页面内容、弹层、本地校验、演示验证码与成功态 |
| `apps/web/src/components/trial-experience.test.tsx` | 弹层、校验、验证码、提交成功与重开重置 |
| `apps/web/src/app/trial/page.tsx` | `/trial` metadata 与页面入口 |
| `apps/web/src/app/trial/trial.css` | 体验页局部视觉与响应式 |
| `apps/web/src/config/routes.ts` | 注册两个 live 路由模式 |
| `apps/web/src/config/routes.test.ts` | 路由注册与动态匹配合同 |
| `apps/web/e2e/home-reference-layout.spec.ts` | 首页链接全量非 404 验证 |
| `apps/web/e2e/home-linked-routes.spec.ts` | 两类详情、体验交互、移动端和聊天入口验收 |

## Chunk 1: Content and route contracts

### Task 1: 锁定六个方案详情内容

**Files:**
- Create: `apps/web/src/components/solution-detail-content.test.ts`
- Create: `apps/web/src/components/solution-detail-content.ts`

- [x] **Step 1: 写六个 slug 与原文失败测试**

测试必须断言：

```ts
expect(solutionDetailSlugs).toStrictEqual([
  "knowledge-service",
  "process-automation",
  "government-knowledge",
  "finance-data",
  "healthcare-knowledge",
  "enterprise-multi-agent",
]);

expect(getSolutionDetail("knowledge-service")).toMatchObject({
  kind: "common",
  title: "企业知识问答与知识服务",
  summary: "将企业文档、制度、产品资料和专业知识转化为可检索、可问答的智能知识服务。",
});
```

行业方案分别锁定原型 `industrySolutionCatalog` 中的 `name`、`problem`、`audience`、`value`、`valueTags`，并锁定对应 `industryDetailBlueprints` 生成的组成与流程。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/solution-detail-content.test.ts
```

Expected: FAIL，内容模块尚不存在。

- [x] **Step 3: 写最小类型化内容模块**

只包含本批六个方案；使用 `kind: "common" | "industry"` 区分两套已存在的信息结构。`getSolutionDetail(slug)` 对未知 slug 返回 `undefined`，不提供回退页面。

- [x] **Step 4: 运行内容测试并确认 GREEN**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/solution-detail-content.test.ts
```

Expected: PASS。

- [x] **Step 5: 提交内容合同**

```bash
git add apps/web/src/components/solution-detail-content.ts apps/web/src/components/solution-detail-content.test.ts
git diff --cached --check
git commit -m "feat(solutions): 锁定首页方案详情内容"
```

### Task 2: 注册方案详情与体验申请路由

**Files:**
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Create: `apps/web/src/app/solutions/[slug]/page.tsx`
- Create: `apps/web/src/app/trial/page.tsx`

- [x] **Step 1: 先更新路由测试**

在 required routes 中加入：

```ts
"/solutions/[slug]",
"/trial",
```

并断言两个路由为 `live`，`matchRoute("/solutions/knowledge-service")` 匹配 `/solutions/[slug]`。

- [x] **Step 2: 运行路由测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/route-files.test.ts
```

Expected: FAIL，路由和显式页面文件尚未注册完整。

- [x] **Step 3: 注册路由并创建最小页面入口**

`routes.ts` 加入：

```ts
publicRoute("/solutions/[slug]", "解决方案详情", "live"),
publicRoute("/trial", "申请体验", "live"),
```

页面文件先返回最小可识别内容，以便路由测试转绿；正式渲染在后续 TDD 任务替换。

- [x] **Step 4: 运行路由测试并确认 GREEN**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/route-files.test.ts
```

Expected: PASS。

- [x] **Step 5: 提交路由合同**

```bash
git add apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/app/solutions/[slug]/page.tsx apps/web/src/app/trial/page.tsx
git diff --cached --check
git commit -m "feat(portal): 注册方案详情与体验路由"
```

## Chunk 2: Real page implementations

### Task 3: 渲染通用和行业方案详情

**Files:**
- Modify: `apps/web/src/app/solutions/[slug]/page.tsx`
- Create: `apps/web/src/app/solutions/[slug]/page.test.tsx`
- Create: `apps/web/src/app/solutions/[slug]/solution-detail.css`

- [x] **Step 1: 写通用、行业、404 三类失败测试**

必须覆盖：

```ts
render(await Page({ params: Promise.resolve({ slug: "knowledge-service" }) }));
expect(screen.getByRole("heading", { level: 1, name: "企业知识问答与知识服务" })).toBeVisible();
expect(screen.getAllByTestId("solution-component")).toHaveLength(6);

render(await Page({ params: Promise.resolve({ slug: "finance-data" }) }));
expect(screen.getByText("经营管理、产品运营与数据分析团队")).toBeVisible();
expect(screen.getAllByTestId("solution-flow-step")).toHaveLength(4);
```

未知 slug 必须调用 `notFound()`，不得显示通用 placeholder。

- [x] **Step 2: 运行页面测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run 'src/app/solutions/[slug]/page.test.tsx'
```

Expected: FAIL，页面仍是最小入口。

- [x] **Step 3: 实现语义页面与 metadata**

- Hero：类型、标题、摘要、适用对象、标签、商务咨询、申请体验。
- 问题区：只使用原型问题、影响与目标文案。
- 组成区：通用方案用原型组件名；行业方案使用作用、输入、输出和关联产品。
- 流程区：按原型顺序渲染，不增加第二套客户端状态；首批先用有序步骤卡展示全部信息。
- 产品能力：链接到现有正式路由或已注册产品路由。
- 案例：仅保留原型“待授权补充 / 不虚构”边界，不创建新死链。

- [x] **Step 4: 写页面局部 CSS**

复用首页色值与卡片语言，但不抽取公共组件；至少覆盖 1180px、760px、reduced-motion 和无 `backdrop-filter` 回退。

- [x] **Step 5: 运行页面、路由和类型测试**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run 'src/app/solutions/[slug]/page.test.tsx' src/components/solution-detail-content.test.ts src/config/routes.test.ts src/config/route-files.test.ts
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: PASS。

- [x] **Step 6: 提交方案详情页**

```bash
git add apps/web/src/app/solutions/[slug]/page.tsx apps/web/src/app/solutions/[slug]/page.test.tsx apps/web/src/app/solutions/[slug]/solution-detail.css
git diff --cached --check
git commit -m "feat(solutions): 渲染首页方案详情"
```

### Task 4: 实现体验申请演示页

**Files:**
- Create: `apps/web/src/components/trial-content.test.ts`
- Create: `apps/web/src/components/trial-content.ts`
- Create: `apps/web/src/components/trial-experience.test.tsx`
- Create: `apps/web/src/components/trial-experience.tsx`
- Modify: `apps/web/src/app/trial/page.tsx`
- Create: `apps/web/src/app/trial/trial.css`

- [x] **Step 1: 写内容与交互失败测试**

内容测试锁定 Hero、四个产品标签、三步流程、弹层字段与成功文案。交互测试覆盖：

1. “立即填写申请”打开弹层。
2. 缺姓名显示“请填写姓名”。
3. 非手机号/邮箱显示“请填写正确的手机号或邮箱”。
4. “获取验证码”显示六位演示码及原型演示说明。
5. 验证码错误显示“验证码不正确，请重新获取”。
6. 缺公司显示“请填写所属公司”。
7. 完整正确提交显示原型成功文案。
8. 关闭后重开会重置表单和成功态。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/trial-content.test.ts src/components/trial-experience.test.tsx
```

Expected: FAIL，组件与内容尚不存在。

- [x] **Step 3: 写最小内容模块和客户端组件**

使用 React state 与原生表单，不新增依赖。联系方式正则沿用原型；演示码只存在组件内存，页面卸载或重开即清空。不得调用注册、邮件验证或客户会话 API。

- [x] **Step 4: 完成页面组合和 CSS**

Hero、体验流程、收口 CTA 与弹层保持原型顺序；应用首页批准的浅蓝画布、白色玻璃卡片、蓝紫按钮和响应式规则。

- [x] **Step 5: 运行体验页、路由和类型测试**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/trial-content.test.ts src/components/trial-experience.test.tsx src/config/routes.test.ts src/config/route-files.test.ts
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: PASS。

- [x] **Step 6: 提交体验页**

```bash
git add apps/web/src/components/trial-content.ts apps/web/src/components/trial-content.test.ts apps/web/src/components/trial-experience.tsx apps/web/src/components/trial-experience.test.tsx apps/web/src/app/trial/page.tsx apps/web/src/app/trial/trial.css
git diff --cached --check
git commit -m "feat(trial): 实现体验申请演示页"
```

## Chunk 3: Browser and release gates

### Task 5: 消除首页死链并完成浏览器验收

**Files:**
- Modify: `apps/web/e2e/home-reference-layout.spec.ts`
- Create: `apps/web/e2e/home-linked-routes.spec.ts`

- [x] **Step 1: 写首页链接状态与新页面 E2E**

- 首页全部 `main.home a` 的内部 URL 最终响应不得为 404 或 5xx。
- 六个方案详情均返回 200；通用和行业样本显示正确标题。
- `/trial` 弹层可打开、关闭、校验、生成演示码并提交成功。
- 1440×1000、768×1024、390×844 无横向溢出。
- 页面仍只有 shell 提供的一套 Agent launcher；打开、关闭行为保持可用。

- [x] **Step 2: 构建并运行 E2E**

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts e2e/home-linked-routes.spec.ts
```

Expected: PASS；首页原 7 个 404 消失。

- [x] **Step 3: 运行完整 web 门槛**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
```

Expected: 全部退出码为 0。

- [x] **Step 4: 检查范围并提交 E2E**

```bash
git status --short
git diff --name-only main...HEAD
git add apps/web/e2e/home-reference-layout.spec.ts apps/web/e2e/home-linked-routes.spec.ts docs/superpowers/plans/2026-08-10-home-linked-conversion-routes.md
git diff --cached --check
git commit -m "test(portal): 验收首页转化路由"
```

- [ ] **Step 5: 下一批进入产品页面族**

下一份计划按 `products → key-products → code-agent → aippt → aishrek` 顺序迁移；第二个页面族完成后再比较真实重复，决定是否提取 `components/portal/`。

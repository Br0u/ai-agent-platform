# 华鲲元启门户 UI 重设计 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前泛化门户改造成以“华鲲元启 AI开发赋能平台（TGDataXAI）”为主品牌、面向企业决策者的工业编辑式门户。

**Architecture:** 保持Next.js服务端组件和现有路由注册表。品牌素材作为本地静态资产，首页拆为静态内容数据与展示组件；AppShell负责全局品牌和原生移动导航，外部功能仍由既有Provider边界控制。

**Tech Stack:** Next.js 16、React 19、TypeScript、CSS、Vitest、Testing Library、Playwright CLI、pypdfium2/Pillow（仅用于提取用户提供PDF中的参考素材）。

> 当前协作规则未授权子代理。计划使用`executing-plans`在现有`feat/project-foundation`工作树执行。

---

## Chunk 1: Branded Assets and HTML Direction Artifact

### Task 1: Extract source-backed brand assets

**Files:**

- Create: `docs/design/assets/huakun-yuanqi/wordmark.png`
- Create: `docs/design/assets/huakun-yuanqi/platform-overview.png`
- Create: `docs/design/assets/huakun-yuanqi/README.md`
- Read: `tmp/pdfs/platform/page-2.png`
- Read: `tmp/pdfs/visual-search/page-1.png`

- [x] **Step 1: Extract the wordmark and platform screenshot**

Use the user-provided PDFs rendered at high resolution. Crop only the real logo and real platform UI; do not redraw, recolor or invent missing details.

- [x] **Step 2: Record provenance and limitations**

`README.md` must name both source PDFs, identify assets as brochure-derived temporary prototype assets, and require replacement with independent originals before production launch.

- [x] **Step 3: Verify dimensions and legibility**

Run a Pillow read check and inspect both images with `view_image`.

Expected: wordmark is legible at 176px display width; platform screenshot remains legible at a maximum rendered width of 680px.

- [x] **Step 4: Commit**

```bash
git add docs/design/assets/huakun-yuanqi
git commit -m "chore(assets): 添加华鲲元启彩页参考素材"
```

### Task 2: Build the approved HTML design artifact

**Files:**

- Create: `docs/design/华鲲元启门户重设计.html`

- [x] **Step 1: Declare the visual system in the HTML**

At the top of the file include a design-system comment containing the approved type scale, palette, grid, spacing and motion rules.

- [x] **Step 2: Implement the approved A+B direction**

The artifact must include:

```html
<header>华鲲元启 / TGDataXAI / platform navigation</header>
<main>
  <section id="hero">enterprise value + real platform screenshot</section>
  <section id="capabilities">four-item capability rail</section>
  <section id="platform-flow">four-layer platform structure</section>
  <section id="enterprise-proof">numbered enterprise advantages</section>
  <section id="solutions">
    solution index with visual search marked as a subset
  </section>
  <section id="resources">docs, releases, compatibility, support</section>
</main>
<footer>private deployment and support</footer>
```

Do not add gradient orbs, fake metrics, customer logos, testimonials or a three-column feature grid.

- [x] **Step 3: Verify the HTML in a real browser**

Check 1440×1000 and 390×844, console output, mobile navigation and primary links.

Expected: no overflow, 0 console errors, all interactive targets at least 44px.

- [x] **Step 4: Commit**

```bash
git add docs/design/华鲲元启门户重设计.html
git commit -m "docs(design): 添加华鲲元启门户高保真方向稿"
```

## Chunk 2: Global Brand Shell

### Task 3: Rebrand and restructure AppShell with TDD

**Files:**

- Modify: `packages/ui/src/app-shell.test.tsx`
- Modify: `packages/ui/src/app-shell.tsx`
- Modify: `packages/ui/src/app-shell.css`
- Modify: `packages/ui/src/tokens.css`

- [x] **Step 1: Write the failing AppShell test**

Test the desired public contract:

```tsx
expect(screen.getByRole("link", { name: "华鲲元启首页" })).toBeVisible();
expect(screen.getByText("TGDataXAI")).toBeVisible();
expect(within(mainNav).getByRole("link", { name: "平台能力" })).toHaveAttribute(
  "href",
  "/product",
);
expect(within(mainNav).getByRole("link", { name: "行业方案" })).toHaveAttribute(
  "href",
  "/cases",
);
expect(screen.getByText("打开导航")).toBeVisible();
expect(screen.queryByText("AI Agent Platform")).not.toBeInTheDocument();
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/ui test src/app-shell.test.tsx
```

Expected: FAIL because the old brand and old navigation are still rendered.

- [x] **Step 3: Implement the shell and tokens**

Use the source-backed colors in `tokens.css`. Render a desktop navigation and a native`details/summary`mobile navigation; maintain44px targets and visible focus.

- [x] **Step 4: Run the test and verify GREEN**

Run the targeted test and then all UI package tests.

- [x] **Step 5: Commit**

```bash
git add packages/ui/src
git commit -m "feat(ui): 建立华鲲元启品牌化全局框架"
```

## Chunk 3: Home Page Narrative

### Task 4: Implement the enterprise-first homepage with TDD

**Files:**

- Modify: `apps/web/src/app/page.test.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/home-content.ts`
- Create: `apps/web/src/components/home-sections.tsx`
- Create: `apps/web/src/components/home.css`
- Create: `apps/web/src/assets/huakun-yuanqi/wordmark.png`
- Create: `apps/web/src/assets/huakun-yuanqi/platform-overview.png`
- Create: `apps/web/src/assets/huakun-yuanqi/README.md`

- [x] **Step 1: Write the failing homepage test**

Test the approved content hierarchy:

```tsx
expect(
  screen.getByRole("heading", { name: "让企业 AI 从模型走向业务" }),
).toBeVisible();
expect(screen.getByText("华鲲元启 AI开发赋能平台")).toBeVisible();
expect(screen.getByRole("link", { name: "了解平台" })).toHaveAttribute(
  "href",
  "/product",
);
expect(screen.getByRole("link", { name: "阅读文档" })).toHaveAttribute(
  "href",
  "/docs",
);
expect(screen.getByRole("img", { name: "华鲲元启平台界面" })).toBeVisible();
expect(screen.getByText("基于华鲲元启的行业子能力")).toBeVisible();
expect(screen.queryByText("AI Agent Platform")).not.toBeInTheDocument();
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/web test src/app/page.test.tsx
```

Expected: FAIL on the new heading and product hierarchy.

- [x] **Step 3: Create static, source-backed homepage content**

Copy the two verified design assets into the app asset directory. `home-content.ts` contains only brochure-backed platform modules, enterprise advantages, solution names and real portal links. It must not include version claims, customer counts or performance metrics.

- [x] **Step 4: Implement semantic homepage sections**

`home-sections.tsx` exports `HeroEvidence`, `CapabilityRail`, `PlatformFlow`, `EnterpriseProof`, `SolutionIndex` and `ResourceTable`. Keep components server-compatible and avoid state.

- [x] **Step 5: Implement the editorial layout**

Use12-column desktop grids, full-width rules, numbered statements and a compact resource table. The visual-search row must visually sit inside the solution index and carry the subset label.

- [x] **Step 6: Run the test and verify GREEN**

Run the targeted homepage test, then all web tests.

- [x] **Step 7: Commit**

```bash
git add apps/web/src/app apps/web/src/components apps/web/src/assets/huakun-yuanqi
git commit -m "feat(web): 重设计华鲲元启企业门户首页"
```

### Task 5: Restyle placeholder pages and expose stable disabled state

**Files:**

- Modify: `apps/web/src/components/feature-placeholder-page.test.tsx`
- Modify: `apps/web/src/components/feature-placeholder-page.tsx`
- Modify: `apps/web/src/components/feature-placeholder-page.css`

- [ ] **Step 1: Write the failing placeholder test**

For a disabled route, require visible`FEATURE_DISABLED`; for a scaffold route, require that the code is absent.

- [ ] **Step 2: Run the test and verify RED**

Expected: FAIL because the stable error code is not rendered.

- [ ] **Step 3: Implement the minimal semantic change and editorial styling**

Render the code only for placeholder routes. Replace the centered generic empty state with a numbered, left-aligned page dossier using the new tokens.

- [ ] **Step 4: Run the test and verify GREEN**

Run the targeted test and all web tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/feature-placeholder-page*
git commit -m "feat(web): 统一品牌化占位页面状态"
```

## Chunk 4: Verification and Handoff

### Task 6: Run the complete quality and browser gate

**Files:**

- Modify: `docs/design/brand-spec.md`
- Modify: `progress.md`
- Modify: `task_plan.md`

- [ ] **Step 1: Run automated quality checks**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Expected: all commands exit 0 with no test failures or lint warnings.

- [ ] **Step 2: Verify the actual Next.js application in a real browser**

Check:

- `/` at 1440×1000 and 390×844.
- `/downloads` for the external placeholder state.
- `/product/agent-studio` for the scaffold state.
- Mobile`details/summary` navigation.
- Console errors and horizontal overflow.

- [ ] **Step 3: Verify source-backed asset usage**

Confirm the wordmark and platform screenshot load locally with no 404 and each has useful alternative text/caption.

- [ ] **Step 4: Update durable documentation**

Record the asset paths in`brand-spec.md`, all RED/GREEN and browser results in`progress.md`, and the phase completion in`task_plan.md`.

- [ ] **Step 5: Review secrets and Git diff**

Confirm no source PDF, `.env`, real credentials, customer data, temp render or browser cache is staged.

- [ ] **Step 6: Commit**

```bash
git add docs/design/brand-spec.md progress.md task_plan.md
git commit -m "docs: 记录华鲲元启UI重设计验收"
```

- [ ] **Step 7: Finish the development branch**

Use`verification-before-completion`and`finishing-a-development-branch`. Do not push or merge without the user's explicit choice.

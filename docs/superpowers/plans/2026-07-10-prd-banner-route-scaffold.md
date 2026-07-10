# PRD Banner and Route Scaffold Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incorrect header identity with the PRD brand and create explicit, independently developable Next.js route directories for every registered portal, console, and admin route.

**Architecture:** The web root layout self-hosts Kaushan Script through `next/font/local` and exposes it as a CSS variable consumed by the shared UI package. A shared registered-route component preserves the existing scaffold/placeholder state contract while thin explicit `page.tsx` files replace the catch-all as the primary route structure; the catch-all remains a fallback.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library, CSS, pnpm, Google Fonts Kaushan Script under SIL OFL 1.1.

**Spec:** `docs/superpowers/specs/2026-07-10-prd-banner-route-scaffold-design.md`

---

## Chunk 1: Header Identity and Font

### Task 1: Add the self-hosted Google Font

**Files:**

- Create: `apps/web/src/assets/fonts/kaushan-script/KaushanScript-Regular.ttf`
- Create: `apps/web/src/assets/fonts/kaushan-script/OFL.txt`
- Create: `apps/web/src/assets/fonts/kaushan-script/README.md`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `docs/design/brand-spec.md`

- [x] **Step 1: Download the official font and license**

Use the official `google/fonts` repository. Record exact source URLs and the SIL OFL 1.1 license in the asset README.

- [x] **Step 2: Configure local font loading**

Use `next/font/local` in `layout.tsx`:

```tsx
const brandScript = localFont({
  src: "../assets/fonts/kaushan-script/KaushanScript-Regular.ttf",
  variable: "--font-brand-script",
  display: "swap",
});
```

Apply the variable class to `<html>` so `packages/ui` can consume it without depending on Next.js.

- [x] **Step 3: Record the font in the brand spec**

Document the local file, official source, license, usage boundary, and fallback.

- [x] **Step 4: Run typecheck and build**

Run:

```bash
pnpm --filter @ai-agent-platform/web typecheck
pnpm build
```

Expected: both exit 0 and the build does not require a Google Fonts runtime request.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/assets/fonts apps/web/src/app/layout.tsx docs/design/brand-spec.md
git commit -m "feat(brand): 自托管Kaushan Script品牌字体"
```

### Task 2: Correct the AppShell brand and PRD navigation with TDD

**Files:**

- Modify: `packages/ui/src/app-shell.test.tsx`
- Modify: `packages/ui/src/app-shell.tsx`
- Modify: `packages/ui/src/app-shell.css`

- [x] **Step 1: Write the failing header contract test**

Require:

```tsx
expect(
  screen.getByRole("link", { name: "AI Agent Platform 首页" }),
).toBeVisible();
expect(screen.getByText("AI Agent Platform")).toBeVisible();
expect(screen.getByText("Build Enterprise AI Faster")).toBeVisible();
expect(screen.queryByText("华鲲元启")).not.toBeInTheDocument();
```

The desktop navigation must map `产品 / 文档 / 版本 / 兼容矩阵 / Marketplace / 支持` to the PRD paths.

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/ui test src/app-shell.test.tsx
```

Expected: FAIL because the old brand and navigation are present.

- [x] **Step 3: Implement the identity and navigation**

Use `var(--font-brand-script)` only for `.site-brand-name`. Keep the subtitle mono, the spectrum rail narrow, focus visible, and all targets at least44px.

- [x] **Step 4: Run targeted and full UI tests**

Run:

```bash
pnpm --filter @ai-agent-platform/ui test src/app-shell.test.tsx
pnpm --filter @ai-agent-platform/ui test
```

Expected: all UI tests pass.

- [x] **Step 5: Commit**

```bash
git add packages/ui/src/app-shell.*
git commit -m "feat(ui): 对齐PRD页头品牌与导航"
```

## Chunk 2: Explicit Route Structure

### Task 3: Introduce the registered-route scaffold with TDD

**Files:**

- Create: `apps/web/src/components/route-scaffold/registered-route-page.test.tsx`
- Create: `apps/web/src/components/route-scaffold/registered-route-page.tsx`
- Create: `apps/web/src/components/route-scaffold/README.md`
- Modify: `apps/web/src/app/[...slug]/page.tsx`

- [x] **Step 1: Write a failing scaffold test**

Test a scaffold route (`/product`) and a disabled route (`/downloads`), including metadata and `FEATURE_DISABLED` behavior.

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/web test src/components/route-scaffold/registered-route-page.test.tsx
```

Expected: FAIL because the shared registered-route component does not exist.

- [x] **Step 3: Implement the shared route component**

Export:

```tsx
export function RegisteredRoutePage({ pathname }: { pathname: string });
export function metadataForRegisteredRoute(pathname: string): Metadata;
```

Use `matchRoute`, `FeaturePlaceholderPage`, and `notFound`. Refactor the catch-all to consume the same functions.

- [x] **Step 4: Run targeted and catch-all tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web test src/components/route-scaffold/registered-route-page.test.tsx 'src/app/[...slug]/page.test.tsx'
```

Expected: both suites pass.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components/route-scaffold apps/web/src/app/'[...slug]'
git commit -m "refactor(web): 统一登记路由页面壳"
```

### Task 4: Create every registered page directory with a filesystem test

**Files:**

- Create: `apps/web/src/config/route-files.test.ts`
- Create: explicit `page.tsx` files for all non-root entries in `routeRegistry`
- Create: `apps/web/src/app/console/layout.tsx`
- Create: `apps/web/src/app/admin/layout.tsx`

- [x] **Step 1: Write the failing filesystem coverage test**

For each registered path except `/`, translate the route pattern into its expected App Router file and assert that it exists:

```ts
expect(existsSync(pageFileForRoute(route.path))).toBe(true);
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/web test src/config/route-files.test.ts
```

Expected: FAIL with missing `app/product/page.tsx` and other explicit files.

- [x] **Step 3: Create public portal page files**

Create explicit files for product, product detail, releases, release detail, roadmap, downloads, OpenLab, docs, compatibility, Marketplace, Marketplace detail, support, help, blog, blog detail, cases, contact, and login.

Each static page exports route metadata and renders `RegisteredRoutePage`. Dynamic pages derive their concrete pathname from `params`.

- [x] **Step 4: Create console page files**

Create `console/layout.tsx` plus all registered console page directories. The layout is a semantic boundary only; authentication remains out of scope.

- [x] **Step 5: Create admin page files**

Create `admin/layout.tsx` plus all registered admin page directories. The layout is a semantic boundary only; authorization remains out of scope.

- [x] **Step 6: Run route coverage and full web tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web test src/config/route-files.test.ts
pnpm --filter @ai-agent-platform/web test
```

Expected: all explicit route files exist and all web tests pass.

- [x] **Step 7: Commit**

```bash
git add apps/web/src/app apps/web/src/config/route-files.test.ts
git commit -m "feat(web): 建立PRD页面目录骨架"
```

### Task 5: Establish component ownership directories

**Files:**

- Create: `apps/web/src/components/portal/README.md`
- Create: `apps/web/src/components/console/README.md`
- Create: `apps/web/src/components/admin/README.md`
- Modify: `apps/web/README.md`

- [ ] **Step 1: Document component boundaries**

Each README states what belongs in the directory, what must stay in `packages/ui`, and where data/integration code belongs.

- [ ] **Step 2: Document the page-development workflow**

Explain explicit routes, nearby tests, shared components, route status changes, database boundaries, and external-feature placeholders.

- [ ] **Step 3: Run format checks**

Run:

```bash
pnpm --filter @ai-agent-platform/web format:check
```

Expected: formatting passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/*/README.md apps/web/README.md
git commit -m "docs(web): 明确页面模块开发边界"
```

## Chunk 3: Verification

### Task 6: Run the complete quality and browser gate

**Files:**

- Modify: `progress.md`
- Modify: `task_plan.md`
- Modify: this plan's checkboxes

- [ ] **Step 1: Run automated checks**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 2: Verify the actual application in a real browser**

Check `/` at1440×1000 and390×844, open the mobile menu, and verify `/product`, `/downloads`, `/console/profile`, and `/admin/products`.

Require:

- exact brand title and subtitle;
- Kaushan Script loaded, not fallback;
- PRD navigation links and44px targets;
- no horizontal overflow;
- `FEATURE_DISABLED` only on disabled routes;
- zero console errors or asset404s.

- [ ] **Step 3: Review source and Git scope**

Confirm no source PDFs, credentials, `.env`, browser caches, temp files, or unrelated changes are staged. Confirm the font license is present.

- [ ] **Step 4: Update durable progress**

Record RED/GREEN results, font source/license, explicit directory count, browser metrics, and build result.

- [ ] **Step 5: Commit verification records**

```bash
git add progress.md task_plan.md docs/superpowers/plans/2026-07-10-prd-banner-route-scaffold.md
git commit -m "docs: 记录PRD页头与目录骨架验收"
```

- [ ] **Step 6: Finish the development branch**

Use `verification-before-completion` and `finishing-a-development-branch`. Do not merge or push without the user's explicit choice.

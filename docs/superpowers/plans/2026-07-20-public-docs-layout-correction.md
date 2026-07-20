# Public Docs Layout Correction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复公开文档桌面布局重叠和失衡，并从公开 UI 移除英文导航代码。

**Architecture:** 保留 CMS 文档模型和管理端字段，仅收窄公开展示 DTO 与组件输出。总览页改成两列阅读网格，详情页保留三列目录结构；共享导航和搜索样式继续由现有文档 CSS 负责。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Testing Library、CSS Grid、Playwright/真实浏览器。

---

## Chunk 1: Public presentation contract

### Task 1: Remove public code rendering with TDD

**Files:**

- Modify: `apps/web/src/components/doc-reader-layout.test.tsx`
- Modify: `apps/web/src/components/docs-detail-layout.test.tsx`
- Modify: `apps/web/src/components/docs-navigation.tsx`
- Modify: `apps/web/src/components/doc-category-cards.tsx`
- Modify: `apps/web/src/components/doc-reader-layout.tsx`
- Modify: `apps/web/src/components/docs-detail-layout.tsx`
- Modify: `apps/web/src/app/docs/docs-search.tsx`

- [x] **Step 1: Write failing assertions**

Assert that public navigation, overview cards, detail header and search results contain the Chinese labels and links but do not contain fixture codes such as `D0`, `D1`, `D2` or slug eyebrows.

- [x] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/doc-reader-layout.test.tsx src/components/docs-detail-layout.test.tsx`

Expected: failure because the current public components still render codes.

- [x] **Step 3: Implement the minimal presentation change**

Remove code spans and public-only code projection. Keep `navigation.code` in the server/CMS model, but do not pass it to `DocsSearch`. Remove the overview kicker and detail slug eyebrow.

- [x] **Step 4: Run focused tests and confirm GREEN**

Run the same Vitest command. Expected: all focused tests pass.

## Chunk 2: Layout correction

### Task 2: Reflow desktop and responsive grids

**Files:**

- Modify: `apps/web/src/components/doc-reader-layout.css`
- Modify: `apps/web/src/app/docs/docs-nextra.css`

- [x] **Step 1: Replace code-dependent grids**

Use single-column navigation labels, three-column overview cards (`title / summary / arrow`) and one-column search result content. Delete obsolete code selectors.

- [x] **Step 2: Correct the overview reading grid**

Use a bounded two-column layout for the overview and keep the detail page's real TOC column. Align the search utility row to the same container and remove excess vertical margin.

- [x] **Step 3: Preserve responsive behavior**

At tablet widths retain two columns until the existing mobile breakpoint; at mobile widths keep the collapsible navigation and stack card title/summary without horizontal overflow.

## Chunk 3: Verification

### Task 3: Validate behavior and visuals

**Files:**

- Test: `apps/web/src/components/doc-reader-layout.test.tsx`
- Test: `apps/web/src/components/docs-detail-layout.test.tsx`
- Test: `apps/web/src/app/docs/page.test.tsx`
- Test: `apps/web/src/app/docs/[category]/page.test.tsx`

- [x] **Step 1: Run public docs tests**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/doc-reader-layout.test.tsx src/components/docs-detail-layout.test.tsx src/app/docs/page.test.tsx 'src/app/docs/[category]/page.test.tsx'`

Result: public docs tests pass 26/26. The full Web suite was also executed and reported 1873 passed, 4 failed and 58 skipped; all four failures are in concurrent Assistant streaming/floating-chat worktree changes outside this change.

- [x] **Step 2: Run static checks**

Run typecheck, focused ESLint, Prettier check and `git diff --check`.

Result: scoped ESLint, Prettier and `git diff --check` pass. Full Web typecheck was executed but remains blocked by two errors in concurrent Assistant worktree changes outside this change (`route.test.ts` provider mode and `agentos-run-client.test.ts` interface drift).

- [x] **Step 3: Verify in a real browser**

Check `/docs` and one detail page at desktop and mobile widths. Require no visible English code, no overlap, no horizontal overflow, correct links and aligned search/content containers.

- [x] **Step 4: Preserve git boundary**

Confirm the staging area remains empty and existing unrelated `.gitignore`, `apps/web/next-env.d.ts` and `output/` changes remain untouched. Do not commit without explicit user authorization.

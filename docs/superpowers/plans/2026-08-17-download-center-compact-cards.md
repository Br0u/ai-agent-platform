# Download Center Compact Cards Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the collapsible resource directory and render published downloads as compact responsive cards without changing resource data or access policies.

**Architecture:** Keep the existing `DownloadCenter` data and action flow. Add one native button-controlled directory state and change only the existing download-center layout classes; no new component layer or dependency.

**Tech Stack:** React, Next.js, CSS, Vitest, Testing Library

---

## Chunk 1: Public catalog layout

### Task 1: Lock the compact grid and collapsible directory behavior

**Files:**

- Modify: `apps/web/src/components/download-center.test.tsx`

- [x] **Step 1: Write failing tests**

Add interaction coverage proving the desktop directory opens and closes through an accessible button, and static CSS assertions proving three desktop columns, two tablet columns, and one mobile column.

- [x] **Step 2: Verify RED**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/download-center.test.tsx`

Expected: FAIL because the current directory is permanently visible and cards remain one horizontal column.

### Task 2: Implement the smallest layout change

**Files:**

- Modify: `apps/web/src/components/download-center.tsx`
- Modify: `apps/web/src/app/downloads/downloads.css`

- [x] **Step 1: Add native directory disclosure state**

Use a single boolean state, an `aria-expanded` button, and the existing nav markup. Keep all links and anchors unchanged.

- [x] **Step 2: Convert the existing cards to a responsive grid**

Use CSS Grid with three columns on wide screens, two below the existing desktop breakpoint, and one on mobile. Put the existing cover above the existing body, clamp description text, and keep actions aligned at the bottom.

- [x] **Step 3: Verify GREEN**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/download-center.test.tsx`

Expected: PASS.

### Task 4: Restore the original hero and reduce catalog density

**Files:**

- Modify: `apps/web/src/components/download-center-content.ts`
- Modify: `apps/web/src/components/download-center-content.test.ts`
- Modify: `apps/web/src/components/download-center.tsx`
- Modify: `apps/web/src/components/download-center.test.tsx`
- Modify: `apps/web/src/app/downloads/downloads.css`

- [x] **Step 1: Compare the live original and current layouts**

Use the original `/downloads` page as the content and hierarchy reference, and the existing solutions directory as the collapsed-rail reference. Keep resource data, policies, routes, and Agent UI unchanged.

- [x] **Step 2: Lock the intended differences with failing tests**

Require the shared progress rail, the original product-to-experience hero copy and four-step path, and a 4/3/2/1 responsive card grid.

- [x] **Step 3: Implement the download-only visual pass**

Reuse `DirectoryProgressRail`, restore the original Hero hierarchy, and tighten section spacing, card typography, metadata, and actions without adding dependencies or cross-page styles.

- [x] **Step 4: Verify runtime layout and application checks**

Run focused tests, typecheck, lint, format, production build, and desktop/mobile browser checks before committing.

- [x] **Step 4: Verify the affected application**

Run: `pnpm --filter @ai-agent-platform/web typecheck`

Run: `pnpm --filter @ai-agent-platform/web lint`

Run: `pnpm --filter @ai-agent-platform/web format:check`

Run: `pnpm --filter @ai-agent-platform/web build`

- [x] **Step 5: Browser-check `/downloads`**

Confirm the directory is collapsed by default, keyboard accessible, card grid is 3/2/1 columns, contact modal still restores focus, and public preview/download actions retain their current targets.

- [x] **Step 6: Commit only the plan, component, CSS, and test**

```bash
git add docs/superpowers/plans/2026-08-17-download-center-compact-cards.md \
  apps/web/src/components/download-center.tsx \
  apps/web/src/components/download-center.test.tsx \
  apps/web/src/app/downloads/downloads.css
git commit -m "fix(downloads): compact public resource cards"
```

### Task 3: Match the established solutions directory

**Files:**

- Modify: `apps/web/src/components/download-center.tsx`
- Modify: `apps/web/src/components/download-center.test.tsx`
- Modify: `apps/web/src/app/downloads/downloads.css`

- [x] **Step 1: Lock the reference behavior with failing tests**

Require the same 240px expanded / 44px collapsed desktop shell used by the solutions page, plus its mobile trigger, backdrop, drawer, Escape close, and focus restoration behavior.

- [x] **Step 2: Replace the floating panel with the shared visual pattern**

Keep the download-specific directory contents, omit the unnecessary search and progress rail, and reuse the solutions page's frosted shell geometry and mobile drawer behavior.

- [x] **Step 3: Verify the focused behavior**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/download-center.test.tsx`

Expected: PASS.

### Task 5: Remove the collapsed gutter and use horizontal resource cards

**Files:**

- Modify: `apps/web/src/components/download-center.test.tsx`
- Modify: `apps/web/src/app/downloads/downloads.css`
- Verify: `apps/web/src/components/site-shell/site-shell.test.tsx`
- Verify: `packages/ui/src/app-shell.test.tsx`

- [x] **Step 1: Write failing visual-contract tests**

Require the collapsed desktop shell to reserve no colored gutter while retaining the shared progress rail. Require a two-column resource grid whose cards place the information on the left and cover on the right, with a single-column stacked mobile fallback.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/download-center.test.tsx`

Expected: FAIL on the old `44px` collapsed gutter and four-column vertical cards.

- [x] **Step 3: Implement the minimum download-only CSS change**

Collapse the first grid track to zero so the rail floats over the Hero instead of creating a background strip. Switch the catalog to two wide columns and each card to a left-information/right-cover grid; restore a vertical card below the mobile breakpoint. Keep the expanded directory panel, mobile drawer, resource policies, routes, and Agent UI unchanged.

- [x] **Step 4: Verify the shared public footer contract**

Run the existing `SiteShell` and `AppShell` tests to prove `/` and `/downloads` use the same shared `SiteFooter`. Do not add the public marketing footer to auth, console, admin, or assistant workspaces.

- [x] **Step 5: Verify application and browser layout**

Run focused tests, typecheck, lint, format, production build, and desktop/mobile browser checks before committing.

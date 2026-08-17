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

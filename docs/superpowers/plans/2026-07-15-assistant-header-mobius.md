# AI 助理导航莫比乌斯图标 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top navigation AI 助理 placeholder curves with a compact, recognizable Möbius strip mark and restore the unrelated code-agent hero visual.

**Architecture:** Keep the navigation entry in `packages/ui` and render a small inline SVG mesh generated from the standard Möbius parameterization. Use CSS only for the lightweight looping 3D-like turn, hover/active emphasis, and reduced-motion fallback. Remove the mistakenly added product-page renderer and its tests so the code-agent page returns to its original structure.

**Tech Stack:** React, inline SVG, CSS keyframes, Vitest, Testing Library.

---

### Task 1: Restore the unrelated code-agent page

**Files:**
- Modify: `apps/web/src/app/product/code-agent/page.tsx`
- Modify: `apps/web/src/app/product/code-agent/code-agent.css`
- Delete: `apps/web/src/app/product/code-agent/mobius-strip.ts`
- Delete: `apps/web/src/app/product/code-agent/mobius-strip.test.ts`
- Delete: `apps/web/src/app/product/code-agent/mobius-strip-visual.tsx`
- Delete: `apps/web/src/app/product/code-agent/mobius-strip-visual.test.tsx`

- [x] Restore the original CSS-built hero markup and styles.
- [x] Remove the accidental product-page renderer and its tests.
- [x] Confirm no `MobiusStripVisual` or `ca-mobius` references remain.

### Task 2: Replace the AI 助理 header mark

**Files:**
- Modify: `packages/ui/src/navigation/assistant-header-entry.tsx`
- Modify: `packages/ui/src/app-shell.css`
- Modify: `packages/ui/src/navigation/assistant-header-entry.test.tsx`

- [x] Add a focused SVG mesh made from connected Möbius-strip facets, with a continuous band silhouette, center seam, and depth-aware gradient.
- [x] Animate the mark with a slow transform-only perspective turn; preserve the 44px control hit area and reduced-motion behavior.
- [x] Keep the decorative SVG hidden from assistive technology and preserve forced-colors fallback.
- [x] Update tests to assert mesh structure, unique gradient IDs, motion rules, accessibility, and forced-colors behavior.

### Task 3: Verify

- [x] Run the focused UI test.
- [x] Run UI typecheck and lint.
- [x] Run the full web test suite and production build.
- [x] Run `git diff --check` and confirm only intended files are changed.

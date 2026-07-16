# AI 助理导航莫比乌斯图标 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top navigation AI 助理 placeholder curves with a compact, recognizable Möbius strip mark and restore the unrelated code-agent hero visual.

**Architecture:** Keep the navigation entry in `packages/ui` and reuse the standard Möbius mesh plus the Canvas yaw/pitch perspective projection from the earlier hero visual, reduced to a 32×6 mesh for the 25px mark. Drive the lightweight render loop with `requestAnimationFrame`, while preserving hover/active emphasis and reduced-motion fallback. Remove the mistakenly added product-page renderer and its tests so the code-agent page returns to its original structure.

**Tech Stack:** React client component, Canvas 2D, CSS, Vitest, Testing Library.

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
- Create: `packages/ui/src/navigation/assistant-header-mobius.ts`
- Modify: `packages/ui/src/navigation/assistant-header-entry.tsx`
- Modify: `packages/ui/src/app-shell.css`
- Modify: `packages/ui/src/navigation/assistant-header-entry.test.tsx`

- [x] Add the shared Möbius parameterization and a compact 32×6 triangle mesh.
- [x] Reproject the mesh every animation frame with yaw, pitch, perspective, depth sorting, gradient color, and highlight lines.
- [x] Keep the decorative Canvas hidden from assistive technology and preserve reduced-motion and forced-colors fallbacks.
- [x] Update tests to assert drawing, frame re-projection, cleanup behavior, accessibility, and CSS fallbacks.

### Task 3: Verify

- [x] Run the focused UI test.
- [x] Run UI typecheck and lint.
- [x] Run the full web test suite and production build.
- [x] Run `git diff --check` and confirm only intended files are changed.

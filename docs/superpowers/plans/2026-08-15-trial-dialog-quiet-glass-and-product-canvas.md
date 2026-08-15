# Trial Dialog Quiet Glass and Product Canvas Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing `/trial` dialog in direction A and remove the collapsed product-directory background seam without changing content or behavior.

**Architecture:** Reuse the existing React DOM and behavior. Add narrow CSS contracts and one browser geometry assertion, then make the minimum changes in the two existing stylesheet owners. No new component, asset, token layer, or dependency is needed.

**Tech Stack:** Next.js 16, React 19, plain CSS, Vitest, Testing Library, Playwright.

---

## Chunk 1: Visual contracts and minimal CSS

### Task 1: Lock the trial dialog direction

**Files:**

- Modify: `apps/web/src/components/trial-experience.test.tsx`
- Modify: `apps/web/src/app/trial/trial.css`

- [ ] **Step 1: Write the failing CSS contract**

Extend the existing CSS contract test to require the quieter navy backdrop, layered dialog aurora, top-edge pseudo-element, explicit dialog entrance keyframe, and reduced-motion coverage. Keep assertions on stable design roles rather than every shadow value.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/trial-experience.test.tsx
```

Expected: FAIL because the approved dialog surface and entrance selectors do not exist yet.

- [ ] **Step 3: Implement the minimum visual CSS**

In `trial.css` only:

- lighten and cool the backdrop;
- override the dialog's shared card surface with the approved layered glass;
- add the single top light seam;
- refine close, input, verification, disabled, placeholder, and dialog-action surfaces;
- add a short entrance under `prefers-reduced-motion: no-preference`;
- preserve the current mobile layout and reduced-motion behavior.

- [ ] **Step 4: Verify GREEN**

Run the focused Vitest command again. Expected: all tests in the file pass.

### Task 2: Remove the product canvas seam

**Files:**

- Modify: `apps/web/e2e/product-portal-family.spec.ts`
- Modify: `apps/web/src/components/product-directory.css`

- [ ] **Step 1: Write the failing browser assertion**

In the existing quiet collapsed-directory test, assert that the collapsed product content begins at `x=0` while the directory remains 44px wide and hovering it does not change content geometry.

- [ ] **Step 2: Verify RED**

Run the focused Playwright test against a fresh local build. Expected: FAIL with the current content `x=44`.

- [ ] **Step 3: Implement the root fix**

Change only the collapsed desktop product grid track from `44px` to `0`, allowing the existing 44px sticky rail to overflow above the complete product canvas. Do not change expanded or mobile rules.

- [ ] **Step 4: Verify GREEN**

Run the focused Playwright test again. Expected: the product content starts at `x=0`, the directory remains 44px, and hover expansion does not move content.

### Task 3: Regression and visual review

**Files:**

- Test: `apps/web/src/components/trial-experience.test.tsx`
- Test: `apps/web/src/components/product-directory.test.tsx`
- Test: `apps/web/e2e/business-entry-pages.spec.ts`
- Test: `apps/web/e2e/product-portal-family.spec.ts`

- [ ] **Step 1: Run focused unit suites**

Run the trial, product-directory, and directory-progress tests. Expected: all pass.

- [ ] **Step 2: Run static checks and build**

Run web typecheck, scoped ESLint/Prettier, `git diff --check`, and a fresh web build. Expected: zero errors.

- [ ] **Step 3: Review desktop and mobile screenshots**

Capture `/trial` with the dialog open at desktop and mobile widths plus `/product/code-agent` collapsed at desktop. Confirm the dialog remains readable, no content/layout changed, the product strip is gone, and mobile drawer/modal behavior is intact.

- [ ] **Step 4: Commit only task-owned files**

Stage and commit only the two CSS files, two test files, and approved specification/plan documents. Leave all unrelated dirty work untouched.

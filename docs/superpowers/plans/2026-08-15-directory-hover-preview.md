# Directory Hover Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all four desktop directories start at 44px, temporarily preview at 240px on hover or keyboard focus without shifting page content, and close when pointer and focus leave.

**Architecture:** Keep the existing React `collapsed` state as the persistent click-controlled state. Implement temporary preview entirely in CSS with `:hover` and `:focus-within`; keep the grid column at 44px while the 240px glass aside overlays content, so no new component state or pointer handlers are needed. Reuse the existing width transition and fade the decorative progress rail during preview.

**Tech Stack:** Next.js 16, React 19, plain CSS, Vitest, Playwright.

## Global Constraints

- Desktop preview applies only above the existing 900px mobile boundary.
- Collapsed width is exactly 44px; preview and persistent expanded width remain exactly 240px.
- Preview must overlay content; the content column position must not change.
- Pointer exit closes a temporary preview; click-to-pin expansion remains unchanged.
- `focus-within` must expose the same preview for keyboard users.
- Mobile drawers, directory content, URL/history behavior, Navbar, Footer, and Agent behavior must not change.
- `prefers-reduced-motion: reduce` continues to disable directory and progress movement.
- Do not add JavaScript state, event listeners, dependencies, or a new shared directory abstraction.

---

### Task 1: Product directory hover and focus preview

**Files:**
- Modify: `apps/web/e2e/product-portal-family.spec.ts:356-394`
- Modify: `apps/web/src/components/product-directory.css:48-136`
- Modify: `apps/web/src/components/directory-progress.css:1-51`
- Test: `apps/web/src/components/directory-progress.test.tsx:284-300`

**Interfaces:**
- Consumes: existing `.product-directory.is-collapsed`, `.product-directory-layout`, `.product-directory-tools`, `.product-directory-tree`, and `.directory-progress-rail` selectors.
- Produces: a 44px persistent collapsed rail; a 240px `:hover`/`:focus-within` preview; opacity-based progress-rail hiding during preview.

- [ ] **Step 1: Write the failing browser and motion contracts**

Update the desktop directory test to assert the 44px base state, overlay preview, unchanged content position, pointer-exit close, keyboard preview, and persistent click expansion:

```ts
const content = page.locator(".product-directory-content");
const contentX = await content.evaluate(
  (element) => element.getBoundingClientRect().x,
);

await expect(directory).toHaveCSS("width", "44px");
await directory.hover();
await expect(directory).toHaveCSS("width", "240px");
await expect(directory.getByRole("searchbox")).toBeVisible();
expect(
  await content.evaluate((element) => element.getBoundingClientRect().x),
).toBe(contentX);

await content.hover({ position: { x: 320, y: 200 } });
await expect(directory).toHaveCSS("width", "44px");

await toggle.focus();
await expect(directory).toHaveCSS("width", "240px");
await content.click({ position: { x: 320, y: 200 } });
await expect(directory).toHaveCSS("width", "44px");

await toggle.click();
await expect(toggle).toHaveAttribute("aria-expanded", "true");
await expect(directory).toHaveCSS("width", "240px");
```

Extend the existing stylesheet contract to require a rail opacity transition and reduced-motion override:

```ts
expect(stylesheet).toMatch(/directory-progress-rail[^}]*transition:\s*opacity\s+160ms/s);
expect(stylesheet).toMatch(/prefers-reduced-motion:\s*reduce[^}]*directory-progress-rail/s);
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/directory-progress.test.tsx
pnpm --filter @ai-agent-platform/web exec playwright test e2e/product-portal-family.spec.ts --project=desktop --grep '产品目录在桌面静默折叠'
```

Expected: Vitest fails because the rail has no opacity transition; Playwright fails because the directory is still 52px and does not preview on hover.

- [ ] **Step 3: Implement the minimal CSS preview**

In `product-directory.css`, keep the grid column collapsed while the aside expands over content:

```css
.product-directory.is-collapsed {
  width: 44px;
}

.product-directory-layout:has(.product-directory.is-collapsed) {
  grid-template-columns: 44px minmax(0, 1fr);
}

@media (min-width: 901px) {
  .product-directory.is-collapsed:focus-within {
    width: 240px;
    overflow: auto;
  }

  .product-directory.is-collapsed:focus-within input,
  .product-directory.is-collapsed:focus-within .product-directory-tree {
    display: block;
  }

  .product-directory.is-collapsed:focus-within .product-directory-tools {
    grid-template-columns: minmax(0, 1fr) 38px;
    padding: 14px 12px;
  }

  .product-directory.is-collapsed:focus-within .directory-progress-rail {
    opacity: 0;
  }
}

@media (min-width: 901px) and (hover: hover) and (pointer: fine) {
  .product-directory.is-collapsed:hover {
    width: 240px;
    overflow: auto;
  }

  .product-directory.is-collapsed:hover input,
  .product-directory.is-collapsed:hover .product-directory-tree {
    display: block;
  }

  .product-directory.is-collapsed:hover .product-directory-tools {
    grid-template-columns: minmax(0, 1fr) 38px;
    padding: 14px 12px;
  }

  .product-directory.is-collapsed:hover .directory-progress-rail {
    opacity: 0;
  }
}
```

Keep the existing collapsed hiding rules as the base state; the preview selectors above override them. Set the collapsed tool padding to `3px` and the collapsed button to `36px × 36px` so it fits inside 44px. Restore the existing tools border, translucent background, and shadow in both preview blocks so the full directory looks identical whether previewed or pinned.

In `directory-progress.css`, fade the rail and disable that fade for reduced motion:

```css
.directory-progress-rail {
  transition: opacity 160ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .directory-progress-rail,
  .directory-progress-rail__dot {
    transition: none;
  }
}
```

- [ ] **Step 4: Run Task 1 tests and verify GREEN**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/directory-progress.test.tsx src/components/product-directory.test.tsx
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/product-portal-family.spec.ts --project=desktop --grep '产品目录在桌面静默折叠'
```

Expected: all commands pass; at 1440px and 901px the content x-coordinate is unchanged while the directory previews.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/web/e2e/product-portal-family.spec.ts apps/web/src/components/product-directory.css apps/web/src/components/directory-progress.css apps/web/src/components/directory-progress.test.tsx
git diff --cached --check
git commit -m "feat(web): preview product directory on hover"
```

---

### Task 2: Apply the same preview to solution, download, and partner directories

**Files:**
- Modify: `apps/web/e2e/solution-overview-overlay.spec.ts:266-355`
- Modify: `apps/web/e2e/business-entry-pages.spec.ts:201-280`
- Modify: `apps/web/src/app/solutions/solutions.css:14-224`
- Modify: `apps/web/src/app/downloads/downloads.css:198-235`
- Modify: `apps/web/src/app/partners/partners.css:207-242`

**Interfaces:**
- Consumes: Task 1's 44px/240px preview behavior and shared `.directory-progress-rail` fade.
- Produces: identical CSS-only hover/focus preview across solution, download, and partner directories while preserving their existing mobile drawers.

- [ ] **Step 1: Write the failing cross-route browser contracts**

For each directory, assert the same real behavior rather than only matching stylesheet text:

```ts
await expect(directory).toHaveCSS("width", "44px");
const contentX = await content.evaluate(
  (element) => element.getBoundingClientRect().x,
);

await directory.hover();
await expect(directory).toHaveCSS("width", "240px");
await expect(directory.getByRole("searchbox")).toBeVisible();
expect(
  await content.evaluate((element) => element.getBoundingClientRect().x),
).toBe(contentX);

await content.hover({ position: { x: 320, y: 200 } });
await expect(directory).toHaveCSS("width", "44px");
```

Keep the existing 900px/800px/390px assertions for modal drawers and progress-rail removal unchanged.

- [ ] **Step 2: Run the cross-route tests and verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec playwright test e2e/solution-overview-overlay.spec.ts e2e/business-entry-pages.spec.ts --project=desktop --grep '静默折叠|显示静默进度'
```

Expected: tests fail because all three directories remain 52px and do not reveal search/navigation on hover.

- [ ] **Step 3: Implement the three route-specific CSS variants**

For each stylesheet:

1. Change the collapsed grid column and directory width from `52px` to `44px`.
2. Under `@media (min-width: 901px)`, add `:focus-within` rules that set the directory width to `240px`, restore `overflow: auto`, show input/nav, restore the two-column tools layout, and set `.directory-progress-rail { opacity: 0; }`.
3. Under `@media (min-width: 901px) and (hover: hover) and (pointer: fine)`, repeat those preview declarations with `:hover`. Keep the current collapsed hiding rules as the default so touch hover cannot reveal a cramped 44px menu.
4. Use `3px` inline tool padding and `36px × 36px` collapsed buttons.
5. Leave every `@media (max-width: 900px)` drawer rule unchanged.

The solution variant follows this exact selector shape:

```css
@media (min-width: 901px) and (hover: hover) and (pointer: fine) {
  .solution-shell[data-directory-collapsed="true"]
    .solution-directory:hover {
    width: 240px;
    overflow: auto;
  }
}
```

Keep the 44px grid rule in the existing plain `@media (min-width: 901px)` block, and add a separate plain desktop `:focus-within` preview block. Use the equivalent `.download-shell/.download-directory` and `.partner-shell/.partner-directory` selectors in their existing files.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec playwright test e2e/product-portal-family.spec.ts e2e/solution-overview-overlay.spec.ts e2e/business-entry-pages.spec.ts --project=desktop --grep '静默折叠|显示静默进度'
pnpm --filter @ai-agent-platform/web exec vitest run src/components/directory-progress.test.tsx src/components/product-directory.test.tsx src/components/solution-overview.test.tsx src/components/download-center.test.tsx src/components/partner-center.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web exec eslint e2e/product-portal-family.spec.ts e2e/solution-overview-overlay.spec.ts e2e/business-entry-pages.spec.ts src/components/directory-progress.test.tsx
pnpm --filter @ai-agent-platform/web exec prettier --check src/components/directory-progress.css src/components/product-directory.css src/app/solutions/solutions.css src/app/downloads/downloads.css src/app/partners/partners.css e2e/product-portal-family.spec.ts e2e/solution-overview-overlay.spec.ts e2e/business-entry-pages.spec.ts src/components/directory-progress.test.tsx
git diff --check
```

Expected: focused Playwright passes for 1440px, 901px, 900px, 800px, and 390px; 68 focused Vitest tests pass; typecheck, ESLint, Prettier, and diff-check pass.

Then run the complete affected browser suites:

```bash
pnpm --filter @ai-agent-platform/web exec playwright test e2e/product-portal-family.spec.ts e2e/solution-overview-overlay.spec.ts e2e/business-entry-pages.spec.ts --project=desktop
```

Expected: all non-gated tests pass, the existing mobile-only test remains skipped in the desktop project, and screenshots show a quiet 44px floating rail with no page-content shift.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/web/e2e/solution-overview-overlay.spec.ts apps/web/e2e/business-entry-pages.spec.ts apps/web/src/app/solutions/solutions.css apps/web/src/app/downloads/downloads.css apps/web/src/app/partners/partners.css
git diff --cached --check
git commit -m "feat(web): preview all directories on hover"
```

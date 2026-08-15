# Quiet Directory Progress Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the product, solution, download, and partner desktop directories start as a quiet 52px progress rail and keep their expanded active item synchronized with the visible page content.

**Architecture:** Add one shared client utility that calculates document progress and the active represented anchor, plus one decorative rail component. Keep the four existing directory trees and mobile drawers; each directory supplies its own ordered anchor IDs and consumes the shared result without automatic URL mutation.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest, Testing Library, Playwright.

---

## Chunk 1: Shared progress unit

### Task 1: Calculate and render directory progress

**Files:**
- Create: `apps/web/src/components/directory-progress.tsx`
- Create: `apps/web/src/components/directory-progress.css`
- Create: `apps/web/src/components/directory-progress.test.tsx`

- [ ] **Step 1: Write failing calculation and component tests**

Cover these exact cases:

```tsx
expect(calculatePageProgress({ scrollY: 0, scrollHeight: 1000, innerHeight: 1000 })).toBe(0);
expect(calculatePageProgress({ scrollY: 450, scrollHeight: 1000, innerHeight: 500 })).toBe(0.9);
expect(calculatePageProgress({ scrollY: 900, scrollHeight: 1000, innerHeight: 500 })).toBe(1);

expect(selectActiveAnchor([{ id: "a", top: 40 }, { id: "b", top: 500 }], {
  headerOffset: 88,
  atBottom: false,
})).toBe("a");
expect(selectActiveAnchor([{ id: "a", top: -900 }, { id: "b", top: 500 }], {
  headerOffset: 88,
  atBottom: true,
})).toBe("b");
```

Render `DirectoryProgressRail` and assert `aria-hidden="true"`, the clamped CSS progress value, and the visible class only when `collapsed` is true.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/directory-progress.test.tsx --reporter=dot
```

Expected: FAIL because the shared module does not exist.

- [ ] **Step 3: Implement the pure calculations, hook, and rail**

`directory-progress.tsx` should export:

```tsx
export function calculatePageProgress(input: {
  scrollY: number;
  scrollHeight: number;
  innerHeight: number;
}): number;

export function selectActiveAnchor(
  anchors: readonly { id: string; top: number }[],
  options: { headerOffset: number; atBottom: boolean },
): string;

export function useDirectoryProgress(anchorIds: readonly string[]): {
  activeHash: string;
  progress: number;
};

export function DirectoryProgressRail(props: {
  collapsed: boolean;
  progress: number;
}): JSX.Element;
```

Implementation constraints:

- Deduplicate IDs and ignore missing DOM elements.
- Preserve DOM order, not directory-array order, when targets exist.
- Use one `requestAnimationFrame` callback for scroll/resize bursts.
- Recalculate after anchor IDs change and observe rendered-content changes with one `ResizeObserver` when available.
- Use `document.documentElement.scrollHeight - window.innerHeight`; return 0 when the range is not positive.
- Force the last target active when `Math.abs(scrollHeight - innerHeight - scrollY) <= 1`.
- Do not call `history.pushState` or `history.replaceState`.
- Clean up scroll, resize, animation-frame, and observer resources.

`directory-progress.css` defines the 1px track, quiet fill, and 8px dot. It applies a maximum 160ms positional transition and removes it under `prefers-reduced-motion: reduce`.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2. Expected: all tests pass.

- [ ] **Step 5: Commit the shared unit**

```bash
git add apps/web/src/components/directory-progress.tsx apps/web/src/components/directory-progress.css apps/web/src/components/directory-progress.test.tsx
git commit -m "feat: add quiet directory progress rail"
```

## Chunk 2: Four directory integrations

### Task 2: Integrate product and solution directories

**Files:**
- Modify: `apps/web/src/components/product-directory.tsx`
- Modify: `apps/web/src/components/product-directory.css`
- Modify: `apps/web/src/components/product-directory.test.tsx`
- Modify: `apps/web/src/components/solution-overview.tsx`
- Modify: `apps/web/src/app/solutions/solutions.css`
- Modify: `apps/web/src/components/solution-overview.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add assertions that:

- Product and solution desktop directories render collapsed initially.
- Both render one visible `DirectoryProgressRail` in the collapsed state.
- Product capability links use the hook-provided active hash without changing `window.location.hash`.
- A folded product branch containing the active capability remains rendered/open.
- The solution mobile boundary uses `(max-width: 900px)` and the route link remains `aria-current="page"` while page progress changes.

- [ ] **Step 2: Run product and solution tests and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/product-directory.test.tsx src/components/solution-overview.test.tsx --reporter=dot
```

Expected: failures for default expanded state, missing rail, missing scroll active state, and the 780px solution breakpoint.

- [ ] **Step 3: Implement the minimal integrations**

- Change both desktop collapsed state initializers to `true`.
- Change `SolutionOverview`'s JavaScript media query to `(max-width: 900px)`.
- Render the rail inside each desktop aside.
- For product pages, derive same-route hash IDs from the existing directory data and pass them to `useDirectoryProgress`.
- Prefer the tracked active hash over the URL hash when it is non-empty.
- Treat a branch as open when it contains the active same-route hash; keep unrelated user-folded branches closed.
- For solution pages, pass an empty anchor list so the route link remains the only active directory item while the progress dot still moves.
- Reduce collapsed-state shadow/glow only; do not alter expanded hierarchy, typography, or page content.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2. Expected: all tests pass.

- [ ] **Step 5: Commit product and solution integration**

```bash
git add apps/web/src/components/product-directory.tsx apps/web/src/components/product-directory.css apps/web/src/components/product-directory.test.tsx apps/web/src/components/solution-overview.tsx apps/web/src/app/solutions/solutions.css apps/web/src/components/solution-overview.test.tsx
git commit -m "feat: sync product and solution directory progress"
```

### Task 3: Integrate download and partner directories

**Files:**
- Modify: `apps/web/src/components/download-center.tsx`
- Modify: `apps/web/src/app/downloads/downloads.css`
- Modify: `apps/web/src/components/download-center.test.tsx`
- Modify: `apps/web/src/components/partner-center.tsx`
- Modify: `apps/web/src/app/partners/partners.css`
- Modify: `apps/web/src/components/partner-center.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add assertions that:

- Partner now starts collapsed; download remains collapsed.
- Both collapsed asides expose the shared rail.
- Download scrolling marks the represented resource link through `aria-current="location"` without changing the URL.
- Partner scrolling marks the matching current-view child, and its parent remains open if the user had folded that group.
- Missing or other-view partner anchors are ignored.

- [ ] **Step 2: Run download and partner tests and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/download-center.test.tsx src/components/partner-center.test.tsx --reporter=dot
```

Expected: failures for partner's expanded default and missing shared progress/scroll-active behavior.

- [ ] **Step 3: Implement the minimal integrations**

- Set partner desktop collapsed state to `true`.
- Render the shared rail in both asides.
- Build download anchor IDs from the existing hero, section, software, and resource IDs in document order.
- Build partner anchor IDs only from the current view's existing directory nodes.
- Prefer the tracked hash for active-link rendering, without updating browser history.
- Keep the active partner child's ancestor expanded through derived render state; do not mutate unrelated collapsed groups.
- Apply the same quiet collapsed surface/shadow values used by solution/product.
- Preserve download dialog, partner contact dialog, mobile drawers, and Agent isolation logic.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2. Expected: all tests pass.

- [ ] **Step 5: Commit download and partner integration**

```bash
git add apps/web/src/components/download-center.tsx apps/web/src/app/downloads/downloads.css apps/web/src/components/download-center.test.tsx apps/web/src/components/partner-center.tsx apps/web/src/app/partners/partners.css apps/web/src/components/partner-center.test.tsx
git commit -m "feat: sync download and partner directory progress"
```

## Chunk 3: Boundary and browser verification

### Task 4: Lock responsive, scroll, and regression behavior

**Files:**
- Modify: `apps/web/e2e/product-portal-family.spec.ts`
- Modify: `apps/web/e2e/solution-overview-overlay.spec.ts`
- Modify: `apps/web/e2e/business-entry-pages.spec.ts`
- Modify: `apps/web/e2e/full-public-site-overlay.spec.ts`

- [ ] **Step 1: Add failing browser contracts**

Cover:

- 1440px and 901px: each directory starts at 52px, the rail is visible, expansion is manual, and content has no horizontal overflow.
- 900px, 800px, and 390px: the desktop rail is absent and the existing modal drawer has dialog semantics, focus containment, body scroll lock, and restoration.
- Product capability, download resource, and partner subsection scrolling update the expanded directory's `aria-current` item.
- Scrolling to within 1px of the bottom activates the last represented anchor.
- Automatic tracking does not change `page.url()`.
- Solution route highlighting remains stable while its progress dot moves.
- `prefers-reduced-motion: reduce` removes the rail transition.
- Exactly one existing Agent launcher remains on every representative route.

- [ ] **Step 2: Build and run the targeted Playwright tests**

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test \
  e2e/product-portal-family.spec.ts \
  e2e/solution-overview-overlay.spec.ts \
  e2e/business-entry-pages.spec.ts \
  e2e/full-public-site-overlay.spec.ts \
  --project=desktop
```

Expected before final fixes: new contracts fail for unimplemented boundary or scroll states. After fixes: all non-environment-gated tests pass.

- [ ] **Step 3: Run final static and focused verification**

```bash
pnpm --filter @ai-agent-platform/web exec vitest run \
  src/components/directory-progress.test.tsx \
  src/components/product-directory.test.tsx \
  src/components/solution-overview.test.tsx \
  src/components/download-center.test.tsx \
  src/components/partner-center.test.tsx \
  --reporter=dot
pnpm typecheck
pnpm --filter @ai-agent-platform/web lint
git diff --check
```

Expected: unit tests, typecheck, lint, build, and targeted browser tests pass; diff check has no whitespace errors.

- [ ] **Step 4: Commit browser contracts and final fixes**

```bash
git add apps/web/e2e/product-portal-family.spec.ts apps/web/e2e/solution-overview-overlay.spec.ts apps/web/e2e/business-entry-pages.spec.ts apps/web/e2e/full-public-site-overlay.spec.ts
git commit -m "test: lock quiet directory progress behavior"
```

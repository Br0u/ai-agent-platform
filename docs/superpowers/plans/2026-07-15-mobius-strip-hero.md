# 莫比乌斯带 Hero 视觉升级 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the code-agent Hero's fake CSS rings and ribbons with a mathematically correct, animated Möbius strip that keeps the existing blue-purple visual language.

**Architecture:** Keep the server-rendered Hero layout in `page.tsx`, add a small client-only Canvas component for animation, and isolate the Möbius surface math in a pure TypeScript module so the topology can be tested without a browser. CSS owns sizing, glow, reduced-motion fallback, and responsive behavior; the Canvas owns mesh projection, depth sorting, lighting, and motion.

**Tech Stack:** Next.js 16, React 19, TypeScript, Canvas 2D, Vitest, Testing Library, existing code-agent CSS.

---

## File Map

- Create: `apps/web/src/app/product/code-agent/mobius-strip.ts`
  - Pure parametric point, mesh generation, seam/topology helpers, and viewport resolution selection.
- Create: `apps/web/src/app/product/code-agent/mobius-strip.test.ts`
  - Tests the half-twist seam, mesh dimensions, and finite numeric output.
- Create: `apps/web/src/app/product/code-agent/mobius-strip-visual.tsx`
  - Client-only Canvas renderer with resize handling, depth-sorted triangles, lighting, animation, and reduced-motion support.
- Create: `apps/web/src/app/product/code-agent/mobius-strip-visual.test.tsx`
  - Tests the SSR-safe accessible output and the reduced-motion/animation-loop contract with browser API mocks.
- Modify: `apps/web/src/app/product/code-agent/page.tsx`
  - Replace the `.ca-3d-cube-group` and `.ca-ribbon*` markup with `MobiusStripVisual`.
- Modify: `apps/web/src/app/product/code-agent/code-agent.css`
  - Remove fake cube/ribbon styles and add the actual visual container, glow, responsive sizing, and screen-reader helper styles.

The geometry module and renderer stay beside the page because this is a page-specific hero visual; this follows the existing `code-agent` co-location pattern and avoids an unrelated `features`/`portal` move.

## Chunk 1: Geometry Contract

### Task 1: Add failing geometry tests

**Files:**
- Create: `apps/web/src/app/product/code-agent/mobius-strip.test.ts`

- [ ] **Step 1: Write tests for the seam and mesh contract**

Test these behaviors:

```ts
it("maps the end of the strip to the opposite side at the seam", () => {
  const start = mobiusPoint(0, 0.4);
  const end = mobiusPoint(Math.PI * 2, 0.4);
  const oppositeStart = mobiusPoint(0, -0.4);
  expect(end.x).toBeCloseTo(oppositeStart.x);
  expect(end.y).toBeCloseTo(oppositeStart.y);
  expect(end.z).toBeCloseTo(oppositeStart.z);
});

it("creates a closed mesh with two triangles per grid cell", () => {
  const mesh = createMobiusMesh({ uSteps: 24, vSteps: 8 });
  expect(mesh.vertices).toHaveLength((24 + 1) * (8 + 1));
  expect(mesh.faces).toHaveLength(24 * 8 * 2);
});

it("does not emit non-finite coordinates", () => {
  const mesh = createMobiusMesh({ uSteps: 24, vSteps: 8 });
  expect(mesh.vertices.flatMap(({ x, y, z }) => [x, y, z]).every(Number.isFinite)).toBe(true);
});

it("keeps every triangle index inside the generated vertex buffer", () => {
  const mesh = createMobiusMesh({ uSteps: 24, vSteps: 8 });
  expect(mesh.faces.flat().every((index) => index >= 0 && index < mesh.vertices.length)).toBe(true);
});

it("keeps both boundary rows continuous across the sampled seam", () => {
  const mesh = createMobiusMesh({ uSteps: 24, vSteps: 8 });
  const rowSize = 8 + 1;
  for (let j = 0; j <= 8; j += 1) {
    const start = mesh.vertices[j];
    const end = mesh.vertices[rowSize * 24 + (8 - j)];
    expect(end.x).toBeCloseTo(start.x);
    expect(end.y).toBeCloseTo(start.y);
    expect(end.z).toBeCloseTo(start.z);
  }
});

it("selects a lower mesh resolution below the mobile breakpoint", () => {
  expect(resolutionForWidth(639)).toEqual({ uSteps: 64, vSteps: 12 });
  expect(resolutionForWidth(640)).toEqual({ uSteps: 96, vSteps: 16 });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --dir apps/web exec vitest run src/app/product/code-agent/mobius-strip.test.ts
```

Expected: FAIL because `mobius-strip.ts` does not exist yet.

## Chunk 2: Geometry and Canvas Renderer

### Task 2: Implement the pure Möbius geometry module

**Files:**
- Create: `apps/web/src/app/product/code-agent/mobius-strip.ts`
- Test: `apps/web/src/app/product/code-agent/mobius-strip.test.ts`

- [ ] **Step 1: Implement `mobiusPoint`**

Use the standard half-twist surface with explicit defaults for radius and half-width. Keep the returned type small and serializable:

```ts
export type Point3 = { x: number; y: number; z: number };
export type MobiusPoint = Point3 & { u: number; v: number };

export function mobiusPoint(
  u: number,
  v: number,
  radius = 1.72,
): MobiusPoint {
  const radial = radius + v * Math.cos(u / 2);
  return {
    x: radial * Math.cos(u),
    y: radial * Math.sin(u),
    z: v * Math.sin(u / 2),
    u,
    v,
  };
}
```

- [ ] **Step 2: Implement `createMobiusMesh`**

Accept `uSteps`, `vSteps`, `radius`, and `halfWidth`; include both seam endpoints so the renderer can draw the continuous boundary and test the seam mapping. Generate two triangles per adjacent grid cell with stable integer indices.

- [ ] **Step 3: Implement `resolutionForWidth`**

Return `{ uSteps: 64, vSteps: 12 }` for widths below `640` and `{ uSteps: 96, vSteps: 16 }` for widths at or above `640`; keep this pure so the breakpoint contract is directly testable.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm --dir apps/web exec vitest run src/app/product/code-agent/mobius-strip.test.ts
```

Expected: PASS.

### Task 3: Build the client Canvas visual

**Files:**
- Create: `apps/web/src/app/product/code-agent/mobius-strip-visual.tsx`
- Test: `apps/web/src/app/product/code-agent/mobius-strip-visual.test.tsx`

- [ ] **Step 1: Add a client component with a Canvas and accessible description**

Render a `<canvas aria-label="带有一次 180° 半扭转的莫比乌斯带">` with a stable class and an adjacent visually-hidden description stating that it is an animated Möbius strip with one 180° half-twist. The component must render safely during SSR and only touch `window`, `document`, and Canvas APIs inside `useEffect`.

- [ ] **Step 2: Add resize-aware projection and mobile downsampling**

Use a `ResizeObserver` on the container, cap device pixel ratio at 2, and resize the backing canvas without changing its CSS size. Call `resolutionForWidth(width)` on every resize callback; when a callback crosses `640px`, rebuild the mesh with the new resolution before drawing the next frame. Project rotated 3D points using perspective and center the strip in the available box.

- [ ] **Step 3: Add depth-sorted surface rendering**

For every frame, rotate the precomputed mesh, sort faces by average camera depth, draw filled triangles with hue based on `u`/`v`, and add low-opacity outer boundary and centerline strokes. Keep the render loop free of React state updates.

- [ ] **Step 4: Add motion and cleanup**

Use a 14-second slow yaw cycle plus a small pitch/vertical float. Stop the animation frame and disconnect the resize/media listeners on cleanup. Under `prefers-reduced-motion: reduce`, render one stable frame and do not schedule a loop. Remove the existing `.ca-3d-scene` six-second `float` animation so two motion systems cannot fight each other.

- [ ] **Step 5: Add and run Canvas contract tests**

Mock `HTMLCanvasElement.getContext`, `ResizeObserver`, `matchMedia`, and `requestAnimationFrame` in `mobius-strip-visual.test.tsx`. Use `renderToString` to assert SSR output includes the Canvas `aria-label` and hidden description. Use client render tests to assert reduced-motion mode renders once without scheduling a loop, normal mode schedules an animation frame, unmount calls `cancelAnimationFrame`, the observer callback is registered and `disconnect()` is called, and the media query listener is removed. Trigger observer callbacks at widths on both sides of `640px` and assert the renderer rebuilds using the corresponding resolution.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
pnpm --dir apps/web exec vitest run src/app/product/code-agent/mobius-strip.test.ts
pnpm --dir apps/web exec vitest run src/app/product/code-agent/mobius-strip-visual.test.tsx
pnpm --dir apps/web exec tsc --noEmit
```

Expected: PASS with no TypeScript errors.

## Chunk 3: Hero Integration and Verification

### Task 4: Replace the existing fake 3D markup

**Files:**
- Modify: `apps/web/src/app/product/code-agent/page.tsx`
- Modify: `apps/web/src/app/product/code-agent/code-agent.css`

- [ ] **Step 1: Replace the Hero visual children**

Import `MobiusStripVisual` and render it as the only 3D object inside `.ca-hero__visual`. Remove the three `.ca-3d-cube` elements, base ring markup, and text ribbons so there is one coherent surface.

- [ ] **Step 2: Replace obsolete CSS**

Remove the fake cube/ribbon keyframes and styles. Add a `.ca-mobius` container that fills the visual column, a pseudo-element or child glow for the floor light, and a visually-hidden utility used by the component. Preserve existing Hero sizing and add a mobile rule that keeps the visual within the column without horizontal overflow.

- [ ] **Step 3: Add a reduced-motion CSS fallback**

Use `@media (prefers-reduced-motion: reduce)` to disable decorative CSS float/glow motion. The Canvas component remains responsible for stopping its JavaScript loop and leaving the first frame visible.

### Task 5: Verify the feature end to end

**Files:**
- Test: `apps/web/src/app/product/code-agent/mobius-strip.test.ts`
- Test: `apps/web/src/app/product/code-agent/mobius-strip-visual.test.tsx`

- [ ] **Step 1: Run the focused and repository web checks**

Run:

```bash
pnpm --dir apps/web exec vitest run src/app/product/code-agent/mobius-strip.test.ts
pnpm --dir apps/web exec vitest run src/app/product/code-agent/mobius-strip-visual.test.tsx
pnpm --dir apps/web run typecheck
pnpm --dir apps/web run lint
pnpm --dir apps/web run build
```

Expected: all commands pass.

- [ ] **Step 2: Inspect the rendered Hero**

Open `/product/code-agent` in the running web app and verify:

- the object reads as a wide strip with a visible single half-twist;
- the surface has correct front/back occlusion while rotating;
- the animation is slow and does not compete with the left-side title;
- no old cubes, text ribbons, or horizontal overflow remain;
- reduced-motion mode leaves a complete static strip visible.

- [ ] **Step 3: Review the final diff**

Run:

```bash
git diff --check
git status --short
```

Confirm only the planned component, geometry module/test, page, and stylesheet changed beyond the already committed plan/spec documents.

- [ ] **Step 4: Commit the implementation**

```bash
git add apps/web/src/app/product/code-agent/mobius-strip.ts \
  apps/web/src/app/product/code-agent/mobius-strip.test.ts \
  apps/web/src/app/product/code-agent/mobius-strip-visual.tsx \
  apps/web/src/app/product/code-agent/page.tsx \
  apps/web/src/app/product/code-agent/code-agent.css
git commit -m "feat: 用真实莫比乌斯带升级码多多首屏视觉"
```

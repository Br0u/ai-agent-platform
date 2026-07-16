# Homepage Content Density and Scroll Motion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress homepage regions 2–5, add one-shot Aliyun-inspired scroll reveals, and add a subtle breathing animation to the post-Hero purple atmosphere without changing the Hero or closing CTA.

**Architecture:** Keep every content section server-rendered. Add one null-rendering client observer that progressively enhances only elements marked with `data-home-reveal="true"`; CSS owns layout, timing, staggering, reduced-motion behavior, and the purple atmosphere breath.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS, Vitest, Testing Library, Playwright.

**Design spec:** `docs/superpowers/specs/2026-07-16-home-content-density-motion-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `apps/web/src/components/home-reveal.tsx` | Client-only `IntersectionObserver` progressive enhancement; no visual values |
| `apps/web/src/components/home-reveal.test.tsx` | Observer, fallback, reduced-motion, and cleanup behavior |
| `apps/web/src/components/home-sections.tsx` | Server-rendered reveal targets and text/block markers for regions 2–5 |
| `apps/web/src/app/page.tsx` | Mount the null-rendering observer inside the existing homepage root |
| `apps/web/src/app/page.test.tsx` | Lock the four reveal targets and protect Hero/closing exclusions |
| `apps/web/src/components/home.css` | Compact post-Hero sizing, scroll reveal keyframes/staggers, purple breath, responsive and reduced-motion rules |
| `apps/web/e2e/home-reference-layout.spec.ts` | Desktop width/density, one-shot reveal, overflow, and reduced-motion browser acceptance |

Do not modify `home-content.ts`, Hero markup, closing CTA markup, or `apps/web/next-env.d.ts`.

## Chunk 1: Progressive reveal behavior

### Task 0: Preserve pre-implementation evidence and generated-file state

**Files:**
- Read only: `apps/web/next-env.d.ts`
- Evidence only: `artifacts/playwright/home-reference-before/`

- [ ] **Step 1: Preserve the current generated-file state outside the worktree**

```bash
git rev-parse HEAD > /tmp/home-density-base.sha
cp apps/web/next-env.d.ts /tmp/home-density-next-env.before
git diff -- apps/web/next-env.d.ts
```

Expected: `/tmp/home-density-base.sha` contains the committed plan handoff SHA. The backup matches the user's current worktree version, including its pre-existing `.next/dev/types/routes.d.ts` line.

- [ ] **Step 2: Build the pre-change homepage and capture baseline screenshots**

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=desktop --grep "captures named visual evidence"
mkdir -p artifacts/playwright/home-reference-before
cp artifacts/playwright/home-reference/*.png artifacts/playwright/home-reference-before/
```

Expected: four baseline screenshots exist under `artifacts/playwright/home-reference-before/`. After the build, compare `apps/web/next-env.d.ts` with `/tmp/home-density-next-env.before`; if they differ, restore the exact backup before touching source files.

### Task 1: Add the isolated homepage reveal observer

**Files:**
- Create: `apps/web/src/components/home-reveal.tsx`
- Create: `apps/web/src/components/home-reveal.test.tsx`

- [ ] **Step 1: Write the failing observer tests**

Create `home-reveal.test.tsx` with a controllable `IntersectionObserver` mock. Cover these contracts:

```tsx
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeRevealObserver } from "./home-reveal";

type ObserverCallback = IntersectionObserverCallback;

let observerCallback: ObserverCallback = () => undefined;
const observe = vi.fn();
const unobserve = vi.fn();
const disconnect = vi.fn();

class MockIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observerCallback = callback;
  }
  observe = observe;
  unobserve = unobserve;
  disconnect = disconnect;
}

function renderHarness({ reducedMotion = false } = {}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(
      (query: string): MediaQueryList =>
        ({ matches: reducedMotion, media: query }) as MediaQueryList,
    ),
  });
  return render(
    <main className="home">
      <section data-home-region="hero" />
      <section data-home-region="platform" data-home-reveal="true" />
      <section data-home-region="resources" data-home-reveal="true" />
      <section data-home-region="closing" />
      <HomeRevealObserver />
    </main>,
  );
}
```

Install and reset globals before React mounts the observer:

```tsx
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: 1_200,
    bottom: 1_500,
  } as DOMRect);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

Tests must assert:

1. Motion-capable mode adds `home-reveal-ready`, observes both marked regions, and does not observe Hero or closing.
2. Calling the captured callback with `{ isIntersecting: true, target }` adds `is-home-visible` and calls `unobserve(target)`.
3. `unmount()` calls `disconnect()` and removes `home-reveal-ready`.
4. A target whose mocked rectangle starts at `top: 700` is immediately marked visible and is not observed.
5. Reduced-motion mode and missing-`IntersectionObserver` mode leave every target visible and never add the ready class that hides pending content.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/home-reveal.test.tsx
```

Expected: FAIL because `./home-reveal` does not exist.

- [ ] **Step 3: Implement the minimal observer**

Create `home-reveal.tsx`:

```tsx
"use client";

import { useEffect } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const REVEAL_SELECTOR = '[data-home-reveal="true"]';
const READY_CLASS = "home-reveal-ready";
const VISIBLE_CLASS = "is-home-visible";

export function HomeRevealObserver() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("main.home");
    if (!root) return;

    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR),
    );
    const reveal = (target: HTMLElement) =>
      target.classList.add(VISIBLE_CLASS);
    const reduceMotion =
      window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;

    if (reduceMotion || typeof window.IntersectionObserver !== "function") {
      targets.forEach(reveal);
      return;
    }

    const revealLine = window.innerHeight - 96;
    const pending = targets.filter((target) => {
      const rect = target.getBoundingClientRect();
      if (rect.top <= revealLine && rect.bottom >= 0) {
        reveal(target);
        return false;
      }
      return true;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          reveal(target);
          observer.unobserve(target);
        }
      },
      { rootMargin: "0px 0px -96px 0px", threshold: 0.05 },
    );

    pending.forEach((target) => observer.observe(target));
    root.classList.add(READY_CLASS);

    return () => {
      observer.disconnect();
      root.classList.remove(READY_CLASS);
    };
  }, []);

  return null;
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/home-reveal.test.tsx
```

Expected: PASS with five observer/fallback tests. Missing-observer coverage must use `vi.stubGlobal("IntersectionObserver", undefined)` and verify the ready class is absent.

- [ ] **Step 5: Commit the observer unit**

```bash
git add apps/web/src/components/home-reveal.tsx apps/web/src/components/home-reveal.test.tsx
git commit -m "feat(home): add progressive reveal observer"
```

### Task 2: Mark only regions 2–5 and mount the observer

**Files:**
- Modify: `apps/web/src/app/page.test.tsx:12-31`
- Modify: `apps/web/src/components/home-sections.tsx:112-360`
- Modify: `apps/web/src/app/page.tsx:1-24`

- [ ] **Step 1: Add the failing page contract**

Add this test to `page.test.tsx`:

```tsx
it("marks only the four post-hero content regions for scroll reveal", () => {
  render(<HomePage />);

  const home = screen.getByRole("main", { name: "华鲲元启门户首页" });
  const revealRegions = Array.from(
    home.querySelectorAll('[data-home-reveal="true"]'),
    (region) => region.getAttribute("data-home-region"),
  );

  expect(revealRegions).toStrictEqual([
    "platform",
    "enterprise",
    "solutions",
    "resources",
  ]);
  expect(home.querySelector('[data-home-region="hero"]')).not.toHaveAttribute(
    "data-home-reveal",
  );
  expect(
    home.querySelector('[data-home-region="closing"]'),
  ).not.toHaveAttribute("data-home-reveal");

  const markerCounts = Array.from(
    home.querySelectorAll<HTMLElement>('[data-home-reveal="true"]'),
    (region) => ({
      region: region.dataset.homeRegion,
      text: region.querySelectorAll('[data-home-reveal-item="text"]').length,
      block: region.querySelectorAll('[data-home-reveal-item="block"]').length,
    }),
  );
  expect(markerCounts).toStrictEqual([
    { region: "platform", text: 3, block: 10 },
    { region: "enterprise", text: 2, block: 4 },
    { region: "solutions", text: 3, block: 6 },
    { region: "resources", text: 3, block: 5 },
  ]);
  expect(
    home.querySelectorAll(
      '[data-home-region="hero"] [data-home-reveal-item], [data-home-region="closing"] [data-home-reveal-item]',
    ),
  ).toHaveLength(0);
});
```

- [ ] **Step 2: Run the page test and verify failure**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/page.test.tsx
```

Expected: FAIL because no regions carry `data-home-reveal`.

- [ ] **Step 3: Add reveal targets and item roles without changing content**

In `home-sections.tsx`:

- Add `data-home-reveal="true"` only to `PlatformOverview`, `EnterpriseProof`, `SolutionIndex`, and `ResourceTable` section elements.
- Add `data-home-reveal-item="text"` to each target region's kicker, `h2`, and intro paragraph.
- Add `data-home-reveal-item="block"` to platform actions, all four capability cards, all platform/enterprise/solution/resource rows, and the three generated illustrations.
- Do not add either attribute inside `HeroEvidence` or `PrivateDeploymentClose`.
- Preserve all existing class names, content, links, accessibility labels, and list keys.

For the conditional solution row class, append no new CSS class; the data attribute is independent:

```tsx
<article
  className={
    solution.subsetLabel
      ? "home-solution-row home-solution-row--subset"
      : "home-solution-row"
  }
  data-home-reveal-item="block"
  key={solution.title}
>
```

In `page.tsx`, import and mount the null-rendering client component once inside `<main>`:

```tsx
import { HomeRevealObserver } from "../components/home-reveal";

// Keep the six visual regions in their current order.
<PrivateDeploymentClose />
<HomeRevealObserver />
```

Because the observer returns `null`, the six direct child region order remains unchanged.

- [ ] **Step 4: Run the page and observer tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/page.test.tsx src/components/home-reveal.test.tsx
```

Expected: PASS; the existing six-region hierarchy test must remain unchanged.

- [ ] **Step 5: Commit semantic reveal markers**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/page.test.tsx apps/web/src/components/home-sections.tsx
git commit -m "feat(home): mark post-hero reveal layers"
```

## Chunk 2: Compact layout and motion styling

### Task 3: Lock the compact desktop and responsive layout in browser tests

**Files:**
- Modify: `apps/web/e2e/home-reference-layout.spec.ts:76-220`
- Modify: `apps/web/src/components/home.css:19-900`

- [ ] **Step 1: Add failing desktop density assertions**

Extend `matches the approved desktop composition` after the Hero assertions:

```ts
const heroFrame = await page.locator(".home-hero > .home-frame").boundingBox();
const closingFrame = await page
  .locator(".home-closing > .home-frame")
  .boundingBox();
const contentFrames = await page
  .locator(
    '[data-home-region="platform"] > .home-frame, [data-home-region="enterprise"] > .home-frame, [data-home-region="solutions"] > .home-frame, [data-home-region="resources"] > .home-frame',
  )
  .evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width),
  );

expect(heroFrame!.width).toBeGreaterThan(1_300);
expect(closingFrame!.width).toBeGreaterThan(1_300);
expect(heroFrame!.height).toBeGreaterThanOrEqual(800);
expect(closingFrame!.height).toBeGreaterThanOrEqual(560);
expect(
  await page.locator(".home-hero h1").evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  ),
).toBeGreaterThanOrEqual(66);
expect(contentFrames).toHaveLength(4);
contentFrames.forEach((width) => {
  expect(width).toBeGreaterThanOrEqual(1_100);
  expect(width).toBeLessThanOrEqual(1_121);
});
```

Assert every row stays within the compact limits and does not clip wrapped content:

```ts
for (const [selector, maximum] of [
  [".home-platform-row", 140],
  [".home-enterprise-row", 124],
  [".home-solution-row:not(.home-solution-row--subset)", 124],
  [".home-solution-row--subset", 140],
  [".home-resource", 128],
] as const) {
  const rows = await page.locator(selector).evaluateAll(
    (elements) => elements.map((element) => ({
      height: element.getBoundingClientRect().height,
      clipsContent: element.scrollHeight > element.clientHeight + 1,
    })),
  );
  expect(rows.length).toBeGreaterThan(0);
  rows.forEach((row) => {
    expect(row.height).toBeLessThanOrEqual(maximum);
    expect(row.clipsContent).toBe(false);
  });
}
```

Add a desktop-project tablet test at `768x1024`. It must call `expectNoHorizontalOverflow`, assert the platform/solution/resource grids have one column, assert all content frames are narrower than the viewport, assert each intro panel's computed `min-height` is at most `480px`, and assert `scrollHeight <= clientHeight + 1` so content-driven growth is allowed without clipping. This catches the existing `640px` tablet minimum without imposing a brittle maximum height.

- [ ] **Step 2: Build and run the desktop composition test to verify failure**

Run:

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=desktop --grep "approved desktop composition"
```

Expected: FAIL because content frames are still 1360px and rows exceed the new limits.

- [ ] **Step 3: Implement post-Hero density overrides**

Modify existing declarations instead of appending duplicate overrides where practical. Keep `.home-frame`, all `.home-hero*`, and all `.home-closing*` values unchanged.

Required desktop values:

```css
.home-platform-overview > .home-frame,
.home-enterprise > .home-frame,
.home-solutions > .home-frame,
.home-resources > .home-frame {
  max-width: 1120px;
}

.home-platform-overview,
.home-enterprise,
.home-solutions,
.home-resources {
  padding-block: clamp(64px, 6vw, 96px);
}

.home-capability-rail { gap: clamp(14px, 1.5vw, 20px); }
.home-capability-card {
  min-height: 132px;
  padding: 20px;
  border-radius: 22px;
}
.home-capability-card .home-icon-shell {
  top: 18px;
  right: 18px;
  width: 46px;
  height: 46px;
  flex-basis: 46px;
}
.home-capability-card__copy { margin-top: 34px; }

.home-platform__grid {
  gap: 24px;
  margin-top: 48px;
}
.home-platform__intro,
.home-solutions__intro,
.home-resources__intro {
  min-height: 520px;
  padding: clamp(30px, 3vw, 40px);
  border-radius: 28px;
}
.home-platform__illustration,
.home-solutions__illustration,
.home-resources__illustration {
  width: min(72%, 380px);
}

.home-platform-row {
  grid-template-columns: 52px 36px minmax(120px, .65fr) minmax(180px, 1.35fr) 36px;
  gap: 16px;
  min-height: 134px;
  padding: 20px 26px;
}
.home-enterprise__heading {
  min-height: 190px;
  padding: 40px;
  border-radius: 28px;
}
.home-enterprise-row {
  grid-template-columns: 52px 44px minmax(180px, .9fr) minmax(260px, 1.3fr);
  gap: 22px;
  min-height: 118px;
  padding-block: 18px;
}
.home-solution-row {
  grid-template-columns: 52px 40px minmax(0, 1fr) 36px;
  gap: 18px;
  min-height: 116px;
  padding: 18px 28px;
}
.home-solution-row--subset {
  min-height: 132px;
}
.home-solution-row--subset p { margin-top: 6px; }
.home-resource {
  grid-template-columns: 52px minmax(0, 1fr) 40px;
  gap: 20px;
  min-height: 124px;
  padding-block: 18px;
}
```

Also apply these scoped reductions inside regions 2–5:

- Main icon shells: 50px square, 16px radius, 24px SVG.
- Row arrows: 36px square.
- Intro/enterprise `h2`: `clamp(38px, 3.6vw, 54px)`.
- Card/row `h3`: `clamp(18px, 1.4vw, 22px)`.
- Resource titles (`.home-resource__copy strong`): `clamp(19px, 1.55vw, 23px)`.
- Intro copy top margin: 20px; action group top margin: 24px.
- Panel/list radius: 28px; enterprise list inline padding: 30px; resource list inline padding: 30px.

At `max-width: 1179px`, retain single-column grids but lower intro minimum height to 480px and illustration width to `min(58%, 360px)`.

At `max-width: 759px`, keep the existing 32px page gutter and use these minimums:

```css
.home-capability-card { min-height: 132px; }
.home-platform-row { min-height: 128px; }
.home-enterprise-row { min-height: 126px; }
.home-solution-row { min-height: 126px; }
.home-resource { min-height: 118px; }
```

Do not force heights when wrapped content needs more room; use `min-height` only.

- [ ] **Step 4: Rebuild and run desktop plus mobile layout acceptance**

Run:

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=desktop --grep "approved desktop composition"
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=desktop --grep "compact tablet"
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=mobile --grep "without clipping"
```

Expected: PASS; no horizontal overflow and Hero/closing frames remain wide.

- [ ] **Step 5: Commit the compact layout**

```bash
git add apps/web/src/components/home.css apps/web/e2e/home-reference-layout.spec.ts
git commit -m "style(home): compact post-hero content regions"
```

### Task 4: Add staged reveal CSS and the purple atmosphere breath

**Files:**
- Modify: `apps/web/e2e/home-reference-layout.spec.ts:220-310`
- Modify: `apps/web/src/components/home.css:38-60,646-670,865-891`

- [ ] **Step 1: Add failing motion acceptance tests**

Add a desktop-only test:

```ts
test("reveals post-hero regions once as they enter the viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHome(page, "no-preference");

  const resources = page.locator('[data-home-region="resources"]');
  await expect(resources).not.toHaveClass(/is-home-visible/);
  await resources.scrollIntoViewIfNeeded();
  await expect(resources).toHaveClass(/is-home-visible/);

  const firstItem = resources.locator("[data-home-reveal-item]").first();
  const activeMotion = await Promise.all([
    resources.evaluate((element) => getComputedStyle(element).animationName),
    firstItem.evaluate((element) => getComputedStyle(element).animationName),
    page.locator(".home-atmosphere span").nth(1).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        names: style.animationName,
        durations: style.animationDuration,
      };
    }),
  ]);
  expect(activeMotion[0]).toContain("home-section-reveal");
  expect(activeMotion[1]).toMatch(/home-(text|block)-reveal/);
  expect(activeMotion[2].names).toContain("home-purple-breathe");
  expect(activeMotion[2].durations).toContain("8s");

  const breathContract = await page
    .locator(".home-atmosphere span")
    .nth(1)
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const animation = element
        .getAnimations()
        .find(
          (candidate) =>
            candidate instanceof CSSAnimation &&
            candidate.animationName === "home-purple-breathe",
        );
      const timing = animation?.effect?.getTiming();
      const frames =
        animation?.effect instanceof KeyframeEffect
          ? animation.effect.getKeyframes()
          : [];
      return {
        easing: style.animationTimingFunction,
        iterations: timing?.iterations,
        opacities: frames.map((frame) => String(frame.opacity)),
        scales: frames.map((frame) => String(frame.scale)),
      };
    });
  expect(breathContract.easing).toContain("ease-in-out");
  expect(breathContract.iterations).toBe(Infinity);
  expect(breathContract.opacities).toEqual(["0.72", "1"]);
  expect(breathContract.scales).toEqual(["0.94", "1.06"]);

  const foregroundInfiniteAnimations = await resources
    .locator("[data-home-reveal-item]")
    .evaluateAll((elements) =>
      elements.flatMap((element) =>
        element
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations === Infinity),
      ).length,
    );
  expect(foregroundInfiniteAnimations).toBe(0);

  await expect
    .poll(() => firstItem.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
});
```

Extend the reduced-motion test selector to include `[data-home-reveal-item]`. Assert reveal regions and items have opacity `1`, animation name `none`, no blur, and no transform. Assert the second atmosphere span has `animationName === "none"` and `scale === "none"` or `"1"`. Also assert the Hero and its children never use `home-section-reveal` or `home-purple-breathe` in normal-motion mode.

- [ ] **Step 2: Build and run the motion tests to verify failure**

Run:

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=desktop --grep "reveals post-hero|reduced motion"
```

Expected: FAIL because `home-section-reveal`, child reveal animation names, and `home-purple-breathe` do not exist yet.

- [ ] **Step 3: Replace mount-time region animation with scoped reveal animations**

Keep the current `home-region-enter` animation only on Hero and closing:

```css
.home [data-home-region="hero"],
.home [data-home-region="closing"] {
  animation: home-region-enter 620ms var(--ease-out) both;
}
```

Add progressive item rules:

```css
.home-reveal-ready [data-home-reveal]:not(.is-home-visible) {
  opacity: 0;
  transform: translateY(32px);
}

.home-reveal-ready [data-home-reveal].is-home-visible {
  animation: home-section-reveal 520ms var(--ease-out) both;
}

.home-reveal-ready [data-home-reveal] [data-home-reveal-item] {
  opacity: 0;
}

.home-reveal-ready
  [data-home-reveal].is-home-visible
  [data-home-reveal-item="text"] {
  animation: home-text-reveal 480ms var(--ease-out) both;
  animation-delay: var(--home-reveal-delay, 0ms);
}

.home-reveal-ready
  [data-home-reveal].is-home-visible
  [data-home-reveal-item="block"] {
  animation: home-block-reveal 440ms var(--ease-out) both;
  animation-delay: var(--home-reveal-delay, 160ms);
}

@keyframes home-section-reveal {
  from { opacity: 0; transform: translateY(32px); }
  to { opacity: 1; transform: none; }
}

@keyframes home-text-reveal {
  from { opacity: 0; filter: blur(10px); transform: translateY(10px); }
  to { opacity: 1; filter: blur(0); transform: none; }
}

@keyframes home-block-reveal {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: none; }
}
```

Assign delays by visual hierarchy:

- kicker `0ms`, target-region `h2` `60ms`, intro `120ms`, actions `180ms`.
- platform capability cards: `240ms`, `300ms`, `360ms`, `420ms`.
- platform rows: `480ms`, `540ms`, `600ms`, `660ms`; platform illustration: `720ms`.
- enterprise rows: `180ms`, `240ms`, `300ms`, `360ms`.
- solution rows: `240ms`, `300ms`, `360ms`, `420ms`, `480ms`; solution illustration: `540ms`.
- resource rows: `240ms`, `300ms`, `360ms`, `420ms`; resource illustration: `480ms`.

Use existing component classes and `:nth-child()` / `:nth-of-type()` selectors; do not add inline styles.

- [ ] **Step 4: Rebuild and prove reveal staging before adding the breath**

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=desktop --grep "reveals post-hero"
```

Expected: section and child reveal animation-name assertions pass; the same test still fails only on the missing `home-purple-breathe` assertion.

- [ ] **Step 5: Add the purple breath without touching Hero**

Amend only the second atmosphere span:

```css
.home-atmosphere span:nth-child(2) {
  inset: 28% -14% auto auto;
  background: rgb(115 88 234 / 28%);
  animation:
    home-atmosphere-drift 16s ease-in-out infinite alternate,
    home-purple-breathe 8s ease-in-out infinite alternate;
}

@keyframes home-purple-breathe {
  from { opacity: .72; scale: .94; }
  to { opacity: 1; scale: 1.06; }
}
```

The individual `scale` property intentionally composes with the existing drift keyframe's `transform`.

Inside `prefers-reduced-motion: reduce`, ensure all reveal items are immediately visible and reset blur, transform, scale, animation, and delay:

```css
.home-reveal-ready [data-home-reveal],
.home-reveal-ready [data-home-reveal] [data-home-reveal-item] {
  opacity: 1;
  filter: none;
  transform: none;
  animation: none;
}

.home-atmosphere span {
  animation: none;
  transform: none;
  scale: none;
}
```

- [ ] **Step 6: Rebuild and run motion acceptance**

Run:

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=desktop --grep "reveals post-hero|reduced motion|loads without"
```

Expected: PASS with no console, React, or image diagnostics.

- [ ] **Step 7: Commit motion styling**

```bash
git add apps/web/src/components/home.css apps/web/e2e/home-reference-layout.spec.ts
git commit -m "feat(home): stage scroll reveals and background breath"
```

## Chunk 3: Full verification and visual QA

### Task 5: Verify the complete homepage change

**Files:**
- Verify only; do not include `apps/web/next-env.d.ts` or `.superpowers/` in commits.

- [ ] **Step 1: Run focused unit tests**

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/page.test.tsx src/components/home-reveal.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full Web quality checks**

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web format:check
```

Expected: all commands exit 0.

- [ ] **Step 3: Build and run the complete homepage Playwright file**

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts
```

Expected: desktop and mobile projects pass, including overflow, density, reveal, reduced motion, accessibility, and diagnostics.

Immediately compare the generated file with the preserved user copy:

```bash
cmp -s apps/web/next-env.d.ts /tmp/home-density-next-env.before
```

Expected: exit 0. If the build rewrote it, restore exactly `/tmp/home-density-next-env.before` before continuing; do not use `git checkout` because the pre-task file was already modified.

- [ ] **Step 4: Inspect generated screenshots**

Review:

- `artifacts/playwright/home-reference-before/home-1440.png`
- `artifacts/playwright/home-reference-before/home-768.png`
- `artifacts/playwright/home-reference-before/home-390.png`
- `artifacts/playwright/home-reference-before/home-1440-reduced.png`
- `artifacts/playwright/home-reference/home-1440.png`
- `artifacts/playwright/home-reference/home-768.png`
- `artifacts/playwright/home-reference/home-390.png`
- `artifacts/playwright/home-reference/home-1440-reduced.png`

Confirm:

- Hero and closing CTA retain their prior width and composition.
- Regions 2–5 are visibly narrower and 20–30% shorter without text clipping.
- Before/after screenshots preserve Hero and closing composition while regions 2–5 become narrower and shorter.
- No empty region remains hidden in the full-page screenshot.

Screenshots intentionally disable animation and verify composition only. The live Playwright motion test from Task 4 is the source of truth for the 8-second breath, reveal timing, Hero exclusion, and reduced-motion behavior.

- [ ] **Step 5: Audit the final diff**

```bash
git status --short
BASE_SHA=$(cat /tmp/home-density-base.sha)
git diff --check "$BASE_SHA"..HEAD
git diff --stat "$BASE_SHA"..HEAD
```

Expected: only the planned homepage source/tests are in the implementation commits. The pre-existing `apps/web/next-env.d.ts` modification and `.superpowers/` visual drafts remain uncommitted and untouched.

### Task 6: Apply and reverify conditional QA corrections

**Files:**
- Modify only if required: `apps/web/src/components/home-reveal.tsx`
- Modify only if required: `apps/web/src/components/home-sections.tsx`
- Modify only if required: `apps/web/src/components/home.css`
- Modify only if required: `apps/web/src/app/page.tsx`
- Modify only if required: `apps/web/src/app/page.test.tsx`
- Modify only if required: `apps/web/src/components/home-reveal.test.tsx`
- Modify only if required: `apps/web/e2e/home-reference-layout.spec.ts`

- [ ] **Step 1: Make the smallest correction found by Task 5**

Do not change copy, links, Hero, closing CTA, or unrelated files. If Task 5 found no issue, skip the rest of Task 6 and do not create a commit.

- [ ] **Step 2: Rerun the affected focused test, then full acceptance**

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/page.test.tsx src/components/home-reveal.test.tsx
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts
cmp -s apps/web/next-env.d.ts /tmp/home-density-next-env.before
```

Expected: every command exits 0. Restore the exact `/tmp` backup if and only if the build rewrote `next-env.d.ts`, then rerun `git status --short`.

- [ ] **Step 3: Reinspect the four before/after screenshots and final diff**

```bash
git diff --check
git diff --stat
git status --short
```

Expected: corrected screenshots still preserve Hero/closing, post-Hero regions remain compact, and the working diff contains only planned homepage files.

- [ ] **Step 4: Commit the verified correction**

Stage the allowed implementation files; unchanged paths add nothing:

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/page.test.tsx apps/web/src/components/home-reveal.tsx apps/web/src/components/home-reveal.test.tsx apps/web/src/components/home-sections.tsx apps/web/src/components/home.css apps/web/e2e/home-reference-layout.spec.ts
git diff --cached --check
git commit -m "fix(home): finish compact motion visual QA"
BASE_SHA=$(cat /tmp/home-density-base.sha)
git diff --check "$BASE_SHA"..HEAD
git diff --stat "$BASE_SHA"..HEAD
```

Expected: the staged diff passes whitespace checks, the commit succeeds, and the post-commit audit includes every implementation commit. If no files changed after verification, do not create an empty commit.

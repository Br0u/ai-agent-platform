# Pricing Page and M Assistant Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-calculating pricing configuration page and a public-portal M-shaped placeholder assistant with stable future API contracts.

**Architecture:** Keep pricing configuration and summary generation in a focused client feature, with placeholder API contracts that do not touch the database. Mount one assistant widget from `SiteShell`, gate it through the registered public-route model, and isolate server responses behind an `AssistantProvider` interface so future AI integration does not change the UI protocol.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Vitest, Testing Library, CSS, Claude Design HTML artifact, image generation, WebP.

**Source spec:** `docs/superpowers/specs/2026-07-13-pricing-and-m-assistant-design.md`

---

## Chunk 1: Design artifact, asset, and pricing domain

### Task 1: Freeze the production design direction

**Files:**
- Create: `docs/design/pricing-m-assistant-exploration.html`
- Create: `docs/design/pricing-m-assistant-verification.md`
- Create: `docs/design/assets/m-assistant/source.png`
- Create: `apps/web/public/assets/assistant/m-assistant.webp`

- [ ] **Step 1: Read the required design references**

Use `@claude-design`. Read its `references/workflow.md`, `references/design-principles.md`, `references/output-formats.md`, `references/variations-and-tweaks.md`, and `references/verification.md`, plus the repository files `docs/design/brand-spec.md` and `packages/ui/src/tokens.css`.

- [ ] **Step 2: Build a three-variation HTML design canvas**

Create one self-contained HTML artifact showing three materially different refinements inside the approved “企业助手型 + 机械折线 M” direction:

1. conservative structured panel;
2. compact technical dock;
3. editorial support panel.

Each variation must include collapsed assistant, open assistant, desktop pricing layout, and mobile behavior. Use exact repository tokens, real Chinese copy, no fake prices, no emoji, no large gradient background, and a labeled image placeholder until the M asset exists. Mark the conservative structured panel as the implementation direction.

- [ ] **Step 3: Verify the placeholder artifact in a real browser**

Run a local server from the repository root:

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/docs/design/pricing-m-assistant-exploration.html` in a real browser at `1440 × 1000` and `390 × 844`. Record viewport, overflow result, console result, and the selected conservative variant in `docs/design/pricing-m-assistant-verification.md`. Expected: `document.documentElement.scrollWidth === window.innerWidth`, no missing text, and zero console errors.

- [ ] **Step 4: Generate the mechanical-fold M asset**

Use `@imagegen` to create one centered, full-body, letter-M-shaped enterprise assistant on transparency: blue body, indigo structural limbs, one restrained violet status light, compact mechanical folded-line silhouette, no logo, no readable text, no shadows, no scenery, no detached effects. After selecting the result, copy the generated PNG to the exact path and verify it exists:

```bash
mkdir -p docs/design/assets/m-assistant
cp <selected-imagegen-output.png> docs/design/assets/m-assistant/source.png
test -s docs/design/assets/m-assistant/source.png
```

Expected: all commands exit `0` and the source PNG is non-empty.

- [ ] **Step 5: Produce and inspect the production WebP**

Confirm the encoder is available, then run:

```bash
command -v cwebp
mkdir -p apps/web/public/assets/assistant
cwebp -quiet -resize 256 256 docs/design/assets/m-assistant/source.png -o apps/web/public/assets/assistant/m-assistant.webp
sips -g pixelWidth -g pixelHeight -g hasAlpha apps/web/public/assets/assistant/m-assistant.webp
```

Expected: `cwebp` resolves, `pixelWidth: 256`, `pixelHeight: 256`, and `hasAlpha: yes`. If `cwebp` is absent, stop and report the missing required encoder instead of silently changing formats.

- [ ] **Step 6: Replace the HTML placeholder and repeat browser verification**

Replace the M placeholder in all three HTML variations with `/apps/web/public/assets/assistant/m-assistant.webp`. Repeat the two viewports from Step 3 and add the final result to `docs/design/pricing-m-assistant-verification.md`. Inspect the asset at its production 64px size. Expected: the M silhouette remains recognizable, alpha is clean, there is no horizontal overflow, and the console remains error-free.

- [ ] **Step 7: Commit the design and asset**

```bash
git add docs/design/pricing-m-assistant-exploration.html docs/design/pricing-m-assistant-verification.md docs/design/assets/m-assistant/source.png apps/web/public/assets/assistant/m-assistant.webp
git commit -m "design: define pricing and M assistant visuals"
```

### Task 2: Add deterministic pricing configuration and handoff encoding

**Files:**
- Create: `apps/web/src/features/pricing/pricing-config.ts`
- Create: `apps/web/src/features/pricing/pricing-summary.ts`
- Create: `apps/web/src/features/pricing/pricing-summary.test.ts`
- Create: `apps/web/src/features/pricing/pricing-query.ts`
- Create: `apps/web/src/features/pricing/pricing-query.test.ts`

- [ ] **Step 1: Write failing pricing domain tests**

Cover these exact cases:

```ts
expect(DEFAULT_PRICING_SELECTION).toEqual({
  deployment: "local-private",
  scale: "pilot",
  modules: [],
  term: "tbd",
});

expect(buildPricingSummary({
  deployment: "local-private",
  scale: "pilot",
  modules: ["workflow", "agent-studio"],
  term: "1y",
})).toEqual([
  "部署方式：本地私有化",
  "使用规模：体验验证",
  "功能模块：AI Agent Studio、Workflow",
  "服务周期：一年",
]);

expect(buildPricingContactHref(selection)).toBe(
  "/contact?source=pricing&deployment=local-private&scale=pilot&modules=agent-studio%2Cworkflow&term=1y",
);
```

Also verify unknown query IDs are ignored and module IDs are deduplicated and sorted.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/features/pricing/pricing-summary.test.ts src/features/pricing/pricing-query.test.ts
```

Expected: FAIL because the pricing modules do not exist.

- [ ] **Step 3: Implement the minimal pricing domain**

Define readonly option tables, stable ID union types, `PricingSelection`, `DEFAULT_PRICING_SELECTION`, `buildPricingSummary`, `buildPricingContactHref`, and `parsePricingContactQuery`. Keep query parsing allowlist-based and free of database or browser dependencies.

- [ ] **Step 4: Run the tests and confirm GREEN**

Run the same targeted test command. Expected: all pricing domain tests pass.

- [ ] **Step 5: Commit the pricing domain**

```bash
git add apps/web/src/features/pricing
git commit -m "feat(pricing): add configuration and contact handoff"
```

### Task 3: Implement the pricing page and placeholder estimate interface

**Files:**
- Create: `apps/web/src/components/portal/pricing/pricing-calculator.tsx`
- Create: `apps/web/src/components/portal/pricing/pricing-calculator.css`
- Create: `apps/web/src/components/portal/pricing/pricing-calculator.test.tsx`
- Create: `apps/web/src/features/pricing/pricing-contract.ts`
- Create: `apps/web/src/app/pricing/page.tsx`
- Create: `apps/web/src/app/pricing/page.test.tsx`
- Create: `apps/web/src/app/api/v1/pricing/estimate/handler.ts`
- Create: `apps/web/src/app/api/v1/pricing/estimate/route.ts`
- Create: `apps/web/src/app/api/v1/pricing/estimate/route.test.ts`

- [ ] **Step 1: Write failing page and API tests**

The component test must verify defaults; every specified deployment, scale, module, and term option; visible labels; multi-select modules; live summary updates; the exact fixed disclosure; disabled contact action with no module; an `aria-describedby` explanation reachable from that disabled control; the exact encoded contact link after selection; and absence of currency/amount fields (`￥`, `¥`, `CNY`, `USD`, `amount`) in every state.

The route test must assert exact status codes and response bodies for: legal input returning HTTP `501` with only `status` and the fixed message; invalid IDs; duplicate modules; empty modules; missing fields; malformed JSON returning HTTP `400` with `invalid_configuration`; and no `amount` key in any legal response. Import the route module and assert it exports `POST` but no `GET`; verify the framework-level GET request returns HTTP `405` during Task 7 browser QA.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/portal/pricing/pricing-calculator.test.tsx src/app/pricing/page.test.tsx src/app/api/v1/pricing/estimate/route.test.ts
```

Expected: FAIL because the page and route do not exist.

- [ ] **Step 3: Implement the minimal page**

Build the approved two-column layout with labeled controls, live requirement summary, the fixed disclosure “在线估算尚未开放，最终价格以商务报价为准”, and a contact link enabled only after at least one module is selected. When disabled, use a semantic disabled control tied to a visible explanation through `aria-describedby`. Do not call the estimate API and do not display a numeric amount.

- [ ] **Step 4: Implement the estimate contract**

Define shared request, `not_available`, and error types plus the allowlist schema in `pricing-contract.ts`. Consume the same contract from the handler and its tests. Keep `route.ts` as the thin POST adapter. Return only the spec-defined `400` and `501` JSON shapes; do not import database code.

- [ ] **Step 5: Run targeted tests and confirm GREEN**

Run the targeted command from Step 2. Expected: all pricing page and route tests pass.

- [ ] **Step 6: Commit the pricing page**

```bash
git add apps/web/src/components/portal/pricing apps/web/src/features/pricing apps/web/src/app/pricing apps/web/src/app/api/v1/pricing
git commit -m "feat(pricing): add estimate-ready pricing page"
```

## Chunk 2: Assistant contract and global widget

### Task 4: Add the placeholder assistant provider and API contract

**Files:**
- Create: `apps/web/src/features/assistant/assistant-contract.ts`
- Create: `apps/web/src/server/assistant/assistant-provider.ts`
- Create: `apps/web/src/server/assistant/placeholder-assistant-provider.ts`
- Create: `apps/web/src/server/assistant/placeholder-assistant-provider.test.ts`
- Create: `apps/web/src/server/assistant/assistant-request-log.ts`
- Create: `apps/web/src/app/api/v1/assistant/chat/handler.ts`
- Create: `apps/web/src/app/api/v1/assistant/chat/route.ts`
- Create: `apps/web/src/app/api/v1/assistant/chat/route.test.ts`

- [ ] **Step 1: Write failing provider and route tests**

Verify the three exact preset questions map to exact success bodies containing `mode: "placeholder"`, the expected fixed message, and action labels plus hrefs for `/docs#quick-start`, `/contact`, and `/support`. Verify arbitrary input gets the exact generic placeholder body. Require `context.pathname` to be a path-only string beginning with `/`, no query/hash, and at most 256 Unicode characters; verify a valid pathname reaches the Provider and invalid/missing context is rejected. Verify trimming, Unicode-aware 500-character acceptance, 501-character rejection, blank rejection, missing/non-string message rejection, malformed JSON, exact HTTP `400` validation body, exact HTTP `503` provider-failure body, and that error responses never echo the submitted message. Import the route module and assert it exports `POST` but no `GET`; verify framework-level GET returns HTTP `405` in Task 7.

Inject a request logger and deterministic clock/request ID into handler tests. Assert one metadata record contains only request ID, status code, and non-negative duration; assert the serialized log record contains neither the submitted message nor `context.pathname`.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/assistant/placeholder-assistant-provider.test.ts src/app/api/v1/assistant/chat/route.test.ts
```

Expected: FAIL because the provider and API route do not exist.

- [ ] **Step 3: Implement the provider boundary**

Define `AssistantProvider` with one `reply(request)` method. Implement `PlaceholderAssistantProvider` without external calls or persistence. Keep fixed copy and suggested actions in the provider, not in the route. Implement a small structured request logger accepting only `{ requestId, statusCode, durationMs }`.

- [ ] **Step 4: Implement validation and the thin route**

Count Unicode characters with `Array.from(message.trim()).length`. The handler returns the exact stable success/error contracts. Read or create a request ID, measure elapsed time, and emit only request ID, status code, and duration through the injected logger. Never pass the request body to the logger. `route.ts` delegates to a default placeholder provider.

- [ ] **Step 5: Run targeted tests and confirm GREEN**

Run the command from Step 2. Expected: all provider and route tests pass.

- [ ] **Step 6: Commit the assistant backend seam**

```bash
git add apps/web/src/features/assistant/assistant-contract.ts apps/web/src/server/assistant apps/web/src/app/api/v1/assistant
git commit -m "feat(assistant): add placeholder chat provider"
```

### Task 5: Implement assistant visibility and accessible widget state

**Files:**
- Create: `apps/web/src/config/assistant-visibility.ts`
- Create: `apps/web/src/config/assistant-visibility.test.ts`
- Create: `apps/web/src/components/assistant/assistant-launcher.tsx`
- Create: `apps/web/src/components/assistant/assistant-panel.tsx`
- Create: `apps/web/src/components/assistant/assistant-widget.tsx`
- Create: `apps/web/src/components/assistant/assistant-widget.css`
- Create: `apps/web/src/components/assistant/assistant-widget.test.tsx`
- Create: `apps/web/src/components/assistant/assistant-widget.styles.test.ts`
- Create: `apps/web/src/components/assistant/use-assistant-session.ts`
- Create: `apps/web/src/components/assistant/use-assistant-session.test.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.test.tsx`

- [ ] **Step 1: Write failing visibility tests**

Require `true` for `/`, `/product`, `/pricing`, `/docs`, and `/support`; require `false` for unknown routes, `/login`, `/register`, every `/staff/**`, `/console/**`, and `/admin/**` route.

- [ ] **Step 2: Write failing widget tests**

Cover collapsed/open states, dialog semantics, focus movement, Esc close and focus return, preset submission, trimmed free input, blank prevention, disabled controls during request, successful placeholder response, and retained input plus one-request-per-click retry after failure. Require persistent “帮助中心” and “商务咨询” fallback links in normal and failed states. On failure, assert no assistant answer is appended.

Require message history to have no `aria-live`; require a separate polite status region to contain only the newest assistant response. Add a focused CSS test that reads `assistant-widget.css` and asserts an explicit `@media (prefers-reduced-motion: reduce)` rule disables the launcher animation. Browser QA remains responsible for confirming the actual computed animation.

The session-hook test must render one controller, add a message, unmount/remount only the widget consumer while leaving the controller mounted, and confirm the history survives. It must also verify a full controller remount clears history and verify an older delayed response cannot overwrite or append after a newer active request result.

- [ ] **Step 3: Run tests and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/config/assistant-visibility.test.ts src/components/assistant/use-assistant-session.test.tsx src/components/assistant/assistant-widget.test.tsx src/components/assistant/assistant-widget.styles.test.ts src/components/site-shell/site-shell.test.tsx
```

Expected: FAIL because the visibility helper and widget do not exist.

- [ ] **Step 4: Implement visibility as a deny-by-default pure function**

Use `matchRoute(pathname)`. Return true only when the matched route has `group === "public"` and the pathname is not an identity route. Do not use a broad “not admin/console” test.

- [ ] **Step 5: Implement the session controller**

Implement `useAssistantSession` with message history, draft, open state, latest announcement, and request states `idle | sending | failed`. It owns fetch, duplicate-submit prevention, stale-response protection, and retry. Do not add localStorage or database calls.

- [ ] **Step 6: Implement focused launcher, panel, and widget components**

`AssistantLauncher` owns only the M image button. `AssistantPanel` owns dialog rendering, history, presets, form controls, fallback links, focus entry/Esc handling, and a separate newest-response status region. `AssistantWidget` composes them from controller props. Use the generated `/assets/assistant/m-assistant.webp`, a 44px-or-larger launcher, and the approved responsive constraints.

- [ ] **Step 7: Mount the controller once in SiteShell**

Call `useAssistantSession` unconditionally at the persistent `SiteShell` level. Conditionally render `<AssistantWidget session={session} />` beside page children only when `shouldShowAssistant(pathname)` is true. This preserves the controller during client navigation even when the widget is temporarily hidden. Do not modify `AppShell` or duplicate it in route pages.

- [ ] **Step 8: Run targeted tests and confirm GREEN**

Run the command from Step 3. Expected: all visibility, widget, and shell tests pass.

- [ ] **Step 9: Commit the global widget**

```bash
git add apps/web/src/config/assistant-visibility.ts apps/web/src/config/assistant-visibility.test.ts apps/web/src/components/assistant apps/web/src/components/site-shell
git commit -m "feat(assistant): add public portal M assistant"
```

## Chunk 3: Navigation, contact integration, and full verification

### Task 6: Register pricing in navigation, routes, and contact handoff

**Files:**
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Modify: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/config/navigation.test.ts`
- Modify: `apps/web/src/config/route-files.test.ts`
- Modify: `apps/web/src/app/contact/page.tsx`
- Create: `apps/web/src/app/contact/page.test.tsx`
- Create: `apps/web/src/app/contact/pricing-contact-summary.tsx`
- Create: `apps/web/src/app/contact/pricing-contact-summary.test.tsx`
- Modify: `apps/web/src/components/route-scaffold/registered-route-page.tsx`
- Modify: `apps/web/src/components/route-scaffold/registered-route-page.test.tsx`

- [ ] **Step 1: Write failing registry and navigation tests**

Add `/pricing` as a live public route. Require `支持 → 商务服务 → 价格计算` and footer `支持与商务联系 → 价格计算`. Keep all existing menu entries and ordering stable except for the deliberate new subgroup/link.

- [ ] **Step 2: Write failing contact summary tests**

Verify valid pricing query parameters render human-readable labels, unknown IDs are ignored, no source query renders no pricing summary, and query values are never rendered as raw HTML. Add a page integration test that calls the async page with promised `searchParams` and verifies the normalized summary reaches the rendered scaffold.

- [ ] **Step 3: Run tests and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/config/routes.test.ts src/config/navigation.test.ts src/config/route-files.test.ts src/app/contact/pricing-contact-summary.test.tsx src/app/contact/page.test.tsx src/components/route-scaffold/registered-route-page.test.tsx
```

Expected: FAIL because `/pricing` and contact handoff are not registered.

- [ ] **Step 4: Implement route and navigation changes**

Add the live route, the support mega-menu subgroup, and footer link. Update exact-array tests instead of weakening them to partial containment.

- [ ] **Step 5: Add an optional scaffold content slot**

Extend `RegisteredRoutePage` with an optional `children: ReactNode` prop and render it after the generated anchor index inside `FeaturePlaceholderPage`. Add a regression test proving existing registered routes are unchanged and supplied content remains inside `.feature-shell__inner`.

- [ ] **Step 6: Render the safe contact summary**

Await the Next.js `searchParams` promise in the contact page, parse it through `parsePricingContactQuery`, and pass `PricingContactSummary` through the new scaffold content slot. Render only allowlisted labels; do not add a contact submission backend.

- [ ] **Step 7: Run targeted tests and confirm GREEN**

Run the command from Step 3. Expected: all route, navigation, and contact summary tests pass.

- [ ] **Step 8: Commit integration**

```bash
git add apps/web/src/config apps/web/src/app/contact apps/web/src/components/route-scaffold
git commit -m "feat(portal): register pricing and contact handoff"
```

### Task 7: Run project-wide verification and browser QA

**Files:**
- Create: `apps/web/e2e/pricing-assistant.spec.ts`
- Create: `docs/design/pricing-m-assistant-implementation-verification.md`
- Modify if needed: only files introduced or touched by Tasks 1–6

- [ ] **Step 1: Run automated quality gates**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
git diff --check
```

Expected: all commands exit `0`; database-backed skipped tests may remain skipped when their environment variables are absent.

- [ ] **Step 2: Write the focused browser acceptance test**

Create one Playwright spec covering:

- desktop `1440 × 1000`: pricing layout, exact disclosure, no currency amount, contact handoff, assistant on `/pricing` and `/product`, no assistant on `/login`, `/register`, and `/staff/login`, dialog focus, Esc focus return, and no horizontal overflow;
- API request context: `GET /api/v1/pricing/estimate` and `GET /api/v1/assistant/chat` both return `405`;
- failure state: intercept `**/api/v1/assistant/chat`, fulfill `503` with the contract error, assert draft retained, no false assistant answer, both fallback links visible, and each retry click increments the intercepted request count by exactly one;
- session lifecycle: send one successful message, use a header `Link` for client navigation to another public route, verify history remains; navigate through a client-side identity link so the widget hides, go back and verify history remains; reload and verify history clears;
- mobile `390 × 844`: stacked pricing layout, bottom drawer, 44px controls, safe-area spacing, and no horizontal overflow;
- reduced motion: call `page.emulateMedia({ reducedMotion: "reduce" })`, open the page, and assert the launcher computed `animation-name` is `none` or computed duration is `0s`.

Collect console errors and fail the test if any unexpected error occurs.

- [ ] **Step 3: Run the focused browser test reproducibly**

The existing `apps/web/playwright.config.ts` owns the development server. Run:

```bash
pnpm --filter @ai-agent-platform/web exec playwright test e2e/pricing-assistant.spec.ts --project=desktop --project=mobile
```

Expected: Playwright starts the configured production server, waits for its configured base URL, and the focused spec passes under both existing projects. Branch viewport-specific assertions with `testInfo.project.name === "desktop"` or `"mobile"`. If debugging manually, run `pnpm --filter @ai-agent-platform/web dev`, wait for `curl --fail --silent --show-error http://127.0.0.1:3000/pricing`, then use base URL `http://127.0.0.1:3000`.

- [ ] **Step 4: Record browser evidence**

Write `docs/design/pricing-m-assistant-implementation-verification.md` with the exact browser/project, desktop and mobile viewport sizes, automated spec result, API `405` results, console-error count, overflow checks, reduced-motion computed value, session lifecycle result, and paths to any failure screenshots retained by Playwright.

- [ ] **Step 5: Re-run automated quality gates after browser QA**

Run the Step 1 commands again after any browser-driven fixes. Expected: all commands exit `0`.

- [ ] **Step 6: Commit browser coverage and evidence**

```bash
git add apps/web/e2e/pricing-assistant.spec.ts docs/design/pricing-m-assistant-implementation-verification.md
git commit -m "test(e2e): verify pricing and assistant flows"
```

- [ ] **Step 7: Inspect repository scope**

```bash
git status --short
git log --oneline --decorate -8
```

Expected: only intended feature commits and no generated `.next`, environment, database, or local runtime files.

- [ ] **Step 8: Request final code review**

Use `@requesting-code-review` against merge-base `main`. Fix Critical and Important findings, rerun the relevant checks, and keep advisory changes scoped to this feature.

- [ ] **Step 9: Commit verified review fixes when required**

Review `git status --short` and `git diff` first. Because the isolated worktree was clean after Step 6, any tracked modifications must be the reviewed fixes. Do not create new files during this step. Then run:

```bash
git add -u
git diff --cached --check
git commit -m "fix: address pricing and assistant review"
```

Skip this step when review requires no changes.

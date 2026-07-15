# Assistant Web Experience Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the selected D-direction portal assistant entry, standalone assistant page, admin assistant surface, and unified Admin/Auth shells while retaining an honest placeholder backend.

**Architecture:** Extend the existing route registry and permission seed first, then introduce presentation-only shells in `packages/ui`. Keep assistant state in a Web-layer provider so the package UI never calls APIs; expose the provider to the portal header, floating M launcher, drawer, and `/assistant` page. Upgrade the existing placeholder contract to the versioned platform envelope before building new screens.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Vitest, Testing Library, CSS, PostgreSQL-backed access control.

**Source spec:** `docs/superpowers/specs/2026-07-13-agentos-assistant-experience-design.md`

**Required design skills:** Use `@claude-design` for page-level composition and `@emil-design-eng` for component motion, focus, keyboard behavior, and reduced-motion polish.

**Dependency boundary:** This plan deliberately stops at a truthful placeholder Web experience. Production anonymous Cookie/TTL, shared PostgreSQL application rate limiting, AgentOS readiness/circuit breaking, and real BFF-to-AgentOS status calls are implemented in `docs/superpowers/plans/2026-07-13-assistant-runtime-integration.md`; do not declare production assistant acceptance complete until that plan passes.

---

## File structure

- `packages/ui/src/admin-shell/*`: pure Admin shell, context header, status strip, panels, and shared styles.
- `packages/ui/src/auth-shell/*`: pure two-column Auth shell and mobile single-column behavior.
- `packages/ui/src/navigation/assistant-header-entry.tsx`: presentational Möbius entry; no fetch or Next.js dependency.
- `apps/web/src/components/assistant/assistant-experience-provider.tsx`: shared session, drawer, trigger-focus, and composer-focus controller.
- `apps/web/src/features/assistant/assistant-contract.ts`: versioned public/admin UI protocol and strict parsers.
- `apps/web/src/server/assistant/*`: placeholder provider, status, and protected admin test handler.
- `apps/web/src/app/assistant/*`: standalone public workspace.
- `apps/web/src/app/admin/assistant/*`: protected status/config/test placeholder.
- `apps/web/src/components/auth/auth-page.tsx`: Web adapter that supplies brand copy to the package Auth shell.

## Chunk 1: Contracts, permissions, and shared shells

### Task 1: Add assistant navigation and the independent permission

**Files:**
- Modify: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/config/navigation.test.ts`
- Modify: `packages/database/src/seed-access-control.ts`
- Modify: `packages/database/src/seed-access-control.test.ts`
- Modify: `packages/database/src/seed-access-control.integration.test.ts`

- [ ] **Step 1: Write failing registry, navigation, and seed tests**

Add expectations equivalent to:

```ts
expect(findAdminItem("/admin/assistant")).toMatchObject({
  label: "AI 助理",
  permission: "admin:assistant",
});
expect(adminRole.permissionKeys).toContain("admin:assistant");
expect(superAdminRole.permissionKeys).toContain("admin:assistant");
```

Also assert `content_operator`, `support_operator`, and `employee` do not inherit the new permission.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/config/navigation.test.ts
pnpm --filter @ai-agent-platform/database test -- src/seed-access-control.test.ts src/seed-access-control.integration.test.ts
```

Expected: failures for the missing navigation item and permission.

- [ ] **Step 3: Implement the minimum registry and permission changes**

Add an “AI Operations” admin group with `admin:assistant`. Add the permission to the seed catalog; rely on the existing `adminPermissionKeys` derivation so only `admin` and `super_admin` gain it. Do not register page routes before their real page files exist.

- [ ] **Step 4: Run the targeted tests and confirm GREEN**

Run the commands from Step 2. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/config/navigation.ts apps/web/src/config/navigation.test.ts packages/database/src/seed-access-control.ts packages/database/src/seed-access-control.test.ts packages/database/src/seed-access-control.integration.test.ts
git commit -m "feat(access): add assistant navigation and permission"
```

### Task 2: Add presentational Admin/Auth shells and the Möbius entry

**Files:**
- Create: `packages/ui/src/admin-shell/admin-shell.tsx`
- Create: `packages/ui/src/admin-shell/admin-shell.css`
- Create: `packages/ui/src/admin-shell/admin-shell.test.tsx`
- Create: `packages/ui/src/auth-shell/auth-shell.tsx`
- Create: `packages/ui/src/auth-shell/auth-shell.css`
- Create: `packages/ui/src/auth-shell/auth-shell.test.tsx`
- Create: `packages/ui/src/navigation/assistant-header-entry.tsx`
- Create: `packages/ui/src/navigation/assistant-header-entry.test.tsx`
- Modify: `packages/ui/src/navigation/portal-header.tsx`
- Modify: `packages/ui/src/navigation/portal-header.test.tsx`
- Modify: `packages/ui/src/app-shell.tsx`
- Modify: `packages/ui/src/app-shell.css`
- Modify: `packages/ui/src/app-shell.test.tsx`
- Modify: `packages/ui/src/tokens.css`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write failing shell and entry tests**

Cover:

```tsx
render(<AssistantHeaderEntry onActivate={onActivate} />);
expect(screen.getByRole("button", { name: "打开 AI 助理" })).toHaveClass("assistant-header-entry");
await user.click(screen.getByRole("button", { name: "打开 AI 助理" }));
expect(onActivate).toHaveBeenCalledTimes(1);
```

Assert the SVG is `aria-hidden`, the control is at least 44px by CSS contract, reduced motion stops its six-second transform-only rotation, and `PortalHeader` places the slot before login. Assert AdminShell renders a dark indigo navigation region, breadcrumb, environment status, the supplied administrator display name, and a bright `<main>`; identity must come from props, never hard-coded. Assert AuthShell renders brand story and operation regions without portal header/footer.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/ui test -- src/admin-shell/admin-shell.test.tsx src/auth-shell/auth-shell.test.tsx src/navigation/assistant-header-entry.test.tsx src/navigation/portal-header.test.tsx src/app-shell.test.tsx
```

Expected: modules and the new `assistantEntry` slot do not exist.

- [ ] **Step 3: Implement pure presentation components**

Use `ReactNode assistantEntry` on `PortalHeader` and `AppShell`; do not import a Web hook into `packages/ui`. Add only the selected D tokens and shared primitives needed by real screens. The Möbius SVG uses local gradient IDs generated with `useId`, `transform-origin: center`, and:

```css
@keyframes assistant-mobius-rotate { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .assistant-header-entry__mark { animation: none; }
}
```

Do not add a full generic design-system abstraction.

- [ ] **Step 4: Run targeted tests, typecheck, and format check**

```bash
pnpm --filter @ai-agent-platform/ui test -- src/admin-shell/admin-shell.test.tsx src/auth-shell/auth-shell.test.tsx src/navigation/assistant-header-entry.test.tsx src/navigation/portal-header.test.tsx src/app-shell.test.tsx
pnpm --filter @ai-agent-platform/ui typecheck
pnpm --filter @ai-agent-platform/ui format:check
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src
git commit -m "feat(ui): add enterprise admin and auth shells"
```

### Task 3: Upgrade the placeholder API to the versioned platform contract

**Files:**
- Modify: `apps/web/src/features/assistant/assistant-contract.ts`
- Modify: `apps/web/src/server/assistant/assistant-provider.ts`
- Modify: `apps/web/src/server/assistant/placeholder-assistant-provider.ts`
- Modify: `apps/web/src/server/assistant/placeholder-assistant-provider.test.ts`
- Create: `apps/web/src/server/assistant/assistant-status.ts`
- Create: `apps/web/src/server/assistant/assistant-status.test.ts`
- Modify: `apps/web/src/app/api/v1/assistant/chat/handler.ts`
- Modify: `apps/web/src/app/api/v1/assistant/chat/route.test.ts`
- Create: `apps/web/src/app/api/v1/assistant/status/handler.ts`
- Create: `apps/web/src/app/api/v1/assistant/status/route.ts`
- Create: `apps/web/src/app/api/v1/assistant/status/route.test.ts`

- [ ] **Step 1: Write failing contract and route tests**

Require exact envelopes:

```ts
expect(success).toEqual({
  version: "1",
  requestId: "req-1",
  mode: "placeholder",
  session: { temporary: true },
  message: { id: "msg-1", role: "assistant", content: expect.any(String) },
  suggestedActions: expect.any(Array),
});
expect(status).toEqual({
  version: "1",
  requestId: "req-2",
  live: true,
  ready: false,
  capability: "placeholder",
  message: "模型尚未配置，当前为安全占位模式。",
});
```

Assert the error envelope uses `validation_error`, `rate_limited`, or `assistant_unavailable`, never echoes input, and contains no session credential. Keep Unicode/path/body-bound tests already present.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/assistant/placeholder-assistant-provider.test.ts src/server/assistant/assistant-status.test.ts src/app/api/v1/assistant/chat/route.test.ts src/app/api/v1/assistant/status/route.test.ts
```

Expected: old unversioned response shape fails.

- [ ] **Step 3: Implement the minimum versioned placeholder**

Keep `requestId` correlation-only. Inject clock and ID factories into handlers. Return `mode: "placeholder"` and `capability: "placeholder"`; do not add cookies or persistence in this plan. The response `session` contains only `temporary: true`; do not invent an expiry before a real session exists.

- [ ] **Step 4: Run and confirm GREEN**

Run the Step 2 command plus:

```bash
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/assistant apps/web/src/server/assistant apps/web/src/app/api/v1/assistant
git commit -m "feat(assistant): version the placeholder protocol"
```

## Chunk 2: Shared controller and production screens

### Task 4: Introduce explicit shell routing and one assistant controller

**Files:**
- Create: `apps/web/src/components/site-shell/shell-route.ts`
- Create: `apps/web/src/components/site-shell/shell-route.test.ts`
- Create: `apps/web/src/components/assistant/assistant-experience-provider.tsx`
- Create: `apps/web/src/components/assistant/assistant-experience-provider.test.tsx`
- Modify: `apps/web/src/components/assistant/use-assistant-session.ts`
- Modify: `apps/web/src/components/assistant/use-assistant-session.test.tsx`
- Modify: `apps/web/src/components/assistant/assistant-widget.tsx`
- Modify: `apps/web/src/components/assistant/assistant-widget.test.tsx`
- Modify: `apps/web/src/config/assistant-visibility.ts`
- Modify: `apps/web/src/config/assistant-visibility.test.ts`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.test.tsx`
- Modify: `packages/ui/src/app-shell.tsx`
- Modify: `packages/ui/src/app-shell.test.tsx`

- [ ] **Step 1: Write failing route/controller tests**

Table-test these classifications: `/` → portal, `/assistant` → assistant, `/login` and `/register` and `/staff/*` → auth, `/console/*` → console, `/admin/*` → admin. Assert auth/admin/console do not initialize assistant state. Assert portal has top and floating launchers, assistant has top entry but no floating M, and multiple launchers return focus to the exact trigger that opened the drawer. Assert `SiteShell` retains the validated workforce `displayName` and supplies it, breadcrumb data, and environment status to AdminShell.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/site-shell/shell-route.test.ts src/components/assistant/assistant-experience-provider.test.tsx src/components/assistant/use-assistant-session.test.tsx src/components/assistant/assistant-widget.test.tsx src/config/assistant-visibility.test.ts src/components/site-shell/site-shell.test.tsx
pnpm --filter @ai-agent-platform/ui test -- src/app-shell.test.tsx
pnpm --filter @ai-agent-platform/ui typecheck
```

Expected: current shell defaults all non-workspace routes to portal and session focus is not shared.

- [ ] **Step 3: Implement explicit variants and provider**

Create `classifyShellRoute(pathname)` and mount `AssistantExperienceProvider` only for portal/assistant. Store `lastTrigger: HTMLElement | null`; on close/Escape return focus to it. Expose `openFrom(trigger)`, `close()`, `registerComposer(element | null)`, and `focusComposer()`. Clear the ref on unmount and test that a stale composer is never focused. Add a validation state for empty/over-500-code-point input so the workspace can render an error beside the composer. On `/assistant`, the header entry calls `focusComposer`; elsewhere it opens the drawer. Preserve abort-on-navigation and one-in-flight-request logic.

- [ ] **Step 4: Run and confirm GREEN**

Run Step 2. Expected: all pass, including exact focus-return tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/site-shell apps/web/src/components/assistant apps/web/src/config/assistant-visibility.ts apps/web/src/config/assistant-visibility.test.ts packages/ui/src/app-shell.tsx packages/ui/src/app-shell.test.tsx
git commit -m "feat(assistant): share portal and workspace controller"
```

### Task 5: Build the standalone assistant workspace

**Files:**
- Create: `apps/web/src/app/assistant/page.tsx`
- Create: `apps/web/src/app/assistant/page.test.tsx`
- Create: `apps/web/src/components/assistant/assistant-workspace.tsx`
- Create: `apps/web/src/components/assistant/assistant-workspace.css`
- Create: `apps/web/src/components/assistant/assistant-workspace.test.tsx`
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Modify: `apps/web/src/config/route-files.test.ts`

- [ ] **Step 1: Write failing page and workspace tests**

Assert D-direction headings, explicit placeholder disclosure, preset questions, service state, one composer, no fake history persistence, no floating M, 500-code-point validation, Shift+Enter/newline behavior, submission state, error proximity, and a collapsed mobile session rail. Add a CSS-source assertion for no viewport-width fixed child and a Playwright check later for actual overflow.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/assistant/page.test.tsx src/components/assistant/assistant-workspace.test.tsx src/config/route-files.test.ts
```

Expected: missing page/workspace.

- [ ] **Step 3: Implement the selected C-in-D chat composition**

Register `/assistant` as live in the same task that creates its page. Use the existing M asset, real placeholder copy, left history placeholder, wide conversation rail, and bottom composer. Consume the shared provider and register the textarea ref through `registerComposer`; do not duplicate fetch/session code. Mark historical rows as unavailable placeholders instead of clickable fake history.

- [ ] **Step 4: Run and confirm GREEN**

Run Step 2 plus Web typecheck. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/assistant apps/web/src/components/assistant/assistant-workspace.tsx apps/web/src/components/assistant/assistant-workspace.css apps/web/src/components/assistant/assistant-workspace.test.tsx apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/config/route-files.test.ts
git commit -m "feat(assistant): add standalone public workspace"
```

### Task 6: Build the protected Admin assistant page on the new shell

**Files:**
- Create: `apps/web/src/app/admin/assistant/page.tsx`
- Create: `apps/web/src/app/admin/assistant/page.test.tsx`
- Create: `apps/web/src/components/admin/assistant-admin-page.tsx`
- Create: `apps/web/src/components/admin/assistant-admin-page.test.tsx`
- Create: `apps/web/src/app/api/v1/admin/assistant/chat/handler.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/chat/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/chat/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/status/handler.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/status/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/status/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/sessions/handler.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/sessions/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/sessions/route.test.ts`
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Modify: `apps/web/src/config/route-files.test.ts`

- [ ] **Step 1: Write failing permission and UI tests**

Mock `requirePermission` and assert the page plus all three APIs require exactly `admin:assistant`. Test 401/403/200 handler paths through injected authorization. Status returns safe placeholder state, sessions returns an empty versioned collection with an explicit not-persisted message, and chat uses the protected placeholder provider. Assert four status cells, read-only configuration, protected placeholder test console, and disabled “会话审计 / Skill 管理” labels; no model-key form and no customer message text.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/admin/assistant/page.test.tsx src/components/admin/assistant-admin-page.test.tsx src/app/api/v1/admin/assistant/chat/route.test.ts src/app/api/v1/admin/assistant/status/route.test.ts src/app/api/v1/admin/assistant/sessions/route.test.ts src/config/routes.test.ts src/config/route-files.test.ts
```

Expected: missing page/APIs and unregistered route.

- [ ] **Step 3: Implement protected placeholder management**

Register `/admin/assistant` as live in the same task that creates its page. The admin chat handler reuses the placeholder Provider but has its own authorization seam and route. The page reads the protected status/sessions contracts and shows infrastructure/model/public-entry states honestly. Do not modify unrelated admin business pages; their visual inheritance comes from the shared shell.

- [ ] **Step 4: Run and confirm GREEN**

Run Step 2 plus Web typecheck. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/assistant apps/web/src/components/admin/assistant-admin-page.tsx apps/web/src/components/admin/assistant-admin-page.test.tsx apps/web/src/app/api/v1/admin/assistant apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/config/route-files.test.ts
git commit -m "feat(admin): add protected assistant operations page"
```

### Task 7: Apply one Auth shell to the complete existing auth chain

**Files:**
- Create: `apps/web/src/components/auth/auth-page.tsx`
- Create: `apps/web/src/components/auth/auth-page.test.tsx`
- Create: `apps/web/src/components/auth/auth-page.css`
- Modify: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/login/page.test.tsx`
- Modify: `apps/web/src/app/staff/login/page.tsx`
- Modify: `apps/web/src/app/staff/change-password/page.tsx`
- Modify: `apps/web/src/app/staff/re-auth/page.tsx`
- Modify: `apps/web/src/app/staff/two-factor/page.tsx`
- Modify: `apps/web/src/app/register/page.tsx`
- Create: `apps/web/src/app/staff/login/page.test.tsx`
- Create: `apps/web/src/app/staff/change-password/page.test.tsx`
- Create: `apps/web/src/app/staff/re-auth/page.test.tsx`
- Modify: `apps/web/src/components/auth/login-form.css`
- Modify: `apps/web/src/app/register/page.test.tsx`
- Modify: `apps/web/src/app/staff/two-factor/page.test.tsx`
- Modify: existing form tests

- [ ] **Step 1: Write failing shell-coverage tests**

Assert customer login, employee login, initial-password change, re-auth, 2FA, and registration all render the same AuthShell landmarks with distinct context labels. Assert none render portal navigation, footer, top AI entry, floating M, or assistant session. Preserve every existing form action, `returnTo`, autocomplete, error, QR, and recovery-code behavior.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/auth/auth-page.test.tsx src/components/auth/customer-login-form.test.tsx src/components/auth/staff-login-form.test.tsx src/components/auth/change-password-form.test.tsx src/components/auth/two-factor-form.test.tsx src/app/login/page.test.tsx src/app/register/page.test.tsx src/app/staff/login/page.test.tsx src/app/staff/change-password/page.test.tsx src/app/staff/re-auth/page.test.tsx src/app/staff/two-factor/page.test.tsx
```

Expected: existing pages use separate panel markup and portal shell.

- [ ] **Step 3: Implement the Auth adapter and migrate pages**

Keep forms unchanged unless a test proves a layout accessibility problem. `AuthPage` provides brand story, realm label, title, intro, and children to package `AuthShell`. Desktop is two-column; mobile is one-column. Do not invent an email-verification route.

- [ ] **Step 4: Run and confirm GREEN**

Run Step 2 plus Web typecheck and lint. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/auth apps/web/src/app/login apps/web/src/app/register apps/web/src/app/staff
git commit -m "feat(auth): unify enterprise authentication shell"
```

### Task 8: Verify Web experience in a real browser

**Files:**
- Create: `docs/design/agent-experience-implementation-verification.md`
- Create: `apps/web/e2e/assistant-experience.spec.ts`
- Create: `compose.e2e.yaml`
- Create: `docs/testing/run-assistant-experience-e2e.sh`
- Modify only if defects are found: files from Tasks 2–7

- [ ] **Step 1: Run automated gates**

```bash
pnpm --filter @ai-agent-platform/ui test
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/database test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Expected: all exit `0`.

- [ ] **Step 2: Run Playwright desktop and mobile checks**

Create tracked `compose.e2e.yaml` that adds `env_file: .env.e2e` only to `migrate` and `web`. Build ignored `.env.e2e` from every required key in `.env.example`, then add every E2E fixture key from CI; generate independent random values for all passwords, secrets, and tokens, use `PUBLIC_HOST=127.0.0.1`, and use the proxy URL for Better Auth URL/origins. Never reuse the normal `.env`.

Create `docs/testing/run-assistant-experience-e2e.sh` with `set -eu`, fixed isolated project name `aap-assistant-e2e`, and an EXIT/INT/TERM trap that runs `docker compose -p "$project" ... down -v --remove-orphans`. The script must validate variables and build current code before seeding:

```bash
project=aap-assistant-e2e
docker compose -p "$project" --env-file .env.e2e -f compose.yaml -f compose.e2e.yaml config --quiet
docker compose -p "$project" --env-file .env.e2e -f compose.yaml -f compose.e2e.yaml build migrate web
docker compose -p "$project" --env-file .env.e2e -f compose.yaml -f compose.e2e.yaml up -d --wait db
docker compose -p "$project" --env-file .env.e2e -f compose.yaml -f compose.e2e.yaml run --rm migrate
docker compose -p "$project" --env-file .env.e2e -f compose.yaml -f compose.e2e.yaml run --rm -e NODE_ENV=test migrate pnpm db:seed-auth-e2e
docker compose -p "$project" --env-file .env.e2e -f compose.yaml -f compose.e2e.yaml up -d --wait web proxy
set -a
. ./.env.e2e
set +a
BASE_URL=http://127.0.0.1:8080 pnpm --filter @ai-agent-platform/web exec playwright test e2e/assistant-experience.spec.ts
```

Run only `sh docs/testing/run-assistant-experience-e2e.sh`; its trap must remove the isolated volume even on failure. Use the existing masked E2E admin/customer fixture contract from `seed-auth-e2e.ts`; do not place credentials in the spec or tracked Compose override. `BASE_URL` disables Playwright's built-in Web server, avoiding a port conflict. Test `1440×1000` and `390×844`: portal top entry, floating M, drawer focus/Escape/return, `/assistant` composer focus, no duplicate M, authenticated `/admin/assistant`, and every auth route. Check:

```js
document.documentElement.scrollWidth === window.innerWidth
```

Expected: `true`, zero console errors, zero failed local assets.

- [ ] **Step 3: Verify reduced motion and keyboard-only use**

Emulate reduced motion; confirm Möbius rotation and drawer translation stop. Tab through top entry, drawer, full-chat link, composer, admin navigation, and auth forms with visible focus.

- [ ] **Step 4: Record evidence and commit**

Record commands, viewport results, console status, and any fixes in the verification document.

```bash
git add docs/design/agent-experience-implementation-verification.md apps/web/e2e/assistant-experience.spec.ts compose.e2e.yaml docs/testing/run-assistant-experience-e2e.sh
git commit -m "test(ui): verify assistant and enterprise shells"
```

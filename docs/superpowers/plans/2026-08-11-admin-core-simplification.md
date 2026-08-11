# Admin Core Simplification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved three-area Admin workspace, remove MFA/re-authentication, provision the sole case-sensitive local super administrator, and activate the requested optional-key DeepSeek endpoint.

**Architecture:** Reuse Better Auth, the existing AppShell, existing Admin services, and the deployment-owned model endpoint catalog. Delete MFA-only paths instead of retaining compatibility shims; keep session/permission enforcement. Add only the minimum endpoint metadata and nullable-secret support needed for a deployment-allowlisted, optionally authenticated HTTP endpoint.

**Tech Stack:** Next.js 16, React 19, Better Auth 1.6.23, TypeScript 5.9, Drizzle/PostgreSQL, Python 3.13, FastAPI, Agno 2.7.2, pytest, Vitest.

---

## Chunk 1: Authentication and identity

### Task 1: Remove MFA and sensitive-action re-authentication

**Files:**
- Delete: `apps/web/src/app/staff/two-factor/page.tsx`
- Delete: `apps/web/src/app/staff/two-factor/page.test.tsx`
- Delete: `apps/web/src/app/staff/re-auth/page.tsx`
- Delete: `apps/web/src/app/staff/re-auth/page.test.tsx`
- Delete: `apps/web/src/components/auth/two-factor-form.tsx`
- Delete: `apps/web/src/components/auth/two-factor-form.test.tsx`
- Delete: `apps/web/src/components/auth/re-auth-form.tsx`
- Delete: `apps/web/src/server/auth/sensitive-action.ts`
- Delete: `apps/web/src/server/auth/sensitive-action.test.ts`
- Modify: `apps/web/src/server/auth/{staff-auth.ts,actions.ts,server-actions.ts,audit.ts,access.ts,workspace-route-guards.ts}`
- Modify: affected Admin/document/model/Skill commands and route tests returned by `rg -l -i 'mfa|totp|re-auth|password\+mfa' apps/web/src`
- Modify: `packages/database/src/{schema/identity.ts,auth-models.ts}`
- Create: generated Drizzle migration removing `two_factors`, `users.two_factor_enabled`, and `sessions.mfa_verified_at`

- [ ] Write failing tests proving login no longer redirects to TOTP, sensitive mutations accept session+permission without assurance, and removed routes are absent.
- [ ] Run the focused auth/Admin tests and verify failures reference existing MFA/re-auth behavior.
- [ ] Remove the two-factor plugin, routes/actions/contracts/audit events and assurance stamps; replace sensitive-action calls with the existing permission checks.
- [ ] Remove MFA schema fields/table and generate a forward migration without a compatibility layer.
- [ ] Update affected tests and docs; run `rg -n -i 'two.?factor|mfa|totp|re-auth|password\+mfa' apps/web/src packages/database/src` and keep only historical migration assertions that are intentionally required.
- [ ] Run Web auth/Admin tests and database schema/migration tests.
- [ ] Commit the deletion-focused change.

### Task 2: Preserve case-sensitive workforce usernames

**Files:**
- Modify: `packages/database/src/schema/identity.ts`
- Modify: `packages/database/src/create-super-admin.ts`
- Modify: `packages/database/src/create-super-admin.test.ts`
- Modify: `apps/web/src/server/auth/{staff-auth.ts,actions.ts}` and tests
- Modify: `apps/web/src/server/admin/users.ts` and tests

- [ ] Add tests for exact `Hkzy@admin` storage/login, lowercase rejection, `@` username acceptance, exact-username precedence over email, and case-insensitive duplicate prevention.
- [ ] Configure Better Auth `usernameNormalization:false` and an explicit safe workforce username validator that permits `@`.
- [ ] Change workforce normalization to NFKC+trim only; retain the current `lower(username)` unique index.
- [ ] Make login attempt an exact username before normalized email while keeping one generic credential error and existing rate limits.
- [ ] Extend the existing TTY bootstrap with an explicit replace-all-users path that runs deletion and super-admin creation in one transaction; set `mustChangePassword=false` for this permanent bootstrap account.
- [ ] Run focused database/auth/user tests and commit.

## Chunk 2: Model endpoint and runtime

### Task 3: Support deployment endpoints with optional API keys and explicit HTTP opt-in

**Files:**
- Modify: `infra/agent/model-endpoints.json`
- Modify: `apps/agent/src/agent_service/{model_endpoint_catalog.py,model_config_types.py,model_config_repository.py,model_config_schema.py,model_control_service.py,model_control_api.py,config.py,model_registry.py}`
- Modify: matching `apps/agent/tests/test_model_*` files
- Modify: `apps/web/src/features/assistant/admin-model-config-contract.ts`
- Modify: `apps/web/src/server/assistant/agent-model-control-client.ts`
- Modify: `apps/web/src/components/admin/assistant-model-config-panel.tsx`
- Modify: focused Web contract/client/component tests
- Modify: `infra/docker/README.md` and `apps/web/src/content/deployment.mdx`

- [ ] Add catalog tests: HTTP rejected by default; explicit deployment opt-in accepts only a global host; unsafe/private URLs remain rejected; official endpoints remain HTTPS/key-required.
- [ ] Add service/repository/schema tests for a complete nullable API-key group, optional-key save/activate/reveal behavior, and no partial-null secret state.
- [ ] Add runtime tests proving keyless OpenAI-compatible requests omit Authorization and keyed requests retain Bearer authentication.
- [ ] Add Web tests showing the custom endpoint, HTTP warning, and endpoint-dependent Key requirement; blank optional Key means no authentication.
- [ ] Implement endpoint metadata (`apiKeyRequired`, explicit insecure-HTTP opt-in), nullable secret persistence, and no-auth client requests.
- [ ] Add `DeepSeek-V4-Flash-code` endpoint metadata for `http://125.122.36.24:8810/v1` under provider `deepseek`.
- [ ] Run Agent model tests, Web model-control tests, Agent lint/typecheck, and Web typecheck; commit.

## Chunk 3: Admin navigation and UI

### Task 4: Reduce Admin navigation and add frosted-glass shell

**Files:**
- Modify: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/config/navigation.test.ts`
- Modify: `packages/ui/src/navigation/{navigation-types.ts,sidebar-navigation.tsx,navigation.css}` and tests
- Modify: `packages/ui/src/admin-shell/admin-shell.css`

- [ ] Add tests for three primary Admin items and a default-collapsed `其他功能` group containing every existing non-primary route.
- [ ] Render collapsible groups with native `details/summary`; keep keyboard and focus behavior.
- [ ] Apply frosted glass only to the Admin sidebar using existing CSS and `backdrop-filter`, with a readable opaque fallback.
- [ ] Run UI and navigation tests; commit.

### Task 5: Reorganize Agent and user management

**Files:**
- Modify: `apps/web/src/components/admin/{assistant-admin-page.tsx,assistant-admin-page.css,assistant-admin-page.test.tsx}`
- Delete: `apps/web/src/components/admin/assistant-capability-roadmap.tsx`
- Delete: `apps/web/src/components/admin/assistant-capability-roadmap.test.tsx`
- Modify: `apps/web/src/app/admin/users/page.tsx`
- Modify: `apps/web/src/app/admin/users/page.test.tsx`
- Reuse or create one small shared user-management tabs component only if both users and roles pages need identical markup.

- [ ] Add failing UI tests for the approved Agent sections, absence of roadmap placeholders, user summary/filter hierarchy, and account/role/session navigation.
- [ ] Reorganize the existing single-Agent content into overview/model/Skill/test-session tabs without changing API ownership.
- [ ] Improve the user table with summary counts, compact toolbar, focused creation disclosure, row action menu/disclosure, and explicit safety copy; preserve all existing permissions and mutations.
- [ ] Run focused component/page tests, accessibility assertions, and Web typecheck; commit.

## Chunk 4: Local deployment and verification

### Task 6: Apply migrations, reset the local account, and activate the model

**Target:** running Compose database `ai-agent-platform-db-1` and Agent/Web services from this repository.

- [ ] Rebuild/migrate services in dependency order and verify healthy containers.
- [ ] Read-only snapshot account counts, super-admin role ID, model configuration head, and active pointer before mutation; do not print secrets or hashes.
- [ ] Run the explicit TTY replace-all-users bootstrap with username `Hkzy@admin`, email `admin@schkzy.com`, and the approved password; confirm the destructive prompt.
- [ ] Verify exactly one active workforce user exists, its stored username is case-preserved, lowercase login fails, exact-case login succeeds, and `super_admin` owns the complete current permission catalog.
- [ ] Configure the custom DeepSeek endpoint with model ID `DeepSeek-V4-Flash-code` and no API key, test it, activate it, and verify the runtime snapshot reports the active revision.
- [ ] Run fresh full tests (`pnpm test` with port-binding tests outside the sandbox, Agent pytest), `pnpm typecheck`, relevant lint/format checks, and the Web build.
- [ ] Run `git diff --check`, inspect the complete diff, and commit any final deployment/documentation corrections.


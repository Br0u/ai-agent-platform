# Identity and Access Control Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver separate customer and workforce authentication realms, PostgreSQL sessions, customer registration review, server-enforced RBAC, privileged TOTP, audit logs, and production-safe migration/bootstrap workflows.

**Architecture:** Better Auth 1.6.23 provides credential and database-session mechanics through two realm-specific configurations. Project-owned Drizzle tables and server-only services own realm rules, organization membership, RBAC, registration review, and auditing. Every protected page gets an optimistic route check, while every read and mutation performs a secure DAL check close to the database.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.7, Better Auth 1.6.23, Drizzle ORM 0.45.2, PostgreSQL 18, Argon2id, Zod 4.4.3, Vitest 4.1.10, Testing Library, Playwright CLI, Docker Compose, Nginx.

**Design spec:** `docs/superpowers/specs/2026-07-11-identity-access-control-design.md`

---

## File Map

### Database package

- `packages/database/src/schema/identity.ts`: users, accounts, sessions, verifications, rate limits, identity enums.
- `packages/database/src/schema/authorization.ts`: roles, permissions, user-role and role-permission mappings.
- `packages/database/src/schema/organizations.ts`: customer organizations and memberships.
- `packages/database/src/schema/registrations.ts`: customer registration review records.
- `packages/database/src/schema/audit.ts`: append-only audit records.
- `packages/database/src/auth-models.ts`: Better Auth model/field mapping shared by schema tests and web configs.
- `packages/database/src/identity-policy.ts`: realm/status transition and role-scope rules.
- `packages/database/src/migrate.ts`: Drizzle production migration entrypoint.
- `packages/database/src/seed-access-control.ts`: idempotent system role and permission seed.
- `packages/database/src/create-super-admin.ts`: interactive first-admin CLI.
- `packages/database/src/credentials/password.ts`: shared Argon2id primitive used by web auth and bootstrap CLI.

### Web authentication and authorization

- `apps/web/src/server/auth/shared-options.ts`: shared Better Auth database, security, and rate-limit options.
- `apps/web/src/server/auth/customer-auth.ts`: customer base path, cookie, lifetime, and realm hooks.
- `apps/web/src/server/auth/staff-auth.ts`: workforce base path, cookie, username, lifetime, and TOTP plugins.
- `apps/web/src/server/auth/access.ts`: current actor, realm checks, permission checks, and safe DTOs.
- `apps/web/src/server/auth/errors.ts`: stable error-code mapping and redaction.
- `apps/web/src/server/auth/audit.ts`: allow-listed audit writer.
- `apps/web/src/server/auth/actions.ts`: login, logout, password-change, and TOTP actions.
- `apps/web/src/server/registration/service.ts`: transactional registration, approval, and rejection.
- `apps/web/src/server/admin/users.ts`: workforce user and customer status administration.

### Web UI and routes

- `apps/web/src/components/auth/*`: customer login/register, staff login, password-change, and TOTP forms.
- `apps/web/src/app/api/v1/session/customer/route.ts`: customer session DTO.
- `apps/web/src/app/api/v1/session/staff/route.ts`: workforce session and permission DTO.
- `apps/web/src/app/register/page.tsx`: customer registration.
- `apps/web/src/app/staff/login/page.tsx`: workforce login.
- `apps/web/src/app/console/onboarding/page.tsx`: review and email-verification placeholder.
- `apps/web/src/app/staff/change-password/page.tsx`: forced first-password change.
- `apps/web/src/app/staff/two-factor/page.tsx`: privileged TOTP enrollment and verification.
- `apps/web/src/app/admin/registrations/page.tsx`: registration review.
- Existing `/console/**` and `/admin/**` layouts: realm guard boundaries.

## Chunk 1: Schema, Migration, and Seed Foundation

### Task 1: Reconcile project status and pin security dependencies

**Files:**

- Modify: `task_plan.md`
- Modify: `progress.md`
- Modify: `findings.md`
- Modify: `apps/web/package.json`
- Modify: `packages/database/package.json`
- Modify: `pnpm-lock.yaml`

**Consumes:** clean Phase 9 branch state and the approved design spec.

**Produces:** accurate execution records and reproducible pinned dependencies.

- [ ] **Step 1: Correct stale delivery status**

Update the planning documents to state that `main` was pushed at `7766612`, Phase 9 is complete, and Phase 10 is active in `codex/feat-identity-access-control`. Remove statements claiming that application code is absent or Git delivery is waiting for confirmation.

Verify with:

```bash
rg -n "等待.*推送|没有应用代码|仅待用户确认" task_plan.md progress.md findings.md
git diff -- task_plan.md progress.md findings.md
```

Expected: `rg` returns no stale claim; the diff contains only status corrections and the Phase 10 entry.

- [ ] **Step 2: Commit the documentation correction**

```bash
git add task_plan.md progress.md findings.md
git commit -m "docs(project): 同步身份权限阶段状态"
```

- [ ] **Step 3: Install exact dependencies**

```bash
pnpm --filter @ai-agent-platform/web add better-auth@1.6.23 @better-auth/drizzle-adapter@1.6.23 zod@4.4.3 qrcode@1.5.4
pnpm --filter @ai-agent-platform/web add '@ai-agent-platform/integrations@workspace:*'
pnpm --filter @ai-agent-platform/web add -D @types/qrcode@1.5.6 @playwright/test@1.61.1
pnpm --filter @ai-agent-platform/database add @node-rs/argon2@2.0.2
pnpm --filter @ai-agent-platform/database add -D tsx@4.23.0
```

Expected: lockfile contains exact versions and no peer-dependency warning.

- [ ] **Step 4: Verify dependency metadata**

Run: `pnpm install --frozen-lockfile && pnpm typecheck`

Expected: install and existing type checks pass before feature code is added.

- [ ] **Step 5: Commit dependencies**

```bash
git add apps/web/package.json packages/database/package.json pnpm-lock.yaml
git commit -m "build(auth): 添加认证与安全依赖"
```

### Task 2: Replace the temporary identity schema with realm-aware tables

**Files:**

- Create: `packages/database/src/schema/identity.ts`
- Create: `packages/database/src/schema/authorization.ts`
- Create: `packages/database/src/schema/organizations.ts`
- Create: `packages/database/src/schema/registrations.ts`
- Create: `packages/database/src/schema/audit.ts`
- Create: `packages/database/src/schema/access-control.test.ts`
- Create: `packages/database/src/auth-models.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/schema/content.ts`
- Delete: `packages/database/src/schema/users.ts`
- Delete: `packages/database/src/schema/roles.ts`

**Consumes:** Better Auth 1.6.23 core schema, username plugin schema, two-factor plugin schema, and the approved domain model.

**Produces:** complete Drizzle exports and `0001_identity_access_control.sql` for every later auth/domain service.

- [ ] **Step 1: Write failing schema-contract tests**

Use `getTableConfig` from `drizzle-orm/pg-core` to assert:

```ts
expect(columnNames(users)).toEqual(
  expect.arrayContaining([
    "identity_realm",
    "status",
    "email_verification_status",
    "must_change_password",
  ]),
);
expect(uniqueNames(userRoles)).toContain("user_roles_user_id_role_id_unique");
expect(columnNames(sessions)).toContain("token");
```

Also test that no exported `users.roleId` or `users.passwordHash` exists.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @ai-agent-platform/database test src/schema/access-control.test.ts`

Expected: FAIL because the realm-aware tables do not exist.

- [ ] **Step 3: Implement identity tables**

Create the Better Auth 1.6.23 core schema exactly, then extend it with project fields. Better Auth requires the opaque `sessions.token` as its lookup key; accept that native storage model, mark the column unique, and treat it as a secret that is never logged, selected into DTOs, or displayed. Do not invent a `tokenHash` column without a custom adapter.

Required Better Auth core fields:

| Table           | Required fields                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `users`         | `id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt`                                                       |
| `accounts`      | `id`, `accountId`, `providerId`, `userId`, token fields, token expiries, `scope`, credential `password`, timestamps             |
| `sessions`      | `id`, unique `token`, `userId`, `expiresAt`, `ipAddress`, `userAgent`, timestamps, project `realm` and `mfaVerifiedAt`          |
| `verifications` | `id`, `identifier`, `value`, `expiresAt`, timestamps                                                                            |
| `rate_limits`   | `id`, unique `key`, `count`, `lastRequest`                                                                                      |
| `two_factors`   | `id`, unique `userId`, encrypted `secret`, encrypted/hashed `backupCodes`, `verified`, `failedVerificationCount`, `lockedUntil` |

Add `twoFactorEnabled` to `users`. Export the Better Auth model/field mapping from `packages/database/src/auth-models.ts`; schema tests compare every mapped model with the exported table. Task 4 imports this same mapping into both Drizzle adapter configurations, avoiding a forward test dependency.

Required user fields:

```ts
identityRealm: "customer" | "workforce";
status: "pending_review" | "active" | "disabled" | "rejected";
emailVerificationStatus: "unverified" | "pending" | "verified";
username: string | null;
displayUsername: string | null;
mustChangePassword: boolean;
lastLoginAt: Date | null;
```

Add schema assertions for globally unique normalized email, nullable unique workforce `username` plus `displayUsername`, session expiry/IP/user-agent/realm, composite account uniqueness on `(providerId, accountId)`, verification expiry, two-factor lockout fields, rate-limit key uniqueness, and every foreign-key target.

- [ ] **Step 4: Implement authorization, organization, registration, and audit tables**

Use UUID primary keys, timestamps with timezone, explicit foreign-key deletion behavior, and named unique indexes for every mapping table. Organizations include normalized `legalNameKey` with a unique index; normalization trims, applies Unicode NFKC, collapses whitespace, and lowercases Latin characters. Add `realmScope` to roles and `actorRealm`, `actorUserId`, `action`, `targetType`, `targetId`, `metadata`, `ipAddress`, and `userAgent` to audit logs. Contract tests must cover the organization legal-name key, duplicate `user_roles`, `role_permissions`, and `organization_memberships`; assigning actor; registration reviewer/note/status; and organization status.

- [ ] **Step 5: Update content ownership and exports**

Point `content.authorId` at the new users table and export all schema modules from `schema/index.ts`.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm --filter @ai-agent-platform/database test src/schema/access-control.test.ts`

Expected: schema-contract tests pass.

- [ ] **Step 7: Generate the forward migration**

```bash
pnpm --filter @ai-agent-platform/database exec drizzle-kit generate --name identity_access_control
```

Expected: `packages/database/drizzle/0001_identity_access_control.sql` and updated Drizzle metadata. Inspect the SQL to confirm all core/plugin tables, unique constraints, enums, foreign keys, and delete actions exist; content ownership survives; and temporary `role_id/password_hash` are removed only after replacement tables exist.

- [ ] **Step 8: Run database package gates**

Run: `pnpm --filter @ai-agent-platform/database test && pnpm --filter @ai-agent-platform/database typecheck && pnpm --filter @ai-agent-platform/database lint`

Expected: all pass.

- [ ] **Step 9: Commit schema and migration**

```bash
git add packages/database/src packages/database/drizzle
git commit -m "feat(db): 建立双身份域与RBAC数据模型"
```

### Task 3: Add policy tests, idempotent seed, and production migrations

**Files:**

- Create: `packages/database/src/identity-policy.test.ts`
- Create: `packages/database/src/identity-policy.ts`
- Create: `packages/database/src/seed-access-control.test.ts`
- Create: `packages/database/src/seed-access-control.ts`
- Create: `packages/database/src/migrate.ts`
- Modify: `packages/database/package.json`
- Modify: `apps/web/Dockerfile`
- Modify: `compose.yaml`

**Consumes:** schema exports from Task 2 and `DATABASE_URL`.

**Produces:** pure realm-policy functions, `seedAccessControl(repository: AccessControlSeedRepository)`, `db:migrate`, `db:seed-access`, `db:prepare`, and a one-shot Compose migrator.

- [ ] **Step 1: Write failing realm-policy tests**

Test these pure rules:

```ts
expect(canAssignRole("customer", "workforce")).toBe(false);
expect(canAssignRole("workforce", "workforce")).toBe(true);
expect(canEnterApplication("pending_review", "onboarding")).toBe(true);
expect(canEnterApplication("pending_review", "console")).toBe(false);
expect(canTransition("pending_review", "active")).toBe(true);
expect(canTransition("disabled", "pending_review")).toBe(false);
```

- [ ] **Step 2: Verify RED, implement minimal policies, verify GREEN**

Run before and after implementation: `pnpm --filter @ai-agent-platform/database test src/identity-policy.test.ts`

Expected RED: missing module. Expected GREEN: all policy cases pass.

- [ ] **Step 3: Write failing seed tests**

Inject a repository double and verify that running `seedAccessControl(repository)` twice upserts the same system roles and permissions without duplicates.

Exact permission keys:

```text
console:access, console:team,
admin:site, admin:navigation, admin:products, admin:releases,
admin:docs, admin:blog, admin:cases, admin:faq,
admin:compatibility, admin:marketplace, admin:analytics,
admin:registrations, admin:users, admin:roles, admin:audit
```

Exact realm-safe grants: `customer_member` gets only `console:access`; `customer_admin` gets only `console:access` and `console:team`; `employee` gets no mutation permission; `content_operator` gets the workforce content keys from `admin:site` through `admin:marketplace`; `support_operator` gets only `admin:registrations`; `admin` gets every `admin:*` key including `admin:roles` but service policy forbids granting/removing `super_admin`; `super_admin` gets every `admin:*` key. No workforce role receives `console:*`.

- [ ] **Step 4: Implement the idempotent seed**

Seed `customer_member`, `customer_admin`, `employee`, `content_operator`, `support_operator`, `admin`, and `super_admin` with explicit realm scopes and the matrix above. Do not create any user or default password. Export a CLI wrapper that opens the database, calls `seedAccessControl`, closes the pool in `finally`, and exits non-zero on failure.

- [ ] **Step 5: Add migration scripts**

Add:

```json
{
  "db:migrate": "tsx src/migrate.ts",
  "db:seed-access": "tsx src/seed-access-control.ts",
  "db:prepare": "pnpm db:migrate && pnpm db:seed-access"
}
```

`migrate.ts` must derive the exact path with `fileURLToPath(new URL("../drizzle", import.meta.url))`, call Drizzle's PostgreSQL migrator, close the pool in `finally`, and exit non-zero on failure. Add focused RED/GREEN commands for seed tests:

Run before implementation: `pnpm --filter @ai-agent-platform/database test src/seed-access-control.test.ts`

Expected RED: missing seed module. Run again after implementation; expected GREEN: idempotency and exact grant-matrix tests pass.

- [ ] **Step 6: Add a one-shot Docker migrator target**

Add an `apps/web/Dockerfile` target named `migrator` containing the dependency stage, database sources, migrations, and the `tsx` runtime intentionally retained for the one-shot tool. Add a `migrate` Compose service that runs `db:prepare` after healthy `db`; make `web` depend on `migrate: service_completed_successfully`. Remove the existing `/docker-entrypoint-initdb.d` migration mount from `db` so SQL is never applied twice.

- [ ] **Step 7: Validate empty-database migration**

Run on an isolated Compose project and volume:

```bash
export POSTGRES_PASSWORD='local-auth-test-only'
export DATABASE_URL='postgresql://ai_agent:local-auth-test-only@db:5432/ai_agent_platform'
docker compose -p aap-auth-test down -v
docker compose -p aap-auth-test up --build migrate
docker compose -p aap-auth-test run --rm migrate pnpm --filter @ai-agent-platform/database db:prepare
docker compose -p aap-auth-test exec -T db psql -U ai_agent -d ai_agent_platform -v ON_ERROR_STOP=1 -c "do \$\$ begin if (select count(*) from roles) <> 7 then raise exception 'expected 7 roles'; end if; if (select count(*) from users) <> 0 then raise exception 'expected 0 users'; end if; if (select count(*) from drizzle.__drizzle_migrations) <> 2 then raise exception 'expected 2 migrations'; end if; end \$\$;"
```

Expected: both prepare runs exit 0; the query returns exactly seven roles; `select count(*) from users` returns zero; the Drizzle migration journal shows two applied migrations. The seed owns only the current manifest keys and their exact grants; catalog retirement requires a reviewed forward migration and never happens by deleting unknown roles or permissions during seed.

- [ ] **Step 8: Commit policy and migration runtime**

```bash
git add packages/database apps/web/Dockerfile compose.yaml
git commit -m "build(db): 添加迁移任务与权限种子"
```

## Chunk 2: Authentication, Sessions, and Route Protection

### Task 4: Implement password primitives and realm-specific Better Auth configurations

**Files:**

- Create: `packages/database/src/credentials/password.test.ts`
- Create: `packages/database/src/credentials/password.ts`
- Modify: `packages/database/src/index.ts`
- Create: `apps/web/src/server/auth/config.test.ts`
- Create: `apps/web/src/server/auth/shared-options.ts`
- Create: `apps/web/src/server/auth/customer-auth.ts`
- Create: `apps/web/src/server/auth/staff-auth.ts`
- Create: `apps/web/src/server/auth/errors.ts`

**Consumes:** Task 2 schema mappings, Task 3 rate-limit storage, `BETTER_AUTH_SECRET`, and trusted application origins.

**Produces:** two Better Auth server instances with distinct base paths/cookies and shared project password primitives.

- [ ] **Step 1: Write failing password tests**

In the database package Node test environment, verify a valid 12-character passphrase hashes with Argon2id, verifies correctly, rejects a wrong password, and rejects lengths outside 12–128.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @ai-agent-platform/database test src/credentials/password.test.ts`

Expected: FAIL because password helpers are absent.

- [ ] **Step 3: Implement Argon2id helpers**

Use `@node-rs/argon2` with Argon2id, 64 MiB memory, three iterations, parallelism four, and a 32-byte output. Export only `hashPassword`, `verifyPassword`, and `assertPasswordPolicy` from `@ai-agent-platform/database`; both Better Auth and the bootstrap CLI consume this one implementation.

- [ ] **Step 4: Verify GREEN**

Run the same focused test; expect PASS.

- [ ] **Step 5: Write failing configuration tests**

Export testable realm descriptors and assert:

```ts
expect(customerRealm.basePath).toBe("/api/auth/customer");
expect(customerRealm.cookieName).toBe("aap_customer_session");
expect(customerRealm.maxAgeSeconds).toBe(7 * 24 * 60 * 60);
expect(staffRealm.basePath).toBe("/api/auth/staff");
expect(staffRealm.cookieName).toBe("aap_staff_session");
expect(staffRealm.maxAgeSeconds).toBe(8 * 60 * 60);
```

Also assert cookie cache is disabled, CSRF/origin checks are not disabled, `x-real-ip` is accepted only behind the configured Nginx boundary, and public sign-up is disabled on the raw auth instances. Assert the Better Auth 1.6.23 built-in backup-code generator returns an empty array and its generate/view/verify endpoints are denied. Render a real handler response in the test and assert the final `Set-Cookie` attributes: exact realm name, `HttpOnly`, environment-correct `Secure`, `SameSite=Lax`, and `Path=/`.

- [ ] **Step 6: Implement shared and realm configurations**

Configure Drizzle, custom password hash/verify, database rate limits, `SameSite=Lax`, and separate cookie names. Add the username plugin only to staff auth. Configure the staff TOTP plugin with account lockout enabled and verification-on-enable required. Better Auth 1.6.23 does not support one-way hashed backup-code storage, so disable its built-in backup codes by generating an empty array (stored only as an encrypted empty schema value) and deny the built-in generate/view/verify endpoints. Task 9 owns recovery-code generation, one-way hashing, single-use consumption, and one-time display through project services. Add a realm/status guard hook before session creation. Add `nextCookies()` from `better-auth/next-js` as the final plugin in both configurations so Server Actions forward cookies correctly. Keep raw email sign-up disabled; Task 7 creates Better Auth-compatible user/account rows through a project repository inside the registration transaction.

- [ ] **Step 7: Verify configs and package gates**

Run: `pnpm --filter @ai-agent-platform/database test src/credentials/password.test.ts && pnpm --filter @ai-agent-platform/web test src/server/auth/config.test.ts && pnpm --filter @ai-agent-platform/web typecheck`

- [ ] **Step 8: Commit**

```bash
git add packages/database/src/credentials packages/database/src/index.ts apps/web/src/server/auth
git commit -m "feat(auth): 建立客户与员工认证配置"
```

### Task 5: Keep auth private and build the secure access DAL

**Files:**

- Create: `apps/web/src/server/auth/access.test.ts`
- Create: `apps/web/src/server/auth/access.ts`
- Create: `apps/web/src/server/auth/audit.test.ts`
- Create: `apps/web/src/server/auth/audit.ts`
- Create: `apps/web/src/app/api/v1/session/customer/route.test.ts`
- Create: `apps/web/src/app/api/v1/session/customer/route.ts`
- Create: `apps/web/src/app/api/v1/session/staff/route.test.ts`
- Create: `apps/web/src/app/api/v1/session/staff/route.ts`

**Consumes:** realm auth instances and Task 3 policy functions.

**Produces:** server-only auth adapters, actor/permission DAL, redacted audit writer, and unambiguous project session DTO endpoints.

- [ ] **Step 1: Write failing access-matrix tests**

Inject a session repository and permission repository. Verify customer/workforce realm mismatch, pending onboarding access, disabled rejection, missing permission rejection, and safe session DTOs that omit the native session token and credential data.

- [ ] **Step 2: Verify RED, implement DAL, verify GREEN**

Required public functions:

```ts
getCurrentActor(realm: IdentityRealm): Promise<Actor | null>;
requireCustomer(options?: { onboardingAllowed?: boolean }): Promise<CustomerActor>;
requireWorkforce(): Promise<WorkforceActor>;
requirePermission(permission: PermissionKey): Promise<WorkforceActor>;
```

Run: `pnpm --filter @ai-agent-platform/web test src/server/auth/access.test.ts`

- [ ] **Step 3: Write and implement audit redaction tests**

Verify that `password`, `passwordHash`, `sessionToken`, `tokenHash`, `totpSecret`, and unknown request-body keys are removed. Only allow event-specific metadata keys.

- [ ] **Step 4: Prove Better Auth remains private**

Do not create or export any `/api/auth/**` catch-all Route Handler in Phase 10. Every sign-in, sign-out, session revocation, password, registration, session query, and two-factor operation goes through project Server Actions/DAL calling `auth.api.*` directly. Add route-registry/file tests proving no public Better Auth handler exists. Cookie/config tests may call the internal `auth.handler` directly without mounting it. Future OAuth/email callbacks require a separately reviewed explicit allow-list route.

- [ ] **Step 5: Implement minimal session DTO endpoint**

`GET /api/v1/session/customer` reads only `aap_customer_session`; `GET /api/v1/session/staff` reads only `aap_staff_session`. Each returns realm, status, display name, and only its relevant organization/permission fields. Both return `401 AUTH_SESSION_REQUIRED` without the expected cookie and ignore the other realm cookie. Neither returns session IDs or tokens.

- [ ] **Step 6: Verify handlers and DTO route**

Run: `pnpm --filter @ai-agent-platform/web test src/server/auth/access.test.ts src/server/auth/audit.test.ts src/app/api/v1/session/customer/route.test.ts src/app/api/v1/session/staff/route.test.ts && pnpm --filter @ai-agent-platform/web typecheck && pnpm --filter @ai-agent-platform/web lint`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api apps/web/src/server/auth
git commit -m "feat(auth): 接入会话处理与服务端权限校验"
```

### Task 6: Implement login/logout UI and protect Console/Admin shells

**Files:**

- Create: `apps/web/src/server/auth/actions.test.ts`
- Create: `apps/web/src/server/auth/actions.ts`
- Create: `apps/web/src/components/auth/customer-login-form.test.tsx`
- Create: `apps/web/src/components/auth/customer-login-form.tsx`
- Create: `apps/web/src/components/auth/staff-login-form.test.tsx`
- Create: `apps/web/src/components/auth/staff-login-form.tsx`
- Create: `apps/web/src/app/staff/login/page.tsx`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/console/layout.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/route-files.test.ts`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Modify: `apps/web/src/config/navigation.ts`

**Consumes:** Task 5 DAL and session DTO endpoints.

**Produces:** working customer/staff login and logout, staff/customer shell guards, and permission-filtered navigation.

- [ ] **Step 1: Write failing action tests**

Verify safe return-path allow-listing, generic invalid-credential errors, customer/staff realm selection on the server, logout revocation, and clearing only the correct realm cookie. Add cases for pending/rejected customer onboarding redirects, disabled login rejection plus session revocation, workforce `mustChangePassword` taking precedence over CMS/TOTP, forced Phase 10 remember-me values, and allow-listed audit events for login success/failure and logout.

- [ ] **Step 2: Verify RED, implement actions, verify GREEN**

Run: `pnpm --filter @ai-agent-platform/web test src/server/auth/actions.test.ts`

- [ ] **Step 3: Write failing accessible form tests**

Customer form requires labeled email/password fields, registration link, loading state, and an error live region. Staff form requires labeled username-or-email/password fields and no registration link.

- [ ] **Step 4: Implement forms and pages**

Use Server Actions with Zod validation. Preserve the blue-indigo-violet design tokens and 44 px targets. Do not expose raw Better Auth errors.

- [ ] **Step 5: Add route registry entries**

Add only `/staff/login` in this task and create its explicit page before updating the route-file test. Task 8 owns `/register`, `/console/onboarding`, and `/admin/registrations`; Task 9 owns `/staff/change-password` and `/staff/two-factor`.

- [ ] **Step 6: Protect route groups**

Make `console/layout.tsx` require a customer-realm session while allowing onboarding-capable status at the shell level. Every existing normal Console page calls `requireCustomer()` with active status; the future onboarding page calls `requireCustomer({ onboardingAllowed: true })`. Do not attempt pathname-specific logic in the layout. Make `admin/layout.tsx` require workforce, while every admin page/action requires its specific permission. Add tests proving leaf checks still run after a session/role change.

- [ ] **Step 7: Load permissions into workspace navigation**

When `SiteShell` detects Console/Admin, fetch the corresponding realm endpoint (`/api/v1/session/customer` or `/api/v1/session/staff`), show a non-sensitive loading skeleton, pass `grantedPermissions` into `AppShell`, enable the correct logout action, and redirect on 401. This filtering remains UX only; DAL tests remain the security boundary.

- [ ] **Step 8: Run focused and existing layout tests**

Run: `pnpm --filter @ai-agent-platform/web test src/server/auth/actions.test.ts src/components/auth src/app/console src/app/admin src/config/route-files.test.ts`

Expected: new auth tests and existing three-shell tests pass.

Then run: `pnpm --filter @ai-agent-platform/web typecheck && pnpm --filter @ai-agent-platform/web lint && pnpm --filter @ai-agent-platform/web build`

Expected: private auth instances and all current routes compile in the production build. Add two cookie tests: direct internal `auth.handler` invocation asserts the real cookie attributes without exposing a route; Server Action login/logout runs in a Next request context and asserts the cookie store is set/cleared by `nextCookies()`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 接入双入口登录与受保护工作区"
```

## Chunk 3: Customer Registration and Review

### Task 7: Implement disabled email verification and registration service

**Files:**

- Create: `packages/integrations/src/email-verification-provider.test.ts`
- Create: `packages/integrations/src/email-verification-provider.ts`
- Modify: `packages/integrations/src/index.ts`
- Create: `apps/web/src/server/registration/repository.ts`
- Create: `apps/web/src/server/registration/actions.test.ts`
- Create: `apps/web/src/server/registration/actions.ts`
- Create: `apps/web/src/server/registration/service.test.ts`
- Create: `apps/web/src/server/registration/service.ts`
- Create: `apps/web/src/server/registration/postgres.integration.test.ts`
- Modify: `.env.example`

**Consumes:** Task 2 tables, Task 4 password helper, Task 5 customer auth/session service, and `FEATURE_EMAIL_VERIFICATION`.

**Produces:** disabled email provider, transactional customer registration/review services, Server Actions, and PostgreSQL integration coverage.

- [ ] **Step 1: Write failing provider tests**

Define:

```ts
type EmailVerificationResult =
  | { ok: true }
  | { ok: false; status: 501; code: "EMAIL_VERIFICATION_DISABLED" };

interface EmailVerificationProvider {
  getStatus(): { enabled: boolean; mode: "placeholder" | "live" };
  requestVerification(
    input: VerificationRequest,
  ): Promise<EmailVerificationResult>;
  verifyToken(input: VerificationToken): Promise<EmailVerificationResult>;
  resendVerification(
    input: VerificationRequest,
  ): Promise<EmailVerificationResult>;
}
```

The disabled implementation accepts no repository/audit dependency, so it cannot write by construction. Verify all three methods return the same typed `501` result and no success callback exists. Add `FEATURE_EMAIL_VERIFICATION=false` to `.env.example`.

- [ ] **Step 2: Verify RED, implement provider, verify GREEN**

Run: `pnpm --filter @ai-agent-platform/integrations test src/email-verification-provider.test.ts`

- [ ] **Step 3: Write failing transactional registration tests**

Inject credential, session, registration, audit, permission, and transaction ports. Test server-side Zod validation, agreement acceptance, 12–128 password policy, normalized duplicate email, identifier/IP limiter before account creation, `pending_review` creation, customer realm enforcement, safe return paths, audit creation, and rollback on failure.

Use these exact service contracts:

```ts
type OrganizationDecision =
  | { kind: "create"; legalName: string }
  | { kind: "link"; organizationId: string };

type ReviewDecision = {
  requestId: string;
  organization: OrganizationDecision;
  initialRole?: "customer_admin" | "customer_member";
  reviewNote?: string;
};

type RegistrationQuery = {
  status: "pending_review" | "active" | "rejected";
  page: number;
  pageSize: 10 | 20 | 50;
};

type RegistrationListItemDto = {
  id: string;
  applicantName: string;
  email: string;
  companyName: string;
  status: RegistrationQuery["status"];
  createdAt: string;
};

type RegistrationPageDto = {
  items: RegistrationListItemDto[];
  total: number;
  page: number;
  pageSize: 10 | 20 | 50;
};

interface RegistrationTransaction {
  createUserAndCredential(input: PendingCustomerCredential): Promise<string>;
  createRequest(input: NewRegistrationRequest): Promise<string>;
  appendAudit(event: RegistrationAuditEvent): Promise<void>;
}
```

The repository inserts Better Auth-compatible `users` and credential `accounts` rows using `hashPassword`; raw Better Auth sign-up remains disabled.

- [ ] **Step 4: Implement registration service**

Expose only:

```ts
submitRegistration(input, context): Promise<RegistrationResult>;
listRegistrationRequests(query, actor): Promise<RegistrationPageDto>;
approveRegistration(decision: ReviewDecision, actor): Promise<void>;
rejectRegistration(requestId, actor, reviewNote): Promise<void>;
getRegistrationStatus(customerActor): Promise<RegistrationStatusDto>;
```

All writes must run in one database transaction and call the project-owned realm policy. `approveRegistration` and `rejectRegistration` require an active workforce actor with `admin:registrations`. Use row locking/status compare-and-set plus unique membership constraints so duplicate or concurrent review returns `REGISTRATION_ALREADY_REVIEWED`. Creating/linking organization, membership, initial role, user status, request status, and audit event commits atomically. Default the first organization member to `customer_admin`; later members default to `customer_member` unless an authorized reviewer explicitly selects otherwise.

For `organization.kind="create"`, normalize legal name into a unique `organizations.legal_name_key` and insert-on-conflict/select inside the approval transaction so concurrent create decisions converge on one organization. The first membership is always forced to `customer_admin`; `initialRole` is ignored/rejected for the first member and can override only later members. List queries sort by `createdAt DESC, id DESC`, enforce the page-size union above, and return only the safe DTO fields.

Commit the registration transaction before issuing the onboarding session. If session issuance fails, credentials/request remain valid and the action returns a retryable login redirect; no partial database transaction remains. Action tests must assert the customer realm cookie and `/console/onboarding` redirect after successful issuance.

The single Server Action layer is `apps/web/src/server/registration/actions.ts`:

```ts
type RegistrationActionState =
  | { kind: "validation_error"; fieldErrors: Record<string, string[]> }
  | { kind: "domain_error"; code: RegistrationErrorCode }
  | { kind: "success"; redirectTo: "/console/onboarding" }
  | { kind: "session_issue_failed"; code: "AUTH_SESSION_ISSUE_FAILED"; retryPath: "/login" };

type ReviewActionState =
  | { kind: "validation_error"; fieldErrors: Record<string, string[]> }
  | { kind: "domain_error"; code: ReviewErrorCode }
  | { kind: "success" };

submitRegistrationAction(previous, formData): Promise<RegistrationActionState>;
approveRegistrationAction(formData): Promise<ReviewActionState>;
rejectRegistrationAction(formData): Promise<ReviewActionState>;
resendVerificationAction(): Promise<EmailVerificationResult>;
```

`submitRegistrationAction` calls `customerAuth.api.signInEmail` with the just-submitted email/password, `rememberMe:false`, incoming headers, and `returnHeaders:true`; `nextCookies()` forwards the customer cookie. Page modules import these actions and do not define duplicate action files.

- [ ] **Step 5: Verify service tests**

Run: `pnpm --filter @ai-agent-platform/web test src/server/registration/service.test.ts src/server/registration/actions.test.ts`

Expected RED before implementation: missing service/actions. Expected GREEN: validation, transaction, authorization, audit, and session boundary cases pass.

- [ ] **Step 6: Add real PostgreSQL integration cases**

Against `TEST_DATABASE_URL`, test rollback, unique-email race mapping, create/link organization approval, first/subsequent membership roles, concurrent approval, repeated approval conflict, rejection reason/state, and atomic audit rows. Use `describe.sequential`, unique per-test identifiers, and truncate identity tables between cases; the database/port is exclusive to this test command.

Run:

```bash
cleanup() { docker stop aap-auth-integration-db >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker run --rm -d --name aap-auth-integration-db -e POSTGRES_USER=ai_agent -e POSTGRES_PASSWORD=integration-only -e POSTGRES_DB=ai_agent_platform -p 55432:5432 postgres:18.3-alpine3.23
until docker exec aap-auth-integration-db pg_isready -U ai_agent -d ai_agent_platform; do sleep 1; done
DATABASE_URL=postgresql://ai_agent:integration-only@127.0.0.1:55432/ai_agent_platform pnpm --filter @ai-agent-platform/database db:migrate
TEST_DATABASE_URL=postgresql://ai_agent:integration-only@127.0.0.1:55432/ai_agent_platform pnpm --filter @ai-agent-platform/web test src/server/registration/postgres.integration.test.ts
```

Expected: all transaction cases pass against migrated PostgreSQL.

- [ ] **Step 7: Run package gates**

Run: `pnpm --filter @ai-agent-platform/integrations test && pnpm --filter @ai-agent-platform/integrations typecheck && pnpm --filter @ai-agent-platform/integrations lint && pnpm --filter @ai-agent-platform/web typecheck && pnpm --filter @ai-agent-platform/web lint`

- [ ] **Step 8: Commit**

```bash
git add packages/integrations apps/web/src/server/registration .env.example
git commit -m "feat(identity): 建立客户注册审核服务"
```

### Task 8: Build registration, onboarding, and internal review pages

**Files:**

- Create: `apps/web/src/components/auth/customer-registration-form.test.tsx`
- Create: `apps/web/src/components/auth/customer-registration-form.tsx`
- Create: `apps/web/src/components/auth/email-verification-status.test.tsx`
- Create: `apps/web/src/components/auth/email-verification-status.tsx`
- Create: `apps/web/src/app/register/page.tsx`
- Create: `apps/web/src/app/console/onboarding/page.test.tsx`
- Create: `apps/web/src/app/console/onboarding/page.tsx`
- Create: `apps/web/src/app/admin/registrations/page.test.tsx`
- Create: `apps/web/src/app/admin/registrations/page.tsx`
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/route-files.test.ts`
- Modify: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/config/navigation.test.ts`

**Consumes:** Task 7 actions and DTOs.

**Produces:** customer registration/onboarding pages, review UI, route registry, and permission-aware navigation.

- [ ] **Step 1: Write failing customer UI tests**

Test labels for name, email, password, company, and agreement; inline errors; disabled double-submit; pending review copy; email status; disabled resend explanation; and absence of a false “email sent” message. Cover `pending_review`, `rejected`, and `active` redirects; unauthenticated/wrong-realm denial; all `unverified|pending|verified` states; and the disabled resend action returning `501` without a success announcement.

- [ ] **Step 2: Verify RED and implement customer pages**

Run before implementation: `pnpm --filter @ai-agent-platform/web test src/components/auth/customer-registration-form.test.tsx src/components/auth/email-verification-status.test.tsx src/app/console/onboarding/page.test.tsx`

Implement minimal forms/pages and run again; expect PASS.

- [ ] **Step 3: Write failing review-page tests**

Require `admin:registrations` in both service and action, render paginated pending requests with company/applicant metadata, require a rejection reason, require an explicit create/link organization decision, confirm approval, and show deterministic empty/error/conflict states.

Run before review implementation: `pnpm --filter @ai-agent-platform/web test src/app/admin/registrations/page.test.tsx src/server/registration/actions.test.ts`

Expected RED: review UI/action behavior absent. Run again after implementation; expected GREEN.

- [ ] **Step 4: Implement review page and actions**

Use server-side pagination and permission checks. Approval/rejection calls the registration service; the page never writes tables directly.

- [ ] **Step 5: Update workforce navigation**

Add “客户注册审核” with `permission: "admin:registrations"`. Keep OpenLab review explicitly marked as an unrelated placeholder.

Update `navigation.test.ts` exact permission expectations and `route-files.test.ts` for the three pages owned by this task.

- [ ] **Step 6: Run customer slice tests**

Run: `pnpm --filter @ai-agent-platform/web test src/components/auth src/app/register src/app/console/onboarding src/app/admin/registrations src/config/navigation.test.ts src/config/route-files.test.ts && pnpm --filter @ai-agent-platform/web typecheck && pnpm --filter @ai-agent-platform/web lint`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 实现客户注册与审核页面"
```

## Chunk 4: Workforce Administration, TOTP, Deployment, and Final Gates

### Task 9: Implement workforce provisioning, forced password change, and TOTP

**Files:**

- Create: `apps/web/src/server/admin/users.test.ts`
- Create: `apps/web/src/server/admin/users.ts`
- Create: `apps/web/src/server/auth/sensitive-action.test.ts`
- Create: `apps/web/src/server/auth/sensitive-action.ts`
- Modify: `apps/web/src/server/auth/actions.test.ts`
- Modify: `apps/web/src/server/auth/actions.ts`
- Modify: `apps/web/src/server/auth/staff-auth.ts`
- Create: `apps/web/src/components/auth/change-password-form.test.tsx`
- Create: `apps/web/src/components/auth/change-password-form.tsx`
- Create: `apps/web/src/components/auth/two-factor-form.test.tsx`
- Create: `apps/web/src/components/auth/two-factor-form.tsx`
- Create: `apps/web/src/app/staff/change-password/page.tsx`
- Create: `apps/web/src/app/staff/two-factor/page.tsx`
- Create: `apps/web/src/app/staff/re-auth/page.tsx`
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/route-files.test.ts`

**Consumes:** Task 2 two-factor schema, Task 4 staff auth, Task 5 workforce DAL, and shared password primitive.

**Produces:** workforce provisioning, forced password change, TOTP enrollment/challenge, session MFA assurance, and one central privileged-action guard.

- [ ] **Step 1: Write failing workforce-service tests**

Verify workforce-only creation, customer-role rejection, allowed initial roles, temporary-password flagging, password-change session revocation, disabling atomically revoking sessions, admin inability to grant `super_admin`, and super-admin success. Add last-super-admin protection, self-disable/self-demotion rejection, admin modifying another admin rejection, cross-realm target rejection, reactivation rules, password replacement revocation, atomic role/session/audit writes, and exact mutation permissions.

- [ ] **Step 2: Verify RED, implement service, verify GREEN**

Run: `pnpm --filter @ai-agent-platform/web test src/server/admin/users.test.ts src/server/auth/sensitive-action.test.ts`

Implement:

```ts
requireSensitiveWorkforceAction(
  permission: PermissionKey,
  options?: { recentWithinSeconds?: number; mfaRequired?: boolean },
): Promise<WorkforceActor>;
```

For `admin`/`super_admin` account, role, permission, registration-approval, and site-setting mutations, require the permission, a session created/re-authenticated within ten minutes, and `sessions.mfaVerifiedAt` within ten minutes. Add a Better Auth `after` hook for `/two-factor/verify-totp`: only when `ctx.context.newSession` exists after successful verification, update that exact new session ID with `mfaVerifiedAt=now`. Enrollment alone is insufficient. An older session receives `AUTH_REAUTH_REQUIRED` and redirects to `/staff/re-auth`; re-auth revokes the current staff session and performs a new username/email + password + TOTP login with an allow-listed return path. It never stamps assurance onto an old session from incoming headers.

- [ ] **Step 3: Write failing forced-password and TOTP UI tests**

Test redirect precedence (`mustChangePassword` before CMS; privileged TOTP after password change), labeled current/new password fields, QR alternative text, manual TOTP URI fallback, six-digit code validation, one-time recovery-code warning, disabled recovery-code viewing endpoint, single-use project-owned hashed recovery code, and server actions hard-coding `trustDevice: false`. Verify recovery-code generation stores only hashes in `twoFactors.backupCodes`, returns plaintext only from enrollment/regeneration, consumes a matching hash atomically, and rejects reuse. Re-auth tests assert the old session is revoked first, bad password/TOTP creates no new session, successful TOTP stamps only the new session's `mfaVerifiedAt`, and off-origin/unlisted return paths fall back to `/admin`.

- [ ] **Step 4: Implement password-change and TOTP actions/pages**

Pin compile-contract tests to Better Auth 1.6.23 calls: `staffAuth.api.changePassword`, `enableTwoFactor`, `verifyTOTP`, and `disableTwoFactor`, always passing `headers: await headers()`. Never call Better Auth's built-in `generateBackupCodes`, `viewBackupCodes`, or `verifyBackupCode`; implement project-owned `generateRecoveryCodes` and `verifyAndConsumeRecoveryCode` services against one-way hashes in `twoFactors.backupCodes`. After `enableTwoFactor` returns the TOTP URI and an intentionally empty built-in backup-code list, generate project recovery codes in the same guarded enrollment flow and return their plaintext values once. Use `returnHeaders: true` where the API changes cookies and forward `Set-Cookie`; set `trustDevice: false` and `disableSession: false` explicitly. Render QR data locally with `qrcode`; never call an external QR service.

- [ ] **Step 5: Run workforce security tests**

Run: `pnpm --filter @ai-agent-platform/web test src/server/admin/users.test.ts src/server/auth/actions.test.ts src/server/auth/sensitive-action.test.ts src/components/auth/change-password-form.test.tsx src/components/auth/two-factor-form.test.tsx`

Then run: `pnpm --filter @ai-agent-platform/web typecheck && pnpm --filter @ai-agent-platform/web lint`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(auth): 实现员工初始化密码与管理员TOTP"
```

### Task 10: Implement minimal users, roles, sessions, and audit administration

**Files:**

- Create: `apps/web/src/server/admin/roles.test.ts`
- Create: `apps/web/src/server/admin/roles.ts`
- Create: `apps/web/src/server/admin/audit-logs.test.ts`
- Create: `apps/web/src/server/admin/audit-logs.ts`
- Create: `apps/web/src/server/admin/sessions.test.ts`
- Create: `apps/web/src/server/admin/sessions.ts`
- Create: `apps/web/src/app/admin/users/page.test.tsx`
- Modify: `apps/web/src/app/admin/users/page.tsx`
- Create: `apps/web/src/app/admin/roles/page.test.tsx`
- Modify: `apps/web/src/app/admin/roles/page.tsx`
- Create: `apps/web/src/app/admin/audit-logs/page.test.tsx`
- Modify: `apps/web/src/app/admin/audit-logs/page.tsx`
- Create: `apps/web/src/app/console/profile/page.test.tsx`
- Modify: `apps/web/src/app/console/profile/page.tsx`
- Modify: `apps/web/src/app/admin/site/page.tsx`

**Consumes:** Task 9 sensitive-action guard and admin services.

**Produces:** minimal user/role/session/audit administration with privileged mutation enforcement and append-only audit access.

- [ ] **Step 1: Write failing role and audit query tests**

Test search/filter/pagination, realm-scoped role assignment, permission checks, safe DTOs, append-only audit results, and redacted metadata. Test every account create/disable/reactivate/password replacement, session revocation, role add/remove, permission change, TOTP enrollment/recovery/removal action writes its required allow-listed audit event. Expose no audit update/delete service.

- [ ] **Step 2: Verify RED, implement admin query services, verify GREEN**

Run: `pnpm --filter @ai-agent-platform/web test src/server/admin/roles.test.ts src/server/admin/audit-logs.test.ts`

- [ ] **Step 3: Write page behavior tests**

Users page: filter customer/workforce/status, create employee, disable/reactivate, replace password, revoke one/all sessions. Roles page: scope labels and guarded assignment. Audit page: actor/action/target/time filters. Customer profile: list and revoke own sessions without exposing raw tokens. Site configuration mutations and role/permission mutations must call `requireSensitiveWorkforceAction`; page visibility alone is insufficient.

- [ ] **Step 4: Implement minimal administration pages**

Keep tables server-rendered with GET filters and paginated queries. Mutations use small confirmation forms and server actions. Do not add generic CRUD abstractions.

- [ ] **Step 5: Run admin slice tests**

Run: `pnpm --filter @ai-agent-platform/web test src/server/admin src/app/admin/users src/app/admin/roles src/app/admin/audit-logs src/app/console/profile src/server/auth/sensitive-action.test.ts && pnpm --filter @ai-agent-platform/web typecheck && pnpm --filter @ai-agent-platform/web lint`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(admin): 实现用户角色会话与审计管理"
```

### Task 11: Add secure super-admin bootstrap, proxy throttling, and CI

**Files:**

- Create: `packages/database/src/create-super-admin.test.ts`
- Create: `packages/database/src/create-super-admin.ts`
- Create: `packages/database/src/seed-auth-e2e.ts`
- Create: `packages/database/src/assert-auth-at-rest.ts`
- Modify: `packages/database/package.json`
- Modify: `.env.example`
- Modify: `compose.yaml`
- Modify: `infra/nginx/nginx.conf`
- Create: `.github/workflows/ci.yml`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/auth-smoke.spec.ts`
- Create: `apps/web/e2e/proxy-auth-security.spec.ts`
- Modify: `docs/deployment/server-readiness.md`
- Modify: `packages/database/README.md`

**Consumes:** shared database password helper, migrated/seeded access tables, and the production Docker topology.

**Produces:** interactive first-admin bootstrap, trusted-proxy throttling, PostgreSQL-backed CI, and executable browser smoke tests.

- [ ] **Step 1: Write failing bootstrap tests**

Inject prompt, credential, role, audit, and transaction ports. Test refusal when email/username/password is absent, refusal when any super administrator already exists, normalized unique email/username, hidden password input, no password logging, and successful creation with `identityRealm=workforce`, `status=active`, `mustChangePassword=true`, credential account, `super_admin` assignment, and `bootstrap.super_admin_created` audit event in one transaction.

- [ ] **Step 2: Verify RED, implement CLI, verify GREEN**

Add script `auth:create-super-admin`: `tsx src/create-super-admin.ts`. The CLI uses a TTY-only `readHiddenInput()` helper with raw mode, confirmation, and cleanup in `finally`; it does not accept plaintext passwords as command-line arguments or environment variables. It imports the shared database password primitive, creates Better Auth-compatible user/account rows directly, closes the pool, and exits non-zero on partial or duplicate bootstrap attempts.

Add `db:seed-auth-e2e`: `tsx src/seed-auth-e2e.ts`. It is test-only, requires `NODE_ENV=test` plus masked fixture credentials, creates deterministic realm/status/role fixtures idempotently, and never logs secrets. Add test-only `auth:assert-at-rest`: it reads a recovery code from stdin plus fixture email from environment. Mode `--expect-present-hashed` fails if plaintext is stored or no matching hashed code exists; mode `--expect-consumed` fails if the hash or a revoked fixture session still exists.

- [ ] **Step 3: Add Compose bootstrap documentation**

Document:

```bash
docker compose run --rm -it migrate pnpm --filter @ai-agent-platform/database auth:create-super-admin
```

Expected: password is read from TTY, no default account exists, and the command is idempotently guarded.

- [ ] **Step 4: Add trusted-proxy and auth throttling rules**

Map only POST requests to a non-empty rate-limit key, then define `limit_req_zone $auth_post_key zone=auth_post_per_ip:10m rate=5r/m;`. Apply `limit_req zone=auth_post_per_ip burst=5 nodelay;` and `limit_req_status 429;` to an exact route regex covering `/login`, `/register`, `/staff/login`, `/staff/two-factor`, and `/staff/re-auth`; GET page loads use an empty key and are not counted. Application services still enforce normalized identifier/IP limits. Nginx must overwrite `X-Real-IP` and `X-Forwarded-For`, and the origin must not be published directly. `proxy-auth-security.spec.ts` opens a context with spoofed `X-Real-IP: 203.0.113.77`, triggers a failed login, then uses an authenticated audit page to assert the stored IP differs from the spoof. It also submits more than `burst + rate` POSTs and asserts HTTP 429.

- [ ] **Step 5: Add CI workflow**

On pull requests and pushes to `main`, use Node 24 and pnpm 11.5.2 with a PostgreSQL 18 service. Supply test-only `DATABASE_URL`, `TEST_DATABASE_URL`, `BETTER_AUTH_SECRET` (at least 32 random CI-only characters), `BETTER_AUTH_URL=http://127.0.0.1:3000`, `FEATURE_EMAIL_VERIFICATION=false`, and masked E2E fixture credentials. Install with frozen lockfile, migrate/seed the empty DB, run all unit/integration/static/build gates, install Playwright Chromium, start the built app through `playwright.config.ts.webServer`, seed E2E identities through `db:seed-auth-e2e`, run `auth-smoke.spec.ts`, build the Docker web/migrator targets, and validate Nginx. The E2E seed script refuses `NODE_ENV=production`, reads passwords only from environment variables, and never prints them.

- [ ] **Step 6: Validate Compose and workflow syntax**

Run:

```bash
export POSTGRES_PASSWORD='local-auth-validation-only'
export DATABASE_URL='postgresql://ai_agent:local-auth-validation-only@db:5432/ai_agent_platform'
export BETTER_AUTH_SECRET='local-auth-validation-secret-32chars-minimum'
export BETTER_AUTH_URL='http://127.0.0.1:8080'
export FEATURE_EMAIL_VERIFICATION=false
export E2E_CUSTOMER_PASSWORD='local-customer-validation-passphrase'
export E2E_STAFF_PASSWORD='local-staff-validation-passphrase'
export E2E_ADMIN_PASSWORD='local-admin-validation-passphrase'
docker compose config
docker build --target migrator -f apps/web/Dockerfile .
docker build --target runner -f apps/web/Dockerfile .
docker compose up -d --build --wait --wait-timeout 120 db migrate web proxy
docker compose run --rm proxy nginx -t
docker compose run --rm -e NODE_ENV=test -e E2E_CUSTOMER_PASSWORD -e E2E_STAFF_PASSWORD -e E2E_ADMIN_PASSWORD migrate pnpm --filter @ai-agent-platform/database db:seed-auth-e2e
BASE_URL=http://127.0.0.1:8080 pnpm --filter @ai-agent-platform/web exec playwright test e2e/auth-smoke.spec.ts
BASE_URL=http://127.0.0.1:8080 pnpm --filter @ai-agent-platform/web exec playwright test e2e/proxy-auth-security.spec.ts --project=desktop --workers=1
```

Expected: Compose expands, both image targets build, `nginx -t` reports successful syntax, and both proxy-backed smoke tests pass. `playwright.config.ts` sets `webServer` only when `BASE_URL` is absent; Compose-backed local validation always supplies `BASE_URL`, while CI host mode uses `127.0.0.1` PostgreSQL and lets `webServer` start the app.

Add exact `.env.example` entries for `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, trusted origins, `FEATURE_EMAIL_VERIFICATION=false`, `DATABASE_URL`, and `TEST_DATABASE_URL`, including production validation notes.

Ignore `artifacts/playwright/`, `playwright-report/`, and `test-results/` so browser credentials, traces, and screenshots cannot be committed.

- [ ] **Step 7: Commit**

```bash
git add packages/database .env.example compose.yaml infra/nginx .github docs/deployment packages/database/README.md
git add .gitignore apps/web/playwright.config.ts apps/web/e2e/auth-smoke.spec.ts apps/web/e2e/proxy-auth-security.spec.ts
git commit -m "ci(auth): 加固身份部署与质量门禁"
```

### Task 12: Execute full security, browser, and Docker acceptance

**Files:**

- Modify: `progress.md`
- Modify: `task_plan.md`
- Modify: `docs/product/PRD.md`
- Create: `docs/testing/identity-access-control-acceptance.md`
- Create: `apps/web/e2e/auth-access.spec.ts`
- Create: `apps/web/e2e/auth-fixtures.ts`

**Consumes:** complete Phase 10 implementation and clean Docker volumes.

**Produces:** reproducible automated/browser/deployment evidence mapped to every identity acceptance criterion.

- [ ] **Step 1: Run full automated quality gate**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Expected: all commands exit 0 without warnings introduced by this branch.

- [ ] **Step 2: Run a clean Docker acceptance environment**

Run:

```bash
export POSTGRES_PASSWORD='local-auth-acceptance-only'
export DATABASE_URL='postgresql://ai_agent:local-auth-acceptance-only@db:5432/ai_agent_platform'
export BETTER_AUTH_SECRET='local-auth-acceptance-secret-32chars-minimum'
export BETTER_AUTH_URL='http://127.0.0.1:8080'
export FEATURE_EMAIL_VERIFICATION=false
export E2E_CUSTOMER_PASSWORD='local-customer-fixture-passphrase'
export E2E_STAFF_PASSWORD='local-staff-fixture-passphrase'
export E2E_ADMIN_PASSWORD='local-admin-fixture-passphrase'
docker compose -p aap-auth-acceptance down -v
docker compose -p aap-auth-acceptance up --build -d --wait --wait-timeout 120 db migrate web proxy
docker compose -p aap-auth-acceptance ps
curl -fsS http://127.0.0.1:8080/api/health/live
curl -fsS http://127.0.0.1:8080/api/health/ready
docker compose -p aap-auth-acceptance run --rm -it migrate pnpm --filter @ai-agent-platform/database auth:create-super-admin
```

Expected: migrate exits 0, all long-running services are healthy, both health endpoints return 200, seed creates no default user, and the interactive command creates exactly one forced-password-change super administrator. Restart with `docker compose -p aap-auth-acceptance restart` and re-check health/session fixtures.

- [ ] **Step 3: Execute the access matrix**

Run `docker compose -p aap-auth-acceptance run --rm -e NODE_ENV=test -e E2E_CUSTOMER_PASSWORD -e E2E_STAFF_PASSWORD -e E2E_ADMIN_PASSWORD migrate pnpm --filter @ai-agent-platform/database db:seed-auth-e2e`; Playwright reads the same masked environment variables. `auth-fixtures.ts` contains only fixture identifiers and helpers, never database access or committed passwords. PostgreSQL remains unexposed. Record HTTP/browser assertions for:

- anonymous → Console/Admin denied;
- pending customer → onboarding allowed, Console denied;
- active customer → Console allowed, Admin denied;
- employee → Admin shell allowed, restricted mutations denied;
- admin without TOTP → sensitive mutation denied;
- admin with TOTP → allowed permission only;
- disabled user → next request rejected;
- role removal → next authorization check denied;
- workforce session → customer organization data denied;
- one revoked session → rejected while a separate active session remains valid;
- administrative password replacement → old sessions rejected;
- wrong-realm cookie → explicit denial;
- recovery code → usable once and stored only as a hash;
- production session cookies → `Secure`, `HttpOnly`, `SameSite=Lax`;
- health endpoints → public;
- repeated invalid login/registration → `429` at configured limits;
- email resend with provider disabled → `501 EMAIL_VERIFICATION_DISABLED`.

- [ ] **Step 4: Browser-check desktop and mobile flows**

Run the recovery-code checks in this exact order so the database is inspected both before and after consumption:

```bash
BASE_URL=http://127.0.0.1:8080 pnpm --filter @ai-agent-platform/web exec playwright test e2e/auth-access.spec.ts --grep '@totp-enroll' --project=desktop --workers=1 --trace on --output ../../artifacts/playwright/auth
docker compose -p aap-auth-acceptance run --rm -T -e NODE_ENV=test -e E2E_ADMIN_EMAIL='admin.fixture@example.invalid' migrate pnpm --filter @ai-agent-platform/database auth:assert-at-rest -- --expect-present-hashed < artifacts/playwright/auth/recovery-code.txt
BASE_URL=http://127.0.0.1:8080 pnpm --filter @ai-agent-platform/web exec playwright test e2e/auth-access.spec.ts --grep '@recovery-consume' --project=desktop --workers=1 --trace on --output ../../artifacts/playwright/auth
docker compose -p aap-auth-acceptance run --rm -T -e NODE_ENV=test -e E2E_ADMIN_EMAIL='admin.fixture@example.invalid' migrate pnpm --filter @ai-agent-platform/database auth:assert-at-rest -- --expect-consumed < artifacts/playwright/auth/recovery-code.txt
rm artifacts/playwright/auth/recovery-code.txt
BASE_URL=http://127.0.0.1:8080 pnpm --filter @ai-agent-platform/web exec playwright test e2e/auth-access.spec.ts --grep '@security-state' --grep-invert '@totp-enroll|@recovery-consume' --project=desktop --workers=1 --trace on --output ../../artifacts/playwright/auth
BASE_URL=http://127.0.0.1:8080 pnpm --filter @ai-agent-platform/web exec playwright test e2e/auth-access.spec.ts --grep-invert '@security-state' --trace on --output ../../artifacts/playwright/auth
```

Tag every test that mutates a shared user, role, session, rate-limit bucket, TOTP secret, or recovery code with `@security-state`; these tests run only in the desktop project with one worker. Tag the recovery tests with both `@security-state` and their specific tag. The `@totp-enroll` test writes one recovery code to ignored `artifacts/playwright/auth/recovery-code.txt` with mode 0600 and logs out. The first at-rest assertion fails if plaintext is stored or the matching hash is absent. The `@recovery-consume` test completes one second-factor challenge with that code, logs out, and proves a second attempt with the same code fails. The second at-rest assertion fails if the recovery-code hash or revoked session remains. Only visual and otherwise stateless flows run in both the 1440×1000 and 390×844 projects. Expected: all projects pass; no overflow, focus loss, unlabeled control, console error, or false success message; traces/screenshots are stored under ignored `artifacts/playwright/auth` and summarized, not committed.

After obtaining a valid fixture session, run `docker compose -p aap-auth-acceptance restart web proxy`, wait with `docker compose -p aap-auth-acceptance ps --format json` until both are healthy, and assert the session still works. Revoke it, restart again, and assert it remains rejected.

- [ ] **Step 5: Review secrets and generated files**

Run `git status`, `git diff --check`, secret-pattern searches, and verify `.env`, session tokens, password values, TOTP secrets, recovery codes, database dumps, `.next`, and local caches are not tracked.

- [ ] **Step 6: Update PRD and execution records**

Mark the implemented identity routes and success criteria accurately. Keep SMTP/SSO/License/Download/OpenLab marked disabled. Record exact tests, Docker commands, migration result, and remaining production inputs.

- [ ] **Step 7: Commit final acceptance records**

```bash
git add docs/product/PRD.md docs/testing/identity-access-control-acceptance.md task_plan.md progress.md apps/web/e2e/auth-access.spec.ts apps/web/e2e/auth-fixtures.ts
git commit -m "docs(auth): 记录身份权限验收结果"
```

- [ ] **Step 8: Request final code review before merge**

Use `superpowers:requesting-code-review`, resolve all blocking findings, rerun affected gates, and only then offer merge/push choices through `superpowers:finishing-a-development-branch`.

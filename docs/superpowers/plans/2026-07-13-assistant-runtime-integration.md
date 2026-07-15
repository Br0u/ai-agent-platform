# Assistant Runtime Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Web assistant boundary to the internal AgentOS service with secure anonymous sessions, shared application rate limiting, protected admin status/session APIs, and safe placeholder fallback.

**Architecture:** Keep browser traffic on the existing versioned Next.js BFF. Derive an internal AgentOS session ID from a signed, HttpOnly anonymous Cookie without ever returning the credential to JavaScript. Reuse the existing PostgreSQL `rate_limits` table for multi-instance counters, and isolate AgentOS transport/readiness/circuit logic behind a server-only client and Provider selector. Because no model is configured, public chat remains placeholder while Admin can verify AgentOS infrastructure health.

**Tech Stack:** Next.js 16, TypeScript, Web Crypto/Node crypto, PostgreSQL/Drizzle, Agno AgentOS REST, Vitest, Playwright, Nginx, Docker Compose.

**Source spec:** `docs/superpowers/specs/2026-07-13-agentos-assistant-experience-design.md`

**Depends on:** `docs/superpowers/plans/2026-07-13-assistant-web-experience.md` and `docs/superpowers/plans/2026-07-13-agentos-service.md` completed and green.

---

## File structure

- `apps/web/src/server/assistant/anonymous-session.ts`: Cookie codec, TTL/rotation, internal HMAC ID, and safe public metadata.
- `apps/web/src/server/assistant/assistant-rate-limit.ts`: shared PostgreSQL limiter and cleanup.
- `apps/web/src/server/assistant/trusted-client-ip.ts`: strict proxy boundary parsing.
- `apps/web/src/server/assistant/agentos-client.ts`: Bearer-auth internal HTTP transport.
- `apps/web/src/server/assistant/agentos-readiness.ts`: TTL cache, timeout, circuit state, and recovery.
- `apps/web/src/server/assistant/assistant-provider-selector.ts`: explicit placeholder/AgentOS capability gate.
- `apps/web/src/app/api/v1/admin/assistant/*`: protected status, test, and metadata adapters.

## Chunk 1: Anonymous session and shared rate limit

### Task 1: Implement a signed anonymous session Cookie

**Files:**
- Create: `apps/web/src/server/assistant/anonymous-session.ts`
- Create: `apps/web/src/server/assistant/anonymous-session.test.ts`
- Create: `apps/web/src/server/assistant/assistant-actor.ts`
- Create: `apps/web/src/server/assistant/assistant-actor.test.ts`
- Modify: `apps/web/src/features/assistant/assistant-contract.ts`
- Modify: `apps/web/src/app/api/v1/assistant/chat/route.test.ts`
- Create: `apps/web/src/app/api/v1/assistant/session/handler.ts`
- Create: `apps/web/src/app/api/v1/assistant/session/route.ts`
- Create: `apps/web/src/app/api/v1/assistant/session/route.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing codec and lifecycle tests**

Use an injected clock/random source. Assert:

```ts
expect(cookie.name).toBe("__Host-aap_assistant_sid");
expect(cookie.options).toMatchObject({
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: true,
});
expect(publicSession).toEqual({
  temporary: true,
  expiresAt: "2026-07-13T12:00:00.000Z",
});
expect(JSON.stringify(publicSession)).not.toContain(rawCredential);
```

Choose Cookie policy from validated server configuration `ASSISTANT_PUBLIC_ORIGIN`, never `NODE_ENV`, `Host`, or `X-Forwarded-Proto`: HTTPS uses `__Host-aap_assistant_sid` with Secure and no Domain; HTTP is accepted only for exact loopback development origins and uses `aap_assistant_sid_dev`. Reject non-loopback HTTP at startup and prove request headers cannot downgrade the policy. Test 30-minute idle expiry, 24-hour absolute expiry, sliding refresh, invalid signature/format rotation, and a different internal HMAC session ID than the Cookie credential. Assert raw and internal replayable values never enter returned JSON/log metadata.

Resolve an optional authenticated customer through the existing server-side access boundary; never accept actor IDs in the request body. Put a domain-separated, non-reversible actor binding tag (`anonymous` or HMAC of `customer:<userId>`) inside the signed envelope. Rotate when anonymous ↔ customer or customer actor changes, so a Cookie cannot cross identity binding.

Also test `DELETE /api/v1/assistant/session`: it expires the exact environment-specific Cookie and invokes an injected internal-session deletion function with only the derived internal ID. An invalid Cookie is only cleared and never triggers remote deletion. In placeholder mode the dependency is an explicit no-op because no messages are persisted; return HTTP 204 and do not claim that a remote AgentOS session was deleted.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/assistant/anonymous-session.test.ts src/server/assistant/assistant-actor.test.ts src/app/api/v1/assistant/chat/route.test.ts src/app/api/v1/assistant/session/route.test.ts
```

Expected: session codec and expiry metadata missing.

- [ ] **Step 3: Implement the minimum signed envelope**

Encode version, 256-bit random ID, issued-at, last-seen, and actor binding tag in base64url, authenticated with HMAC-SHA256 using `ASSISTANT_SESSION_SECRET` (minimum 32 random bytes). Derive AgentOS `session_id` with a domain-separated HMAC; never reuse the Cookie value directly. Refresh last-seen on accepted chat requests but never extend beyond absolute expiry. Reject ambiguous duplicate Cookie names. Parse `ASSISTANT_PUBLIC_ORIGIN` once through strict server settings.

- [ ] **Step 4: Add expiry to the public contract without exposing credentials**

Change `session` from `{ temporary: true }` to `{ temporary: true, expiresAt }`. Do not add `id`. Add `.env.example` documentation only; real local values stay ignored.

- [ ] **Step 5: Run and confirm GREEN**

Run the complete Step 2 test command again, then:

```bash
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/assistant/anonymous-session.ts apps/web/src/server/assistant/anonymous-session.test.ts apps/web/src/server/assistant/assistant-actor.ts apps/web/src/server/assistant/assistant-actor.test.ts apps/web/src/features/assistant/assistant-contract.ts apps/web/src/app/api/v1/assistant/chat/route.test.ts apps/web/src/app/api/v1/assistant/session .env.example
git commit -m "feat(assistant): add secure anonymous sessions"
```

### Task 2: Add shared PostgreSQL application rate limiting

**Files:**
- Create: `apps/web/src/server/assistant/assistant-rate-limit.ts`
- Create: `apps/web/src/server/assistant/assistant-rate-limit.test.ts`
- Create: `apps/web/src/server/assistant/assistant-rate-limit.postgres.integration.test.ts`
- Create: `apps/web/src/server/assistant/trusted-client-ip.ts`
- Create: `apps/web/src/server/assistant/trusted-client-ip.test.ts`
- Modify: `apps/web/src/app/api/v1/assistant/chat/handler.ts`
- Modify: `apps/web/src/app/api/v1/assistant/chat/route.test.ts`

- [ ] **Step 1: Write failing key, counter, and proxy tests**

Follow the proven `server/auth/rate-limit.ts` transaction/upsert pattern. Assert keys are HMAC digests and separate `anonymous`, `customer`, and `admin-test` scopes. Anonymous traffic consumes two independent buckets in one transaction: session and, when trusted, IP. Any exceeded bucket rolls back/returns 429. Prove deleting/rotating a Cookie does not bypass the stable trusted-IP bucket. Verify a second limiter instance sharing the same test database observes the first instance's count. Next Route `Request` does not expose the socket peer, so do not invent one: when `TRUST_NGINX_PROXY=true`, accept only one canonical `X-Real-IP` value written by the Compose-internal Nginx and reject ambiguous chains; when false, ignore forwarding headers and rate-limit by session/actor only. Production safety comes from Web having no published port.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/assistant/assistant-rate-limit.test.ts src/server/assistant/assistant-rate-limit.postgres.integration.test.ts src/server/assistant/trusted-client-ip.test.ts src/app/api/v1/assistant/chat/route.test.ts
```

Expected: missing limiter/proxy parser; handler does not emit versioned 429.

- [ ] **Step 3: Implement bounded shared counters**

Use the existing `rate_limits` table with prefix `assistant:` and the same cleanup discipline as auth. HMAC keys use a dedicated `ASSISTANT_RATE_LIMIT_SECRET`, not the Cookie or Better Auth secret. Consume `assistant:anonymous:session:<hmac>` and optional `assistant:anonymous:ip:<hmac>` as separate rows in one transaction; customer and admin-test use their own actor-scoped rows and quotas. Production must not fall back to process memory if the database is unavailable—return safe 503 instead.

- [ ] **Step 4: Integrate the public handler**

Resolve/rotate the Cookie, consume the rate limit before Provider work, and return the exact `429 rate_limited` envelope. Inject session and limiter dependencies so unit tests do not require a database.

- [ ] **Step 5: Run and confirm GREEN**

Run Step 2. Expected: all pass, including cross-instance integration.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/assistant/assistant-rate-limit* apps/web/src/server/assistant/trusted-client-ip* apps/web/src/app/api/v1/assistant/chat
git commit -m "feat(assistant): enforce shared application rate limits"
```

## Chunk 2: AgentOS transport, protected admin APIs, and deployment acceptance

### Task 3: Add the internal AgentOS client and readiness circuit

**Files:**
- Create: `apps/web/src/server/assistant/agentos-client.ts`
- Create: `apps/web/src/server/assistant/agentos-client.test.ts`
- Create: `apps/web/src/server/assistant/agentos-readiness.ts`
- Create: `apps/web/src/server/assistant/agentos-readiness.test.ts`
- Create: `apps/web/src/server/assistant/assistant-provider-selector.ts`
- Create: `apps/web/src/server/assistant/assistant-provider-selector.test.ts`
- Create: `apps/web/src/server/assistant/agentos-assistant-provider.ts`
- Create: `apps/web/src/server/assistant/agentos-assistant-provider.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing transport/security tests**

Mock fetch and assert the client uses only `AGENTOS_INTERNAL_URL`, adds `Authorization: Bearer <OS_SECURITY_KEY>`, applies an AbortSignal timeout, rejects redirects, validates response shape, and never logs URL credentials, key, or message. Test live/ready/capability separately.

- [ ] **Step 2: Write failing readiness/circuit tests**

With an injected clock, verify one probe is cached for the configured TTL, three consecutive failures open the circuit for 30 seconds, open-circuit calls do not hit AgentOS, and one successful half-open probe closes it. Cache the in-flight Promise: concurrent callers at TTL expiry share one probe, and open→half-open permits exactly one probe while others await the same result. Add concurrent fake-clock tests for success and failure so counters cannot race. `ready:true, capability:placeholder` is valid. Do not perform a full health probe inside every chat request.

- [ ] **Step 3: Write failing Provider selection tests**

The selector returns placeholder unless every condition is true: explicit non-sensitive Provider mode, AgentOS ready, default agent ID, and AgentOS-reported capability available. Web never receives or validates model API keys; model/provider secrets exist only in the Agent container. In this phase the catalog is empty, so `AgentOSAssistantProvider.reply()` must return/throw a typed `assistant_not_configured` result without making a run call; do not guess an unstable AgentOS run endpoint before a real Agent exists.

- [ ] **Step 4: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/assistant/agentos-client.test.ts src/server/assistant/agentos-readiness.test.ts src/server/assistant/assistant-provider-selector.test.ts src/server/assistant/agentos-assistant-provider.test.ts
```

Expected: modules missing.

- [ ] **Step 5: Implement transport, cache, circuit, and selector**

Keep all modules `server-only`. Use a small typed fetch client rather than importing Agno SDK code into Next.js. Add only safe env names to `.env.example`: internal URL, BFF-to-AgentOS security key placeholder, cache TTL, probe timeout, circuit threshold/reset, disabled Provider mode, and default Agent ID. Do not add model provider names or model keys to Web configuration.

- [ ] **Step 6: Run and confirm GREEN**

Run Step 4 plus Web typecheck and lint. Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/server/assistant/agentos-* apps/web/src/server/assistant/assistant-provider-selector* .env.example
git commit -m "feat(assistant): add AgentOS readiness boundary"
```

### Task 4: Wire public BFF status and placeholder fallback

**Files:**
- Modify: `apps/web/src/app/api/v1/assistant/chat/handler.ts`
- Modify: `apps/web/src/app/api/v1/assistant/chat/route.ts`
- Modify: `apps/web/src/app/api/v1/assistant/chat/route.test.ts`
- Modify: `apps/web/src/app/api/v1/assistant/status/handler.ts`
- Modify: `apps/web/src/app/api/v1/assistant/status/route.ts`
- Modify: `apps/web/src/app/api/v1/assistant/status/route.test.ts`
- Modify: `apps/web/src/components/assistant/use-assistant-session.ts`
- Modify: `apps/web/src/components/assistant/use-assistant-session.test.tsx`

- [ ] **Step 1: Write failing fallback/status tests**

Assert healthy AgentOS with no model yields `live:true`, `ready:true`, `capability:"placeholder"` and public chat still uses PlaceholderProvider. AgentOS timeout yields `degraded` status but never exposes internal URL/error stack. A malformed AgentOS response yields safe 503 only when the explicitly enabled AgentOS Provider is selected; disabled mode stays placeholder.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/api/v1/assistant/chat/route.test.ts src/app/api/v1/assistant/status/route.test.ts src/components/assistant/use-assistant-session.test.tsx
```

Expected: handlers use static placeholder dependencies.

- [ ] **Step 3: Wire default dependencies**

Construct the selector once in a server-only factory. Public status uses cached readiness. Chat resolves session → limiter → selector → Provider, and returns a rotated Cookie when needed. Update UI parsing for `expiresAt` and degraded/rate-limited envelopes; never auto-retry POST.

- [ ] **Step 4: Run and confirm GREEN**

Run Step 2 plus Web typecheck. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/assistant apps/web/src/components/assistant/use-assistant-session.ts apps/web/src/components/assistant/use-assistant-session.test.tsx
git commit -m "feat(assistant): connect public BFF readiness"
```

### Task 5: Connect all protected Admin assistant APIs

**Files:**
- Modify: `apps/web/src/app/api/v1/admin/assistant/status/handler.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/status/route.test.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/chat/handler.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/chat/route.test.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/sessions/handler.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/sessions/route.test.ts`
- Modify: `apps/web/src/components/admin/assistant-admin-page.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.test.tsx`

- [ ] **Step 1: Write failing auth/status/session tests**

For every route, inject access service and test 401 no session, 403 missing `admin:assistant`, and success. Status may show component states and circuit counters but no secrets/URLs. Admin chat order is fixed: require `admin:assistant` and obtain the workforce actor, consume the actor-scoped `admin-test` bucket, then call the Provider. Test that unauthenticated/forbidden requests touch neither limiter nor Provider, and a limiter rejection never touches Provider. Sessions returns an empty list and `persistence:"disabled"` while capability is placeholder; do not query Agno or display fake sessions until a real Agent creates them.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/api/v1/admin/assistant/status/route.test.ts src/app/api/v1/admin/assistant/chat/route.test.ts src/app/api/v1/admin/assistant/sessions/route.test.ts src/components/admin/assistant-admin-page.test.tsx
```

Expected: Admin routes still use static placeholder implementations.

- [ ] **Step 3: Implement protected adapters**

Use the existing workforce access service and exact permission. Status calls the cached AgentOS client; chat remains placeholder because model/Agent is disabled; sessions is explicit empty metadata. Do not return message bodies, IP, User-Agent, Cookie, internal session ID, or raw errors.

- [ ] **Step 4: Run and confirm GREEN**

Run Step 2. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/admin/assistant apps/web/src/components/admin/assistant-admin-page.tsx apps/web/src/components/admin/assistant-admin-page.test.tsx
git commit -m "feat(admin): connect protected AgentOS status"
```

### Task 6: Harden proxy/Compose wiring and run full acceptance

**Files:**
- Modify: `compose.yaml`
- Modify: `infra/nginx/default.conf.template`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Create: `apps/web/e2e/assistant-runtime.spec.ts`
- Create: `docs/testing/assistant-runtime-acceptance.md`
- Create: `docs/testing/run-assistant-runtime-e2e.sh`
- Modify: `docs/deployment/server-readiness.md`

- [ ] **Step 1: Write failing deployment contracts**

Assert Web receives `AGENTOS_INTERNAL_URL=http://agent:7777`, `OS_SECURITY_KEY`, session secret, limiter secret, and strict `ASSISTANT_PUBLIC_ORIGIN` without publishing Web/Agent ports. Production `.env.example`/runbook uses an HTTPS origin; isolated `.env.e2e` explicitly uses `http://127.0.0.1:8080`, the only permitted local mode. Assert Nginx keeps the first IP POST limit and emits the versioned 429 envelope using Nginx `$request_id`. Assert production direct Web access is impossible in Compose and trusted-proxy parsing is enabled only there.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm --filter @ai-agent-platform/database test -- src/deployment-contracts.test.ts
```

Expected: new Web/Agent environment contract missing.

- [ ] **Step 3: Wire runtime environment and versioned proxy error**

Pass secrets only through environment/Secret sources. Keep AgentOS and Web on backend, Nginx on frontend; do not add host ports. Make Nginx 429 body match the versioned platform error shape and keep BFF limiter active even when tests call Web directly.

- [ ] **Step 4: Run unit, integration, container, and browser acceptance**

Run repository gates first:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm agent:test
pnpm agent:lint
pnpm agent:typecheck
```

Create `docs/testing/run-assistant-runtime-e2e.sh` using the same ignored `.env.e2e`, tracked Compose override, isolated `-p aap-assistant-runtime-e2e`, explicit image builds, and failure-safe `down -v --remove-orphans` trap defined by the Web experience plan. It must run `agno-bootstrap`, `agent-migrate`, `agent`, `migrate`, seeded Web, proxy, and backup in dependency order, then execute:

```bash
BASE_URL=http://127.0.0.1:8080 pnpm --filter @ai-agent-platform/web exec playwright test e2e/assistant-runtime.spec.ts
```

The E2E spec verifies the development HTTP Cookie; production `__Host-`/Secure attributes stay in deterministic unit tests unless the harness provides TLS. Cookie credentials are expected only in `Set-Cookie`; assert they never appear in JSON bodies, browser console, sanitized server logs, or Admin metadata. After stopping AgentOS, poll public status for at most readiness TTL + circuit timeout + a fixed margin before asserting degraded, avoiding cache races.

Test the two limit layers at the correct level: Task 2's PostgreSQL integration test proves BFF 429, cross-instance sharing, and Cookie-rotation resistance without requiring a published Web port; container E2E tests only the Nginx IP 429 with a fresh session/actor and known burst sequence. Do not add test-only production quota switches. Admin API E2E must cover `/api/v1/admin/assistant/chat` as 401 without session, 403 with the seeded workforce actor lacking `admin:assistant`, and success with the seeded admin, in addition to status/sessions safety checks. Also verify public placeholder with AgentOS ready and no published Web/Agent port.

- [ ] **Step 5: Record evidence and commit exact files**

```bash
git add compose.yaml infra/nginx/default.conf.template packages/database/src/deployment-contracts.test.ts apps/web/e2e/assistant-runtime.spec.ts docs/testing/assistant-runtime-acceptance.md docs/testing/run-assistant-runtime-e2e.sh docs/deployment/server-readiness.md
git commit -m "test(assistant): verify AgentOS runtime boundary"
```

# V3 Navbar Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the public product navigation to the supplied V3 hierarchy while preserving the current frosted-glass production header and clearing the two stale CI failures.

**Architecture:** Extend the existing navigation data with optional menu copy, keep the shared MegaMenu renderer, and use the existing product-specific CSS hook for the V3 desktop arrangement. Do not create a second navbar or duplicate route data.

**Tech Stack:** React, TypeScript, CSS, Vitest, Testing Library, pnpm.

---

## Chunk 1: Navigation and CI repair

### Task 1: Lock the V3 navigation contract

**Files:**
- Modify: `packages/ui/src/navigation/navigation-types.ts`
- Modify: `packages/ui/src/navigation/mega-menu.tsx`
- Modify: `packages/ui/src/navigation/mega-menu.test.tsx`
- Modify: `packages/ui/src/navigation/mobile-navigation.tsx`
- Modify: `packages/ui/src/navigation/mobile-navigation.test.tsx`
- Modify: `packages/ui/src/navigation/navigation.css`
- Modify: `packages/ui/src/app-shell.css`
- Modify: `packages/ui/src/app-shell.test.tsx`
- Modify: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/config/navigation.test.ts`

- [x] Add failing tests for the optional V3 intro/overview copy on desktop and mobile, unchanged `/product` and child routes, 3-by-2 platform field, right rail, assistant entry, and frosted non-transparent header.
- [x] Run the focused UI tests and record the failure.
- [x] Add only the optional navigation copy and product-specific CSS needed by the shared renderer.
- [x] Run the focused UI tests and TypeScript checks.

### Task 2: Correct stale CI assertions

**Files:**
- Modify: `apps/web/src/components/route-scaffold/registered-route-page.test.tsx`
- Modify: `packages/database/src/migrations/identity-upgrade.integration.test.ts`
- Modify: `packages/database/src/migrations/registration-company-name.integration.test.ts`
- Modify: `packages/database/src/migrations/session-realm-guard.integration.test.ts`

- [x] Reproduce the stale Web scaffold assertion and the three migration-count failures.
- [x] Remove the obsolete generic `/downloads` scaffold test; dedicated download-center tests remain authoritative.
- [x] Update the three forward-migration assertions from eleven to twelve.
- [x] Run the affected Web and Database tests (PostgreSQL-backed cases skip without `TEST_DATABASE_URL`).

### Task 3: Verify and publish

- [x] Run Web and Database typecheck, lint, formatting, and the relevant test suites.
- [x] Check `/downloads` at 1440×900 and 390×844: desktop hierarchy/glass header, mobile copy, assistant entry, and actual `/product` links.
- [ ] Commit the scoped files, push the PR branch, and wait for required CI results.

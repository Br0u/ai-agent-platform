# PR 18 CI and Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR #18's stale CI contracts pass and address the two actionable review findings without removing supported HTTPS custom model endpoints.

**Architecture:** Keep the new Admin tabbed UI and core navigation unchanged; update browser tests to exercise the new controls. Advance exact database migration invariants to migration 0009, use that migration to publish the corrected operations document, and restrict insecure HTTP model overrides to the deployment-owned URL while retaining validated HTTPS overrides.

**Tech Stack:** TypeScript, Vitest, Playwright, PostgreSQL/Drizzle SQL migrations, Python/pytest, POSIX shell.

---

## Chunk 1: Browser contracts

### Task 1: Align isolated Admin E2E tests with the approved UI

**Files:**

- Modify: `apps/web/e2e/admin-skill-registry.spec.ts`
- Modify: `apps/web/e2e/assistant-runtime.spec.ts`
- Modify: `apps/web/e2e/assistant-experience.spec.ts`

- [ ] Update the Skill lifecycle test to activate the `Skills` tab before using Skill controls.
- [ ] Update model-control acceptance to activate the `模型配置` tab before asserting model controls.
- [ ] Update the Admin navigation assertion from the removed `AI 助理` label to `Agent 管理`.
- [ ] Run the focused static/unit contracts and the affected isolated E2E scripts.

## Chunk 2: Database and restore invariants

### Task 2: Publish the corrected operations link through a forward migration

**Files:**

- Create: `packages/database/drizzle/0009_*.sql`
- Create: `packages/database/drizzle/meta/0009_snapshot.json`
- Modify: `packages/database/drizzle/meta/_journal.json`
- Modify: database migration integration tests and seed expectations

- [ ] Add a failing integration assertion that the published operations revision links to `/downloads#dl-mdd2-env` and not `/compatibility`.
- [ ] Generate a Drizzle migration that appends and publishes revision 2 for the operations document without rewriting migration 0007.
- [ ] Advance exact migration-count assertions from 8 to 10 and verify the new published revision.
- [ ] Run the PostgreSQL migration integration suite.

### Task 3: Advance backup/restore contracts

**Files:**

- Modify: `infra/docker/restore-drill.sh`
- Modify: `packages/database/src/deployment-contracts.test.ts`

- [ ] Update exact expected migration count/latest timestamp and matching fake-Docker values.
- [ ] Run deployment contract tests and the backup/restore acceptance script.

## Chunk 3: Endpoint boundary

### Task 4: Prevent insecure HTTP endpoint substitution

**Files:**

- Modify: `apps/agent/tests/test_model_endpoint_catalog.py`
- Modify: `apps/agent/src/agent_service/model_endpoint_catalog.py`

- [ ] Add a failing test proving an HTTP deployment endpoint rejects a different hostname/IP.
- [ ] Retain validated HTTPS custom URL overrides, but require insecure HTTP URLs to equal the catalog URL after normalization.
- [ ] Run focused Agent endpoint tests and type/lint checks.

## Chunk 4: Completion

### Task 5: Verify and update PR #18

- [ ] Run `CI=true pnpm ci:fast`.
- [ ] Run all affected isolated acceptance scripts with their required flags.
- [ ] Run `git diff --check` and inspect the final diff.
- [ ] Commit, push the existing PR branch, and monitor GitHub checks.

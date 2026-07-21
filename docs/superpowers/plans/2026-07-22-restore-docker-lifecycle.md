# Restore Docker Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every restore-drill Docker call through one bounded supervisor and reconcile every exact-named resource safely after normal failure, timeout, create races, or repeated signals.

**Architecture:** Keep the implementation in the existing POSIX shell restore drill, backed by a mode-0600 file registry under its protected temporary directory. One Docker supervisor owns command PID, timeout, stdout, and diagnostics; one EXIT cleanup walks registered resources once and applies create-outcome-aware reconciliation.

**Tech Stack:** POSIX `sh`, Docker CLI, Vitest/TypeScript deployment contracts, Docker Compose.

---

## Chunk 1: Contract-first lifecycle boundaries

### Task 1: Static and configuration contracts

**Files:**

- Modify: `packages/database/src/deployment-contracts.test.ts`
- Test: `packages/database/src/deployment-contracts.test.ts`

- [ ] Add a static test that allows the literal Docker execution only inside the central supervisor and rejects anonymous `docker run --rm` and `docker run -d`.
- [ ] Add a public-script test that rejects reconciliation attempts below 2 and invalid create-settle windows with status 64 and generic configuration output.
- [ ] Assert registry directories/files are 0700/0600 and contain only controlled key, type, exact generated name, and outcome values—never Docker arguments, secret paths, stdout, or diagnostics.
- [ ] Run the targeted tests and record failures caused by the current raw Docker calls and accepted single attempt.

### Task 2: Late-phase bounded command contracts

**Files:**

- Modify: `packages/database/src/deployment-contracts.test.ts`
- Test: `packages/database/src/deployment-contracts.test.ts`

- [ ] Extend the fake Docker harness with phase-specific hangs for bundle-validation start/wait, dump-digest create/start/wait, volume create, database create/start, database exec/migration, and transient registry-migration create/start/wait.
- [ ] Assert each public restore invocation exits inside its configured bound, emits only the stable phase/cleanup message, kills the active fake CLI, and leaves no tracked resource or temporary path unless cleanup explicitly fails closed.
- [ ] Run each targeted case and record the current unbounded timeout failure.

### Task 3: Ambiguous create and signal contracts

**Files:**

- Modify: `packages/database/src/deployment-contracts.test.ts`
- Test: `packages/database/src/deployment-contracts.test.ts`

- [ ] Add a delayed-create fake daemon that materializes an exact late transient container after the old second ABSENT observation.
- [ ] Assert AMBIGUOUS create remains unresolved through quick ABSENT results, detects/removes the delayed resource inside the settle window, and fails closed when the window expires without removal.
- [ ] Add double-SIGTERM/SIGINT cases during an active Docker CLI and resource reconciliation; assert the first signal status, completed cleanup, no active PID/resource/temp, and no Docker diagnostics.
- [ ] Add temporary-directory removal failure cases that emit only the generic cleanup failure, preserve an existing nonzero status, and convert an otherwise successful main flow to status 1.
- [ ] Run the targeted cases and record the expected current failures.

## Chunk 2: Single supervisor and registry implementation

### Task 4: Supervisor and file registry

**Files:**

- Modify: `infra/docker/restore-drill.sh`
- Test: `packages/database/src/deployment-contracts.test.ts`

- [ ] Validate reconciliation attempts as 2..10. Add `RESTORE_DOCKER_CREATE_SETTLE_SECONDS`, default 5, valid range 1..300, using a wall-clock deadline checked before every Docker call and 0.1-second unsuccessful-cycle cadence.
- [ ] Create protected shared stdout/diagnostic files and a protected resource registry after temporary allocation.
- [ ] Implement one supervisor signature: timeout, phase, stdout file, diagnostic file, Docker arguments. Track active PID and distinguish success, definite failure, and timeout/signal ambiguity without replaying output.
- [ ] Implement resource registration before create, outcome updates, exact-name query, and all outcomes: skip `DEFINITE_FAILURE`, normal two-ABSENT reconciliation for `SUCCESS`, and remove-only settle reconciliation for `AMBIGUOUS`.
- [ ] Make EXIT and signal handlers ignore INT/TERM as their first action. Signal records the first code and exits; EXIT alone performs exactly one cleanup pass, preserving the original status and checking temporary-directory removal.
- [ ] Run Tasks 1 and 3 tests until green.

### Task 5: Convert every Docker lifecycle

**Files:**

- Modify: `infra/docker/restore-drill.sh`
- Test: `packages/database/src/deployment-contracts.test.ts`

- [ ] Replace decrypt, bundle validation, digest, PostgreSQL, and registry migration launches with exact-name register/create/start/wait lifecycles.
- [ ] Replace volume creation, readiness, bootstrap, pg_restore, role checks, migration/schema/count queries, and digest work with supervisor calls using explicit protected stdout/diagnostic files.
- [ ] Parse only exact non-sensitive expected scalars; leave other output captured and unreported.
- [ ] Remove all anonymous `--rm`, raw Docker calls, fixed per-resource cleanup booleans, and explicit mid-flow reconcile/report retries.
- [ ] Run every new late-phase test and the existing restore lifecycle matrices until green.

### Task 6: Documentation and refactor pass

**Files:**

- Modify: `infra/docker/README.md`
- Modify: `infra/docker/restore-drill.sh`
- Test: `packages/database/src/deployment-contracts.test.ts`

- [ ] Document the single supervisor, exact-named registry, create outcomes, and bounded AMBIGUOUS settle guarantee.
- [ ] Re-run targeted contracts after removing duplicated state and test harness setup.

## Chunk 3: Acceptance and commit

### Task 7: Fresh verification

**Files:**

- Create: `docs/testing/run-restore-docker-lifecycle.sh`
- Create: `docs/testing/fixtures/restore-docker-lifecycle/stubborn-gpg`
- Create: `docs/testing/fixtures/restore-docker-lifecycle/copy-gpg`
- Create: `docs/testing/fixtures/restore-docker-lifecycle/stubborn.Dockerfile`
- Create: `docs/testing/fixtures/restore-docker-lifecycle/copy.Dockerfile`
- Verify: `infra/docker/restore-drill.sh`
- Verify: `packages/database/src/deployment-contracts.test.ts`
- Verify: `infra/docker/README.md`

- [ ] Add a deterministic real-Docker runner. It builds exact images `aap-backup-lifecycle-base-task9`, `aap-backup-lifecycle-stubborn-task9`, and `aap-backup-lifecycle-copy-task9`; creates fixed fixture IDs `00000000-0000-4000-8000-000000000001` and `backup-restore-session-fixture-v1`; invokes the public restore script; verifies generic output and zero resources; and removes all fixture images and temporary paths on EXIT.
- [ ] Run `cd packages/database && pnpm exec vitest run src/deployment-contracts.test.ts` and confirm every test passes with zero skipped tests.
- [ ] Run `sh -n infra/docker/restore-drill.sh`, `git diff --check`, `cd packages/database && pnpm typecheck`, `cd packages/database && pnpm exec prettier --check src/deployment-contracts.test.ts ../../infra/docker/README.md ../../docs/superpowers/specs/2026-07-22-restore-docker-lifecycle-design.md ../../docs/superpowers/plans/2026-07-22-restore-docker-lifecycle.md`, and `docker compose --env-file .env.example config --quiet` from the repository root.
- [ ] Run `sh docs/testing/run-restore-docker-lifecycle.sh timeout`; assert bounded stubborn-decrypt timeout and zero residue.
- [ ] Run `sh docs/testing/run-restore-docker-lifecycle.sh controlled-failure`; assert decrypt and bundle validation succeed, `pg_restore` fails generically, and residue is zero.
- [ ] Run `sh docs/testing/run-agentos-backup-restore.sh` with current worktree images and migrations for the complete OpenPGP chain.
- [ ] Run `docker ps -a --filter 'name=aap-restore-' --format '{{.Names}}'`, `docker network ls --filter 'name=aap-agentos-backup-restore' --format '{{.Name}}'`, `docker volume ls --filter 'name=aap-restore-' --format '{{.Name}}'`, `docker images --filter 'reference=aap-backup-lifecycle-*-task9' --format '{{.Repository}}:{{.Tag}}'`, `find /tmp -maxdepth 1 -name 'aap-restore-lifecycle.*' -print`, and `pgrep -af 'aap-restore-|aap-agentos-backup-restore|run-restore-docker-lifecycle'`; require empty output, treating `pgrep` status 1 as success.
- [ ] Review the staged diff and commit the architectural cleanup separately without merge or push.

# CI Preflight And Parallel Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local preflight and GitHub CI use the same gate commands, expose independent failures in one run, reject missing integration prerequisites, and retain safe Skill E2E diagnostics.

**Architecture:** A single shell entry point owns gate commands and supports `fast`, `full`, and the five CI domain gates. GitHub Actions runs the five domain gates as a fail-fast-disabled matrix; local package scripts call `fast` or `full`. Existing isolated acceptance runners remain authoritative and run independently after checkout rather than waiting for another job.

**Tech Stack:** POSIX shell, pnpm 11, Node.js 24, uv 0.11.19, pytest, Vitest, Docker Compose, PostgreSQL 18, GitHub Actions.

## Global Constraints

- Do not add a dependency.
- Do not weaken secret or protected-output checks.
- Do not preserve retired Skill review or version-management paths.
- Reuse existing test, migration, image, and isolated-acceptance commands.
- `fast` must run without PostgreSQL or Docker; `full` must fail before tests if its database environment is missing.

---

### Task 1: Lock The New CI Contract

**Files:**

- Modify: `packages/database/src/deployment-contracts.test.ts`
- Test: `packages/database/src/deployment-contracts.test.ts`

**Interfaces:**

- Consumes: `.github/workflows/ci.yml`, root `package.json`, `docs/testing/run-ci-gate.sh`.
- Produces: contract assertions for `ci:fast`, `ci:full`, the five matrix gate names, `fail-fast: false`, independent isolated acceptance, and full-preflight environment validation.

- [x] **Step 1: Write failing contract assertions**

Add one test that requires package scripts to call `sh docs/testing/run-ci-gate.sh fast|full`, requires matrix gates `web`, `agent`, `registry`, `database`, `deployment`, and requires the workflow not to contain `needs: quality`.

- [x] **Step 2: Run the focused test and observe RED**

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts -t "shares CI gates with local preflight"`

Expected: FAIL because the scripts and matrix do not exist.

- [x] **Step 3: Commit only after Tasks 2 and 3 make the test pass**

Commit message: `ci: share local and remote quality gates`

### Task 2: Add The Shared Gate Runner

**Files:**

- Create: `docs/testing/run-ci-gate.sh`
- Modify: `package.json`
- Test: `packages/database/src/deployment-contracts.test.ts`

**Interfaces:**

- Consumes: gate name `$1`; existing pnpm, uv, Docker, PostgreSQL, migration, and E2E entry points.
- Produces: `fast`, `full`, `web`, `agent`, `registry`, `database`, and `deployment` commands with non-zero exit on unknown gate or missing full-mode database variables.

- [x] **Step 1: Implement common command and prerequisite helpers**

Use `set -eu`, a fixed `case` allowlist, `command -v` checks, and a `require_environment` helper. Do not introduce configuration files or a new runtime.

- [x] **Step 2: Implement `fast`**

Run web/package unit tests, typecheck, lint, format, Skill runtime static contract, Agent/Skill Python unit gates, Ruff, and Mypy without requiring PostgreSQL or Docker.

- [x] **Step 3: Implement domain gates and `full`**

Reuse the existing commands currently embedded in `.github/workflows/ci.yml`. `full` requires the database URL variables before invoking database-aware gates and the isolated Skill runtime runner.

- [x] **Step 4: Add package scripts**

Add exactly:

```json
"ci:fast": "sh docs/testing/run-ci-gate.sh fast",
"ci:full": "sh docs/testing/run-ci-gate.sh full"
```

- [x] **Step 5: Run shell and focused contract checks**

Run: `sh -n docs/testing/run-ci-gate.sh`

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts -t "shares CI gates with local preflight"`

Expected: PASS.

### Task 3: Split GitHub CI Into Independent Domain Gates

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `packages/database/src/deployment-contracts.test.ts`

**Interfaces:**

- Consumes: `docs/testing/run-ci-gate.sh <matrix.gate>`.
- Produces: a `quality` matrix with five independent cells and the existing four-cell `isolated-acceptance` matrix running without a quality dependency.

- [x] **Step 1: Replace the serial quality body with a matrix**

Set `strategy.fail-fast: false` and include `web`, `agent`, `registry`, `database`, and `deployment`. Keep pinned action versions, PostgreSQL 18, Node 24, pnpm 11.5.2, and uv 0.11.19.

- [x] **Step 2: Call the shared runner**

After dependency installation, run `sh docs/testing/run-ci-gate.sh "${{ matrix.gate }}"`. Preserve masked fixture generation for database-aware cells.

- [x] **Step 3: Remove the isolated acceptance dependency**

Delete `needs: quality`; keep `fail-fast: false`, unique Compose project names, and the four existing public runners.

- [x] **Step 4: Verify the workflow contract**

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: PASS.

### Task 4: Keep Skill Failure Diagnostics Safe And Actionable

**Files:**

- Modify: `docs/testing/run-skill-registry-e2e.sh`
- Modify: `docs/testing/skill-runtime-e2e.test.ts`

**Interfaces:**

- Consumes: protected-pattern file and failed E2E log.
- Produces: the existing generic protected-data failure plus a fixed execution-stage label; raw protected logs remain suppressed.

- [x] **Step 1: Write a failing static contract**

Require fixed restart-stage labels and require raw protected logs to remain suppressed.

- [x] **Step 2: Run the contract and observe RED**

Run: `node docs/testing/skill-runtime-e2e.test.ts`

Expected: FAIL because the stage labels do not exist.

- [x] **Step 3: Implement the minimal fixed-stage summary**

Print only the fixed stage assigned before each lifecycle operation. Never print arbitrary matching log lines, environment values, request bodies, hashes, or service logs.

- [x] **Step 4: Run the contract and shell syntax checks**

Run: `node docs/testing/skill-runtime-e2e.test.ts && sh -n docs/testing/run-skill-registry-e2e.sh`

Expected: PASS.

### Task 5: Full Verification

**Files:**

- Verify only.

**Interfaces:**

- Consumes: all changes from Tasks 1-4.
- Produces: fresh evidence for handoff.

- [x] **Step 1: Run fast local preflight**

Run: `pnpm ci:fast`

Expected: exit 0 with no test, type, lint, format, Ruff, or Mypy failures.

- [x] **Step 2: Run deployment contracts and formatting**

Run: `pnpm --filter @ai-agent-platform/database test && pnpm format:check && git diff --check`

Expected: exit 0.

- [x] **Step 3: Run the existing isolated Skill runtime acceptance**

Run: `RUN_SKILL_RUNTIME_E2E=true SKILL_RUNTIME_E2E_PROJECT=aap-skill-runtime-e2e-ci-preflight-local bash docs/testing/run-skill-runtime-e2e.sh`

Expected: `Skill runtime E2E passed` and zero residual Docker resources.

- [x] **Step 4: Review scope and commit**

Verify only the plan, package scripts, workflow, shared runner, deployment contract, and Skill diagnostic contract changed. Commit with the Task 1 message.

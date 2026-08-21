# Agent Session Handoff and Legacy Dock Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the active Quick assistant conversation when the Header opens `/assistant`, remove the unreachable legacy Dock path, and restore the local Agent containers from the current main checkout.

**Architecture:** Keep the existing `AssistantExperienceProvider`, temporary pathname-scoped session, Quick surface, and full-screen Workspace. Reuse `preserveOnNextPathnameChange` for both intentional Workspace handoffs, collapse the presentation state machine to `closed | quick`, and delete Dock-only code instead of retaining compatibility branches. Runtime recovery is operational only and must recreate services from the repository root so no container binds to a disposable worktree.

**Tech Stack:** React 19, Next.js 16, TypeScript, Vitest, Testing Library, Docker Compose.

---

## Chunk 1: Session handoff and dead-path removal

### Task 1: Preserve Header-to-Workspace conversation handoff

**Files:**

- Modify: `apps/web/src/components/site-shell/site-shell.test.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`

- [x] **Step 1: Write the failing integration test**

  Add a small test-only draft probe backed by `useAssistantExperience`. On `/pricing`, open the real Quick surface, enter a draft through its real textarea, activate the Header assistant entry, rerender the shell at `/assistant`, and assert the provider-backed draft probe still contains the value. Also assert `router.push("/assistant")` was called.

- [x] **Step 2: Run the test and verify RED**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/site-shell/site-shell.test.tsx`

  Expected: the new test fails because the pathname change clears the draft.

- [x] **Step 3: Implement the minimum fix**

  In the portal branch of `activateHeaderEntry`, call:

  ```ts
  experience.session.preserveOnNextPathnameChange("/assistant");
  router.push("/assistant");
  ```

  Keep the existing Workspace behavior that focuses the composer.

- [x] **Step 4: Run the test and verify GREEN**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/site-shell/site-shell.test.tsx`

  Expected: all SiteShell tests pass.

- [x] **Step 5: Commit Task 1**

  Stage only the two Task 1 files and commit with `fix(web): preserve assistant header handoff`.

### Task 2: Delete the unreachable legacy Dock surface

**Files:**

- Modify: `apps/web/src/components/assistant/assistant-experience-provider.tsx`
- Modify: `apps/web/src/components/assistant/assistant-experience-provider.test.tsx`
- Modify: `apps/web/src/components/assistant/assistant-conversation.tsx`
- Modify: `apps/web/src/components/assistant/assistant-conversation.css`
- Modify: `apps/web/src/components/assistant/assistant-conversation.test.tsx`
- Modify: `apps/web/src/components/assistant/assistant-prompt-input.tsx`
- Modify: `apps/web/src/components/assistant/assistant-workspace.tsx`
- Modify: `apps/web/src/components/assistant/assistant-workspace.test.tsx`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.tsx`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.test.tsx`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.css`
- Modify: `apps/web/src/server/assistant/public-page-context.ts`
- Modify: `docs/testing/assistant-experience-acceptance.md`
- Delete: `apps/web/src/components/assistant/assistant-dock.tsx`
- Delete: `apps/web/src/components/assistant/assistant-dock.css`
- Delete: `apps/web/src/components/assistant/assistant-dock.test.tsx`
- Delete: `apps/web/src/components/assistant/use-assistant-dock-size.ts`
- Delete: `apps/web/src/components/assistant/use-assistant-dock-size.test.tsx`

- [x] **Step 1: Write the failing surface-contract test**

  Change the provider test harness to expose its public context keys and add an assertion that the experience has no `openDockFrom`, `collapseToQuick`, or Dock completion API. Keep coverage for `closed -> quick -> closed`, stale Quick exit completion, focus restoration, pathname clearing, and intentional Workspace handoff.

- [x] **Step 2: Run the provider test and verify RED**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-experience-provider.test.tsx`

  Expected: the new contract assertion fails because Dock APIs are still present.

- [x] **Step 3: Collapse the provider to Quick-only presentation state**

  Make `AssistantSurface` exactly `"closed" | "quick"`. Remove Dock-only methods, blocked-Quick state, Dock-to-Quick exit handling, and Dock branches. Rename the remaining exit callback to `completeQuickExit(instanceVersion)` and keep version checks so stale Quick exit callbacks cannot restore focus after a reopen.

- [x] **Step 4: Simplify the Quick surface**

  Replace `completeSurfaceExit("quick", version)` with `completeQuickExit(version)`. Remove `quickInteractionReady` conditionals and the dead `.floating-assistant__panel.is-blocked` CSS; the mounted Quick surface is interactive, while the existing `useIsPresent` cleanup continues to make an exiting panel inert and hidden.

- [x] **Step 5: Delete Dock-only implementation and tests**

  Delete the five Dock/resize files listed above. Remove Dock-only cases from provider and floating-widget tests. Do not add a compatibility export or fallback.

- [x] **Step 6: Remove runtime and documentation residue**

  Remove `.assistant-dock` from the public page-context exclusion list. Update the acceptance document to state that Header and Quick intentionally preserve the session when handing off to `/assistant`, ordinary pathname changes clear it, and no Dock implementation remains.

- [x] **Step 7: Verify the focused cleanup**

  Run:

  ```bash
  ! rg -n "AssistantDock|useAssistantDockSize|openDockFrom|collapseToQuick|completeSurfaceExit|quickInteractionReady|assistant-dock|is-blocked|\"dock\"" apps/web/src docs/testing/assistant-experience-acceptance.md
  pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-experience-provider.test.tsx src/components/ui/floating-chat-widget-shadcnui.test.tsx src/components/site-shell/site-shell.test.tsx src/server/assistant/public-page-context.test.ts
  pnpm --filter @ai-agent-platform/web typecheck
  ```

  Expected: `rg` returns no matches; tests and typecheck exit zero.

- [x] **Step 8: Commit Task 2**

  Stage only the Task 2 paths plus this plan and commit with `refactor(web): remove legacy assistant dock`.

## Chunk 2: Runtime recovery and release verification

### Task 3: Recreate the local Agent services from current main

**Files:**

- Modify: none

- [ ] **Step 1: Confirm the stale container source**

  Run from the main repository root `/Users/brou/Documents/Work/00-ahkzy/AI Agent Platform`:

  ```bash
  docker compose ps --format json
  docker inspect --format '{{json .State.Health}}' ai-agent-platform-agent-1
  docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}} {{json .State.Health}}' ai-agent-platform-agent-1 ai-agent-platform-skill-registry-1
  ```

  Expected before recovery: the Agent container references the deleted `assistant-render-performance` worktree and its health check cannot execute `/opt/aap/run-agent-with-secret-env.sh`.

- [ ] **Step 2: Recreate only the Agent-owned development services**

  Run from the main repository root `/Users/brou/Documents/Work/00-ahkzy/AI Agent Platform`:

  ```bash
  docker compose up -d --build --no-deps --force-recreate --wait --wait-timeout 120 agent skill-registry
  ```

  Do not remove volumes, reset databases, or clean unrelated containers.

- [ ] **Step 3: Verify current-root ownership and health**

  Run from the main repository root:

  ```bash
  docker compose ps --format json
  docker inspect --format '{{json .State.Health}}' ai-agent-platform-agent-1
  docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}} {{json .State.Health}}' ai-agent-platform-agent-1 ai-agent-platform-skill-registry-1
  ```

  Expected: Agent and Skill Registry are healthy and both Compose labels reference the repository root, not a deleted worktree. If recreation fails, inspect only `docker compose logs --tail 100 agent skill-registry` before deciding the next action.

### Task 4: Final review and verification

**Files:**

- Modify: none unless verification exposes a scoped regression

- [ ] **Step 1: Complete branch-wide spec and code-quality review**

  Review the full branch against this plan from the feature worktree. Fix every Critical or Important issue and commit any review repair to the feature branch before final verification.

- [ ] **Step 2: Run Web verification**

  Run from the feature worktree root `/Users/brou/Documents/Work/00-ahkzy/AI Agent Platform/.worktrees/agent-cleanup-session-handoff`:

  ```bash
  pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant src/components/site-shell/site-shell.test.tsx src/components/ui/floating-chat-widget-shadcnui.test.tsx src/server/assistant/public-page-context.test.ts
  pnpm --filter @ai-agent-platform/web test
  pnpm --filter @ai-agent-platform/web typecheck
  pnpm --filter @ai-agent-platform/web lint
  pnpm --filter @ai-agent-platform/web build
  ```

  Expected: every command exits zero.

- [ ] **Step 3: Run Agent verification**

  Run with the current directory set to the feature worktree's `apps/agent`. Use the main checkout's existing virtual-environment executables so the commands do not create another environment; pytest's configured `pythonpath = ["src"]` and the explicit Ruff/mypy paths keep source resolution inside the feature worktree:

  ```bash
  /Users/brou/Documents/Work/00-ahkzy/AI\ Agent\ Platform/apps/agent/.venv/bin/pytest -q
  /Users/brou/Documents/Work/00-ahkzy/AI\ Agent\ Platform/apps/agent/.venv/bin/ruff check .
  /Users/brou/Documents/Work/00-ahkzy/AI\ Agent\ Platform/apps/agent/.venv/bin/mypy src tests
  ```

  Expected: all commands exit zero; skipped tests remain explicitly reported as skipped.

- [ ] **Step 4: Inspect the final diff**

  Run from the feature worktree root after all review fixes and tests:

  ```bash
  git status --short
  git diff main...HEAD --check
  git diff --stat main...HEAD
  ```

  Expected: only planned paths changed, no whitespace errors, and net deletion is substantial.

- [ ] **Step 5: Finish the branch**

  Use `superpowers:finishing-a-development-branch` to present integration options. Do not merge, push, or delete the worktree without the user's selection.

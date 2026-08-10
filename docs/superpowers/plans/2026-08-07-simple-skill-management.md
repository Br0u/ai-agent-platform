# Simple Skill Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the review/version/candidate-oriented Skill administration with one safe library flow: upload, enable, disable, replace, delete, and re-upload a deleted name.

**Architecture:** Keep immutable revision artifacts and the existing candidate-to-activation machinery as internal safety mechanisms. Expose only Skill-level product operations through the Web BFF, derive `enabled` from the Agent's authoritative active set, and archive deleted Skill identities so an active-name-only uniqueness constraint allows clean re-upload.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Vitest, FastAPI, Python 3.13, PostgreSQL, Agno 2.7.2, pytest.

**Design:** `docs/superpowers/specs/2026-08-07-simple-skill-management-design.md`

---

## File map

### Skill Registry

- `apps/skill-registry/src/skill_registry/types.py`: Skill-level contracts and lifecycle commands.
- `apps/skill-registry/src/skill_registry/repository.py`: current-Skill queries, active-name uniqueness, archive, and replacement concurrency.
- `apps/skill-registry/src/skill_registry/service.py`: ZIP validation plus Skill-level upload/archive orchestration.
- `apps/skill-registry/src/skill_registry/api.py`: internal Skill-level HTTP responses.
- `apps/skill-registry/src/skill_registry/schema.py`: schema version and verification expectations.
- `apps/skill-registry/src/skill_registry/skill_set_repository.py`: internal active revision-set reads; no product candidate listing.
- `apps/skill-registry/tests/test_{schema,migrate,repository,repository_postgres,service,api,app}.py`: unit and real PostgreSQL coverage.

### Web BFF and contracts

- `apps/web/src/features/assistant/admin-skill-contract.ts`: one Skill-level response model and lifecycle command responses.
- `apps/web/src/server/assistant/skill-registry-client.ts`: internal registry client for list/upload/archive and internal set creation.
- `apps/web/src/server/assistant/admin-skill-lifecycle-commands.ts`: new single product orchestration boundary.
- `apps/web/src/app/api/v1/admin/assistant/skills/handler.ts`: list/upload/enable/disable/delete handlers.
- `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/{enable,disable}/route.ts`: product mutation routes.
- `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/route.ts`: product delete route.
- Matching `*.test.ts` files: request validation, permissions, concurrency, unknown-result reconciliation, and redaction.

### Admin UI

- `apps/web/src/components/admin/assistant-skill-registry-panel.tsx`: become the single Skill library panel.
- `apps/web/src/components/admin/assistant-skill-upload-dialog.tsx`: same-name replacement confirmation.
- `apps/web/src/components/admin/assistant-skill-modal.tsx`: reuse the existing accessible modal shell.
- `apps/web/src/components/admin/assistant-admin-page.tsx`: render one Skill panel.
- `apps/web/src/app/admin/assistant/page.tsx`: load one consolidated Skill snapshot.
- `apps/web/src/components/admin/assistant-admin-page.css`: remove runtime matrix CSS and add compact row/action states.
- Matching component/page tests and `apps/web/e2e/admin-skill-registry.spec.ts`.

### Deletions

- `apps/web/src/components/admin/assistant-skill-configuration-panel.tsx`
- `apps/web/src/components/admin/assistant-skill-configuration-panel.test.tsx`
- `apps/web/src/features/assistant/admin-skill-runtime-contract.ts`
- `apps/web/src/features/assistant/admin-skill-runtime-contract.test.ts`
- `apps/web/src/app/api/v1/admin/assistant/skill-runtime/**`
- Product-only candidate/rollback branches in `apps/web/src/server/assistant/admin-skill-runtime-commands.ts` and its tests.

The Agent activation API, materializer, generation slot, immutable set tables, and runtime reconciliation stay. They already solve safe hot replacement and draining; rewriting them would add risk without changing the product interaction.

---

## Chunk 1: Finish the review-removal baseline

### Task 1: Close the current uncommitted review-removal change

**Files:**

- Modify: the existing review-removal worktree changes under `apps/agent`, `apps/skill-registry`, `apps/web`, `packages/database`, `packages/skill-core`, `docs/testing`, `infra/docker`, and `README.md`
- Test: existing tests in the same modules

- [ ] **Step 1: Add a repository contract test for removed review concepts**

In `packages/database/src/deployment-contracts.test.ts`, assert that product code and access-control seeds no longer contain:

```ts
[
  "admin:assistant:skills:review",
  "/review",
  "pending_review",
  "revision_rejected",
  "revision_published",
]
```

Limit the scan to current product files. Historical migration SQL may contain an old state only when it is required to upgrade stored data and immediately removes that state.

- [ ] **Step 2: Run the contract test and inspect every failure**

Run:

```bash
pnpm --filter @ai-agent-platform/database test -- src/deployment-contracts.test.ts
```

Expected: FAIL on any remaining product route, permission, UI copy, E2E script, or current schema contract that still implements manual review.

- [ ] **Step 3: Remove remaining product review references**

At minimum, inspect and correct stale language in:

```text
docs/testing/README.md
apps/skill-registry/pyproject.toml
apps/web/src/components/ui/floating-chat-widget-shadcnui.tsx
apps/web/src/components/admin/assistant-capability-roadmap.tsx
README.md
```

Keep automatic archive validation and scanning. Do not replace “review” with a second approval state.

- [ ] **Step 4: Run the baseline verification**

Run:

```bash
pnpm --filter @ai-agent-platform/database test -- src/deployment-contracts.test.ts
pnpm --filter @ai-agent-platform/web test
pnpm skill-core:test
pnpm skill-registry:test
pnpm agent:test
pnpm typecheck
pnpm lint
git diff --check
```

Expected: all runnable checks pass. PostgreSQL-skipped tests are reported as unverified, not passed.

- [ ] **Step 5: Run real PostgreSQL coverage**

Run:

```bash
pnpm skill-registry:e2e
```

Expected: exit 0 and final output `Skill Registry E2E passed`, with no review step in the scenario.

- [ ] **Step 6: Commit only the review-removal baseline**

```bash
git add README.md apps/agent apps/skill-registry apps/web packages/database packages/skill-core docs/testing infra/docker
git diff --cached --check
git commit -m "refactor(skill): remove manual review workflow"
```

Before committing, verify `git diff --cached --name-only` contains no unrelated user files.

---

## Chunk 2: Build the Skill-level registry model

### Task 2: Allow a deleted Skill name to be uploaded again

**Files:**

- Modify: `apps/skill-registry/src/skill_registry/schema.py`
- Modify: `apps/skill-registry/src/skill_registry/repository.py`
- Test: `apps/skill-registry/tests/test_schema.py`
- Test: `apps/skill-registry/tests/test_migrate.py`
- Test: `apps/skill-registry/tests/test_repository.py`
- Test: `apps/skill-registry/tests/test_repository_postgres.py`

- [ ] **Step 1: Write failing schema and repository tests**

Cover:

```python
def test_active_skill_names_are_unique_but_archived_names_are_reusable() -> None:
    ...

async def test_upload_after_archive_creates_a_new_skill_identity() -> None:
    ...
```

The second upload must receive a new Skill UUID and revision number `1`.

- [ ] **Step 2: Run the focused tests**

Run:

```bash
uv --directory apps/skill-registry run pytest \
  tests/test_schema.py \
  tests/test_migrate.py \
  tests/test_repository.py \
  tests/test_repository_postgres.py -q
```

Expected: FAIL because `skills.slug` is globally unique and archived Skills cannot be replaced.

- [ ] **Step 3: Add the active-name-only uniqueness migration**

Add the next schema migration in `schema.py`:

```sql
ALTER TABLE skill_registry.skills
  DROP CONSTRAINT skills_slug_key;
CREATE UNIQUE INDEX skills_active_slug_key
  ON skill_registry.skills (slug)
  WHERE archived_at IS NULL;
```

Update verification constants to require the partial unique index.

Change `_resolve_upload_skill` to use:

```sql
INSERT INTO skill_registry.skills (id, slug, created_by)
VALUES (%s, %s, %s)
ON CONFLICT (slug) WHERE archived_at IS NULL DO NOTHING
RETURNING id
```

Every target-Skill lookup must add `archived_at IS NULL`.

- [ ] **Step 4: Run focused and real PostgreSQL tests**

Run:

```bash
uv --directory apps/skill-registry run pytest \
  tests/test_schema.py \
  tests/test_migrate.py \
  tests/test_repository.py \
  tests/test_repository_postgres.py -q
```

Expected: PASS, including the real partial-index behavior when a PostgreSQL DSN is present.

- [ ] **Step 5: Commit**

```bash
git add apps/skill-registry/src/skill_registry/schema.py \
  apps/skill-registry/src/skill_registry/repository.py \
  apps/skill-registry/tests/test_schema.py \
  apps/skill-registry/tests/test_migrate.py \
  apps/skill-registry/tests/test_repository.py \
  apps/skill-registry/tests/test_repository_postgres.py
git commit -m "feat(skill): allow reupload after deletion"
```

### Task 3: Return one current Skill with authoritative enabled state

**Files:**

- Modify: `apps/skill-registry/src/skill_registry/types.py`
- Modify: `apps/skill-registry/src/skill_registry/repository.py`
- Modify: `apps/skill-registry/src/skill_registry/service.py`
- Modify: `apps/skill-registry/src/skill_registry/api.py`
- Modify: `apps/web/src/features/assistant/admin-skill-contract.ts`
- Modify: `apps/web/src/server/assistant/skill-registry-client.ts`
- Test: corresponding Registry and Web contract/client tests

- [ ] **Step 1: Write failing Skill-library contract tests**

Use this product shape:

```ts
type AdminSkillLibraryItem = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  uploadedAt: string;
  replacementToken: string;
};
```

`replacementToken` is the current full artifact SHA-256 used only for compare-and-swap replacement; the UI does not display it.

Assert:

- one row per active Skill identity;
- no revision number or revision state in the public list;
- `enabled` is true when any revision of that Skill is in the active Agent set;
- archived Skill identities are omitted.

- [ ] **Step 2: Run focused tests**

Run:

```bash
uv --directory apps/skill-registry run pytest \
  tests/test_repository.py tests/test_repository_postgres.py \
  tests/test_service.py tests/test_api.py -q
pnpm --filter @ai-agent-platform/web test -- \
  src/features/assistant/admin-skill-contract.test.ts \
  src/server/assistant/skill-registry-client.test.ts
```

Expected: FAIL because the current response exposes revision metadata and does not derive enabled state.

- [ ] **Step 3: Implement the current-Skill query**

In `repository.py`:

- choose the highest `published` revision for the non-archived Skill;
- join `active_agent_skill_sets` and `agent_skill_set_items` by `skill_id`;
- derive `enabled` with `EXISTS`, not a stored flag;
- return manifest description and artifact digest.

Do not query candidate sets when computing `enabled`.

- [ ] **Step 4: Replace the public contracts**

Remove revision list/detail/file contracts from the admin Skill library response. Keep revision IDs only in internal runtime client types.

Run the focused tests again; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/skill-registry/src/skill_registry/{types.py,repository.py,service.py,api.py} \
  apps/skill-registry/tests \
  apps/web/src/features/assistant/admin-skill-contract.ts \
  apps/web/src/features/assistant/admin-skill-contract.test.ts \
  apps/web/src/server/assistant/skill-registry-client.ts \
  apps/web/src/server/assistant/skill-registry-client.test.ts
git commit -m "feat(skill): expose authoritative skill library"
```

---

## Chunk 3: Add Skill-level lifecycle operations

### Task 4: Collapse candidate activation into one internal apply operation

**Files:**

- Create: `apps/web/src/server/assistant/admin-skill-lifecycle-commands.ts`
- Create: `apps/web/src/server/assistant/admin-skill-lifecycle-commands.test.ts`
- Modify: `apps/web/src/server/assistant/skill-registry-client.ts`
- Modify: `apps/web/src/server/assistant/agent-skill-control-client.ts`
- Modify: `apps/web/src/server/auth/audit.ts`
- Test: matching client and audit tests

- [ ] **Step 1: Write failing lifecycle command tests**

The command surface is:

```ts
type SkillLifecycleOperation = "enable" | "disable" | "replace" | "delete";

applySkillSet({
  actor,
  operation,
  skillId,
  expectedActivationVersion,
  nextRevisionIds,
  requestId,
});
```

Assert that one call:

1. reads the authoritative active set;
2. creates an internal candidate with exactly one revision per Skill;
3. activates it through AgentOS;
4. returns only after Registry and Agent agree;
5. automatically discards a candidate when activation never starts;
6. preserves caller-stable request IDs for result-unknown reconciliation;
7. writes one redacted Skill-level audit event.

- [ ] **Step 2: Run the focused tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- \
  src/server/assistant/admin-skill-lifecycle-commands.test.ts \
  src/server/assistant/skill-registry-client.test.ts \
  src/server/assistant/agent-skill-control-client.test.ts \
  src/server/auth/audit.test.ts
```

Expected: FAIL because only public candidate/create/activate commands exist.

- [ ] **Step 3: Implement the lifecycle command**

Reuse the existing registry and Agent clients. Do not add another runtime service or queue.

Keep:

- recent password plus MFA evidence;
- single-use authorization grants;
- activation-version compare-and-swap;
- stable error mapping;
- result-unknown reconciliation.

Expose no candidate ID in the product response.

- [ ] **Step 4: Run focused tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/assistant/admin-skill-lifecycle-commands* \
  apps/web/src/server/assistant/{skill-registry-client,agent-skill-control-client}* \
  apps/web/src/server/auth/audit*
git commit -m "feat(skill): add atomic lifecycle orchestration"
```

### Task 5: Add enable, disable, replacement, and delete APIs

**Files:**

- Modify: `apps/web/src/app/api/v1/admin/assistant/skills/handler.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/enable/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/enable/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/disable/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/disable/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/route.ts`
- Create: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/route.test.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/skills/uploads/route.test.ts`
- Modify: Registry service/repository/API files and tests for archive and replacement CAS

- [ ] **Step 1: Write failing route tests**

Use explicit request bodies:

```json
{"requestId":"10000000-0000-4000-8000-000000000001"}
```

Confirmed replacement resubmits the ZIP with:

```text
targetSkillId=20000000-0000-4000-8000-000000000002
expectedArtifactSha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

Cover:

- new upload returns `201` and `enabled: false`;
- unconfirmed same-name upload returns `409 skill_name_conflict` with safe conflict metadata;
- stale replacement token returns `409 skill_changed`;
- enable/disable are idempotent at the Skill level;
- enabled replacement keeps the Skill enabled;
- failed replacement archives the new unused revision and preserves the old runtime;
- deleting disabled Skill archives it immediately;
- deleting enabled Skill activates a set without it before archiving;
- unknown disable result never archives the Skill;
- deleted name can be uploaded again as a new disabled Skill.

- [ ] **Step 2: Run focused route and Registry tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- \
  src/app/api/v1/admin/assistant/skills
uv --directory apps/skill-registry run pytest \
  tests/test_repository.py tests/test_repository_postgres.py \
  tests/test_service.py tests/test_api.py -q
```

Expected: FAIL on missing product routes and archive/replacement commands.

- [ ] **Step 3: Implement minimal Registry mutations**

Add repository/service commands for:

- compare current artifact digest;
- archive a non-active Skill identity;
- archive a failed replacement revision;
- refuse archived targets;
- return the current published revision used by lifecycle orchestration.

Keep immutable artifacts and audit rows. A deleted Skill is hidden by `skills.archived_at`; it is not physically erased.

- [ ] **Step 4: Implement BFF handlers**

Permissions:

- upload new: `admin:assistant:skills:upload`;
- replace disabled: upload permission;
- enable/disable: `admin:assistant:skills:configure` plus recent password/MFA;
- replace enabled: upload and configure permissions plus recent password/MFA;
- delete: configure permission plus recent password/MFA.

Never report success before the authoritative post-operation list agrees with Agent state.

- [ ] **Step 5: Run focused tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/skill-registry apps/web/src/app/api/v1/admin/assistant/skills \
  apps/web/src/server/assistant/admin-skill-lifecycle-commands* \
  apps/web/src/features/assistant/admin-skill-contract*
git commit -m "feat(skill): add skill lifecycle endpoints"
```

---

## Chunk 4: Replace the administration interface

### Task 6: Build the single Skill library panel

**Files:**

- Modify: `apps/web/src/components/admin/assistant-skill-registry-panel.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-registry-panel.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-upload-dialog.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-upload-dialog.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.test.tsx`
- Modify: `apps/web/src/app/admin/assistant/page.tsx`
- Modify: `apps/web/src/app/admin/assistant/page.test.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.css`

- [ ] **Step 1: Write failing component tests**

Assert the panel renders:

```text
Skill 库                                      [上传 Skill]

● 已启用  ai-system-knowledge
  系统知识查询能力
  [停用] [删除]

○ 未启用  another-skill
  另一项能力
  [启用] [删除]
```

Also assert:

- no revision number;
- no candidate, activation version, Registry Active, Agent Loaded, Previous, Capability, or Failure Code;
- only the mutated row is disabled while pending;
- delete always opens a confirmation modal;
- same-name `409` opens the replacement modal;
- replacement reuses the original `File`;
- result unknown shows `正在确认状态` and prevents resubmission.

- [ ] **Step 2: Run component tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- \
  src/components/admin/assistant-skill-registry-panel.test.tsx \
  src/components/admin/assistant-skill-upload-dialog.test.tsx \
  src/components/admin/assistant-admin-page.test.tsx \
  src/app/admin/assistant/page.test.tsx
```

Expected: FAIL against the split Registry/runtime UI.

- [ ] **Step 3: Implement the compact panel**

Reuse `assistant-skill-modal.tsx` for replacement and deletion confirmation. Keep native buttons and status text; do not add a UI dependency.

Use row-local state:

```ts
type PendingSkillOperation =
  | { skillId: string; operation: "enable" | "disable" | "delete" }
  | { skillId: string; operation: "replace"; file: File };
```

After every successful mutation, replace the local item with the server-returned authoritative item or remove it after delete.

- [ ] **Step 4: Remove the separate runtime panel from the page**

`AssistantAdminPage` receives only the consolidated Skill snapshot. `AdminAssistantPage` no longer loads `loadAdminSkillRuntimeSnapshot`.

Run component tests again; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/assistant-skill-* \
  apps/web/src/components/admin/assistant-admin-page* \
  apps/web/src/app/admin/assistant/page* \
  apps/web/src/components/admin/assistant-admin-page.css
git commit -m "feat(skill): simplify admin skill library"
```

### Task 7: Delete public candidate/version management

**Files:**

- Delete: `apps/web/src/components/admin/assistant-skill-configuration-panel.tsx`
- Delete: `apps/web/src/components/admin/assistant-skill-configuration-panel.test.tsx`
- Delete: `apps/web/src/features/assistant/admin-skill-runtime-contract.ts`
- Delete: `apps/web/src/features/assistant/admin-skill-runtime-contract.test.ts`
- Delete: `apps/web/src/app/api/v1/admin/assistant/skill-runtime/**`
- Delete: public revision detail/file routes under `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/revisions/**`
- Modify/Delete: obsolete candidate/rollback code in `apps/web/src/server/assistant/admin-skill-runtime-commands.ts`
- Modify: `apps/web/src/server/auth/audit.ts`
- Modify: `packages/database/src/deployment-contracts.test.ts`

- [ ] **Step 1: Add a failing forbidden-surface test**

Assert current product source contains none of:

```text
/skill-runtime/candidates
/skill-runtime/rollback
创建候选集合
候选集合
回滚到上一集合
REGISTRY ACTIVE
AGENT LOADED
ACTIVATION VERSION
```

- [ ] **Step 2: Run the contract test**

Expected: FAIL while old files remain.

- [ ] **Step 3: Delete obsolete files and branches**

Keep internal Registry set creation and Agent activation endpoints because the lifecycle command still calls them. Delete only user-facing routes, contracts, and components.

- [ ] **Step 4: Run Web tests, typecheck, and lint**

Run:

```bash
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
```

Expected: PASS with no unresolved runtime-panel imports.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src packages/database/src/deployment-contracts.test.ts
git diff --cached --check
git commit -m "refactor(skill): remove candidate management surface"
```

---

## Chunk 5: Acceptance and documentation

### Task 8: Replace the Skill E2E scenario

**Files:**

- Modify: `apps/web/e2e/admin-skill-registry.spec.ts`
- Modify: `docs/testing/run-skill-registry-e2e.sh`
- Modify: `docs/testing/run-skill-runtime-e2e.sh`
- Modify: `docs/testing/README.md`
- Modify: `infra/docker/README.md`
- Modify: `README.md`

- [ ] **Step 1: Write the new acceptance sequence**

The isolated scenario must prove:

```text
upload A -> A disabled
enable A -> Agent loads A
disable A -> Agent no longer loads A, A remains in library
enable A -> replace A with same-name ZIP -> Agent loads replacement
delete enabled A -> Agent no longer loads A, A absent from library
upload same-name A -> new Skill ID, disabled
delete disabled A -> A absent from library
```

Also include one blocked ZIP and one replacement-load failure that preserves the old active Skill.

- [ ] **Step 2: Run the E2E and observe the expected failure**

Run:

```bash
pnpm skill-registry:e2e
```

Expected: FAIL until the scripts and routes use the new lifecycle.

- [ ] **Step 3: Update scripts and documentation**

Remove review, revision selection, candidate, manual activation, and rollback instructions. Document only product operations and the automatic scan boundary.

- [ ] **Step 4: Run real E2E**

Run:

```bash
pnpm skill-registry:e2e
pnpm skill-runtime:e2e
```

Expected: both exit 0; cleanup leaves no temporary containers, networks, volumes, secret files, or local fixture artifacts.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/admin-skill-registry.spec.ts \
  docs/testing/run-skill-registry-e2e.sh \
  docs/testing/run-skill-runtime-e2e.sh \
  docs/testing/README.md infra/docker/README.md README.md
git commit -m "test(skill): cover simple lifecycle end to end"
```

### Task 9: Final verification

**Files:**

- No production changes unless a check exposes a defect

- [ ] **Step 1: Run all test suites**

```bash
pnpm test
pnpm agent:test
pnpm skill-core:test
pnpm skill-registry:test
```

Expected: all runnable tests pass; skipped integration tests are listed separately.

- [ ] **Step 2: Run static checks**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm agent:typecheck
pnpm agent:lint
pnpm skill-core:typecheck
pnpm skill-core:lint
uv --directory apps/skill-registry run mypy src tests
uv --directory apps/skill-registry run ruff check .
git diff --check
```

Expected: exit 0 for every command.

- [ ] **Step 3: Run real integration gates**

```bash
pnpm skill-registry:e2e
pnpm skill-runtime:e2e
```

Expected: exit 0 and the full lifecycle passes against real PostgreSQL and AgentOS.

- [ ] **Step 4: Inspect deletion and naming invariants directly**

Using the isolated E2E database, verify:

- the deleted Skill is absent from active library views;
- its audit record remains inaccessible to manager/runtime roles;
- the re-uploaded same name has a different Skill UUID;
- only the new identity is visible;
- its initial enabled state is false;
- no active set references an archived Skill identity.

- [ ] **Step 5: Final code review and commit**

Run:

```bash
git status --short
git diff --stat b066d45..HEAD
git diff --check b066d45..HEAD
```

If verification required fixes, commit only those fixes:

List every verified fix path explicitly with `git add -- path`, then run:

```bash
git diff --cached --check
git commit -m "fix(skill): close lifecycle verification gaps"
```

Do not push or create a pull request without separate user authorization.

# Skill Registry Permission-Based Self Review Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an uploader with the Skill review permission and recent password/MFA assurance to review their own revision, replace the obsolete independence attestation end to end, and give actionable guidance for multi-root macOS ZIP uploads.

**Architecture:** Upgrade the isolated Skill Registry database from schema v1 to v2, preserving historical review evidence while renaming the fourth attestation and removing only the creator/reviewer inequality. Deploy the Registry and Web contracts together: Registry remains authoritative for immutable artifacts and state transitions, while Web remains authoritative for workforce permission and recent assurance. Keep ZIP validation fail-closed in `skill-core`; improve only the bounded Web error guidance.

**Tech Stack:** PostgreSQL 18, Python 3.13, FastAPI, psycopg 3, TypeScript 5.9, Next.js 16, React 19, Vitest, pytest, Playwright, Docker Compose.

---

## Working-tree constraints

- Work only in `/Users/brou/Documents/Work/00-ahkzy/AI Agent Platform/.worktrees/brou-skill-registry-upload-review` on `brou/skill-registry-upload-review`.
- Preserve the existing uncommitted edits in:
  - `apps/web/src/components/admin/assistant-skill-upload-dialog.tsx`
  - `apps/web/src/components/admin/assistant-skill-upload-dialog.test.tsx`
- Those edits already distinguish `validation_error` and `registry_unavailable`; Task 6 extends their validation copy instead of replacing or discarding them.
- Do not touch the unrelated dirty state in the main worktree.
- Never print database URLs, auth secrets, Skill control keys, session tokens, TOTP material, or recovery codes.

## File responsibility map

- `apps/skill-registry/src/skill_registry/schema.py`: literal v1 bootstrap, v2 migration SQL, exact current-schema verification contracts.
- `apps/skill-registry/src/skill_registry/migrate.py`: monotonic v1 -> v2 migration state machine and post-migration verification.
- `apps/skill-registry/src/skill_registry/types.py`: frozen domain command and review-attestation names.
- `apps/skill-registry/src/skill_registry/repository.py`: transactional review event and revision state mutation.
- `apps/skill-registry/src/skill_registry/api.py`: strict private HTTP request/response contract.
- `apps/web/src/features/assistant/admin-skill-contract.ts`: strict browser-facing DTO parser.
- `apps/web/src/server/assistant/skill-registry-client.ts`: strict Web-to-Registry transport contract.
- `apps/web/src/server/assistant/admin-skill-commands.ts`: permission/recent-assurance authorized review command.
- `apps/web/src/app/api/v1/admin/assistant/skills/handler.ts`: bounded Admin BFF request parsing and response mapping.
- `apps/web/src/components/admin/assistant-skill-review-dialog.tsx`: review attestations and submit interaction.
- `apps/web/src/components/admin/assistant-skill-revision-detail.tsx`: review-detail loading and open-review action.
- `apps/web/src/components/admin/assistant-skill-registry-panel.tsx`: list permissions and upload/review announcements.
- `apps/web/src/components/admin/assistant-skill-upload-dialog.tsx`: bounded actionable ZIP validation guidance.
- `packages/database/src/skill-registry-role-boundary.integration.test.ts`: independent TypeScript/PostgreSQL role and trigger verification.
- `docs/testing/run-skill-registry-e2e.sh` and `apps/web/e2e/admin-skill-registry.spec.ts`: isolated full-stack acceptance.

## Chunk 1: Database and Registry domain

### Task 1: Add schema v2 and preserve stateful upgrades

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/schema.py`
- Modify: `apps/skill-registry/src/skill_registry/migrate.py`
- Test: `apps/skill-registry/tests/test_schema.py`
- Test: `apps/skill-registry/tests/test_migrate.py`
- Test: `apps/skill-registry/tests/test_migrate_postgres.py`
- Test: `packages/database/src/skill-registry-role-boundary.integration.test.ts`

- [ ] **Step 1: Write failing schema-contract tests**

Update the tests to require version 2, the renamed column, a v2 migration statement, and no creator/reviewer inequality in the current trigger:

```python
def test_schema_v2_renames_review_authorization_evidence() -> None:
    assert schema.SKILL_REGISTRY_SCHEMA_VERSION == 2
    assert "RENAME COLUMN independent_reviewer_confirmed" in schema.SCHEMA_VERSION_2_SQL
    assert "TO reviewer_authorization_confirmed" in schema.SCHEMA_VERSION_2_SQL
    assert "reviewer_authorization_confirmed IS TRUE" in schema.SCHEMA_VERSION_2_SQL
    assert "NEW.reviewed_by = OLD.created_by" not in schema.SCHEMA_VERSION_2_SQL
```

Add migration-sequence expectations:

```python
@pytest.mark.asyncio
async def test_migration_upgrades_v1_to_v2() -> None:
    cursor = FakeCursor(versions=(1,))
    connection = FakeConnection(cursor)
    async def connector(database_url: str) -> MigrationConnection:
        return connection
    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    await run_migration(settings, connector=connector)
    assert SCHEMA_VERSION_2_SQL in cursor.executed

@pytest.mark.asyncio
async def test_migration_accepts_exact_v2_only() -> None:
    cursor = FakeCursor(versions=(1, 2))
    connection = FakeConnection(cursor)
    async def connector(database_url: str) -> MigrationConnection:
        return connection
    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    await run_migration(settings, connector=connector)
    assert SCHEMA_VERSION_1_SQL not in cursor.executed
    assert SCHEMA_VERSION_2_SQL not in cursor.executed
```

Extend `FakeCursor.execute` so executing `SCHEMA_VERSION_2_SQL` changes
`versions` to `(1, 2)`. Update the anomaly parametrization to reject `(2,)`,
`(1, 3)`, and `(1, 2, 3)` while accepting exactly `(1, 2)`.

Add verifier-negative tests that return both the old and new storage columns,
and that return the v1 `guard_revision_update` definition containing the
second-actor check. Both must raise `Skill registry migration verification
failed`; the verifier must compare exact current rows/function definitions,
not merely search for the new column.

Preserve the existing empty-database branch of
`test_real_registry_migration_and_role_boundary`: drop/recreate the Registry
schema, call `run_migration(settings)` twice, and change its exact expected
versions to `[(1,), (2,)]` before continuing all role-boundary checks.

Add a separate real PostgreSQL test for stateful upgrade:

```python
await owner.execute("DROP SCHEMA IF EXISTS skill_registry CASCADE")
await owner.execute(
    "CREATE SCHEMA skill_registry AUTHORIZATION ai_agent_skill_registry_migrator"
)
migrator = await _connect(urls["migrator"])
await migrator.execute(PREPARE_SCHEMA_SQL)
await migrator.execute(SCHEMA_VERSION_1_SQL)
actor_id, reviewer_id, skill_id, revision_id = uuid4(), uuid4(), uuid4(), uuid4()
async with manager.transaction():
    await _insert_skill_revision(
        manager,
        skill_id=skill_id,
        revision_id=revision_id,
        actor_id=actor_id,
        slug=f"v1-history-{uuid4().hex[:12]}",
        nonce=uuid4(),
    )
async with manager.transaction():
    historical_event_id = await _insert_review_event(
        manager,
        revision_id=revision_id,
        reviewer_id=reviewer_id,
        event_type="revision_published",
    )
    await manager.execute(
        """UPDATE skill_registry.skill_revisions
           SET state='published', reviewed_by=%s, reviewed_at=now()
           WHERE id=%s""",
        (reviewer_id, revision_id),
    )
await run_migration(MigrationSettings.model_validate({"database_url": urls["migrator"]}))
versions = await owner.execute(
    "SELECT version FROM skill_registry.schema_versions ORDER BY version"
)
assert await versions.fetchall() == [(1,), (2,)]
columns = await owner.execute(
    """SELECT column_name FROM information_schema.columns
       WHERE table_schema='skill_registry'
         AND table_name='skill_control_events'
         AND column_name IN (
           'independent_reviewer_confirmed',
           'reviewer_authorization_confirmed'
         ) ORDER BY column_name"""
)
assert await columns.fetchall() == [("reviewer_authorization_confirmed",)]
evidence = await owner.execute(
    "SELECT reviewer_authorization_confirmed "
    "FROM skill_registry.skill_control_events WHERE id = %s",
    (historical_event_id,),
)
assert await evidence.fetchone() == (True,)
```

Close `migrator` in `finally`. Reuse `_insert_skill_revision` and
`_insert_review_event` rather than duplicating SQL. This test starts from a
genuine v1 schema and row; the existing test independently covers empty-start
v1+v2 bootstrap and the complete role/security boundary.

- [ ] **Step 2: Write the failing same-actor PostgreSQL boundary test**

Change the role-boundary scenario so one UUID is both creator and reviewer, and require a matching control event in the same transaction:

```ts
const actorId = randomUUID();
await client.query(
  `INSERT INTO skill_registry.skill_control_events (
     id, request_id, assertion_nonce, actor, event_type, target_id, result_code,
     content_reviewed, usage_rights_confirmed, execution_risk_accepted,
     reviewer_authorization_confirmed
   ) VALUES ($1, $2, $3, $4, 'revision_published', $5, 'ok', true, true, true, true)`,
  [randomUUID(), randomUUID(), randomUUID(), actorId, revisionId],
);
await client.query(
  `UPDATE skill_registry.skill_revisions
      SET state='published', reviewed_by=$1, reviewed_at=now()
    WHERE id=$2`,
  [actorId, revisionId],
);
```

Add the currently missing actor/nonce negatives explicitly:

- insert a valid review event for `wrongActorId`, update with `reviewed_by = actorId`,
  force deferred constraints with `SET CONSTRAINTS ALL IMMEDIATE`, and expect
  SQLSTATE `23514`;
- insert a second control event with the first event's `assertion_nonce` and
  expect SQLSTATE `23505`;
- keep the existing missing-event (`23514`), immutable-field/delete/truncate
  (`42501`), foreign-role (`42501`), and replication-bypass (`42501`) cases.

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```bash
uv --directory apps/skill-registry run pytest \
  tests/test_schema.py tests/test_migrate.py tests/test_migrate_postgres.py -q -rs
pnpm --filter @ai-agent-platform/database test -- \
  src/skill-registry-role-boundary.integration.test.ts
```

Expected: unit failures because schema version 2, `SCHEMA_VERSION_2_SQL`, and the renamed column do not exist; PostgreSQL tests either fail at the old same-actor guard or report their explicit missing-environment skip.

- [ ] **Step 4: Implement the minimal v2 migration**

Keep `SCHEMA_VERSION_1_SQL` unchanged as the historical bootstrap. Add a separate v2 migration:

```python
SKILL_REGISTRY_SCHEMA_VERSION = 2

SCHEMA_VERSION_2_SQL = """
ALTER TABLE skill_registry.skill_control_events
  DROP CONSTRAINT skill_control_events_review_evidence;
ALTER TABLE skill_registry.skill_control_events
  RENAME COLUMN independent_reviewer_confirmed
  TO reviewer_authorization_confirmed;
ALTER TABLE skill_registry.skill_control_events
  ADD CONSTRAINT skill_control_events_review_evidence CHECK (
    (
      event_type IN ('revision_published', 'revision_rejected')
      AND content_reviewed IS TRUE
      AND usage_rights_confirmed IS TRUE
      AND execution_risk_accepted IS TRUE
      AND reviewer_authorization_confirmed IS TRUE
    ) OR (
      event_type NOT IN ('revision_published', 'revision_rejected')
      AND content_reviewed IS NULL
      AND usage_rights_confirmed IS NULL
      AND execution_risk_accepted IS NULL
      AND reviewer_authorization_confirmed IS NULL
    )
  );
CREATE OR REPLACE FUNCTION skill_registry.guard_revision_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, skill_registry
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.skill_id IS DISTINCT FROM OLD.skill_id
    OR NEW.revision_no IS DISTINCT FROM OLD.revision_no
    OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.source_url IS DISTINCT FROM OLD.source_url
    OR NEW.source_ref IS DISTINCT FROM OLD.source_ref
    OR NEW.source_commit IS DISTINCT FROM OLD.source_commit
    OR NEW.manifest IS DISTINCT FROM OLD.manifest
    OR NEW.findings IS DISTINCT FROM OLD.findings
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'skill revision body is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.state = 'pending_review' AND NEW.state IN ('published', 'rejected') THEN
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'review actor and timestamp are required'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.state = 'published' AND NEW.state = 'archived' THEN
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'review metadata is immutable after review'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid skill revision state transition'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
INSERT INTO skill_registry.schema_versions(version)
VALUES (2) ON CONFLICT (version) DO NOTHING;
"""
```

The v2 trigger body above is complete: it is the v1 trigger with only the
`NEW.reviewed_by = OLD.created_by` rejection removed.

Update `run_migration` with exact states:

```python
if version_state == (None, 0):
    await cursor.execute(SCHEMA_VERSION_1_SQL)
    await cursor.execute(SCHEMA_VERSION_2_SQL)
elif version_state == (1, 1):
    await cursor.execute(SCHEMA_VERSION_2_SQL)
elif version_state != (2, 2):
    raise RuntimeError("Skill registry migration verification failed")
```

Update the current-schema verifier constants and queries to require only
`reviewer_authorization_confirmed`, the exact v2 constraint, and the exact full
v2 `guard_revision_update` definition. The storage-column query must include
both old and new candidate names so an unexpected coexisting old column makes
the exact-set comparison fail. Keep the fail-closed higher-version behavior.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run the commands from Step 3.

Expected: all available tests pass; integration tests may skip only with the explicit four missing Registry database URLs shown by `-rs`.

- [ ] **Step 6: Commit the database migration slice**

```bash
git add apps/skill-registry/src/skill_registry/schema.py \
  apps/skill-registry/src/skill_registry/migrate.py \
  apps/skill-registry/tests/test_schema.py \
  apps/skill-registry/tests/test_migrate.py \
  apps/skill-registry/tests/test_migrate_postgres.py \
  packages/database/src/skill-registry-role-boundary.integration.test.ts
git commit -m "feat(skills): allow authorized self review in schema v2"
```

### Task 2: Rename Registry domain and persistence contracts

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/types.py`
- Modify: `apps/skill-registry/src/skill_registry/repository.py`
- Test: `apps/skill-registry/tests/test_service.py`
- Test: `apps/skill-registry/tests/test_repository.py`
- Test: `apps/skill-registry/tests/test_repository_postgres.py`

- [ ] **Step 1: Write failing domain/repository tests**

Use the same UUID for `CreateUploadRevision.actor` and `ReviewRevision.reviewer`, and construct the renamed attestation:

```python
attestations = ReviewAttestations(
    content_reviewed=True,
    usage_rights_confirmed=True,
    execution_risk_accepted=True,
    reviewer_authorization_confirmed=True,
)
command = ReviewRevision(
    revision_id=detail.revision.id,
    reviewer=ACTOR,
    request_id=uuid4(),
    assertion_nonce=uuid4(),
    decision="approve",
    expected_state="pending_review",
    reason=None,
    attestations=attestations,
    skill_id=detail.revision.skill_id,
)
assert (await registry.review_revision(command)).state == "published"
```

Assert exact repository SQL contains `reviewer_authorization_confirmed` and does not contain `independent_reviewer_confirmed` in current writes.

Replace the current `test_repository_rejects_self_review` expectation with a
successful repository script assertion: creator and reviewer are the same UUID,
the control-event insert uses that UUID, and the following revision update sets
`reviewed_by` to the same UUID.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
uv --directory apps/skill-registry run pytest \
  tests/test_service.py tests/test_repository.py tests/test_repository_postgres.py -q -rs
```

Expected: constructor/SQL assertions fail because the old attestation name remains.

- [ ] **Step 3: Implement the domain rename**

Change the frozen dataclass and completeness check:

```python
@dataclass(frozen=True, slots=True)
class ReviewAttestations:
    content_reviewed: bool
    usage_rights_confirmed: bool
    execution_risk_accepted: bool
    reviewer_authorization_confirmed: bool

    @property
    def complete(self) -> bool:
        return all(
            value is True
            for value in (
                self.content_reviewed,
                self.usage_rights_confirmed,
                self.execution_risk_accepted,
                self.reviewer_authorization_confirmed,
            )
        )
```

Update the repository insert column and parameter. Delete the existing
`if revision.created_by == command.reviewer: ... REVIEW_SELF_APPROVAL_DENIED`
branch from `PostgresSkillRegistryRepository._validate_review`; the authorization
decision remains in Web, and the Registry continues to trust only its signed Web
control assertion.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

Expected: all available tests pass, with only explicit database-environment skips allowed.

- [ ] **Step 5: Commit the domain slice**

```bash
git add apps/skill-registry/src/skill_registry/types.py \
  apps/skill-registry/src/skill_registry/repository.py \
  apps/skill-registry/tests/test_service.py \
  apps/skill-registry/tests/test_repository.py \
  apps/skill-registry/tests/test_repository_postgres.py
git commit -m "refactor(skills): rename reviewer authorization evidence"
```

### Task 3: Upgrade the private Registry review/detail API contract

**Files:**
- Modify: `apps/skill-registry/src/skill_registry/api.py`
- Test: `apps/skill-registry/tests/test_api.py`
- Test: `apps/skill-registry/tests/test_app.py`

- [ ] **Step 1: Write failing strict-contract tests**

Require review requests to accept only:

```json
{
  "decision": "approve",
  "reason": null,
  "expectedState": "pending_review",
  "attestations": {
    "contentReviewed": true,
    "usageRightsConfirmed": true,
    "executionRiskAccepted": true,
    "reviewerAuthorizationConfirmed": true
  }
}
```

Add negative cases proving the legacy field, a missing new field, `false`, `1`,
and extra fields are rejected after JSON decoding. Require revision detail
responses to return `version: "2"` and only
`reviewerAuthorizationConfirmed` in `reviewAttestations`.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
uv --directory apps/skill-registry run pytest tests/test_api.py tests/test_app.py -q
```

Expected: failures on the old exact field set and detail response version 1.

- [ ] **Step 3: Implement minimal strict API changes**

Change `_ATTESTATION_FIELDS`, request parsing, domain mapping, and detail serialization. Keep list/upload/file/review-result response versions at `"1"`; only detail carries the changed attestation response and moves to `"2"`.
Remove the now-unreachable `REVIEW_SELF_APPROVAL_DENIED` code from the Registry
API error allowlists and its tests; do not preserve an obsolete public contract.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

Expected: all API/app tests pass.

- [ ] **Step 5: Commit the Registry API slice**

```bash
git add apps/skill-registry/src/skill_registry/api.py \
  apps/skill-registry/tests/test_api.py \
  apps/skill-registry/tests/test_app.py
git commit -m "feat(skills): expose reviewer authorization contract"
```

## Chunk 2: Web authorization, contracts, and UI

### Task 4: Upgrade Web contracts without weakening permission or MFA

**Files:**
- Modify: `apps/web/src/features/assistant/admin-skill-contract.ts`
- Modify: `apps/web/src/server/assistant/skill-registry-client.ts`
- Modify: `apps/web/src/server/assistant/admin-skill-commands.ts`
- Modify: `apps/web/src/app/api/v1/admin/assistant/skills/handler.ts`
- Test: `apps/web/src/features/assistant/admin-skill-contract.test.ts`
- Test: `apps/web/src/server/assistant/skill-registry-client.test.ts`
- Test: `apps/web/src/server/assistant/admin-skill-commands.test.ts`
- Test: `apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/revisions/[revisionId]/review/route.test.ts`

- [ ] **Step 1: Write failing DTO and transport tests**

Replace the old field in valid fixtures and add explicit old-field rejection:

```ts
const attestations = {
  contentReviewed: true,
  usageRightsConfirmed: true,
  executionRiskAccepted: true,
  reviewerAuthorizationConfirmed: true,
} as const;

expect(parseAdminSkillRevisionDetailResponse({
  ...detail,
  version: "2",
  reviewAttestations: attestations,
})).not.toBeNull();

expect(parseAdminSkillRevisionDetailResponse({
  ...detail,
  version: "2",
  reviewAttestations: {
    contentReviewed: true,
    usageRightsConfirmed: true,
    executionRiskAccepted: true,
    independentReviewerConfirmed: true,
  },
})).toBeNull();
```

Keep command authorization assertions that review calls
`requireSensitiveAction("admin:assistant:skills:review", {
recentWithinSeconds: 600, mfaRequired: true })`. Remove the obsolete route test
that maps `REVIEW_SELF_APPROVAL_DENIED` to 403; retain the independent upstream
failure-to-503 assertion. Actor equality is proven in the repository, UI, and
E2E seams where both identities actually exist.
Delete the `admin-skill-commands.test.ts` case that injects
`REVIEW_SELF_APPROVAL_DENIED`; it is an obsolete Registry contract, not a Web
permission test.

For each of the four strict Web boundaries—browser detail DTO,
Web-to-Registry review request, server review command input, and BFF review
body—add isolated cases for legacy-only field, missing new field, `false`,
number `1`, an extra key, inherited properties, and accessor properties. Do not
combine the legacy-field case with `undefined`, because that could hide alias
acceptance.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- \
  src/features/assistant/admin-skill-contract.test.ts \
  src/server/assistant/skill-registry-client.test.ts \
  src/server/assistant/admin-skill-commands.test.ts \
  'src/app/api/v1/admin/assistant/skills/[skillId]/revisions/[revisionId]/review/route.test.ts'
```

Expected: failures because version 2 and `reviewerAuthorizationConfirmed` are not yet accepted.

- [ ] **Step 3: Implement the exact Web contract rename**

Update the four strict parsers and copied DTOs. Preserve exact-own-property checks and return frozen literal `true` values:

```ts
attestations: {
  contentReviewed: true,
  usageRightsConfirmed: true,
  executionRiskAccepted: true,
  reviewerAuthorizationConfirmed: true,
}
```

Do not alter `requirePermission`, `requireSensitiveAction`, the existing
600-second window, MFA requirement, nonce generation, audit writes, or error
sanitization.
Remove `REVIEW_SELF_APPROVAL_DENIED` from the Web Registry-client error-code/
status maps and from the BFF 403 mapping. Permission denial remains the Web
authorization layer's normal `permission_denied` response, while Registry no
longer emits a creator-identity denial.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

Expected: all focused Web contract tests pass.

- [ ] **Step 5: Commit the Web contract slice**

```bash
git add apps/web/src/features/assistant/admin-skill-contract.ts \
  apps/web/src/features/assistant/admin-skill-contract.test.ts \
  apps/web/src/server/assistant/skill-registry-client.ts \
  apps/web/src/server/assistant/skill-registry-client.test.ts \
  apps/web/src/server/assistant/admin-skill-commands.ts \
  apps/web/src/server/assistant/admin-skill-commands.test.ts \
  apps/web/src/app/api/v1/admin/assistant/skills/handler.ts \
  'apps/web/src/app/api/v1/admin/assistant/skills/[skillId]/revisions/[revisionId]/review/route.test.ts'
git commit -m "feat(skills): authorize self review through Web BFF"
```

### Task 5: Allow the creator to review in the UI

**Files:**
- Modify: `apps/web/src/components/admin/assistant-skill-review-dialog.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-revision-detail.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-registry-panel.tsx`
- Modify: `apps/web/src/components/admin/assistant-admin-page.tsx`
- Modify: `apps/web/src/app/admin/assistant/page.tsx`
- Test: `apps/web/src/components/admin/assistant-skill-review-dialog.test.tsx`
- Test: `apps/web/src/components/admin/assistant-skill-revision-detail.test.tsx`
- Test: `apps/web/src/components/admin/assistant-skill-registry-panel.test.tsx`
- Test: `apps/web/src/components/admin/assistant-admin-page.test.tsx`
- Test: `apps/web/src/app/admin/assistant/page.test.tsx`

- [ ] **Step 1: Write failing creator-review UI tests**

Replace the old “prevents creator” test with an actual submit test:

```tsx
render(
  <AssistantSkillReviewDialog
    actorUserId={REVISION.createdBy}
    findings={[]}
    onClose={vi.fn()}
    onReviewed={onReviewed}
    revision={REVISION}
  />,
);
for (const label of [
  "已逐项审阅内容和文件",
  "已确认使用权和许可证",
  "已评估并接受执行风险",
  "确认审核账号具备审核权限并对本次发布负责",
]) fireEvent.click(screen.getByLabelText(label));
fireEvent.click(screen.getByRole("button", { name: "批准发布" }));
expect(fetch).toHaveBeenCalledWith(expect.stringEndingWith("/review"), expect.anything());
```

In detail tests, set `createdBy === actorUserId` and expect “打开审核操作” to be enabled for `pending_review`. Keep the panel test proving users without `canReview` never receive a detail/review button.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- \
  src/components/admin/assistant-skill-review-dialog.test.tsx \
  src/components/admin/assistant-skill-revision-detail.test.tsx \
  src/components/admin/assistant-skill-registry-panel.test.tsx \
  src/components/admin/assistant-admin-page.test.tsx \
  src/app/admin/assistant/page.test.tsx
```

Expected: creator remains blocked and old independent-review text remains.

- [ ] **Step 3: Implement minimal UI behavior**

- Remove `isCreator` and both creator-blocking branches.
- Remove `actorUserId` from dialog, detail, and registry-panel props. Remove the
  resulting `skillActorUserId` prop from `AssistantAdminPage` and the server page,
  and update their tests; do not retain dead identity plumbing.
- Rename the fourth state key and request field to `reviewerAuthorizationConfirmed`.
- Change the header from `INDEPENDENT REVIEW` to `AUTHORIZED REVIEW`.
- Change panel text from “双人审核” to “权限审核” and from “等待独立审核” to “等待审核”。
- Continue rendering review details/actions only when `permissions.canReview` is true in `AssistantSkillRegistryPanel`.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

Expected: all focused UI tests pass, including the uploader-as-reviewer path and the no-review-permission negative path.

- [ ] **Step 5: Commit the UI slice**

```bash
git add apps/web/src/components/admin/assistant-skill-review-dialog.tsx \
  apps/web/src/components/admin/assistant-skill-review-dialog.test.tsx \
  apps/web/src/components/admin/assistant-skill-revision-detail.tsx \
  apps/web/src/components/admin/assistant-skill-revision-detail.test.tsx \
  apps/web/src/components/admin/assistant-skill-registry-panel.tsx \
  apps/web/src/components/admin/assistant-skill-registry-panel.test.tsx \
  apps/web/src/components/admin/assistant-admin-page.tsx \
  apps/web/src/components/admin/assistant-admin-page.test.tsx \
  apps/web/src/app/admin/assistant/page.tsx \
  apps/web/src/app/admin/assistant/page.test.tsx
git commit -m "feat(skills): allow permission-based uploader review"
```

### Task 6: Finish actionable multi-root ZIP guidance

**Files:**
- Modify: `apps/web/src/components/admin/assistant-skill-upload-dialog.tsx`
- Modify: `apps/web/src/components/admin/assistant-skill-upload-dialog.test.tsx`
- Test fixture only: `/Users/brou/Downloads/ai-system-knowledge-20260703.072701 2.zip`
- Test fixture only: `/Users/brou/Downloads/ai-system-knowledge-validated.zip`

- [ ] **Step 1: Tighten the existing failing-copy test**

Change the expected bounded copy to:

```ts
expect(await screen.findByRole("alert")).toHaveTextContent(
  "Skill ZIP 校验失败。请确保压缩包只有一个顶层 Skill 目录，删除 __MACOSX，并确保顶层目录名与 SKILL.md 的 name 一致。",
);
```

Keep the existing Registry-unavailable test unchanged.
In the successful-upload test, require the full replacement announcement:

```ts
expect(await screen.findByRole("status")).toHaveTextContent(
  "上传成功，状态：pending_review（等待审核）。",
);
expect(screen.queryByText(/独立审核/u)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the upload-dialog test and confirm RED**

```bash
pnpm --filter @ai-agent-platform/web test -- \
  src/components/admin/assistant-skill-upload-dialog.test.tsx
```

Expected: the actionable validation-copy assertion fails against the current
generic directory-structure message, and the success-announcement assertion
fails against `待独立审核`.

- [ ] **Step 3: Implement the bounded guidance**

Change `INVALID_ARCHIVE_ERROR` and the upload-success announcement from
`待独立审核` to `等待审核`. Keep strict response parsing, generic fallback,
Registry-unavailable handling, abort/race behavior, and no raw server-message
rendering.

- [ ] **Step 4: Run the UI test and the real differential ZIP loop**

```bash
pnpm --filter @ai-agent-platform/web test -- \
  src/components/admin/assistant-skill-upload-dialog.test.tsx
PYTHONPATH=packages/skill-core/src packages/skill-core/.venv/bin/python - <<'PY'
from pathlib import Path
from skill_core import SkillPackageError, canonicalize_skill_zip

cases = (
    (Path('/Users/brou/Downloads/ai-system-knowledge-20260703.072701 2.zip'), 'ARCHIVE_MULTIPLE_SKILL_ROOTS'),
    (Path('/Users/brou/Downloads/ai-system-knowledge-validated.zip'), None),
)
for path, expected_error in cases:
    try:
        package = canonicalize_skill_zip(path.read_bytes())
    except SkillPackageError as error:
        assert error.code == expected_error, (path.name, error.code)
    else:
        assert expected_error is None, path.name
        assert package.slug == 'ai-system-knowledge'
print('skill ZIP differential acceptance passed')
PY
```

Expected: the Vitest file passes and the script prints exactly `skill ZIP differential acceptance passed`.

- [ ] **Step 5: Commit the upload-guidance slice**

```bash
git add apps/web/src/components/admin/assistant-skill-upload-dialog.tsx \
  apps/web/src/components/admin/assistant-skill-upload-dialog.test.tsx
git commit -m "fix(skills): explain rejected multi-root archives"
```

## Chunk 3: Cross-layer acceptance and deployment

### Task 7: Update E2E and maintained product documentation

**Files:**
- Create: `apps/skill-registry/tests/fixtures/seed_v1_history.py`
- Modify: `apps/web/e2e/admin-skill-registry.spec.ts`
- Modify: `docs/testing/run-skill-registry-e2e.sh`
- Modify: `docs/testing/README.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-20-maduoduo-skill-registry-design.md`
- Modify: `docs/superpowers/specs/2026-07-22-skill-registry-self-review-policy-design.md`
- Test: `packages/database/src/deployment-contracts.test.ts`

- [ ] **Step 1: Write failing E2E/deployment contract assertions**

Change the lifecycle title to
`workforce:super_admin uploads and self-reviews after MFA; workforce:admin is denied`.
Use the fixed fixture identities from `auth-fixtures.ts`:

```ts
expect(detailBody.revision).toMatchObject({
  createdBy: identities.modelAdmin.id,
  reviewedBy: identities.modelAdmin.id,
  state: "published",
});
```

The exact browser order is:

1. add `modelAdminSessionToken` and prove `/api/v1/session/staff` returns 403
   with `AUTH_TOTP_SETUP_REQUIRED`;
2. complete TOTP setup with `adminPassword`, then upload the ZIP as
   `identities.modelAdmin.id`;
3. save that assured storage state, switch to `adminSessionToken`, and prove a
   direct review returns 403 `permission_denied`;
4. switch to `modelAdminStaleSessionToken` and prove the same review returns
   401 `reauth_required` with `/staff/re-auth`;
5. restore the assured model-admin session, review through the UI with
   `reviewerAuthorizationConfirmed`, and assert both `createdBy` and
   `reviewedBy` equal `identities.modelAdmin.id`.

Add deployment-contract assertions for schema version 2, the v1-history seed,
the renamed field, the two negative response codes, and the absence of
production-path “双人审核/独立审核” copy.

- [ ] **Step 2: Run focused contract tests and confirm RED**

```bash
pnpm --filter @ai-agent-platform/database test -- \
  src/deployment-contracts.test.ts
```

Expected: failures until the E2E runner/spec and maintained design wording are updated.

- [ ] **Step 3: Update E2E flow and documentation**

- Implement `seed_v1_history.py` as a non-production test helper. It connects
  with `SKILL_REGISTRY_MIGRATOR_DATABASE_URL`, applies only
  `PREPARE_SCHEMA_SQL` and `SCHEMA_VERSION_1_SQL`, creates fixed Skill/revision/
  review-event UUIDs, and publishes the revision with
  `independent_reviewer_confirmed=true` using distinct historical actors. It
  must assert `(MAX(version), COUNT(*)) == (1, 1)` and print only
  `Skill Registry v1 history seeded`.

Use this complete helper:

```python
from hashlib import sha256
from io import BytesIO
from os import environ
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

import psycopg

from skill_registry.schema import PREPARE_SCHEMA_SQL, SCHEMA_VERSION_1_SQL


SKILL_ID = UUID("70000000-0000-4000-8000-000000000001")
REVISION_ID = UUID("70000000-0000-4000-8000-000000000002")
CREATOR_ID = UUID("70000000-0000-4000-8000-000000000003")
REVIEWER_ID = UUID("70000000-0000-4000-8000-000000000004")
EVENT_ID = UUID("70000000-0000-4000-8000-000000000005")
REQUEST_ID = UUID("70000000-0000-4000-8000-000000000006")
NONCE = UUID("70000000-0000-4000-8000-000000000007")


raw_url = environ["SKILL_REGISTRY_MIGRATOR_DATABASE_URL"]
prefix = "postgresql+psycopg_async://"
if not raw_url.startswith(prefix):
    raise RuntimeError("Skill Registry v1 fixture URL is invalid")
database_url = raw_url.replace(prefix, "postgresql://", 1)
skill_markdown = b"---\nname: e2e-v1-history\ndescription: v1 migration history\n---\n"
archive_buffer = BytesIO()
with ZipFile(archive_buffer, "w", compression=ZIP_DEFLATED) as archive:
    archive.writestr("e2e-v1-history/SKILL.md", skill_markdown)
archive_bytes = archive_buffer.getvalue()
archive_sha256 = sha256(archive_bytes).hexdigest()
file_sha256 = sha256(skill_markdown).hexdigest()

with psycopg.connect(database_url) as connection:
    with connection.cursor() as cursor:
        cursor.execute(PREPARE_SCHEMA_SQL)
        cursor.execute(SCHEMA_VERSION_1_SQL)
        cursor.execute(
            "INSERT INTO skill_registry.skills (id, slug, created_by) "
            "VALUES (%s, 'e2e-v1-history', %s)",
            (SKILL_ID, CREATOR_ID),
        )
        cursor.execute(
            """INSERT INTO skill_registry.skill_revisions (
                 id, skill_id, revision_no, state, source_type, manifest, created_by
               ) VALUES (%s, %s, 1, 'pending_review', 'upload', '{}'::jsonb, %s)""",
            (REVISION_ID, SKILL_ID, CREATOR_ID),
        )
        cursor.execute(
            """INSERT INTO skill_registry.skill_revision_artifacts (
                 revision_id, skill_id, artifact_sha256, compressed_size,
                 extracted_size, file_count, archive_bytes
               ) VALUES (%s, %s, %s, %s, %s, 1, %s)""",
            (
                REVISION_ID,
                SKILL_ID,
                archive_sha256,
                len(archive_bytes),
                len(skill_markdown),
                archive_bytes,
            ),
        )
        cursor.execute(
            """INSERT INTO skill_registry.skill_revision_files (
                 revision_id, path, file_sha256, size, media_type
               ) VALUES (%s, 'SKILL.md', %s, %s, 'text/markdown')""",
            (REVISION_ID, file_sha256, len(skill_markdown)),
        )
        cursor.execute(
            """INSERT INTO skill_registry.skill_control_events (
                 id, request_id, assertion_nonce, actor, event_type, target_id,
                 result_code, content_reviewed, usage_rights_confirmed,
                 execution_risk_accepted, independent_reviewer_confirmed
               ) VALUES (
                 %s, %s, %s, %s, 'revision_published', %s, 'ok',
                 true, true, true, true
               )""",
            (EVENT_ID, REQUEST_ID, NONCE, str(REVIEWER_ID), REVISION_ID),
        )
        cursor.execute(
            """UPDATE skill_registry.skill_revisions
               SET state='published', reviewed_by=%s, reviewed_at=now()
               WHERE id=%s""",
            (REVIEWER_ID, REVISION_ID),
        )
        cursor.execute(
            "SELECT max(version), count(*) FROM skill_registry.schema_versions"
        )
        if cursor.fetchone() != (1, 1):
            raise RuntimeError("Skill Registry v1 fixture verification failed")

print("Skill Registry v1 history seeded")
```
- In the runner, after role bootstrap and before the first normal Registry
  migration, mount and execute that helper with the service's existing secret
  entrypoint:

```sh
run_job --no-deps \
  -v "$repo_root/apps/skill-registry/tests/fixtures/seed_v1_history.py:/tmp/seed-v1-history.py:ro" \
  skill-registry-migrate python /tmp/seed-v1-history.py
run_job --no-deps skill-registry-migrate
run_job --no-deps skill-registry-migrate
```

- Query after migration and require exactly `2:2`, zero legacy columns, one new
  column, and `true` for the fixed historical event's renamed evidence. This is
  the real stateful v1 -> v2 preservation gate.

```sh
migration_contract=$(compose exec -T db psql -v ON_ERROR_STOP=1 \
  -U "$owner" -d "$database" -Atqc \
  "SELECT max(version)::text || ':' || count(*)::text
     FROM skill_registry.schema_versions;
   SELECT count(*) FILTER (WHERE column_name='independent_reviewer_confirmed')::text
          || ':' ||
          count(*) FILTER (WHERE column_name='reviewer_authorization_confirmed')::text
     FROM information_schema.columns
    WHERE table_schema='skill_registry'
      AND table_name='skill_control_events';
   SELECT reviewer_authorization_confirmed
     FROM skill_registry.skill_control_events
    WHERE id='70000000-0000-4000-8000-000000000005'::uuid;
   SELECT
     (SELECT count(*) FROM skill_registry.skill_revision_artifacts
       WHERE revision_id='70000000-0000-4000-8000-000000000002'::uuid)::text
     || ':' ||
     (SELECT count(*) FROM skill_registry.skill_revision_files
       WHERE revision_id='70000000-0000-4000-8000-000000000002'::uuid)::text;")
expected_migration_contract=$(printf '2:2\n0:1\nt\n1:1')
[ "$migration_contract" = "$expected_migration_contract" ] || {
  echo "Skill Registry v1 to v2 preservation failed" >&2
  exit 1
}
```
- Use the exact browser actor/session order from Step 1. Do not bypass the
  permission or 600-second recent password/MFA gate with a raw Registry call.
- Update every active-policy occurrence in the original 2026-07-20 design, not
  only its decision table. Sections 4, 5.1, 9, 12, 15.2, 16.2, 20.1, 20.3,
  21.A, and 22 must replace “双人/独立/禁止自审” with: uploader self-review is
  allowed only with `admin:assistant:skills:review` plus recent password/TOTP;
  no-permission and missing-assurance reviews still fail. Section 12's fourth
  attestation becomes `确认审核账号具备审核权限并对本次发布负责`, and the
  database is described as binding the same transaction event actor to
  `reviewed_by`, not comparing it to `created_by`. Add a top-level supersession
  note linking the 2026-07-22 change spec.
- Change the 2026-07-22 spec status from “待用户审阅” to “已确认”。
- Change root `README.md` and `docs/testing/README.md` from “双人审核” to
  permission-based review, and describe super-admin upload/self-review plus the
  no-permission and stale-assurance negatives.
- Document the supported packaging command without committing user Downloads content:

```bash
COPYFILE_DISABLE=1 zip -X -r ai-system-knowledge.zip ai-system-knowledge \
  -x '__MACOSX/*' '*/.DS_Store'
```

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

Expected: deployment contract tests pass.

- [ ] **Step 5: Commit the acceptance/documentation slice**

```bash
git add apps/web/e2e/admin-skill-registry.spec.ts \
  apps/skill-registry/tests/fixtures/seed_v1_history.py \
  docs/testing/run-skill-registry-e2e.sh \
  docs/testing/README.md README.md \
  docs/superpowers/specs/2026-07-20-maduoduo-skill-registry-design.md \
  docs/superpowers/specs/2026-07-22-skill-registry-self-review-policy-design.md \
  packages/database/src/deployment-contracts.test.ts
git commit -m "test(skills): cover authorized uploader review"
```

### Task 8: Run complete verification and migrate the live local stack

**Files:**
- Verify only: all changed files
- Runtime state: existing local Docker Compose project `ai-agent-platform`

- [ ] **Step 1: Confirm scope and cleanliness before verification**

```bash
git status --short --branch
git diff --check
rg -n "independentReviewerConfirmed|independent_reviewer_confirmed|REVIEW_SELF_APPROVAL_DENIED|需独立审核人|等待独立审核|双人审核" \
  apps/skill-registry/src apps/web/src apps/web/e2e packages/database/src \
  README.md docs/testing \
  docs/superpowers/specs/2026-07-20-maduoduo-skill-registry-design.md
```

Expected: only intentional branch changes; `git diff --check` exits 0; the
legacy search returns only the literal historical v1 bootstrap, the v1-history
fixture, and explicit migration assertions. It returns no production Web copy,
current API/error contract, current repository write, root README, or testing
README.

- [ ] **Step 2: Run the complete Python quality gate**

```bash
pnpm skill-core:test
pnpm skill-core:lint
pnpm skill-core:typecheck
pnpm skill-registry:test
uv --directory apps/skill-registry run ruff check .
uv --directory apps/skill-registry run ruff format --check .
uv --directory apps/skill-registry run mypy src tests
```

Expected: all commands exit 0; report skipped integration tests separately rather than counting them as passed.

- [ ] **Step 3: Run the complete TypeScript/Web quality gate**

```bash
pnpm --filter @ai-agent-platform/database test
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/database typecheck
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/database lint
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/database format:check
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
```

Expected: every command exits 0 with no test failures, type errors, lint errors, formatting errors, or build errors.

- [ ] **Step 4: Run isolated real PostgreSQL/Compose acceptance**

```bash
pnpm skill-registry:e2e
```

Expected: the v1-history helper prints its fixed success marker; migration
produces `(2, 2)`, preserves the historical true evidence under the new column,
and removes the old column. The browser flow uses model-admin as both uploader
and reviewer; the no-permission and stale-assurance negatives pass; cleanup
removes every temporary container, network, volume, and image.

- [ ] **Step 5: Back up and migrate the existing local stack**

Use the existing private Compose files already configured for this worktree.
Preflight names and permissions without reading content:

```bash
test "$(stat -f '%Lp' /private/tmp/ai-agent-platform-skill-registry.env)" = 600
test -f /private/tmp/ai-agent-platform-skill-registry-local.yaml
docker compose -p ai-agent-platform \
  --env-file /private/tmp/ai-agent-platform-skill-registry.env \
  -f compose.yaml \
  -f /private/tmp/ai-agent-platform-skill-registry-local.yaml config --quiet
```

Create and verify an encrypted pre-migration backup without exposing content:

```bash
docker compose -p ai-agent-platform \
  --env-file /private/tmp/ai-agent-platform-skill-registry.env \
  -f compose.yaml \
  -f /private/tmp/ai-agent-platform-skill-registry-local.yaml \
  run --rm --no-deps -e BACKUP_RUN_ONCE=true backup
docker compose -p ai-agent-platform \
  --env-file /private/tmp/ai-agent-platform-skill-registry.env \
  -f compose.yaml \
  -f /private/tmp/ai-agent-platform-skill-registry-local.yaml \
  run --rm --no-deps --entrypoint sh backup -c \
  'test "$(find /backups -maxdepth 1 -type f -name "ai-agent-platform-*.dump.gpg" | wc -l)" -ge 1'
```

Then build, migrate, and restart only affected services:

```bash
docker compose -p ai-agent-platform \
  --env-file /private/tmp/ai-agent-platform-skill-registry.env \
  -f compose.yaml \
  -f /private/tmp/ai-agent-platform-skill-registry-local.yaml \
  build web skill-registry skill-registry-migrate
docker compose -p ai-agent-platform \
  --env-file /private/tmp/ai-agent-platform-skill-registry.env \
  -f compose.yaml \
  -f /private/tmp/ai-agent-platform-skill-registry-local.yaml \
  run --rm --no-deps skill-registry-migrate
docker compose -p ai-agent-platform \
  --env-file /private/tmp/ai-agent-platform-skill-registry.env \
  -f compose.yaml \
  -f /private/tmp/ai-agent-platform-skill-registry-local.yaml \
  up -d --no-deps --wait skill-registry web
```

- [ ] **Step 6: Verify the stateful migration and current revision**

First, create a uniquely digested but valid single-root archive by adding one
harmless Markdown comment to a temporary copy. This prevents the repository's
same-Skill/same-digest replay behavior from returning an older revision:
Run Steps 6 and 7 in the same shell session so `SMOKE_ROOT`, `SMOKE_SHA`,
`REVISION_ID`, and the cleanup trap remain active until the single review ends.

```bash
SMOKE_ROOT=$(mktemp -d /private/tmp/aap-skill-live.XXXXXX)
cleanup_live_smoke() { rm -rf "$SMOKE_ROOT"; }
trap cleanup_live_smoke EXIT
unzip -q /Users/brou/Downloads/ai-system-knowledge-validated.zip -d "$SMOKE_ROOT"
SMOKE_NONCE=$(openssl rand -hex 16)
printf '\n<!-- live-smoke-%s -->\n' "$SMOKE_NONCE" \
  >> "$SMOKE_ROOT/ai-system-knowledge/SKILL.md"
(cd "$SMOKE_ROOT" && COPYFILE_DISABLE=1 zip -X -qr \
  "$SMOKE_ROOT/ai-system-knowledge-live.zip" ai-system-knowledge \
  -x '__MACOSX/*' '*/.DS_Store')
SMOKE_SHA=$(PYTHONPATH=packages/skill-core/src \
  packages/skill-core/.venv/bin/python - \
  "$SMOKE_ROOT/ai-system-knowledge-live.zip" <<'PY'
from pathlib import Path
import sys
from skill_core import canonicalize_skill_zip
package = canonicalize_skill_zip(Path(sys.argv[1]).read_bytes())
assert package.slug == "ai-system-knowledge"
print(package.sha256)
PY
)
case "$SMOKE_SHA" in
  [0-9a-f][0-9a-f]*) [ "${#SMOKE_SHA}" -eq 64 ] ;;
  *) echo "live smoke digest is invalid" >&2; exit 1 ;;
esac
```

Always upload this fresh archive from the authenticated account that has both
upload and review permission. Query the existing Skill ID:

```bash
docker compose -p ai-agent-platform \
  --env-file /private/tmp/ai-agent-platform-skill-registry.env \
  -f compose.yaml \
  -f /private/tmp/ai-agent-platform-skill-registry-local.yaml \
  exec -T db sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc \
  "SELECT id FROM skill_registry.skills WHERE slug='\''ai-system-knowledge'\''"'
```

If the query returns a UUID, enter it in the dialog's optional target field. If
it returns no row, leave the optional target blank so the upload creates the
Skill. Before uploading, prove the random artifact digest does not already
exist:

```bash
test "$(docker compose -p ai-agent-platform \
  --env-file /private/tmp/ai-agent-platform-skill-registry.env \
  -f compose.yaml \
  -f /private/tmp/ai-agent-platform-skill-registry-local.yaml \
  exec -T db sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v digest="$1" -Atqc \
  "SELECT count(*) FROM skill_registry.skill_revision_artifacts WHERE artifact_sha256 = :'\''digest'\''"' \
  sh "$SMOKE_SHA")" = 0
```

Choose `$SMOKE_ROOT/ai-system-knowledge-live.zip`, submit, require HTTP 201 and
`pending_review`, and copy both the returned Skill ID and revision UUID. Set
`REVISION_ID` to that new UUID. Digest absence before upload plus the exact
UUID/digest query below is the deterministic non-replay proof.

Then run read-only queries inside the DB container as its configured owner; do
not source the env file or print URLs/secrets:

```bash
docker compose -p ai-agent-platform \
  --env-file /private/tmp/ai-agent-platform-skill-registry.env \
  -f compose.yaml \
  -f /private/tmp/ai-agent-platform-skill-registry-local.yaml \
  exec -T db sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v revision_id="$1" -At' \
  sh "$REVISION_ID" <<'SQL'
SELECT max(version)::text || ':' || count(*)::text
FROM skill_registry.schema_versions;
SELECT string_agg(column_name, ',' ORDER BY column_name)
FROM information_schema.columns
WHERE table_schema='skill_registry'
  AND table_name='skill_control_events'
  AND column_name IN ('independent_reviewer_confirmed',
                      'reviewer_authorization_confirmed');
SELECT skill.slug, revision.id, revision.state,
       revision.reviewed_by IS NOT NULL AS reviewed,
       coalesce(revision.reviewed_by = revision.created_by, false) AS self_reviewed,
       artifact.artifact_sha256
FROM skill_registry.skill_revisions AS revision
JOIN skill_registry.skills AS skill ON skill.id = revision.skill_id
JOIN skill_registry.skill_revision_artifacts AS artifact
  ON artifact.revision_id = revision.id
WHERE revision.id = :'revision_id'::uuid;
SQL
```

Expected: the first two lines are `2:2` and
`reviewer_authorization_confirmed`. The third line is the fresh recorded UUID
and must be
`ai-system-knowledge|<REVISION_ID>|pending_review|f|f|<SMOKE_SHA>`. Stop Step 6
here; do not review or remove the smoke workspace yet.

- [ ] **Step 7: Run live health and browser smoke checks**

```bash
curl --noproxy '*' -fsS http://127.0.0.1:3000/api/health/ready
docker compose -p ai-agent-platform \
  --env-file /private/tmp/ai-agent-platform-skill-registry.env \
  -f compose.yaml \
  -f /private/tmp/ai-agent-platform-skill-registry-local.yaml ps
```

Expected: Web and Skill Registry are healthy; readiness returns HTTP 200. In
the already authenticated browser, open the exact revision UUID from Step 6,
check `确认审核账号具备审核权限并对本次发布负责`, approve, and observe HTTP 200
plus `published`. Rerun the exact UUID-filtered query from Step 6 once and
require `ai-system-knowledge|<REVISION_ID>|published|t|t|<SMOKE_SHA>`. Then run
`rm -rf "$SMOKE_ROOT"` and `trap - EXIT`; the EXIT trap is the failure-safe
cleanup. The isolated E2E—not the mutable live account—provides the deterministic
403 no-permission and 401 stale-assurance evidence.

- [ ] **Step 8: Final verification commit and handoff**

If verification required no code changes, do not create an empty commit. If verification fixes were required, rerun the exact failing gate first, then the complete affected gate, and commit only those fixes:

```bash
git status --short --branch
git log --oneline -8
```

Handoff must report: commits, exact passing commands/counts, explicit skips, live migration result, current revision state, and the still-unimplemented Agent runtime Skill loading boundary.

---

## Definition of done

- A workforce user with `admin:assistant:skills:review` and recent password/MFA can review a revision they created.
- A user without that permission, or without recent assurance, still cannot review.
- The fourth attestation is consistently named `reviewerAuthorizationConfirmed` / `reviewer_authorization_confirmed` across current API, UI, Registry, and database paths.
- Historical v1 evidence survives schema v2 migration; the old name exists only inside the v1 bootstrap and explicit migration assertions.
- Same-transaction review event binding, actor equality to `reviewed_by`, nonce uniqueness, immutable revision data, blocking Findings, and state transitions remain enforced.
- The macOS multi-root ZIP remains rejected and the UI explains the single-root, `__MACOSX`, and manifest-name requirements.
- Unit, integration, E2E, static analysis, formatting, build, stateful migration, live health, and browser smoke evidence are all recorded honestly.
- Publishing still does not load the Skill into Agent runtime; that remains the next phase.

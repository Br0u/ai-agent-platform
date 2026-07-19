# CMS-Managed Nextra Documents Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace repository-backed public MDX with a real CMS workflow for safe Markdown drafts, immutable published revisions, audited lifecycle changes, and database-driven Nextra document pages.

**Architecture:** `@ai-agent-platform/document-content` converts bounded Markdown plus four directives into a versioned, sanitized HAST render model without dynamic code execution. PostgreSQL stores the mutable draft, append-only revisions, and permanent route registry; public pages only read the selected published revision. CMS mutations use transaction-scoped authorization, CAS, audit writes, and recent MFA for externally visible or destructive changes.

**Tech Stack:** TypeScript 5.9, Next.js 16 App Router/Server Actions, React 19, Nextra 4.6 display components, unified/remark/rehype, Zod 4, Drizzle ORM 0.45, PostgreSQL 18, Vitest 4, Playwright 1.61.

**Design:** `docs/superpowers/specs/2026-07-19-cms-managed-nextra-documents-design.md`

**Worktree note:** Do not create a clean worktree for this execution. The current worktree contains relevant, user-owned `/docs` layout and responsive UI changes that this feature must preserve. Stage exact files only; never stage `.gitignore`, `apps/web/next-env.d.ts`, `output/`, or unrelated user changes unless a task explicitly owns them.

---

## File map

### Shared document-content package

- Create `packages/document-content/package.json` — package exports and verification scripts.
- Create `packages/document-content/tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts` — package tooling.
- Create `packages/document-content/src/contracts.ts` — Zod limits, safe body, TOC, route and render-model types.
- Create `packages/document-content/src/markdown.ts` — Markdown/directive parser, resource limits, sanitized HAST and checksums.
- Create `packages/document-content/src/legacy-mdx.ts` — build-time-only conversion of the seven known MDX fixtures.
- Create `packages/document-content/src/seed.ts` — deterministic initial document manifest and SQL renderer.
- Create `packages/document-content/src/index.ts` — public exports.
- Create `packages/document-content/src/*.test.ts` — parser, security, legacy conversion and deterministic seed tests.
- Create immutable copies of `apps/web/src/content/*.mdx` and `_meta.ts` under `packages/document-content/fixtures/legacy/`; delete the runtime originals only after the public database switch is verified.

### Database

- Modify `packages/database/src/schema/content.ts` — lifecycle fields, revision table and route registry.
- Modify `packages/database/src/schema/access-control.test.ts` — schema constraints and indexes.
- Modify `packages/database/src/seed-access-control.ts` and tests — add super-admin-only `admin:docs:delete`.
- Create `packages/database/drizzle/0006_cms_documents.sql` — schema, transition triggers and append-only constraints.
- Create `packages/database/drizzle/0007_cms_document_seed.sql` — generated initial documents and render models.
- Modify `packages/database/drizzle/meta/_journal.json` and add generated snapshots as required by Drizzle.
- Modify `infra/postgres/02-runtime-grants.sql` — append-only revision and permanent route grants.
- Create `packages/database/src/document-role-boundary.integration.test.ts` — real runtime-role denial tests.
- Modify `packages/database/src/deployment-contracts.test.ts` — static grant and migration contracts.

### Web domain and audit

- Create `apps/web/src/server/documents/contracts.ts` — document DTOs, query/action input schemas and stable action states.
- Create `apps/web/src/server/documents/repository.ts` — Drizzle public/admin reads and mutation transactions.
- Create `apps/web/src/server/documents/service.ts` — lifecycle state machine, CAS and domain errors.
- Create `apps/web/src/server/documents/actions.ts` — Server Actions, assurance guards and cache invalidation.
- Create corresponding `*.test.ts` and PostgreSQL integration tests.
- Modify `apps/web/src/server/auth/audit.ts` and tests — document events, target type and transaction-scoped repository injection.

### CMS UI

- Replace `apps/web/src/app/admin/docs/page.tsx` scaffold with list/editor server page.
- Create `apps/web/src/components/admin/document-editor.tsx` and tests — accessible action-state editor.
- Create `apps/web/src/components/admin/document-manager.css` — CMS document layout.
- Create `apps/web/src/app/admin/docs/preview/[revisionId]/page.tsx` and tests — protected preview.
- Modify `apps/web/src/config/routes.ts` and tests — mark `/admin/docs` live and register preview behavior if needed.

### Public rendering

- Create `apps/web/src/components/documents/safe-document-renderer.tsx` and tests — HAST-to-React mapping without eval/HTML injection.
- Create `apps/web/src/components/documents/document-code-block.tsx` and tests — copyable code blocks.
- Modify the user-owned `docs-navigation.tsx`, `doc-reader-layout.tsx`, `docs-detail-layout.tsx`, and their tests to receive published navigation DTOs as props.
- Modify `apps/web/src/app/docs/page.tsx` and `apps/web/src/app/docs/[category]/page.tsx` to read database publications.
- Modify `apps/web/src/components/docs-content.ts` so static product claims remain separate from runtime document navigation.
- Modify `apps/web/next.config.ts` only after local content removal, retaining Nextra packages for components but removing file-content routing configuration if no longer required.

### Operations

- Create `docs/deployment/cms-document-migration.md` — backup, rollout, smoke and old-image rollback.
- Modify `docs/testing/README.md` and relevant deployment contracts.

---

## Chunk 1: Safe content model and database foundation

### Task 1: Build the bounded Markdown-to-HAST package

**Files:**
- Create: `packages/document-content/package.json`
- Create: `packages/document-content/tsconfig.json`
- Create: `packages/document-content/eslint.config.mjs`
- Create: `packages/document-content/vitest.config.ts`
- Create: `packages/document-content/src/contracts.ts`
- Create: `packages/document-content/src/markdown.ts`
- Create: `packages/document-content/src/index.ts`
- Test: `packages/document-content/src/contracts.test.ts`
- Test: `packages/document-content/src/markdown.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add package scaffolding and failing contract tests**

Define these public contracts in the test before implementation:

```ts
type DocumentNavigation = { label: string; code: string; position: number };
type SafeDocumentBodyV1 = {
  format: "safe-markdown-v1";
  source: string;
  checksum: string;
  navigation: DocumentNavigation;
  renderModel: { version: 1; root: SafeHastRoot; toc: Heading[] };
};

expect(() => parseDocumentDraft({ slug: "Bad Slug", source: "# OK", ... }))
  .toThrowError("DOCUMENT_INPUT_INVALID:slug");
```

Limits must cover source bytes, slug/title/summary/navigation lengths, position, AST node count, nesting depth, heading count and individual code-block size.

- [ ] **Step 2: Run contract tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/document-content test -- contracts.test.ts`

Expected: FAIL because the package/contracts do not exist.

- [ ] **Step 3: Implement the package and contract schemas**

Add direct dependencies for `zod`, `unified`, `remark-parse`, `remark-gfm`, `remark-directive`, `remark-rehype`, `rehype-sanitize`, `unist-util-visit`, `mdast-util-to-string`, `github-slugger`, and HAST/MDAST types. Do not rely on Nextra transitive dependencies.

- [ ] **Step 4: Write failing Markdown security tests**

Cover accepted Markdown and `:::callout`, `:::steps`, `:::cards`, and fenced `filetree`. Reject:

```ts
const rejected = [
  "<script>alert(1)</script>",
  "import x from 'x'",
  "export const x = 1",
  "# Hello {process.env.SECRET}",
  "<Unknown onClick={evil} />",
  ":::unknown\ntext\n:::",
  "[x](javascript:alert(1))",
  "![x](https://attacker.invalid/x.png)",
];
```

Also assert `JSON.stringify(renderModel)` contains none of `script`, `onClick`, `dangerouslySetInnerHTML`, `javascript:` or `style` properties.

Security cases must additionally prove that UTF-8 byte limits fail before parser invocation; every directive rejects missing, extra, expression or out-of-range attributes; links reject `http:`, protocol-relative, relative, backslash and percent/entity-encoded dangerous forms; images accept only normalized `/assets/...` paths and reject traversal, encoded separators and all remote origins.

- [ ] **Step 5: Run Markdown tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/document-content test -- markdown.test.ts`

Expected: FAIL because `compileSafeDocument` is absent.

- [ ] **Step 6: Implement one parse/sanitize/render-model pipeline**

Use `processor.parse(source)` then `processor.run(tree)`. Reject unsupported MDAST before remark-rehype. Transform only explicit directives, assign heading IDs with `github-slugger`, run `rehype-sanitize` with a narrow schema, count final HAST again, and compute SHA-256 over canonical JSON. Never call MDX compile/evaluate or `dangerouslySetInnerHTML`.

- [ ] **Step 7: Verify GREEN and package quality**

Run:

```bash
pnpm --filter @ai-agent-platform/document-content test
pnpm --filter @ai-agent-platform/document-content typecheck
pnpm --filter @ai-agent-platform/document-content lint
pnpm --filter @ai-agent-platform/document-content format:check
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit the shared parser**

Stage only the package, workspace lockfile changes, and no app files.

```bash
git commit -m "feat(cms): add safe document content pipeline"
```

### Task 2: Add CMS document schema, append-only constraints and permissions

**Files:**
- Modify: `packages/database/src/schema/content.ts`
- Modify: `packages/database/src/schema/access-control.test.ts`
- Modify: `packages/database/src/seed-access-control.ts`
- Modify: `packages/database/src/seed-access-control.test.ts`
- Modify: `packages/database/src/seed-access-control.integration.test.ts`
- Create: `packages/database/drizzle/0006_cms_documents.sql`
- Modify: `packages/database/drizzle/meta/_journal.json`
- Modify/add: `packages/database/drizzle/meta/*_snapshot.json`
- Modify: `infra/postgres/02-runtime-grants.sql`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Create: `packages/database/src/document-role-boundary.integration.test.ts`
- Modify: `packages/database/src/migrate.integration.test.ts`

- [ ] **Step 1: Write failing schema and permission tests**

Assert exports and constraints for:

```ts
content.revision;
content.rowVersion;
content.publishedRevision;
content.publishedBy;
content.archivedAt;
content.archivedBy;
content.deletedAt;
content.deletedBy;
contentRevisions;
contentRoutes;
```

Assert `admin:docs:delete` is absent from `content_operator` and `admin`, present only in `super_admin`.

- [ ] **Step 2: Run focused database tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/database test -- src/schema/access-control.test.ts src/seed-access-control.test.ts src/deployment-contracts.test.ts`

Expected: FAIL on missing schema, permission and grant contracts.

- [ ] **Step 3: Implement Drizzle schema and generate migration**

Use `integer` revisions/row versions, immutable revision UUIDs, `ON DELETE RESTRICT`, `(content_id, revision)` uniqueness, a composite FK from `content.(id, published_revision)` to `content_revisions.(content_id, revision)`, `content_route_state`, slug primary key, and a partial unique canonical-route index. Add `revision` and `row_version` with default `1`, then validate positive CHECK constraints; keep `published_revision` nullable and enforce `published_revision > 0 AND published_revision <= revision` when present. Existing non-document content therefore backfills safely without a revision pointer. Run:

```bash
pnpm --filter @ai-agent-platform/database exec drizzle-kit generate --name cms_documents
```

Review and amend the generated SQL with triggers that reject revision UPDATE/DELETE, route DELETE/rebind, any route insert whose initial state is not `reserved`, and state transitions other than `reserved → canonical → alias`. The seed must insert reserved routes before promoting them to canonical.

- [ ] **Step 4: Implement least-privilege grants**

After blanket runtime grants, revoke `DELETE, TRUNCATE` on `content`; revoke `UPDATE, DELETE, TRUNCATE` on `content_revisions`; revoke `DELETE, TRUNCATE` and table-level UPDATE on `content_routes`; grant only `UPDATE(state)`. Keep audit logs append-only.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `pnpm --filter @ai-agent-platform/database test -- src/schema/access-control.test.ts src/seed-access-control.test.ts src/deployment-contracts.test.ts`

Expected: PASS.

- [ ] **Step 6: Run real migration/grant boundary tests when URLs exist**

Update the migration journal assertion from 6 to 7 for this task, then run: `pnpm --filter @ai-agent-platform/database test -- src/migrate.integration.test.ts src/seed-access-control.integration.test.ts src/document-role-boundary.integration.test.ts`

Expected: PASS, or explicit skip listing missing approved PostgreSQL URLs. Never describe a skip as a passing DB test.

- [ ] **Step 7: Commit schema and privilege boundary**

```bash
git commit -m "feat(cms): add immutable document publication schema"
```

### Task 3: Generate and verify the seven-document backfill

**Files:**
- Create: `packages/document-content/src/legacy-mdx.ts`
- Create: `packages/document-content/src/legacy-mdx.test.ts`
- Create: `packages/document-content/src/seed.ts`
- Create: `packages/document-content/src/seed.test.ts`
- Modify: `packages/document-content/package.json`
- Create: `packages/document-content/fixtures/legacy/*.mdx`
- Create: `packages/document-content/fixtures/legacy/_meta.ts`
- Create: `packages/database/drizzle/0007_cms_document_seed.sql`
- Modify: `packages/database/drizzle/meta/_journal.json`
- Modify: `packages/database/src/migrate.integration.test.ts`

- [ ] **Step 1: Copy the current seven MDX files into immutable legacy fixtures**

Do not delete the runtime originals yet. Preserve byte-for-byte copies and record SHA-256 checksums in tests.

- [ ] **Step 2: Write failing conversion tests**

Assert `description` front matter becomes `summary`, imports are removed, and exact transformations hold:

```text
<Callout type="info">...</Callout> -> :::callout{type="info"} ... :::
<Steps>...</Steps>                  -> :::steps ... :::
<Cards.Card title="T" href="/x"/> -> - [T](/x)
<FileTree>...</FileTree>            -> ```filetree ... ```
```

Unknown imports/components or malformed known components must fail generation.

Use all seven source checksums. Cover the real nested FileTree hierarchy and all Cards wrapper/card attributes. Compare each generated safe source and render model with explicit expected fixtures so lost headings, code blocks, links or component content fail before SQL generation.

- [ ] **Step 3: Run conversion tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/document-content test -- legacy-mdx.test.ts seed.test.ts`

Expected: FAIL because converter/generator are absent.

- [ ] **Step 4: Implement deterministic conversion and SQL generation**

Use a fixed manifest of UUID, slug, code and position. Call the production `compileSafeDocument` for each converted source. Render SQL with escaped JSONB and fixed IDs; if an existing ID/slug belongs to other content, raise instead of overwrite.

- [ ] **Step 5: Add `seed:generate` and `seed:check` scripts**

`seed:check` writes to a temporary path and byte-compares with `packages/database/drizzle/0007_cms_document_seed.sql`; it must never rewrite during tests.

- [ ] **Step 6: Verify GREEN and migration counts**

Run:

```bash
pnpm --filter @ai-agent-platform/document-content test -- legacy-mdx.test.ts seed.test.ts
pnpm --filter @ai-agent-platform/document-content seed:check
pnpm --filter @ai-agent-platform/database test -- src/migrate.test.ts
pnpm --filter @ai-agent-platform/database test -- src/migrate.integration.test.ts
```

Expected: PASS and generated migration contains seven content rows, seven revision rows and seven canonical routes.

Update `migrate.integration.test.ts` to expect eight journal entries and query exactly seven seeded `document` rows/revisions/canonical routes with stored checksums matching the generator manifest. Add a separate seed-body integration fixture that migrates only through `0006`, executes the actual generated `0007` SQL body twice against identical rows and proves the second application is a no-op, then recreates the through-`0006` database with a conflicting fixed slug/ID and proves `0007` fails without overwriting it. The generated seed uses exact-identity collision guards plus `ON CONFLICT DO NOTHING`; canonical promotion updates only rows still in `reserved`, so an identical second application does not attempt `canonical → canonical`.

- [ ] **Step 7: Commit generated backfill**

```bash
git commit -m "feat(cms): seed existing documents as published revisions"
```

## Chunk 2: Domain workflow and CMS

### Task 4: Add transaction-scoped audit support and document service

**Files:**
- Modify: `apps/web/src/server/auth/audit.ts`
- Modify: `apps/web/src/server/auth/audit.test.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/server/documents/contracts.ts`
- Create: `apps/web/src/server/documents/contracts.test.ts`
- Create: `apps/web/src/server/documents/repository.ts`
- Create: `apps/web/src/server/documents/repository.test.ts`
- Create: `apps/web/src/server/documents/service.ts`
- Create: `apps/web/src/server/documents/service.test.ts`
- Create: `apps/web/src/server/documents/postgres.integration.test.ts`

- [ ] **Step 1: Write failing audit injection tests**

Require `createDatabaseAuditRepository(database = getDatabase())` to write through the supplied transaction. Add typed events `document.created`, `document.draft_saved`, `document.published`, `document.archived`, `document.deleted`, `document.restored` and target `document`.

- [ ] **Step 2: Run audit tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/web test -- src/server/auth/audit.test.ts`

Expected: FAIL on missing event schemas/database injection.

- [ ] **Step 3: Implement audit changes and verify GREEN**

Metadata permits only `{ slug, revision, result }` with bounded primitive values. Never log source, renderModel, title or summary.

- [ ] **Step 4: Write failing domain tests**

Define `DocumentService` tests for paginated/searchable/status-filtered/sorted admin listing, create, save CAS, slug reservation, publish, rename publish/alias, draft isolation, archive, soft delete, restore, state conflicts, slug conflict, unsafe input and transaction rollback when permission/audit fails.

Make lifecycle assertions exact: create/save append exactly one revision; publish/archive/delete/restore append none; every successful mutation increments `rowVersion`; stale row or draft revision produces no business write or audit; repeated publish/archive conflicts; delete forces archived; restore remains archived; archived same-revision republish succeeds; a permanent alias can never become canonical again.

Use an injected repository contract; mocks may model transaction outcomes but assertions must target domain behavior and exact commands, not Drizzle internals.

- [ ] **Step 5: Run service tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/web test -- src/server/documents/service.test.ts`

Expected: FAIL because service is absent.

- [ ] **Step 6: Implement the minimal repository/service**

Every mutation transaction must:

1. perform an authoritative `admin:docs` or `admin:docs:delete` query that locks `users`, `user_roles`, `roles`, `role_permissions`, and `permissions` with `FOR SHARE OF u, ur, r, rp, p`, matching the live registration repository pattern;
2. lock/read the current content row;
3. enforce `expectedRevision`/`expectedRowVersion` and state transition;
4. write content/revision/routes;
5. write typed audit via the same transaction;
6. return a DTO with no secret/internal error data.

- [ ] **Step 7: Verify unit and PostgreSQL integration behavior**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/documents
pnpm --filter @ai-agent-platform/web test -- src/server/documents/postgres.integration.test.ts
```

Expected: unit PASS; integration PASS or explicit environment skip.

The PostgreSQL integration suite must pause after the transaction permission lock, attempt permission revocation on a second connection, prove revocation waits, then allow the mutation to commit and the revocation to finish. Also prove a revocation committed before transaction authorization causes denial.

- [ ] **Step 8: Commit domain workflow**

```bash
git commit -m "feat(cms): add audited document lifecycle service"
```

### Task 5: Wire document Server Actions

**Files:**
- Create: `apps/web/src/server/documents/actions.ts`
- Create: `apps/web/src/server/documents/actions.test.ts`

- [ ] **Step 1: Write failing action-boundary tests**

Assert create/save use normal `requirePermission("admin:docs")`; publish/archive use `requireSensitiveWorkforceAction("admin:docs")`; delete/restore use `requireSensitiveWorkforceAction("admin:docs:delete")`. Invalid return paths cannot redirect off-origin. Failed assurance must not call the service.

For every FormData action, test missing, duplicate, malformed, negative and oversized IDs/revision/row-version/text fields. Parse with the schemas in `documents/contracts.ts`, require `getAll(name).length === 1`, and prove invalid input never calls the service. Assert exact mappings for every documented domain/auth code, including `DOCUMENT_NOT_PUBLISHABLE`; unknown exceptions and raw PostgreSQL messages must be reported internally and rethrown or mapped to one generic internal code, never returned verbatim.

- [ ] **Step 2: Run action tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/web test -- src/server/documents/actions.test.ts`

Expected: FAIL because actions are absent.

- [ ] **Step 3: Implement stable action states and cache behavior**

Implement `createDocumentAction` plus save/publish/archive/delete/restore. Map only documented domain/auth codes. Every successful action calls `revalidatePath("/admin/docs")`; publish/archive/delete/restore additionally call `updateTag("documents")` and `revalidatePath("/docs", "layout")`. Reauth redirects only to fixed `/admin/docs` paths.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @ai-agent-platform/web test -- src/server/documents/actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit document actions**

```bash
git commit -m "feat(cms): add guarded document actions"
```

### Task 6: Replace the CMS scaffold with a usable document manager

**Files:**
- Modify: `apps/web/src/app/admin/docs/page.tsx`
- Create: `apps/web/src/app/admin/docs/page.test.tsx`
- Create: `apps/web/src/components/admin/document-editor.tsx`
- Create: `apps/web/src/components/admin/document-editor.test.tsx`
- Create: `apps/web/src/components/admin/document-manager.css`
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Modify: `apps/web/src/server/documents/contracts.ts`
- Modify: `apps/web/src/server/documents/contracts.test.ts`
- Modify: `apps/web/src/server/documents/repository.ts`
- Modify: `apps/web/src/server/documents/repository.test.ts`
- Modify: `apps/web/src/server/documents/postgres.integration.test.ts`
- Modify: `apps/web/src/server/documents/service.ts`
- Modify: `apps/web/src/server/documents/service.test.ts`
- Modify: `apps/web/src/server/documents/actions.ts`
- Modify: `apps/web/src/server/documents/actions.test.ts`
- Create: `apps/web/src/server/documents/server-actions.ts`
- Create: `apps/web/src/server/documents/server-actions.test.ts`

- [ ] **Step 1: Write failing selected-revision, page and editor tests**

Add a strict `SelectedDocumentDto` that extends the mutation `DocumentDto` with the real immutable `revisionId` UUID. Require `repository.getById` to join `content` to `content_revisions` on both `content_id` and the current integer `revision`; never derive or guess a revision UUID. Require `requirePermission("admin:docs")` before any document repository/service read and prove denial performs no read. Cover safe defaults for invalid/duplicate search params, search, status filters, deterministic sort, pagination, empty/error states, selected document fields, revision/publication status, labels, validation messages, pending buttons, the exact `/admin/docs/preview/[revisionId]` link without a revision query, publish/archive controls and super-admin-only delete/restore controls. Delete/restore visibility comes from the authoritative actor permission list containing `admin:docs:delete`, never a browser-provided role label. Prove a real editor remounts from document A to B without retaining A's uncontrolled field values. Prove client code imports only a dedicated top-level `"use server"` action module and exercise all six wrappers through that boundary. All controls require accessible names and status announcements.

- [ ] **Step 2: Run CMS UI tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/web test -- src/server/documents/contracts.test.ts src/server/documents/repository.test.ts src/server/documents/service.test.ts src/server/documents/actions.test.ts src/server/documents/server-actions.test.ts src/server/documents/postgres.integration.test.ts src/app/admin/docs/page.test.tsx src/components/admin/document-editor.test.tsx src/config/routes.test.ts`

Expected: FAIL because the selected-revision contract/join do not exist and `/admin/docs` remains scaffold.

- [ ] **Step 3: Implement the server page and focused client editor**

Keep search, status, sort, page, page size and selection in validated URL search params. Pass only `SelectedDocumentDto` to the editor, key the editor by document identity plus optimistic-concurrency values, and build preview URLs from its database-selected `revisionId`. Use `useActionState` for mutations, `useFormStatus` for pending states, hidden expected revision/row version fields, and a plain textarea with a short syntax guide. Put the six async client-callable wrappers in `server-actions.ts` with a top-level `"use server"`; keep action factories and state types in the server-only implementation module. Do not add a WYSIWYG editor.

- [ ] **Step 4: Add restrained responsive CMS styling**

Desktop uses list + editor columns; mobile stacks them. Reuse design tokens and existing CMS shell. No changes to the public docs CSS in this task.

- [ ] **Step 5: Mark the route live and verify GREEN**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/documents/contracts.test.ts src/server/documents/repository.test.ts src/server/documents/service.test.ts src/server/documents/actions.test.ts src/server/documents/server-actions.test.ts src/server/documents/postgres.integration.test.ts src/app/admin/docs/page.test.tsx src/components/admin/document-editor.test.tsx src/config/routes.test.ts
pnpm --filter @ai-agent-platform/web typecheck
env -u DATABASE_URL -u RUNTIME_DATABASE_URL_FILE DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid pnpm --filter @ai-agent-platform/web build
```

Expected: PASS.

- [ ] **Step 6: Commit CMS UI**

```bash
git add -- \
  apps/web/src/app/admin/docs/page.tsx \
  apps/web/src/app/admin/docs/page.test.tsx \
  apps/web/src/components/admin/document-editor.tsx \
  apps/web/src/components/admin/document-editor.test.tsx \
  apps/web/src/components/admin/document-manager.css \
  apps/web/src/config/routes.ts \
  apps/web/src/config/routes.test.ts \
  apps/web/src/server/documents/contracts.ts \
  apps/web/src/server/documents/contracts.test.ts \
  apps/web/src/server/documents/repository.ts \
  apps/web/src/server/documents/repository.test.ts \
  apps/web/src/server/documents/postgres.integration.test.ts \
  apps/web/src/server/documents/service.ts \
  apps/web/src/server/documents/service.test.ts \
  apps/web/src/server/documents/actions.ts \
  apps/web/src/server/documents/actions.test.ts \
  apps/web/src/server/documents/server-actions.ts \
  apps/web/src/server/documents/server-actions.test.ts \
  docs/superpowers/plans/2026-07-19-cms-managed-nextra-documents.md
git commit -m "feat(cms): implement document management workspace"
```

## Chunk 3: Public switch, migration safety and acceptance

### Task 7: Add safe HAST rendering and dynamic navigation props

**Files:**
- Create: `apps/web/src/components/documents/safe-document-renderer.tsx`
- Create: `apps/web/src/components/documents/safe-document-renderer.test.tsx`
- Create: `apps/web/src/components/documents/document-code-block.tsx`
- Create: `apps/web/src/components/documents/document-code-block.test.tsx`
- Create: `apps/web/src/app/admin/docs/preview/[revisionId]/page.tsx`
- Create: `apps/web/src/app/admin/docs/preview/[revisionId]/page.test.tsx`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/components/docs-navigation.tsx`
- Modify: `apps/web/src/components/doc-category-cards.tsx`
- Modify: `apps/web/src/components/doc-reader-layout.tsx`
- Modify: `apps/web/src/components/docs-detail-layout.tsx`
- Modify: `apps/web/src/app/docs/docs-nextra.css`
- Modify: `apps/web/src/components/doc-reader-layout.css`
- Add: `apps/web/public/assets/docs-background.webp`
- Modify: existing corresponding tests

- [ ] **Step 1: Write failing renderer tests**

Render a valid version-1 model and assert headings/IDs, tables, links, callout, steps, cards, filetree and code copy control. Assert malformed/unknown elements or properties render a safe unavailable state and never produce script, style, event handlers or raw HTML.

- [ ] **Step 2: Run renderer tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/web test -- src/components/documents`

Expected: FAIL because renderer is absent.

- [ ] **Step 3: Implement versioned HAST-to-React mapping**

Use `hast-util-to-jsx-runtime` with React `Fragment/jsx/jsxs` and explicit components. Validate the complete render model with the shared schema before mapping. The copy button receives only extracted text.

- [ ] **Step 4: Write and implement protected preview tests**

Assert `admin:docs` permission gate, exact revision lookup, safe renderer use, 404 for missing/deleted documents, and `robots: noindex, nofollow`. Run the focused route test RED before implementation and GREEN afterward.

- [ ] **Step 5: Lock the current static-navigation layout baseline**

Extend the current layout tests to assert sidebar, mobile navigation, overview cards and pager remain internally consistent with the existing static `docsCategories` source. Do not introduce required `documents` props in this task; the public route callers still use the file-backed source until Task 8 switches the complete call graph atomically.

- [ ] **Step 6: Adapt the current user-owned layouts without visual rollback**

Preserve current class names, background asset, sidebar, mobile details, TOC and responsive CSS. Treat the pre-existing docs UI files as the approved visual baseline, review their complete diff before staging, and include them only in the docs renderer/public commits where they are directly required. Continue excluding unrelated `.gitignore`, `apps/web/next-env.d.ts` and `output/` changes.

- [ ] **Step 7: Verify GREEN**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/documents 'src/app/admin/docs/preview/[revisionId]/page.test.tsx' src/components/docs-detail-layout.test.tsx src/components/doc-reader-layout.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit renderer, preview and data-driven layouts**

Stage only this exact allowlist. Inspect `git diff --cached --name-only` before committing and unstage anything else:

```bash
git add -- \
  apps/web/src/components/documents/safe-document-renderer.tsx \
  apps/web/src/components/documents/safe-document-renderer.test.tsx \
  apps/web/src/components/documents/document-code-block.tsx \
  apps/web/src/components/documents/document-code-block.test.tsx \
  'apps/web/src/app/admin/docs/preview/[revisionId]/page.tsx' \
  'apps/web/src/app/admin/docs/preview/[revisionId]/page.test.tsx' \
  apps/web/package.json \
  pnpm-lock.yaml \
  apps/web/src/components/docs-navigation.tsx \
  apps/web/src/components/doc-category-cards.tsx \
  apps/web/src/components/doc-reader-layout.tsx \
  apps/web/src/components/doc-reader-layout.test.tsx \
  apps/web/src/components/doc-reader-layout.css \
  apps/web/src/components/docs-detail-layout.tsx \
  apps/web/src/components/docs-detail-layout.test.tsx \
  apps/web/src/app/docs/docs-nextra.css \
  apps/web/public/assets/docs-background.webp
git diff --cached --name-only
git commit -m "feat(docs): render safe published document models"
```

The allowlist deliberately excludes `.gitignore`, `apps/web/next-env.d.ts` and `output/`. `doc-category-cards.tsx` is included because the new reader layout removes its old `useDocReader` export dependency; omitting that current baseline change would make a clean checkout fail typecheck.

### Task 8: Switch public routes to immutable publications

**Files:**
- Modify: `apps/web/src/app/docs/page.tsx`
- Create: `apps/web/src/app/docs/page.test.tsx`
- Modify: `apps/web/src/app/docs/[category]/page.tsx`
- Modify/create: `apps/web/src/app/docs/[category]/page.test.tsx`
- Modify: `apps/web/src/app/docs/layout.tsx`
- Modify: `apps/web/src/app/docs/docs-search.tsx`
- Modify: `apps/web/src/app/docs/docs-nextra.css`
- Modify: `apps/web/src/components/docs-content.ts`
- Create: `apps/web/src/components/docs-static-content.ts`
- Modify: `apps/web/src/components/docs-sections.tsx`
- Modify: `apps/web/src/components/docs-navigation.tsx`
- Modify: `apps/web/src/components/doc-category-cards.tsx`
- Modify: `apps/web/src/components/doc-reader-layout.tsx`
- Modify: `apps/web/src/components/doc-reader-layout.test.tsx`
- Modify: `apps/web/src/components/docs-detail-layout.tsx`
- Modify: `apps/web/src/components/docs-detail-layout.test.tsx`

- [ ] **Step 1: Write failing public route tests**

Cover published list, database failure state, current slug, alias permanent redirect, reserved/missing/deleted/archive 404, metadata from published revision, exact renderer model, and previous/next order. Prove the one bounded catalog cache reuses fulfilled results across many valid missing slugs while a rejected read is not cached and the next invocation succeeds. Prove published rows with missing canonical/all-route joins fail closed instead of disappearing. Exercise both page rendering and `generateMetadata`: metadata converts only a typed database-availability failure into safe fallback title/robots metadata, while `notFound()` and `permanentRedirect()` control-flow exceptions escape unchanged and are never converted into the generic database-unavailable state. In the same RED step, require `documents` props across `DocReaderLayout`, `DocsDetailLayout`, `DocsNavigation`, `DocsMobileNavigation` and `DocCategoryCards`, assert overview, sidebar, mobile navigation and pager receive the same ordered publication DTOs, and cover the CMS-backed lightweight search plus unavailable-route chrome.

- [ ] **Step 2: Run public route tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/web test -- src/app/docs/page.test.tsx 'src/app/docs/[category]/page.test.tsx' src/components/doc-reader-layout.test.tsx src/components/docs-detail-layout.test.tsx`

Expected: FAIL until the single bounded catalog cache, fail-closed route joins, client/server content split, CMS runtime search and unavailable-state chrome are implemented.

- [ ] **Step 3: Implement cached public queries**

Use one `unstable_cache` boundary tagged `documents` and one constant catalog cache scope; no user-controlled slug or route key may reach the cache API. The cached repository callback must throw typed database-read failures so a transient failure is never stored as a DTO, empty list or `null`. Join both all routes and the canonical route with `LEFT JOIN`, then reject missing/inconsistent routes during DTO parsing. Catch the typed availability error only outside the cache and render the documented generic unavailable state inside the shared public docs chrome.

After a successful cached lookup, invoke `permanentRedirect` for aliases and `notFound` for missing/unpublished documents outside every generic availability catch. Never broadly catch Next control-flow exceptions.

Mark both database-backed docs routes force-dynamic so production builds never require a live database; runtime database reads remain cached by the explicit `unstable_cache` boundary.

- [ ] **Step 4: Switch overview/detail routes and metadata**

Replace the layouts' static `docsCategories` imports with required `documents` props in the same atomic task that updates both public route callers. Pass the same ordered publication DTOs to overview, navigation and pager. Restore Navbar/search/footer through a shared public docs chrome. Search only a lightweight client projection of slug, title, summary, navigation label and code; never serialize the body to the client. Move legacy client marketing claims into `docs-static-content.ts`, leaving `docs-content.ts` server-only. Render only the selected published revision model.

- [ ] **Step 5: Stop runtime file-content routing but retain rollback payloads**

After route tests pass against database fixtures and immutable copies/checksums are verified, remove `importPage`/`nextra/pages`/`getPageMap` from the public route implementation. Keep `apps/web/src/content/*.mdx`, `_meta.ts` and the existing Nextra configuration in this release as non-runtime rollback payloads. Keep Nextra component/style imports used by the safe renderer.

- [ ] **Step 6: Verify route and build boundaries**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/docs src/components/documents src/components/doc-reader-layout.test.tsx src/components/docs-detail-layout.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
env -u DATABASE_URL -u RUNTIME_DATABASE_URL_FILE DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid pnpm --filter @ai-agent-platform/web build
```

Expected: PASS with public routes reading only immutable database publications; retained `src/content` files are not imported by runtime code. The deliberately unreachable database proves `next build` performs no document database read, regardless of a developer's existing `.env.local`.

- [ ] **Step 7: Commit public switch**

```bash
test -z "$(git diff --cached --name-only)"
git add -- \
  apps/web/src/app/docs/page.tsx \
  apps/web/src/app/docs/page.test.tsx \
  'apps/web/src/app/docs/[category]/page.tsx' \
  'apps/web/src/app/docs/[category]/page.test.tsx' \
  apps/web/src/app/docs/layout.tsx \
  apps/web/src/app/docs/docs-search.tsx \
  apps/web/src/app/docs/docs-nextra.css \
  apps/web/src/components/docs-content.ts \
  apps/web/src/components/docs-static-content.ts \
  apps/web/src/components/docs-sections.tsx \
  apps/web/src/components/docs-navigation.tsx \
  apps/web/src/components/doc-category-cards.tsx \
  apps/web/src/components/doc-reader-layout.tsx \
  apps/web/src/components/doc-reader-layout.test.tsx \
  apps/web/src/components/docs-detail-layout.tsx \
  apps/web/src/components/docs-detail-layout.test.tsx \
  docs/superpowers/plans/2026-07-19-cms-managed-nextra-documents.md
git diff --cached --name-only
git commit -m "feat(docs): read public documents from CMS publications"
```

The cached name list must equal the sixteen implementation paths above plus this plan file exactly before committing. If another staged file exists, stop without unstaging or overwriting the user's index.

### Task 9: Add rollout documentation and full acceptance

**Files:**
- Create: `docs/deployment/cms-document-migration.md`
- Modify: `docs/testing/README.md`
- Modify: `packages/database/src/deployment-contracts.test.ts`
- Create: `apps/web/e2e/cms-documents.spec.ts`
- Create: `docs/testing/run-cms-documents-e2e.sh`

- [ ] **Step 1: Write failing deployment-contract tests**

Require the runbook to state backup, seed checksum, seven-row validation, migration-before-Web order, no destructive DB rollback, old-image rollback, CMS smoke and public alias/404 checks.

- [ ] **Step 2: Run deployment tests and verify RED**

Run: `pnpm --filter @ai-agent-platform/database test -- src/deployment-contracts.test.ts`

Expected: FAIL because the runbook is absent.

- [ ] **Step 3: Write runbook and browser acceptance**

Browser flow at 1440×900 and 390×844:

1. authenticate as permitted workforce fixture;
2. open CMS document manager;
3. create/save/preview a draft;
4. publish and confirm public content;
5. save a new draft and confirm public content remains old;
6. publish renamed slug and confirm old slug redirects;
7. archive and confirm public 404;
8. republish and confirm recovery;
9. verify denied user cannot enter or mutate;
10. assert no console errors and no failed network responses outside expected 404/redirects.

- [ ] **Step 4: Run focused end-to-end and migration verification**

Run: `bash docs/testing/run-cms-documents-e2e.sh`

The runner contract is exact:

1. create a unique Compose project name and temporary secret directory, install an EXIT trap immediately, and generate only per-run test secrets;
2. build the current Web/migrator images, start an isolated PostgreSQL stack, run all migrations and seed/grant steps, then start the current Web image;
3. query PostgreSQL and fail unless there are exactly seven seeded `content` rows, seven revision-1 `content_revisions`, seven canonical `content_routes`, zero aliases/reserved routes, and every stored source/render checksum equals the checked-in manifest;
4. seed two deterministic workforce fixtures through test-only setup: one actor with `admin:docs`, `admin:docs:delete`, recent session/password assurance and recent MFA, and one active denied actor without those grants; never add a production fixture endpoint;
5. export the isolated Web URL as `BASE_URL` and run exactly `pnpm --filter @ai-agent-platform/web exec playwright test e2e/cms-documents.spec.ts --project=desktop --project=mobile --workers=1`;
6. after browser flow passes, poll `/docs` and all seven canonical document URLs every 15 seconds for 10 minutes; require every response to be non-5xx, require all seven expected published checksums on every pass, and require zero database/Web container restarts;
7. print the fixed marker `CMS documents E2E passed.` only after all checks pass;
8. the EXIT trap always runs `docker compose ... down -v --remove-orphans`, removes the temporary secrets/dumps, and fails if any container, volume or network bearing the unique project name remains.

Expected: the marker is printed and the script exits 0. If Docker, image build, PostgreSQL, browser, migration, fixture setup, soak or cleanup is unavailable/fails, print the exact failed boundary, exit non-zero, mark acceptance incomplete and do not start Task 10. There is no fixture-harness fallback for this gate.

- [ ] **Step 5: Commit the reviewed rollout assets**

```bash
test -z "$(git diff --cached --name-only)"
git add -- \
  docs/deployment/cms-document-migration.md \
  docs/testing/README.md \
  packages/database/src/deployment-contracts.test.ts \
  apps/web/e2e/cms-documents.spec.ts \
  docs/testing/run-cms-documents-e2e.sh
git diff --cached --name-only
git commit -m "test(cms): verify document publishing rollout"
```

The cached name list must equal the five paths above exactly before committing.

- [ ] **Step 6: Execute the phase-3 public rollout and stable observation**

This is a target-environment gate, not a local Compose substitute:

**Current execution boundary:** live repository inspection found no authorized target environment, public rollout origin, immutable image registry/repository, platform-specific push/deploy/rollback commands, backup command, deployment evidence sink or named release owner. Therefore this run must stop after Step 5 and report Phase 2/3 deployment pending unless the user supplies that deployment contract and authority. Do not invent commands, use a developer machine as the target, or treat the isolated runner as live evidence. Before resuming, record all nine values in the runbook and have the release owner approve them: target name, public origin, registry/repository, phase-2 digest, phase-3 digest, backup command, deploy command, rollback command and evidence sink.

1. record the currently serving pre-CMS Web image digest, immutable Task 7 phase-2 image digest, immutable Task 8/9 phase-3 image digest, target environment, release owner and a fresh backup identifier outside the repository;
2. execute Phase 2 first: backup → migrations/backfill → exact seven-row/revision/canonical-route/checksum validation → deploy the Task 7 image. Prove `/admin/docs` create/save/preview/publish works while the real public `/docs` route still serves bundled MDX and is unchanged by a new database publication;
3. keep the Task 7 image serving for a minimum 60-minute Phase-2 observation with zero CMS/public 5xx, database/Web restarts or document-read alerts. Failure rolls the application back to the recorded pre-CMS digest without rolling back the database;
4. only after Phase 2 passes, deploy the Task 8/9 phase-3 image so the target environment's real public `/docs` route switches to immutable database publications; run CMS and seven-document public smoke against that public origin;
5. exercise the Phase-3 application rollback once: restore the recorded Task 7 phase-2 digest without rolling back the database, verify all seven bundled-MDX public pages, then redeploy the Task 8/9 digest and repeat the exact database/public checks;
6. observe the re-switched database-backed public route for at least 24 continuous hours, polling `/docs` plus all seven canonical URLs every minute. Acceptance requires zero 5xx responses, zero checksum/content mismatches, zero unexpected redirects, zero Web/database restarts, and no document-read availability alerts;
7. retain timestamped checks, all three image digests, backup ID, Phase-2 evidence, Phase-3 rollback/redeploy results, observation start/end and release-owner approval in the deployment evidence system. Missing evidence or approval leaves Task 9 incomplete.

### Task 10: Remove the repository content source after the observation gate

**Gate:** Start this task only after both Task 9 gates pass: the isolated runner prints the exact success marker, and the target environment completes the public switch, rollback/redeploy drill, 24-hour stable observation and explicit release-owner approval. If either gate is skipped or fails, retain the MDX rollback payloads and report the migration as incomplete.

**Files:**
- Modify: `apps/web/next.config.ts`
- Delete: `apps/web/src/content/_meta.ts`
- Delete: `apps/web/src/content/quick-start.mdx`
- Delete: `apps/web/src/content/deployment.mdx`
- Delete: `apps/web/src/content/upgrade.mdx`
- Delete: `apps/web/src/content/operations.mdx`
- Delete: `apps/web/src/content/api.mdx`
- Delete: `apps/web/src/content/hardware.mdx`
- Delete: `apps/web/src/content/faq.mdx`
- Create: `apps/web/src/config/no-repository-docs.test.ts`

- [ ] **Step 1: Write a failing source-removal contract**

Assert no app source imports `nextra/pages`, `importPage`, `getPageMap` or `src/content`, and assert the Nextra wrapper/content directory configuration is absent. Preserve Nextra UI component/style dependencies still used by the safe renderer.

- [ ] **Step 2: Run the contract and verify RED**

Run: `pnpm --filter @ai-agent-platform/web test -- src/config/no-repository-docs.test.ts`

Expected: FAIL because rollback MDX and Nextra content configuration still exist.

- [ ] **Step 3: Delete rollback content and remove content-loader configuration**

Delete only the eight listed source files. Remove the `nextra({ contentDirBasePath: "/docs" })` wrapper from `next.config.ts` while retaining all unrelated Next configuration and the Nextra packages/components/styles that remain in use.

- [ ] **Step 4: Verify the cleanup and repeat the isolated pre-deployment gate**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/config/no-repository-docs.test.ts src/app/docs src/components/documents
pnpm --filter @ai-agent-platform/web typecheck
env -u DATABASE_URL -u RUNTIME_DATABASE_URL_FILE DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid pnpm --filter @ai-agent-platform/web build
bash docs/testing/run-cms-documents-e2e.sh
```

Expected: every command passes and the E2E runner again prints `CMS documents E2E passed.` after cleanup.

- [ ] **Step 5: Run fresh full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
env -u DATABASE_URL -u RUNTIME_DATABASE_URL_FILE DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid pnpm build
bash docs/testing/run-cms-documents-e2e.sh
git diff --check
git status --short
```

Expected: all commands exit 0; no generated `.next`, secrets, DB dumps or Playwright output are staged; unrelated user changes remain preserved.

- [ ] **Step 6: Commit repository-source cleanup**

```bash
test -z "$(git diff --cached --name-only)"
git add -A -- \
  apps/web/next.config.ts \
  apps/web/src/content/_meta.ts \
  apps/web/src/content/quick-start.mdx \
  apps/web/src/content/deployment.mdx \
  apps/web/src/content/upgrade.mdx \
  apps/web/src/content/operations.mdx \
  apps/web/src/content/api.mdx \
  apps/web/src/content/hardware.mdx \
  apps/web/src/content/faq.mdx \
  apps/web/src/config/no-repository-docs.test.ts
git diff --cached --name-only
git commit -m "refactor(docs): remove repository content source"
```

The cached name list must equal the ten paths above exactly before committing.

- [ ] **Step 7: Deploy and verify the phase-4 cleanup image**

Use the same user-supplied and approved target deployment contract from Task 9; absence of any value is a hard stop. Build an immutable target-environment image from the Task 10 commit and record its digest. Retain the accepted Task 8/9 phase-3 digest as the application rollback target. Deploy the cleanup digest without changing or rolling back the database, then repeat the CMS lifecycle smoke, seven canonical document checks, alias redirect and archive 404 against the real public origin. Observe for at least 60 continuous minutes with the same zero-5xx, zero-mismatch, zero-restart criteria; on failure restore the phase-3 digest. Store the cleanup digest, checks, timestamps and release-owner approval in the deployment evidence system.

- [ ] **Step 8: Review requirements line by line**

Re-read the design completion criteria and record evidence for CMS CRUD/lifecycle, immutable publication, safe renderer, authorization, CAS, audit, alias redirect, migration and responsive UI. A skipped or failed PostgreSQL/Docker acceptance means Task 10 cannot be complete.

---

## Execution rules

- Follow `@test-driven-development` for every behavior change: RED, observed failure, minimal GREEN, refactor.
- Use a fresh implementation subagent per task under `@subagent-driven-development`; root agent independently checks diffs and reruns tests before accepting work.
- Use `@verification-before-completion` before every completion claim and before the final handoff.
- Preserve all pre-existing user changes. Never blanket-stage the worktree.
- Do not treat skipped PostgreSQL/Docker tests as passing.
- Do not expose document source, render models, session data or secrets in logs/audit payloads.

import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertSafeIdentityMigrationTestDatabaseUrl,
  databaseSchema,
} from "@ai-agent-platform/database";

import { createDatabaseDocumentRepository } from "./repository";
import { createDocumentService, type DocumentRepository } from "./service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;

const context = {
  ipAddress: "203.0.113.20",
  userAgent: "document-integration-test",
};

async function waitForPostgresLock(
  pool: Pool,
  applicationName: string,
): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await pool.query<{ wait_event_type: string | null }>(
      `SELECT wait_event_type
       FROM pg_stat_activity
       WHERE application_name = $1 AND state = 'active'`,
      [applicationName],
    );
    if (result.rows[0]?.wait_event_type === "Lock") return;
    await delay(25);
  }
  throw new Error("Timed out waiting for PostgreSQL permission lock");
}

function draft(slug: string) {
  return {
    slug,
    title: `Title ${slug}`,
    summary: `Summary ${slug}`,
    source: `# ${slug}\n\nSafe body.`,
    navigation: { label: slug, code: "DOC", position: 1 },
  };
}

describePostgres("document PostgreSQL repository", () => {
  const pool = new Pool({ connectionString: safeUrl });
  const database = drizzle(pool, { schema: databaseSchema });
  const repository = createDatabaseDocumentRepository(database);
  const service = createDocumentService(repository);
  let adminId: string;
  let deniedId: string;

  async function seedActors() {
    adminId = randomUUID();
    deniedId = randomUUID();
    const roleId = randomUUID();
    const docsPermissionId = randomUUID();
    const deletePermissionId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, name, email, identity_realm, status)
       VALUES ($1, 'Document admin', $2, 'workforce', 'active'),
              ($3, 'Denied user', $4, 'workforce', 'active')`,
      [
        adminId,
        `${adminId}@example.test`,
        deniedId,
        `${deniedId}@example.test`,
      ],
    );
    await pool.query(
      `INSERT INTO roles (id, name, realm_scope)
       VALUES ($1, 'super_admin', 'workforce')`,
      [roleId],
    );
    await pool.query(
      `INSERT INTO permissions (id, key, name)
       VALUES ($1, 'admin:docs', 'Manage documents'),
              ($2, 'admin:docs:delete', 'Delete documents')`,
      [docsPermissionId, deletePermissionId],
    );
    await pool.query(
      "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
      [adminId, roleId],
    );
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       VALUES ($1, $2), ($1, $3)`,
      [roleId, docsPermissionId, deletePermissionId],
    );
  }

  beforeAll(async () => {
    await pool.query("select 1");
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE content_routes, content_revisions, content, audit_logs, role_permissions, user_roles, permissions, roles, sessions, accounts, users CASCADE",
    );
    await seedActors();
  });

  afterAll(async () => pool.end());

  it("commits one draft revision, reserved route and bounded audit atomically", async () => {
    const created = await service.create(
      draft(`draft-${randomUUID()}`),
      {
        userId: adminId,
      },
      context,
    );
    const result = await pool.query(
      `SELECT c.status::text, c.revision, c.row_version,
              (SELECT count(*)::int FROM content_revisions cr WHERE cr.content_id = c.id) AS revisions,
              r.state::text AS route_state, a.action, a.metadata
       FROM content c
       JOIN content_routes r ON r.content_id = c.id
       JOIN audit_logs a ON a.target_id = c.id::text
       WHERE c.id = $1`,
      [created.id],
    );
    expect(result.rows).toEqual([
      expect.objectContaining({
        status: "draft",
        revision: 1,
        row_version: 1,
        revisions: 1,
        route_state: "reserved",
        action: "document.created",
        metadata: {
          slug: created.slug,
          revision: 1,
          result: "success",
        },
      }),
    ]);
    expect(JSON.stringify(result.rows[0]?.metadata)).not.toMatch(
      /source|renderModel|title|summary/u,
    );
  });

  it("isolates a renamed draft then publishes through permanent route transitions", async () => {
    const originalSlug = `original-${randomUUID()}`;
    const renamedSlug = `renamed-${randomUUID()}`;
    const created = await service.create(draft(originalSlug), {
      userId: adminId,
    });
    const published = await service.publish(
      {
        id: created.id,
        expectedRevision: 1,
        expectedRowVersion: 1,
      },
      { userId: adminId },
    );
    const saved = await service.save(
      {
        ...draft(renamedSlug),
        id: created.id,
        expectedRevision: published.revision,
        expectedRowVersion: published.rowVersion,
      },
      { userId: adminId },
    );
    expect(saved).toMatchObject({
      revision: 2,
      rowVersion: 3,
      publishedRevision: 1,
      status: "published",
    });

    const republished = await service.publish(
      {
        id: saved.id,
        expectedRevision: 2,
        expectedRowVersion: 3,
      },
      { userId: adminId },
    );
    expect(republished).toMatchObject({
      revision: 2,
      publishedRevision: 2,
      rowVersion: 4,
    });
    const routes = await pool.query(
      "SELECT slug, state::text FROM content_routes WHERE content_id = $1 ORDER BY slug",
      [created.id],
    );
    expect(routes.rows).toEqual(
      [
        { slug: originalSlug, state: "alias" },
        { slug: renamedSlug, state: "canonical" },
      ].sort((left, right) => left.slug.localeCompare(right.slug)),
    );

    await expect(
      pool.query(
        "UPDATE content_routes SET state = 'canonical' WHERE slug = $1",
        [originalSlug],
      ),
    ).rejects.toThrow();
    await expect(
      service.save(
        {
          ...draft(originalSlug),
          id: republished.id,
          expectedRevision: republished.revision,
          expectedRowVersion: republished.rowVersion,
        },
        { userId: adminId },
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_SLUG_CONFLICT" });
    await expect(
      pool.query(
        "UPDATE content_revisions SET title = 'forbidden' WHERE content_id = $1",
        [created.id],
      ),
    ).rejects.toThrow();
  });

  it("reuses a canonical route for published A to draft B to draft A", async () => {
    const slugA = `published-a-${randomUUID()}`;
    const slugB = `published-b-${randomUUID()}`;
    const created = await service.create(draft(slugA), { userId: adminId });
    const publishedA = await service.publish(
      {
        id: created.id,
        expectedRevision: created.revision,
        expectedRowVersion: created.rowVersion,
      },
      { userId: adminId },
    );
    const draftB = await service.save(
      {
        ...draft(slugB),
        id: created.id,
        expectedRevision: publishedA.revision,
        expectedRowVersion: publishedA.rowVersion,
      },
      { userId: adminId },
    );
    const draftA = await service.save(
      {
        ...draft(slugA),
        id: created.id,
        expectedRevision: draftB.revision,
        expectedRowVersion: draftB.rowVersion,
      },
      { userId: adminId },
    );
    const republishedA = await service.publish(
      {
        id: created.id,
        expectedRevision: draftA.revision,
        expectedRowVersion: draftA.rowVersion,
      },
      { userId: adminId },
    );

    expect(republishedA).toMatchObject({
      slug: slugA,
      revision: 3,
      publishedRevision: 3,
      rowVersion: 5,
    });
    const routes = await pool.query(
      "SELECT slug, state::text FROM content_routes WHERE content_id = $1 ORDER BY slug",
      [created.id],
    );
    expect(routes.rows).toEqual(
      [
        { slug: slugA, state: "canonical" },
        { slug: slugB, state: "reserved" },
      ].sort((left, right) => left.slug.localeCompare(right.slug)),
    );
  });

  it("reuses a reserved route for pure draft A to B to A", async () => {
    const slugA = `draft-a-${randomUUID()}`;
    const slugB = `draft-b-${randomUUID()}`;
    const created = await service.create(draft(slugA), { userId: adminId });
    const draftB = await service.save(
      {
        ...draft(slugB),
        id: created.id,
        expectedRevision: created.revision,
        expectedRowVersion: created.rowVersion,
      },
      { userId: adminId },
    );
    const draftA = await service.save(
      {
        ...draft(slugA),
        id: created.id,
        expectedRevision: draftB.revision,
        expectedRowVersion: draftB.rowVersion,
      },
      { userId: adminId },
    );
    const publishedA = await service.publish(
      {
        id: created.id,
        expectedRevision: draftA.revision,
        expectedRowVersion: draftA.rowVersion,
      },
      { userId: adminId },
    );

    expect(publishedA).toMatchObject({
      slug: slugA,
      revision: 3,
      publishedRevision: 3,
      rowVersion: 4,
    });
  });

  it("rolls back route and draft writes when audit fails", async () => {
    const created = await service.create(draft(`audit-${randomUUID()}`), {
      userId: adminId,
    });
    const before = await pool.query(
      "SELECT slug, revision, row_version FROM content WHERE id = $1",
      [created.id],
    );
    const failingRepository: DocumentRepository = {
      ...repository,
      transaction: (work) =>
        repository.transaction((tx) =>
          work({
            ...tx,
            async appendAudit() {
              throw new Error("forced audit failure");
            },
          }),
        ),
    };
    await expect(
      createDocumentService(failingRepository).save(
        {
          ...draft(`rolled-back-${randomUUID()}`),
          id: created.id,
          expectedRevision: 1,
          expectedRowVersion: 1,
        },
        { userId: adminId },
      ),
    ).rejects.toThrow("forced audit failure");
    const after = await pool.query(
      "SELECT slug, revision, row_version FROM content WHERE id = $1",
      [created.id],
    );
    const counts = await pool.query(
      `SELECT (SELECT count(*)::int FROM content_revisions WHERE content_id = $1) AS revisions,
              (SELECT count(*)::int FROM content_routes WHERE content_id = $1) AS routes,
              (SELECT count(*)::int FROM audit_logs WHERE target_id = $1::text) AS audits`,
      [created.id],
    );
    expect(after.rows).toEqual(before.rows);
    expect(counts.rows).toEqual([{ revisions: 1, routes: 1, audits: 1 }]);
  });

  it("rejects stale CAS without business writes or audit", async () => {
    const created = await service.create(draft(`cas-${randomUUID()}`), {
      userId: adminId,
    });
    await expect(
      service.save(
        {
          ...draft(`stale-${randomUUID()}`),
          id: created.id,
          expectedRevision: 1,
          expectedRowVersion: 2,
        },
        { userId: adminId },
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_REVISION_CONFLICT" });
    const result = await pool.query(
      `SELECT c.revision, c.row_version,
              (SELECT count(*)::int FROM content_revisions WHERE content_id = c.id) AS revisions,
              (SELECT count(*)::int FROM audit_logs WHERE target_id = c.id::text) AS audits
       FROM content c WHERE c.id = $1`,
      [created.id],
    );
    expect(result.rows).toEqual([
      { revision: 1, row_version: 1, revisions: 1, audits: 1 },
    ]);
  });

  it("rolls back the content insert when the route slug is already reserved", async () => {
    const holderSlug = `holder-${randomUUID()}`;
    const slug = `conflict-${randomUUID()}`;
    const holder = await service.create(draft(holderSlug), { userId: adminId });
    await pool.query(
      `INSERT INTO content_routes (slug, content_id, state)
       VALUES ($1, $2, 'reserved')`,
      [slug, holder.id],
    );
    await expect(
      service.create(draft(slug), { userId: adminId }),
    ).rejects.toMatchObject({ code: "DOCUMENT_SLUG_CONFLICT" });
    const result = await pool.query(
      "SELECT count(*)::int AS total FROM content WHERE slug = $1",
      [slug],
    );
    expect(result.rows).toEqual([{ total: 0 }]);
  });

  it("lists explicit DTO fields without document bodies", async () => {
    const created = await service.create(draft(`list-${randomUUID()}`), {
      userId: adminId,
    });
    const result = await service.list(
      { search: created.slug, page: 1, pageSize: 10, sort: "title_asc" },
      { userId: adminId },
    );

    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: created.id,
      slug: created.slug,
    });
    expect(result.items[0]).not.toHaveProperty("body");
    expect(result.items[0]).not.toHaveProperty("renderModel");
  });

  it("selects the real UUID for the document current revision", async () => {
    const created = await service.create(draft(`selected-${randomUUID()}`), {
      userId: adminId,
    });
    const saved = await service.save(
      {
        ...draft(`selected-current-${randomUUID()}`),
        id: created.id,
        expectedRevision: created.revision,
        expectedRowVersion: created.rowVersion,
      },
      { userId: adminId },
    );
    const revisions = await pool.query<{ id: string; revision: number }>(
      `SELECT id::text, revision
       FROM content_revisions
       WHERE content_id = $1
       ORDER BY revision`,
      [created.id],
    );

    const selected = await service.getById(created.id, { userId: adminId });

    expect(revisions.rows).toHaveLength(2);
    expect(selected).toMatchObject({
      id: created.id,
      revision: saved.revision,
      revisionId: revisions.rows[1]?.id,
    });
    expect(selected?.revisionId).not.toBe(revisions.rows[0]?.id);
  });

  it("keeps paginated items and total in one repeatable-read snapshot", async () => {
    await service.create(draft(`snapshot-a-${randomUUID()}`), {
      userId: adminId,
    });
    await service.create(draft(`snapshot-b-${randomUUID()}`), {
      userId: adminId,
    });
    let markItemsRead!: () => void;
    let resumeCount!: () => void;
    let released = false;
    const itemsRead = new Promise<void>((resolve) => {
      markItemsRead = resolve;
    });
    const countBarrier = new Promise<void>((resolve) => {
      resumeCount = resolve;
    });
    const pausedService = createDocumentService(
      createDatabaseDocumentRepository(database, {
        async afterListItems() {
          markItemsRead();
          await countBarrier;
        },
      }),
    );
    const listing = pausedService.list(
      { page: 1, pageSize: 10, sort: "title_asc" },
      { userId: adminId },
    );

    try {
      await itemsRead;
      await service.create(draft(`snapshot-c-${randomUUID()}`), {
        userId: adminId,
      });
      resumeCount();
      released = true;
      const result = await listing;
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    } finally {
      if (!released) resumeCount();
      await listing.catch(() => undefined);
    }
  });

  it("holds permission rows until the authorized mutation commits", async () => {
    let markChecked!: () => void;
    let allowMutation!: () => void;
    const checked = new Promise<void>((resolve) => {
      markChecked = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      allowMutation = resolve;
    });
    const pausedRepository: DocumentRepository = {
      ...repository,
      transaction: (work) =>
        repository.transaction((tx) =>
          work({
            ...tx,
            async assertActiveWorkforcePermission(userId, permission, options) {
              await tx.assertActiveWorkforcePermission(
                userId,
                permission,
                options,
              );
              markChecked();
              await resume;
            },
          }),
        ),
    };
    const applicationName = `cms-permission-revoker-${randomUUID()}`;
    const revocationClient = await pool.connect();
    let barrierReleased = false;
    let revocationCommitted = false;
    let creation: Promise<unknown> | undefined;
    let revocation: Promise<unknown> | undefined;
    try {
      await revocationClient.query("BEGIN");
      await revocationClient.query(
        "SELECT set_config('application_name', $1, false)",
        [applicationName],
      );
      creation = createDocumentService(pausedRepository).create(
        draft(`locked-${randomUUID()}`),
        { userId: adminId },
      );
      await checked;
      revocation = revocationClient.query(
        "DELETE FROM user_roles WHERE user_id = $1",
        [adminId],
      );
      await waitForPostgresLock(pool, applicationName);
      allowMutation();
      barrierReleased = true;
      await creation;
      await revocation;
      await revocationClient.query("COMMIT");
      revocationCommitted = true;
    } finally {
      if (!barrierReleased) allowMutation();
      await creation?.catch(() => undefined);
      await revocation?.catch(() => undefined);
      if (!revocationCommitted) {
        await revocationClient.query("ROLLBACK").catch(() => undefined);
      }
      await revocationClient
        .query("SELECT set_config('application_name', '', false)")
        .catch(() => undefined);
      revocationClient.release();
    }
  });

  it("denies delete permission when a non-super role is misgranted in storage", async () => {
    const userId = randomUUID();
    const roleId = randomUUID();
    let triggerDisabled = false;
    try {
      await pool.query(
        `INSERT INTO users (id, name, email, identity_realm, status)
         VALUES ($1, 'Misgranted user', $2, 'workforce', 'active')`,
        [userId, `${userId}@example.test`],
      );
      await pool.query(
        `INSERT INTO roles (id, name, realm_scope)
         VALUES ($1, 'misgranted_document_deleter', 'workforce')`,
        [roleId],
      );
      await pool.query(
        "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
        [userId, roleId],
      );
      await pool.query(
        'ALTER TABLE role_permissions DISABLE TRIGGER "role_permissions_admin_docs_delete_guard"',
      );
      triggerDisabled = true;
      await pool.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, id FROM permissions WHERE key = 'admin:docs:delete'`,
        [roleId],
      );
      await pool.query(
        'ALTER TABLE role_permissions ENABLE TRIGGER "role_permissions_admin_docs_delete_guard"',
      );
      triggerDisabled = false;

      await expect(
        repository.transaction((tx) =>
          tx.assertActiveWorkforcePermission(userId, "admin:docs:delete", {
            requireSuperAdmin: true,
          }),
        ),
      ).rejects.toMatchObject({ code: "AUTH_PERMISSION_DENIED" });
    } finally {
      try {
        if (!triggerDisabled) {
          await pool.query(
            'ALTER TABLE role_permissions DISABLE TRIGGER "role_permissions_admin_docs_delete_guard"',
          );
          triggerDisabled = true;
        }
        await pool.query("DELETE FROM role_permissions WHERE role_id = $1", [
          roleId,
        ]);
      } finally {
        if (triggerDisabled) {
          await pool.query(
            'ALTER TABLE role_permissions ENABLE TRIGGER "role_permissions_admin_docs_delete_guard"',
          );
          triggerDisabled = false;
        }
      }
      await pool.query("DELETE FROM user_roles WHERE role_id = $1", [roleId]);
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      await pool.query("DELETE FROM roles WHERE id = $1", [roleId]);
    }
    expect(triggerDisabled).toBe(false);
  });

  it("denies a mutation when permission revocation committed first", async () => {
    await pool.query("DELETE FROM user_roles WHERE user_id = $1", [adminId]);
    await expect(
      service.create(draft(`denied-${randomUUID()}`), { userId: adminId }),
    ).rejects.toMatchObject({ code: "AUTH_PERMISSION_DENIED" });
    await expect(
      service.create(draft(`denied-${randomUUID()}`), { userId: deniedId }),
    ).rejects.toMatchObject({ code: "AUTH_PERMISSION_DENIED" });
    const result = await pool.query(
      "SELECT count(*)::int AS total FROM content",
    );
    expect(result.rows).toEqual([{ total: 0 }]);
  });
});

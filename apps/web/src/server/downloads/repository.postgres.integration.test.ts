import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "@ai-agent-platform/database";

import { downloadResourceRepository } from "./repository";

const requested = process.env.RUN_DOWNLOAD_RESOURCE_DB_TEST === "true";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (requested && !testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required when RUN_DOWNLOAD_RESOURCE_DB_TEST=true",
  );
}
const safeUrl = requested
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl!)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;

async function releaseContender(
  client: PoolClient,
  holdsLock: boolean,
  destroy: boolean,
) {
  let unlockError: Error | undefined;
  try {
    if (holdsLock) {
      await client.query("SELECT pg_advisory_unlock($1)", [
        "4922248911538569540",
      ]);
    }
  } catch (error) {
    unlockError =
      error instanceof Error
        ? error
        : new Error("Contender advisory unlock failed");
  }
  if (unlockError) client.release(unlockError);
  else if (destroy) client.release(true);
  else client.release();
  if (unlockError) throw unlockError;
}

describePostgres("download resource PostgreSQL repository", () => {
  const pool = new Pool({ connectionString: safeUrl });

  beforeAll(async () => {
    process.env.DATABASE_URL = safeUrl;
    await pool.query("select 1");
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE download_resources, download_resource_revisions, audit_logs CASCADE",
    );
  });

  afterAll(async () => pool.end());

  async function insertResource(input: {
    key: string;
    category?: "materials" | "software" | "deployment" | "whitepapers";
    sortOrder?: number;
    state?: "unpublished" | "published" | "downline";
    cleanupPending?: boolean;
    withArtifact?: boolean;
  }) {
    const id = randomUUID();
    const revisionId = randomUUID();
    await pool.query(
      `INSERT INTO download_resources (id, key, admin_label, state)
       VALUES ($1, $2, $2, 'unpublished')`,
      [id, input.key],
    );
    await pool.query(
      `INSERT INTO download_resource_revisions
       (id, resource_id, name, product, category, resource_type, description,
        sort_order, preview_policy, download_policy, pdf_object_key,
        cover_object_key, page_count, byte_size, sha256, cleanup_pending_at)
       VALUES ($1, $2, $3, '元启', $4, '彩页', 'description', $5, 'public',
               'public', $6, $7, $8, $9, $10, $11)`,
      [
        revisionId,
        id,
        input.key,
        input.category ?? "materials",
        input.sortOrder ?? 10,
        input.withArtifact === false ? null : `${input.key}.pdf`,
        input.withArtifact === false ? null : `${input.key}.webp`,
        input.withArtifact === false ? null : 1,
        input.withArtifact === false ? null : 100,
        input.withArtifact === false ? null : "a".repeat(64),
        input.cleanupPending ? new Date() : null,
      ],
    );
    if (input.cleanupPending !== true) {
      await pool.query(
        `UPDATE download_resources
         SET state = $3, draft_revision_id = CASE WHEN $3 = 'published' THEN NULL ELSE $2 END,
             published_revision_id = CASE WHEN $3 = 'published' THEN $2 ELSE NULL END
         WHERE id = $1`,
        [id, revisionId, input.state ?? "unpublished"],
      );
    }
    return { id, revisionId };
  }

  it("returns admin empty/unpublished rows and public rows in fixed category order", async () => {
    const emptyId = randomUUID();
    await pool.query(
      "INSERT INTO download_resources (id, key, admin_label) VALUES ($1, 'empty-row', 'empty-row')",
      [emptyId],
    );
    await insertResource({
      key: "white",
      category: "whitepapers",
      sortOrder: 30,
      state: "published",
    });
    await insertResource({
      key: "material-b",
      sortOrder: 20,
      state: "published",
    });
    await insertResource({
      key: "material-a",
      sortOrder: 10,
      state: "published",
    });
    await insertResource({ key: "draft-only", withArtifact: false });

    const admin = await downloadResourceRepository.listAdmin({
      search: "row",
      sort: "updated_desc",
      page: 1,
      pageSize: 20,
    });
    expect(admin.items.map((item) => item.key)).toEqual(["empty-row"]);
    expect(admin.items[0]).toMatchObject({
      state: "unpublished",
      publishedRevision: null,
      draftRevision: null,
    });
    const sorted = await downloadResourceRepository.listAdmin({
      search: "material",
      sort: "sort_asc",
      page: 1,
      pageSize: 20,
    });
    expect(sorted.items.map((item) => item.key)).toEqual([
      "material-a",
      "material-b",
    ]);
    const filtered = await downloadResourceRepository.listAdmin({
      search: "",
      category: "whitepapers",
      state: "published",
      sort: "updated_asc",
      page: 1,
      pageSize: 20,
    });
    expect(filtered.items.map((item) => item.key)).toEqual(["white"]);

    const publicRows = await downloadResourceRepository.listPublic();
    expect(publicRows.map((item) => item.key)).toEqual([
      "material-a",
      "material-b",
      "white",
    ]);
  });

  it("locks resources, applies row-version CAS and rolls revisions plus audit back together", async () => {
    const seeded = await insertResource({ key: "cas", withArtifact: false });
    const blocker = await pool.connect();
    await blocker.query("BEGIN");
    await blocker.query(
      "SELECT id FROM download_resources WHERE id = $1 FOR UPDATE",
      [seeded.id],
    );
    let entered = false;
    const waiting = downloadResourceRepository.transaction(async (tx) => {
      entered = true;
      return tx.lockResource(seeded.id);
    });
    await delay(80);
    expect(entered).toBe(true);
    let settled = false;
    void waiting.finally(() => {
      settled = true;
    });
    await delay(50);
    expect(settled).toBe(false);
    await blocker.query("ROLLBACK");
    blocker.release();
    await expect(waiting).resolves.toMatchObject({ id: seeded.id });

    await expect(
      downloadResourceRepository.transaction(async (tx) => {
        const revision = await tx.insertRevision({
          resourceId: seeded.id,
          name: "rollback",
          product: "元启",
          category: "materials",
          resourceType: "彩页",
          description: "rollback",
          sortOrder: 11,
          previewPolicy: "public",
          downloadPolicy: "public",
          pdfObjectKey: null,
          coverObjectKey: null,
          pageCount: null,
          byteSize: null,
          sha256: null,
          createdBy: null,
        });
        await tx.updateResourceCas({
          id: seeded.id,
          expectedRowVersion: 1,
          state: "unpublished",
          publishedRevisionId: null,
          draftRevisionId: revision.id,
        });
        await tx.appendAudit({
          event: "download_resource.draft_saved",
          target: { type: "download_resource", id: seeded.id },
          metadata: {
            key: "cas",
            rowVersion: 2,
            revisionId: revision.id,
            result: "success",
          },
        });
        throw new Error("rollback probe");
      }),
    ).rejects.toThrow("rollback probe");
    const after = await pool.query(
      `SELECT r.row_version,
              (SELECT count(*)::int FROM download_resource_revisions x WHERE x.resource_id = r.id) revisions,
              (SELECT count(*)::int FROM audit_logs a WHERE a.target_id = r.id::text) audits
       FROM download_resources r WHERE r.id = $1`,
      [seeded.id],
    );
    expect(after.rows[0]).toMatchObject({
      row_version: 1,
      revisions: 1,
      audits: 0,
    });
  });

  it("delegates complete artifacts and cleanup-pointer protection to PostgreSQL", async () => {
    const seeded = await insertResource({
      key: "constraints",
      withArtifact: false,
    });
    await expect(
      pool.query(
        `INSERT INTO download_resource_revisions
         (resource_id, name, product, category, resource_type, description,
          sort_order, preview_policy, download_policy, pdf_object_key)
         VALUES ($1, 'bad', '元启', 'materials', '彩页', 'bad', 1, 'public', 'public', 'only.pdf')`,
        [seeded.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        "UPDATE download_resource_revisions SET cleanup_pending_at = now() WHERE id = $1",
        [seeded.revisionId],
      ),
    ).rejects.toThrow();
  });

  it("switches and clears pointers, moves downline draft, reuses artifacts and detaches cleanup", async () => {
    const seeded = await insertResource({
      key: "lifecycle",
      state: "published",
    });
    const metadataEdit = await downloadResourceRepository.transaction(
      async (tx) => {
        const current = await tx.lockResource(seeded.id);
        expect(current).toMatchObject({ rowVersion: 1 });
        const artifact = await tx.getPreviewRevision(seeded.revisionId);
        if (!artifact) throw new Error("missing seeded revision");
        const revision = await tx.insertRevision({
          resourceId: seeded.id,
          name: "metadata edit",
          product: artifact.product,
          category: artifact.category,
          resourceType: artifact.resourceType,
          description: "same artifacts",
          sortOrder: artifact.sortOrder,
          previewPolicy: artifact.previewPolicy,
          downloadPolicy: artifact.downloadPolicy,
          pdfObjectKey: artifact.pdfObjectKey,
          coverObjectKey: artifact.coverObjectKey,
          pageCount: artifact.pageCount,
          byteSize: artifact.byteSize,
          sha256: artifact.sha256,
          createdBy: null,
        });
        const resource = await tx.updateResourceCas({
          id: seeded.id,
          expectedRowVersion: 1,
          state: "published",
          publishedRevisionId: seeded.revisionId,
          draftRevisionId: revision.id,
        });
        return { resource, revision };
      },
    );
    expect(metadataEdit.resource).toMatchObject({ rowVersion: 2 });
    expect(metadataEdit.revision).toMatchObject({
      pdfObjectKey: "lifecycle.pdf",
      coverObjectKey: "lifecycle.webp",
    });

    await downloadResourceRepository.transaction(async (tx) => {
      await expect(
        tx.updateResourceCas({
          id: seeded.id,
          expectedRowVersion: 2,
          state: "published",
          publishedRevisionId: metadataEdit.revision.id,
          draftRevisionId: null,
        }),
      ).resolves.toMatchObject({ rowVersion: 3, draftRevisionId: null });
      await expect(
        tx.updateResourceCas({
          id: seeded.id,
          expectedRowVersion: 3,
          state: "downline",
          publishedRevisionId: null,
          draftRevisionId: metadataEdit.revision.id,
        }),
      ).resolves.toMatchObject({ rowVersion: 4, state: "downline" });
      await expect(
        tx.updateResourceCas({
          id: seeded.id,
          expectedRowVersion: 3,
          state: "downline",
          publishedRevisionId: null,
          draftRevisionId: metadataEdit.revision.id,
        }),
      ).resolves.toBeNull();
      await expect(
        tx.markRevisionCleanupPending(seeded.revisionId),
      ).resolves.toMatchObject({ id: seeded.revisionId });
      await expect(tx.listCleanupPendingRevisions(seeded.id)).resolves.toEqual([
        expect.objectContaining({ id: seeded.revisionId }),
      ]);
      await expect(
        tx.getPreviewRevision(seeded.revisionId),
      ).resolves.toBeNull();

      const disposable = await tx.insertRevision({
        resourceId: seeded.id,
        name: "discarded metadata edit",
        product: metadataEdit.revision.product,
        category: metadataEdit.revision.category,
        resourceType: metadataEdit.revision.resourceType,
        description: "shared artifacts and detached pointers",
        sortOrder: metadataEdit.revision.sortOrder,
        previewPolicy: metadataEdit.revision.previewPolicy,
        downloadPolicy: metadataEdit.revision.downloadPolicy,
        pdfObjectKey: metadataEdit.revision.pdfObjectKey,
        coverObjectKey: metadataEdit.revision.coverObjectKey,
        pageCount: metadataEdit.revision.pageCount,
        byteSize: metadataEdit.revision.byteSize,
        sha256: metadataEdit.revision.sha256,
        createdBy: null,
      });
      await expect(
        tx.deleteDetachedRevision(disposable.id),
      ).resolves.toMatchObject({ id: disposable.id });
    });

    await expect(
      downloadResourceRepository.transaction((tx) =>
        tx.deleteDetachedRevision(metadataEdit.revision.id),
      ),
    ).rejects.toThrow();
  });

  it("counts PDF and cover references separately and excludes cleanup rows from preview", async () => {
    const first = await insertResource({ key: "refs-a", state: "published" });
    const second = await insertResource({ key: "refs-b", state: "published" });
    await pool.query(
      `UPDATE download_resource_revisions
       SET pdf_object_key = 'shared.pdf', cover_object_key = 'shared.webp'
       WHERE id = ANY($1::uuid[])`,
      [[first.revisionId, second.revisionId]],
    );
    const cleanup = await insertResource({
      key: "cleanup",
      cleanupPending: true,
    });

    await downloadResourceRepository.transaction(async (tx) => {
      await expect(
        tx.countArtifactReferences({
          pdfObjectKey: "shared.pdf",
          coverObjectKey: "shared.webp",
        }),
      ).resolves.toEqual({ pdfReferenceCount: 2, coverReferenceCount: 2 });
      await expect(
        tx.getPreviewRevision(cleanup.revisionId),
      ).resolves.toBeNull();
    });
  });

  it("keeps the session lock until post-commit cleanup and releases it afterward", async () => {
    const contender = await pool.connect();
    let contenderHoldsLock = false;
    let failed = false;
    let cleanupStarted = false;
    let allowCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => {
      allowCleanup = resolve;
    });
    const mutation = downloadResourceRepository.withArtifactMutationLock(
      async () => "committed",
      async () => {
        cleanupStarted = true;
        await cleanupGate;
      },
    );
    let mutationSettled = false;
    let mutationRejected = false;
    let mutationError: unknown;
    const observedMutation = mutation.then(
      () => {
        mutationSettled = true;
      },
      (error: unknown) => {
        mutationSettled = true;
        mutationRejected = true;
        mutationError = error;
      },
    );
    try {
      for (
        let attempt = 0;
        attempt < 200 && !cleanupStarted && !mutationSettled;
        attempt += 1
      ) {
        await delay(10);
      }
      if (mutationRejected) throw mutationError;
      if (mutationSettled) {
        throw new Error("Mutation ended before cleanup wait");
      }
      if (!cleanupStarted) {
        throw new Error("Timed out waiting for post-commit cleanup");
      }
      const during = await contender.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS acquired",
        ["4922248911538569540"],
      );
      contenderHoldsLock = during.rows[0]?.acquired === true;
      expect(contenderHoldsLock).toBe(false);
      allowCleanup();
      await expect(mutation).resolves.toBe("committed");
      const after = await contender.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS acquired",
        ["4922248911538569540"],
      );
      contenderHoldsLock = after.rows[0]?.acquired === true;
      expect(contenderHoldsLock).toBe(true);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      allowCleanup();
      for (let attempt = 0; attempt < 250 && !mutationSettled; attempt += 1) {
        await delay(10);
      }
      await releaseContender(contender, contenderHoldsLock, failed);
      if (!mutationSettled)
        throw new Error("Timed out settling artifact mutation");
      await observedMutation;
    }
  });

  it("unlocks the pinned session when post-commit cleanup fails", async () => {
    await expect(
      downloadResourceRepository.withArtifactMutationLock(
        async () => "committed",
        async () => {
          throw new Error("cleanup failed");
        },
      ),
    ).rejects.toThrow("cleanup failed");
    const contender = await pool.connect();
    let contenderHoldsLock = false;
    let failed = false;
    try {
      const acquired = await contender.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS acquired",
        ["4922248911538569540"],
      );
      contenderHoldsLock = acquired.rows[0]?.acquired === true;
      expect(contenderHoldsLock).toBe(true);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      await releaseContender(contender, contenderHoldsLock, failed);
    }
  });
});

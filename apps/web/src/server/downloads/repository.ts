import "server-only";

import { setTimeout as delay } from "node:timers/promises";

import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import type { Pool, PoolClient } from "pg";

import {
  databaseSchema,
  downloadResourceArtifacts,
  downloadResourceRevisions,
  downloadResources,
  getDatabase,
} from "@ai-agent-platform/database";

import {
  createAuditWriter,
  createDatabaseAuditRepository,
} from "../auth/audit";
import type { AdminDownloadQuery } from "./contracts";

const ARTIFACT_MUTATION_LOCK_KEY = "4922248911538569540";
const ARTIFACT_MUTATION_LOCK_TIMEOUT_MS = 7_400_000;
const ARTIFACT_MUTATION_LOCK_RETRY_MS = 1_000;
const publishedRevision = alias(
  downloadResourceRevisions,
  "published_revision",
);
const draftRevision = alias(downloadResourceRevisions, "draft_revision");

type Database = ReturnType<typeof getDatabase>;
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
type RevisionInsert = typeof downloadResourceRevisions.$inferInsert;
type ArtifactInsert = typeof downloadResourceArtifacts.$inferInsert;
type ResourceState = typeof downloadResources.$inferSelect.state;

const publishedRevisionColumns = getTableColumns(publishedRevision);
const draftRevisionColumns = getTableColumns(draftRevision);

const adminProjection = {
  id: downloadResources.id,
  key: downloadResources.key,
  adminLabel: downloadResources.adminLabel,
  kind: downloadResources.kind,
  state: downloadResources.state,
  publishedRevisionId: downloadResources.publishedRevisionId,
  draftRevisionId: downloadResources.draftRevisionId,
  rowVersion: downloadResources.rowVersion,
  createdAt: downloadResources.createdAt,
  updatedAt: downloadResources.updatedAt,
  publishedRevision: publishedRevisionColumns,
  draftRevision: draftRevisionColumns,
} as const;

async function withArtifacts<
  Row extends {
    publishedRevision: { id: string } | null;
    draftRevision: { id: string } | null;
  },
>(databaseTx: DatabaseTransaction, rows: Row[]) {
  const revisionIds = rows.flatMap((row) =>
    [row.publishedRevision?.id, row.draftRevision?.id].filter(
      (id): id is string => id !== undefined,
    ),
  );
  if (revisionIds.length === 0) {
    return rows.map((row) => ({
      ...row,
      publishedRevision: row.publishedRevision
        ? { ...row.publishedRevision, artifacts: [] }
        : null,
      draftRevision: row.draftRevision
        ? { ...row.draftRevision, artifacts: [] }
        : null,
    }));
  }
  const artifacts = await databaseTx
    .select()
    .from(downloadResourceArtifacts)
    .where(inArray(downloadResourceArtifacts.revisionId, revisionIds));
  const byRevision = new Map<string, typeof artifacts>();
  for (const artifact of artifacts) {
    const entries = byRevision.get(artifact.revisionId) ?? [];
    entries.push(artifact);
    byRevision.set(artifact.revisionId, entries);
  }
  return rows.map((row) => ({
    ...row,
    publishedRevision: row.publishedRevision
      ? {
          ...row.publishedRevision,
          artifacts: byRevision.get(row.publishedRevision.id) ?? [],
        }
      : null,
    draftRevision: row.draftRevision
      ? {
          ...row.draftRevision,
          artifacts: byRevision.get(row.draftRevision.id) ?? [],
        }
      : null,
  }));
}

async function publicWithArtifacts<
  Row extends { id: string; resourceKind: "document" | "software" },
>(databaseTx: DatabaseTransaction, rows: Row[]) {
  if (rows.length === 0) return rows.map((row) => ({ ...row, artifacts: [] }));
  const artifacts = await databaseTx
    .select()
    .from(downloadResourceArtifacts)
    .where(
      inArray(
        downloadResourceArtifacts.revisionId,
        rows.map((row) => row.id),
      ),
    );
  const byRevision = new Map<string, typeof artifacts>();
  for (const artifact of artifacts) {
    const entries = byRevision.get(artifact.revisionId) ?? [];
    entries.push(artifact);
    byRevision.set(artifact.revisionId, entries);
  }
  return rows.map((row) => ({
    ...row,
    artifacts: byRevision.get(row.id) ?? [],
  }));
}

const cleanPublishedJoin = and(
  eq(publishedRevision.resourceId, downloadResources.id),
  eq(publishedRevision.id, downloadResources.publishedRevisionId),
  isNull(publishedRevision.cleanupPendingAt),
);
const cleanDraftJoin = and(
  eq(draftRevision.resourceId, downloadResources.id),
  eq(draftRevision.id, downloadResources.draftRevisionId),
  isNull(draftRevision.cleanupPendingAt),
);

async function assertActiveWorkforcePermission(
  databaseTx: DatabaseTransaction,
  userId: string,
  permission: "admin:downloads",
) {
  const result = await databaseTx.execute(sql`
    SELECT u.id
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id AND r.realm_scope = 'workforce'
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE u.id = ${userId}
      AND u.identity_realm = 'workforce'
      AND u.status = 'active'
      AND p.key = ${permission}
    LIMIT 1
    FOR SHARE OF u, ur, r, rp, p
  `);
  if (result.rows.length !== 1) {
    throw Object.assign(new Error("AUTH_PERMISSION_DENIED"), {
      code: "AUTH_PERMISSION_DENIED" as const,
    });
  }
}

async function selectAdminById(databaseTx: DatabaseTransaction, id: string) {
  const rows = await databaseTx
    .select(adminProjection)
    .from(downloadResources)
    .leftJoin(publishedRevision, cleanPublishedJoin)
    .leftJoin(draftRevision, cleanDraftJoin)
    .where(eq(downloadResources.id, id))
    .limit(1);
  return (await withArtifacts(databaseTx, rows))[0] ?? null;
}

function transactionAdapter(databaseTx: DatabaseTransaction) {
  const audit = createAuditWriter(createDatabaseAuditRepository(databaseTx));

  return {
    assertActiveWorkforcePermission: (
      userId: string,
      permission: "admin:downloads",
    ) => assertActiveWorkforcePermission(databaseTx, userId, permission),

    async lockResource(id: string) {
      const rows = await databaseTx
        .select({ id: downloadResources.id })
        .from(downloadResources)
        .where(eq(downloadResources.id, id))
        .for("update");
      return rows.length === 1 ? selectAdminById(databaseTx, id) : null;
    },

    async lockResourceByKey(key: string) {
      const rows = await databaseTx
        .select({ id: downloadResources.id })
        .from(downloadResources)
        .where(eq(downloadResources.key, key))
        .for("update");
      return rows[0] ? selectAdminById(databaseTx, rows[0].id) : null;
    },

    async insertResource(input: {
      key: string;
      adminLabel: string;
      kind: "document" | "software";
    }) {
      const rows = await databaseTx
        .insert(downloadResources)
        .values(input)
        .returning();
      const row = rows[0];
      if (!row) throw new Error("Download resource insert returned no row");
      return row;
    },

    async insertRevision(input: RevisionInsert) {
      const rows = await databaseTx
        .insert(downloadResourceRevisions)
        .values(input)
        .returning();
      const row = rows[0];
      if (!row) throw new Error("Download revision insert returned no row");
      return row;
    },

    async insertArtifact(input: ArtifactInsert) {
      const rows = await databaseTx
        .insert(downloadResourceArtifacts)
        .values(input)
        .returning();
      const row = rows[0];
      if (!row) throw new Error("Download artifact insert returned no row");
      return row;
    },

    async cloneArtifacts(input: {
      sourceRevisionId: string;
      revisionId: string;
      revisionKind: "document" | "software";
    }) {
      const source = await databaseTx
        .select()
        .from(downloadResourceArtifacts)
        .where(
          eq(downloadResourceArtifacts.revisionId, input.sourceRevisionId),
        );
      if (source.length === 0) return [];
      return databaseTx
        .insert(downloadResourceArtifacts)
        .values(
          source.map((artifact) => ({
            slot: artifact.slot,
            objectKey: artifact.objectKey,
            originalFilename: artifact.originalFilename,
            extension: artifact.extension,
            mediaType: artifact.mediaType,
            byteSize: artifact.byteSize,
            sha256: artifact.sha256,
            pageCount: artifact.pageCount,
            coverObjectKey: artifact.coverObjectKey,
            revisionId: input.revisionId,
            revisionKind: input.revisionKind,
          })),
        )
        .returning();
    },

    async replaceArtifact(input: ArtifactInsert) {
      const replaced = await databaseTx
        .delete(downloadResourceArtifacts)
        .where(
          and(
            eq(downloadResourceArtifacts.revisionId, input.revisionId!),
            eq(downloadResourceArtifacts.slot, input.slot!),
          ),
        )
        .returning();
      const inserted = await databaseTx
        .insert(downloadResourceArtifacts)
        .values(input)
        .returning();
      const artifact = inserted[0];
      if (!artifact)
        throw new Error("Download artifact insert returned no row");
      return { artifact, replaced: replaced[0] ?? null };
    },

    async removeArtifact(input: {
      revisionId: string;
      slot: "document" | "windows" | "macos";
    }) {
      const rows = await databaseTx
        .delete(downloadResourceArtifacts)
        .where(
          and(
            eq(downloadResourceArtifacts.revisionId, input.revisionId),
            eq(downloadResourceArtifacts.slot, input.slot),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    async updateResourceCas(input: {
      id: string;
      expectedRowVersion: number;
      state: ResourceState;
      publishedRevisionId: string | null;
      draftRevisionId: string | null;
    }) {
      const rows = await databaseTx
        .update(downloadResources)
        .set({
          state: input.state,
          publishedRevisionId: input.publishedRevisionId,
          draftRevisionId: input.draftRevisionId,
          rowVersion: sql`${downloadResources.rowVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(downloadResources.id, input.id),
            eq(downloadResources.rowVersion, input.expectedRowVersion),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    async markRevisionCleanupPending(
      revisionId: string,
      cleanupErrorSummary: string | null = null,
    ) {
      const rows = await databaseTx
        .update(downloadResourceRevisions)
        .set({
          cleanupPendingAt: new Date(),
          cleanupErrorSummary,
        })
        .where(eq(downloadResourceRevisions.id, revisionId))
        .returning();
      return rows[0] ?? null;
    },

    async markRevisionPublished(revisionId: string) {
      const rows = await databaseTx
        .update(downloadResourceRevisions)
        .set({ publishedAt: new Date() })
        .where(
          and(
            eq(downloadResourceRevisions.id, revisionId),
            isNull(downloadResourceRevisions.cleanupPendingAt),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    async setCleanupError(revisionId: string, summary: string) {
      const rows = await databaseTx
        .update(downloadResourceRevisions)
        .set({ cleanupErrorSummary: summary })
        .where(
          and(
            eq(downloadResourceRevisions.id, revisionId),
            isNotNull(downloadResourceRevisions.cleanupPendingAt),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    async deleteCleanupRevision(revisionId: string) {
      const rows = await databaseTx
        .delete(downloadResourceRevisions)
        .where(
          and(
            eq(downloadResourceRevisions.id, revisionId),
            isNotNull(downloadResourceRevisions.cleanupPendingAt),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    async listCleanupPendingRevisions(resourceId: string) {
      const revisions = await databaseTx
        .select()
        .from(downloadResourceRevisions)
        .where(
          and(
            eq(downloadResourceRevisions.resourceId, resourceId),
            isNotNull(downloadResourceRevisions.cleanupPendingAt),
          ),
        )
        .orderBy(
          asc(downloadResourceRevisions.createdAt),
          asc(downloadResourceRevisions.id),
        );
      return publicWithArtifacts(databaseTx, revisions);
    },

    async deleteArtifactsForRevision(revisionId: string) {
      return databaseTx
        .delete(downloadResourceArtifacts)
        .where(eq(downloadResourceArtifacts.revisionId, revisionId))
        .returning();
    },

    async deleteDetachedRevision(revisionId: string) {
      const rows = await databaseTx
        .delete(downloadResourceRevisions)
        .where(
          and(
            eq(downloadResourceRevisions.id, revisionId),
            isNull(downloadResourceRevisions.cleanupPendingAt),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    async countArtifactReferences(input: {
      objectKey: string;
      excludeRevisionIds?: string[];
    }) {
      const exclusion = input.excludeRevisionIds?.length
        ? sql`AND revision_id <> ALL(${input.excludeRevisionIds}::uuid[])`
        : sql``;
      const result = await databaseTx.execute(sql`
        SELECT
          count(*) FILTER (WHERE object_key = ${input.objectKey})::int AS object_reference_count,
          count(*) FILTER (WHERE cover_object_key = ${input.objectKey})::int AS cover_reference_count
        FROM download_resource_artifacts
        WHERE 1 = 1 ${exclusion}
      `);
      const row = result.rows[0] as
        | { object_reference_count: number; cover_reference_count: number }
        | undefined;
      return {
        objectReferenceCount: row?.object_reference_count ?? 0,
        coverReferenceCount: row?.cover_reference_count ?? 0,
      };
    },

    async getPreviewRevision(revisionId: string) {
      const rows = await databaseTx
        .select()
        .from(downloadResourceRevisions)
        .where(
          and(
            eq(downloadResourceRevisions.id, revisionId),
            isNull(downloadResourceRevisions.cleanupPendingAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    appendAudit: audit.write,
  };
}

async function throwWithFinalizationErrors(
  primaryError: unknown,
  finalizationErrors: unknown[],
): Promise<never> {
  if (finalizationErrors.length === 0) throw primaryError;
  throw new AggregateError(
    [primaryError, ...finalizationErrors],
    "Artifact mutation and lock finalization failed",
  );
}

async function acquireArtifactMutationLock(pool: Pool): Promise<PoolClient> {
  const deadline = Date.now() + ARTIFACT_MUTATION_LOCK_TIMEOUT_MS;
  while (true) {
    const client = await pool.connect();
    let lock: { rows: Array<{ locked: boolean }> };
    try {
      lock = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [ARTIFACT_MUTATION_LOCK_KEY],
      );
    } catch (error) {
      client.release(error instanceof Error ? error : true);
      throw error;
    }
    if (lock.rows[0]?.locked === true) return client;
    client.release();
    if (Date.now() >= deadline) {
      throw new Error("Artifact mutation advisory lock timed out");
    }
    await delay(ARTIFACT_MUTATION_LOCK_RETRY_MS);
  }
}

export const downloadResourceRepository = {
  async listAdmin(query: AdminDownloadQuery) {
    return getDatabase().transaction(
      async (databaseTx) => {
        const filters = [];
        if (query.search) {
          const pattern = `%${query.search.replace(/[\\%_]/gu, "\\$&")}%`;
          filters.push(
            or(
              ilike(downloadResources.key, pattern),
              ilike(downloadResources.adminLabel, pattern),
              ilike(publishedRevision.name, pattern),
              ilike(draftRevision.name, pattern),
            )!,
          );
        }
        if (query.category) {
          filters.push(
            or(
              eq(draftRevision.category, query.category),
              and(
                isNull(draftRevision.id),
                eq(publishedRevision.category, query.category),
              ),
            )!,
          );
        }
        if (query.state) {
          filters.push(eq(downloadResources.state, query.state));
        }
        const where = filters.length === 0 ? undefined : and(...filters);
        const order = {
          updated_desc: desc(downloadResources.updatedAt),
          updated_asc: asc(downloadResources.updatedAt),
          sort_asc: asc(
            sql`COALESCE(${draftRevision.sortOrder}, ${publishedRevision.sortOrder}, 2147483647)`,
          ),
        }[query.sort];
        const base = databaseTx
          .select(adminProjection)
          .from(downloadResources)
          .leftJoin(publishedRevision, cleanPublishedJoin)
          .leftJoin(draftRevision, cleanDraftJoin);
        const rows = await base
          .where(where)
          .orderBy(order, asc(downloadResources.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize);
        const totals = await databaseTx
          .select({ total: count() })
          .from(downloadResources)
          .leftJoin(publishedRevision, cleanPublishedJoin)
          .leftJoin(draftRevision, cleanDraftJoin)
          .where(where);
        return {
          items: await withArtifacts(databaseTx, rows),
          total: totals[0]?.total ?? 0,
        };
      },
      { isolationLevel: "repeatable read" },
    );
  },

  async getAdminById(id: string) {
    return getDatabase().transaction((databaseTx) =>
      selectAdminById(databaseTx, id),
    );
  },

  async listPublic() {
    const rows = await getDatabase()
      .select({
        key: downloadResources.key,
        updatedAt: downloadResources.updatedAt,
        ...publishedRevisionColumns,
      })
      .from(downloadResources)
      .innerJoin(publishedRevision, cleanPublishedJoin)
      .where(
        and(
          eq(downloadResources.state, "published"),
          eq(downloadResources.kind, publishedRevision.resourceKind),
        ),
      )
      .orderBy(
        sql`CASE ${publishedRevision.category}
          WHEN 'materials' THEN 1
          WHEN 'software' THEN 2
          WHEN 'deployment' THEN 3
          WHEN 'whitepapers' THEN 4
          ELSE 5 END`,
        asc(publishedRevision.sortOrder),
        asc(downloadResources.id),
      );
    return getDatabase().transaction((databaseTx) =>
      publicWithArtifacts(databaseTx, rows),
    );
  },

  async getPublicByKey(key: string) {
    const rows = await getDatabase()
      .select({
        key: downloadResources.key,
        updatedAt: downloadResources.updatedAt,
        ...publishedRevisionColumns,
      })
      .from(downloadResources)
      .innerJoin(publishedRevision, cleanPublishedJoin)
      .where(
        and(
          eq(downloadResources.key, key),
          eq(downloadResources.state, "published"),
          eq(downloadResources.kind, publishedRevision.resourceKind),
        ),
      )
      .limit(1);
    return getDatabase().transaction(async (databaseTx) => {
      const withLoadedArtifacts = await publicWithArtifacts(databaseTx, rows);
      return withLoadedArtifacts[0] ?? null;
    });
  },

  async transaction<Result>(
    work: (tx: ReturnType<typeof transactionAdapter>) => Promise<Result>,
  ) {
    return getDatabase().transaction((databaseTx) =>
      work(transactionAdapter(databaseTx)),
    );
  },

  async withArtifactMutationLock<Result>(
    work: (tx: ReturnType<typeof transactionAdapter>) => Promise<Result>,
    postCommitCleanup?: (result: Result) => Promise<void>,
  ): Promise<Result> {
    const database = getDatabase() as Database & { $client: Pool };
    const client = await acquireArtifactMutationLock(database.$client);
    let result!: Result;
    let failed = false;
    let primaryError: unknown;
    let destroyReason: Error | undefined;
    const finalizationErrors: unknown[] = [];
    try {
      const pinnedDatabase = drizzle(client, { schema: databaseSchema });
      result = await pinnedDatabase.transaction((databaseTx) =>
        work(transactionAdapter(databaseTx)),
      );
      await postCommitCleanup?.(result);
    } catch (error) {
      failed = true;
      primaryError = error;
    } finally {
      try {
        const unlock = await client.query<{ unlocked: boolean }>(
          "SELECT pg_advisory_unlock($1) AS unlocked",
          [ARTIFACT_MUTATION_LOCK_KEY],
        );
        if (unlock.rows[0]?.unlocked !== true) {
          destroyReason = new Error(
            "Artifact mutation advisory unlock returned false",
          );
          finalizationErrors.push(destroyReason);
        }
      } catch (error) {
        finalizationErrors.push(error);
        destroyReason =
          error instanceof Error
            ? error
            : new Error("Artifact mutation advisory unlock failed");
      }
      try {
        client.release(destroyReason);
      } catch (error) {
        finalizationErrors.push(error);
      }
    }
    if (failed) {
      await throwWithFinalizationErrors(primaryError, finalizationErrors);
    }
    if (finalizationErrors.length > 0) {
      throw finalizationErrors.length === 1
        ? finalizationErrors[0]
        : new AggregateError(finalizationErrors, "Lock finalization failed");
    }
    return result;
  },
};

import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import type { Pool } from "pg";

import {
  databaseSchema,
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
type ResourceState = typeof downloadResources.$inferSelect.state;

const publishedRevisionColumns = getTableColumns(publishedRevision);
const draftRevisionColumns = getTableColumns(draftRevision);

const adminProjection = {
  id: downloadResources.id,
  key: downloadResources.key,
  adminLabel: downloadResources.adminLabel,
  state: downloadResources.state,
  publishedRevisionId: downloadResources.publishedRevisionId,
  draftRevisionId: downloadResources.draftRevisionId,
  rowVersion: downloadResources.rowVersion,
  createdAt: downloadResources.createdAt,
  updatedAt: downloadResources.updatedAt,
  publishedRevision: publishedRevisionColumns,
  draftRevision: draftRevisionColumns,
} as const;

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
  return rows[0] ?? null;
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

    async insertResource(input: { key: string; adminLabel: string }) {
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
      return databaseTx
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
      pdfObjectKey: string;
      coverObjectKey: string;
      excludeRevisionId?: string;
    }) {
      const exclusion = input.excludeRevisionId
        ? sql`AND id <> ${input.excludeRevisionId}`
        : sql``;
      const result = await databaseTx.execute(sql`
        SELECT
          count(*) FILTER (WHERE pdf_object_key = ${input.pdfObjectKey})::int AS pdf_reference_count,
          count(*) FILTER (WHERE cover_object_key = ${input.coverObjectKey})::int AS cover_reference_count
        FROM download_resource_revisions
        WHERE 1 = 1 ${exclusion}
      `);
      const row = result.rows[0] as
        | { pdf_reference_count: number; cover_reference_count: number }
        | undefined;
      return {
        pdfReferenceCount: row?.pdf_reference_count ?? 0,
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
        return { items: rows, total: totals[0]?.total ?? 0 };
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
    return getDatabase()
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
          isNotNull(publishedRevision.pdfObjectKey),
          isNotNull(publishedRevision.coverObjectKey),
          isNotNull(publishedRevision.pageCount),
          isNotNull(publishedRevision.byteSize),
          isNotNull(publishedRevision.sha256),
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
          isNotNull(publishedRevision.pdfObjectKey),
          isNotNull(publishedRevision.coverObjectKey),
          isNotNull(publishedRevision.pageCount),
          isNotNull(publishedRevision.byteSize),
          isNotNull(publishedRevision.sha256),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
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
    const client = await database.$client.connect();
    let locked = false;
    let result!: Result;
    let failed = false;
    let primaryError: unknown;
    let destroyReason: Error | undefined;
    const finalizationErrors: unknown[] = [];
    try {
      await client.query("SELECT pg_advisory_lock($1)", [
        ARTIFACT_MUTATION_LOCK_KEY,
      ]);
      locked = true;
      const pinnedDatabase = drizzle(client, { schema: databaseSchema });
      result = await pinnedDatabase.transaction((databaseTx) =>
        work(transactionAdapter(databaseTx)),
      );
      await postCommitCleanup?.(result);
    } catch (error) {
      failed = true;
      primaryError = error;
      if (!locked) {
        destroyReason =
          error instanceof Error
            ? error
            : new Error("Artifact mutation advisory lock acquisition failed");
      }
    } finally {
      if (locked) {
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

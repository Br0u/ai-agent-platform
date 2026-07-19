import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import {
  content,
  contentRevisions,
  contentRoutes,
  getDatabase,
} from "@ai-agent-platform/database";
import type { SafeDocumentBodyV1 } from "@ai-agent-platform/document-content";

import {
  createAuditWriter,
  createDatabaseAuditRepository,
} from "../auth/audit";
import { matchesPostgresConstraint } from "../registration/database-errors";
import {
  DocumentError,
  type AdminDocumentQuery,
  type DocumentDto,
  type DocumentListItemDto,
  type DocumentStatus,
} from "./contracts";
import type {
  DocumentRepository,
  DocumentTransaction,
  LockedDocument,
} from "./service";

type Database = ReturnType<typeof getDatabase>;
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
type ContentRow = typeof content.$inferSelect;
type DocumentListRow = Pick<
  ContentRow,
  | "id"
  | "slug"
  | "title"
  | "summary"
  | "status"
  | "revision"
  | "rowVersion"
  | "publishedRevision"
  | "deletedAt"
  | "updatedAt"
>;

const documentListProjection = {
  id: content.id,
  slug: content.slug,
  title: content.title,
  summary: content.summary,
  status: content.status,
  revision: content.revision,
  rowVersion: content.rowVersion,
  publishedRevision: content.publishedRevision,
  deletedAt: content.deletedAt,
  updatedAt: content.updatedAt,
} as const;

const SLUG_UNIQUE_CONSTRAINTS = new Set([
  "content_slug_unique",
  "content_routes_pkey",
]);

function rethrowSlugConflict(error: unknown): never {
  if (matchesPostgresConstraint(error, "23505", [...SLUG_UNIQUE_CONSTRAINTS])) {
    throw new DocumentError("DOCUMENT_SLUG_CONFLICT");
  }
  throw error;
}

function lockedDocument(row: ContentRow): LockedDocument {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? "",
    body: row.body as SafeDocumentBodyV1,
    status: row.status as DocumentStatus,
    revision: row.revision,
    rowVersion: row.rowVersion,
    publishedRevision: row.publishedRevision,
    publishedAt: row.publishedAt,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    updatedAt: row.updatedAt,
  };
}

function listItem(row: DocumentListRow): DocumentListItemDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? "",
    status: row.status as DocumentStatus,
    revision: row.revision,
    rowVersion: row.rowVersion,
    publishedRevision: row.publishedRevision,
    deleted: row.deletedAt !== null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dto(row: ContentRow): DocumentDto {
  return {
    ...listItem(row),
    body: row.body as SafeDocumentBodyV1,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

async function assertActiveWorkforcePermission(
  databaseTx: DatabaseTransaction,
  userId: string,
  permission: "admin:docs" | "admin:docs:delete",
  requireSuperAdmin = false,
): Promise<void> {
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
      AND (${requireSuperAdmin} = false OR r.name = 'super_admin')
    LIMIT 1
    FOR SHARE OF u, ur, r, rp, p
  `);
  if (result.rows.length !== 1) {
    throw new DocumentError("AUTH_PERMISSION_DENIED");
  }
}

function transactionAdapter(
  databaseTx: DatabaseTransaction,
): DocumentTransaction {
  const audit = createAuditWriter(createDatabaseAuditRepository(databaseTx));

  return {
    assertActiveWorkforcePermission: (userId, permission, options) =>
      assertActiveWorkforcePermission(
        databaseTx,
        userId,
        permission,
        options?.requireSuperAdmin === true,
      ),

    async lockDocument(id) {
      const rows = await databaseTx
        .select()
        .from(content)
        .where(and(eq(content.id, id), eq(content.type, "document")))
        .for("update");
      const row = rows[0];
      return row ? lockedDocument(row) : null;
    },

    async insertDocument(input) {
      try {
        const rows = await databaseTx
          .insert(content)
          .values({
            type: "document",
            slug: input.slug,
            title: input.title,
            summary: input.summary,
            body: input.body,
            status: "draft",
            revision: 1,
            rowVersion: 1,
            authorId: input.actorUserId,
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error("Document insert returned no row");
        return lockedDocument(row);
      } catch (error) {
        rethrowSlugConflict(error);
      }
    },

    async reserveSlug(slug, documentId) {
      const existing = await databaseTx.execute(sql`
        SELECT content_id::text, state::text
        FROM content_routes
        WHERE slug = ${slug}
        FOR UPDATE
      `);
      const route = existing.rows[0] as
        | { content_id: string; state: string }
        | undefined;
      if (route) {
        if (
          route.content_id === documentId &&
          (route.state === "reserved" || route.state === "canonical")
        ) {
          return;
        }
        throw new DocumentError("DOCUMENT_SLUG_CONFLICT");
      }
      try {
        await databaseTx
          .insert(contentRoutes)
          .values({ slug, contentId: documentId, state: "reserved" });
      } catch (error) {
        rethrowSlugConflict(error);
      }
    },

    async appendRevision(input) {
      await databaseTx.insert(contentRevisions).values({
        contentId: input.documentId,
        revision: input.revision,
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        body: input.body,
        createdBy: input.actorUserId,
      });
    },

    async saveDraft(input) {
      try {
        const rows = await databaseTx
          .update(content)
          .set({
            slug: input.slug,
            title: input.title,
            summary: input.summary,
            body: input.body,
            revision: input.revision,
            rowVersion: input.rowVersion,
            updatedAt: new Date(),
          })
          .where(
            and(eq(content.id, input.documentId), eq(content.type, "document")),
          )
          .returning();
        const row = rows[0];
        if (!row) throw new DocumentError("DOCUMENT_NOT_FOUND");
        return lockedDocument(row);
      } catch (error) {
        rethrowSlugConflict(error);
      }
    },

    async lockRouteState(slug, documentId) {
      const result = await databaseTx.execute(sql`
        SELECT state::text
        FROM content_routes
        WHERE slug = ${slug} AND content_id = ${documentId}
        FOR UPDATE
      `);
      const row = result.rows[0] as { state: string } | undefined;
      return row?.state === "reserved" ||
        row?.state === "canonical" ||
        row?.state === "alias"
        ? row.state
        : null;
    },

    async lockCanonicalSlug(documentId) {
      const result = await databaseTx.execute(sql`
        SELECT slug
        FROM content_routes
        WHERE content_id = ${documentId} AND state = 'canonical'
        FOR UPDATE
      `);
      return (result.rows[0] as { slug: string } | undefined)?.slug ?? null;
    },

    async demoteCanonicalToAlias(slug, documentId) {
      const rows = await databaseTx
        .update(contentRoutes)
        .set({ state: "alias" })
        .where(
          and(
            eq(contentRoutes.slug, slug),
            eq(contentRoutes.contentId, documentId),
            eq(contentRoutes.state, "canonical"),
          ),
        )
        .returning({ slug: contentRoutes.slug });
      if (rows.length !== 1)
        throw new DocumentError("DOCUMENT_NOT_PUBLISHABLE");
    },

    async promoteReservedToCanonical(slug, documentId) {
      const rows = await databaseTx
        .update(contentRoutes)
        .set({ state: "canonical" })
        .where(
          and(
            eq(contentRoutes.slug, slug),
            eq(contentRoutes.contentId, documentId),
            eq(contentRoutes.state, "reserved"),
          ),
        )
        .returning({ slug: contentRoutes.slug });
      if (rows.length !== 1)
        throw new DocumentError("DOCUMENT_NOT_PUBLISHABLE");
    },

    async publishDocument(input) {
      const rows = await databaseTx
        .update(content)
        .set({
          status: "published",
          publishedRevision: input.revision,
          publishedAt: new Date(),
          publishedBy: input.actorUserId,
          archivedAt: null,
          archivedBy: null,
          rowVersion: input.rowVersion,
          updatedAt: new Date(),
        })
        .where(
          and(eq(content.id, input.documentId), eq(content.type, "document")),
        )
        .returning();
      const row = rows[0];
      if (!row) throw new DocumentError("DOCUMENT_NOT_FOUND");
      return lockedDocument(row);
    },

    async archiveDocument(input) {
      const rows = await databaseTx
        .update(content)
        .set({
          status: "archived",
          archivedAt: new Date(),
          archivedBy: input.actorUserId,
          rowVersion: input.rowVersion,
          updatedAt: new Date(),
        })
        .where(
          and(eq(content.id, input.documentId), eq(content.type, "document")),
        )
        .returning();
      const row = rows[0];
      if (!row) throw new DocumentError("DOCUMENT_NOT_FOUND");
      return lockedDocument(row);
    },

    async deleteDocument(input) {
      const now = new Date();
      const rows = await databaseTx
        .update(content)
        .set({
          status: "archived",
          archivedAt: now,
          archivedBy: input.actorUserId,
          deletedAt: now,
          deletedBy: input.actorUserId,
          rowVersion: input.rowVersion,
          updatedAt: now,
        })
        .where(
          and(eq(content.id, input.documentId), eq(content.type, "document")),
        )
        .returning();
      const row = rows[0];
      if (!row) throw new DocumentError("DOCUMENT_NOT_FOUND");
      return lockedDocument(row);
    },

    async restoreDocument(input) {
      const rows = await databaseTx
        .update(content)
        .set({
          status: "archived",
          deletedAt: null,
          deletedBy: null,
          rowVersion: input.rowVersion,
          updatedAt: new Date(),
        })
        .where(
          and(eq(content.id, input.documentId), eq(content.type, "document")),
        )
        .returning();
      const row = rows[0];
      if (!row) throw new DocumentError("DOCUMENT_NOT_FOUND");
      return lockedDocument(row);
    },

    appendAudit: (event) => audit.write(event),
  };
}

export function createDatabaseDocumentRepository(
  database: Database = getDatabase(),
  hooks: { afterListItems?(): Promise<void> } = {},
): DocumentRepository {
  return {
    transaction: (work) =>
      database.transaction((databaseTx) =>
        work(transactionAdapter(databaseTx)),
      ),

    async list(query: AdminDocumentQuery, actorUserId: string) {
      return database.transaction(
        async (databaseTx) => {
          await assertActiveWorkforcePermission(
            databaseTx,
            actorUserId,
            "admin:docs",
          );
          const filters = [eq(content.type, "document")];
          if (query.status) filters.push(eq(content.status, query.status));
          if (query.search) {
            const pattern = `%${query.search.replace(/[\\%_]/gu, "\\$&")}%`;
            filters.push(
              or(
                ilike(content.slug, pattern),
                ilike(content.title, pattern),
                ilike(content.summary, pattern),
              )!,
            );
          }
          const order = {
            updated_desc: desc(content.updatedAt),
            updated_asc: asc(content.updatedAt),
            title_asc: asc(content.title),
            title_desc: desc(content.title),
          }[query.sort];
          const where = and(...filters);
          const rows = await databaseTx
            .select(documentListProjection)
            .from(content)
            .where(where)
            .orderBy(order, asc(content.id))
            .limit(query.pageSize)
            .offset((query.page - 1) * query.pageSize);
          await hooks.afterListItems?.();
          const totals = await databaseTx
            .select({ total: count() })
            .from(content)
            .where(where);
          return {
            items: rows.map(listItem),
            total: totals[0]?.total ?? 0,
          };
        },
        { isolationLevel: "repeatable read" },
      );
    },

    async getById(id: string, actorUserId: string) {
      return database.transaction(async (databaseTx) => {
        await assertActiveWorkforcePermission(
          databaseTx,
          actorUserId,
          "admin:docs",
        );
        const row = await databaseTx.query.content.findFirst({
          where: and(eq(content.id, id), eq(content.type, "document")),
        });
        return row ? dto(row) : null;
      });
    },
  };
}

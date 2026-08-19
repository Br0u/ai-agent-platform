import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  ForeignKeyBuilder,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./identity";

export const downloadResourceState = pgEnum("download_resource_state", [
  "unpublished",
  "published",
  "downline",
]);

export const downloadResourceAccess = pgEnum("download_resource_access", [
  "public",
  "contact",
]);

export const downloadResourceCategory = pgEnum("download_resource_category", [
  "materials",
  "software",
  "deployment",
  "whitepapers",
]);

export const downloadResourceKind = pgEnum("download_resource_kind", [
  "document",
  "software",
]);

export const downloadArtifactSlot = pgEnum("download_artifact_slot", [
  "document",
  "windows",
  "macos",
]);

function deferredForeignKey(
  name: string,
  columns: AnyPgColumn[],
  foreignColumns: () => AnyPgColumn[],
) {
  return new ForeignKeyBuilder(() => ({
    name,
    columns,
    foreignColumns: foreignColumns(),
  })).onDelete("restrict");
}

export const downloadResourceRevisions = pgTable(
  "download_resource_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceId: uuid("resource_id")
      .notNull()
      .references((): AnyPgColumn => downloadResources.id, {
        onDelete: "restrict",
      }),
    resourceKind: downloadResourceKind("resource_kind").notNull(),
    name: varchar("name", { length: 240 }).notNull(),
    product: varchar("product", { length: 80 }).notNull(),
    category: downloadResourceCategory("category").notNull(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    previewPolicy: downloadResourceAccess("preview_policy"),
    downloadPolicy: downloadResourceAccess("download_policy").notNull(),
    releaseVersion: varchar("release_version", { length: 40 }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    cleanupPendingAt: timestamp("cleanup_pending_at", { withTimezone: true }),
    cleanupErrorSummary: varchar("cleanup_error_summary", { length: 500 }),
  },
  (table) => [
    unique("download_resource_revisions_resource_id_id_unique").on(
      table.resourceId,
      table.id,
    ),
    unique("download_resource_revisions_id_kind_unique").on(
      table.id,
      table.resourceKind,
    ),
    deferredForeignKey(
      "download_resource_revisions_resource_kind_fk",
      [table.resourceId, table.resourceKind],
      (): AnyPgColumn[] => [downloadResources.id, downloadResources.kind],
    ),
    index("download_resource_revisions_resource_sort_idx").on(
      table.resourceId,
      table.sortOrder,
    ),
    index("download_resource_revisions_cleanup_pending_idx").on(
      table.cleanupPendingAt,
    ),
    check(
      "download_resource_revisions_access_check",
      sql`NOT (${table.previewPolicy} = 'contact' AND ${table.downloadPolicy} = 'public')`,
    ),
    check(
      "download_resource_revisions_kind_policy_check",
      sql`(
        ${table.resourceKind} = 'document'
        AND ${table.releaseVersion} IS NULL
        AND ${table.previewPolicy} IS NOT NULL
      ) OR (
        ${table.resourceKind} = 'software'
        AND ${table.releaseVersion} IS NOT NULL
        AND length(btrim(${table.releaseVersion})) BETWEEN 1 AND 40
        AND ${table.releaseVersion} !~ '[[:cntrl:]]'
        AND ${table.previewPolicy} IS NULL
        AND ${table.downloadPolicy} = 'public'
      )`,
    ),
  ],
);

export const downloadResourceArtifacts = pgTable(
  "download_resource_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    revisionId: uuid("revision_id").notNull(),
    revisionKind: downloadResourceKind("revision_kind").notNull(),
    slot: downloadArtifactSlot("slot").notNull(),
    objectKey: varchar("object_key", { length: 512 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    extension: varchar("extension", { length: 16 }).notNull(),
    mediaType: varchar("media_type", { length: 128 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    pageCount: integer("page_count"),
    coverObjectKey: varchar("cover_object_key", { length: 512 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("download_resource_artifacts_revision_id_slot_unique").on(
      table.revisionId,
      table.slot,
    ),
    deferredForeignKey(
      "download_resource_artifacts_revision_kind_fk",
      [table.revisionId, table.revisionKind],
      (): AnyPgColumn[] => [
        downloadResourceRevisions.id,
        downloadResourceRevisions.resourceKind,
      ],
    ),
    check(
      "download_resource_artifacts_byte_size_positive_check",
      sql`${table.byteSize} > 0`,
    ),
    check(
      "download_resource_artifacts_sha256_check",
      sql`${table.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "download_resource_artifacts_kind_slot_file_check",
      sql`(
        ${table.revisionKind} = 'document'
        AND ${table.slot} = 'document'
        AND ${table.extension} = '.pdf'
        AND ${table.mediaType} = 'application/pdf'
        AND ${table.pageCount} IS NOT NULL
        AND ${table.pageCount} > 0
        AND ${table.coverObjectKey} IS NOT NULL
      ) OR (
        ${table.revisionKind} = 'software'
        AND ${table.pageCount} IS NULL
        AND ${table.coverObjectKey} IS NULL
        AND (
          (${table.slot} = 'windows' AND (
            (${table.extension} = '.exe' AND ${table.mediaType} = 'application/vnd.microsoft.portable-executable')
            OR (${table.extension} = '.msi' AND ${table.mediaType} = 'application/x-msi')
            OR (${table.extension} = '.zip' AND ${table.mediaType} = 'application/zip')
          ))
          OR (${table.slot} = 'macos' AND (
            (${table.extension} = '.dmg' AND ${table.mediaType} = 'application/x-apple-diskimage')
            OR (${table.extension} = '.pkg' AND ${table.mediaType} = 'application/vnd.apple.installer+xml')
            OR (${table.extension} = '.zip' AND ${table.mediaType} = 'application/zip')
          ))
        )
      )`,
    ),
  ],
);

export const downloadResources = pgTable(
  "download_resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 120 }).notNull(),
    adminLabel: varchar("admin_label", { length: 240 }).notNull(),
    kind: downloadResourceKind("kind").notNull(),
    state: downloadResourceState("state").default("unpublished").notNull(),
    publishedRevisionId: uuid("published_revision_id"),
    draftRevisionId: uuid("draft_revision_id"),
    rowVersion: integer("row_version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("download_resources_key_unique").on(table.key),
    unique("download_resources_id_kind_unique").on(table.id, table.kind),
    index("download_resources_state_idx").on(table.state),
    check(
      "download_resources_row_version_positive_check",
      sql`${table.rowVersion} > 0`,
    ),
    check(
      "download_resources_state_pointer_check",
      sql`(${table.state} = 'published' AND ${table.publishedRevisionId} IS NOT NULL) OR (${table.state} = 'unpublished' AND ${table.publishedRevisionId} IS NULL) OR (${table.state} = 'downline' AND ${table.publishedRevisionId} IS NULL AND ${table.draftRevisionId} IS NOT NULL)`,
    ),
    deferredForeignKey(
      "download_resources_published_revision_fk",
      [table.id, table.publishedRevisionId],
      (): AnyPgColumn[] => [
        downloadResourceRevisions.resourceId,
        downloadResourceRevisions.id,
      ],
    ),
    deferredForeignKey(
      "download_resources_draft_revision_fk",
      [table.id, table.draftRevisionId],
      (): AnyPgColumn[] => [
        downloadResourceRevisions.resourceId,
        downloadResourceRevisions.id,
      ],
    ),
  ],
);

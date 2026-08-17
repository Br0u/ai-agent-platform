import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
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

export const downloadResourceRevisions = pgTable(
  "download_resource_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceId: uuid("resource_id")
      .notNull()
      .references((): AnyPgColumn => downloadResources.id, {
        onDelete: "restrict",
      }),
    name: varchar("name", { length: 240 }).notNull(),
    product: varchar("product", { length: 80 }).notNull(),
    category: downloadResourceCategory("category").notNull(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    previewPolicy: downloadResourceAccess("preview_policy").notNull(),
    downloadPolicy: downloadResourceAccess("download_policy").notNull(),
    pdfObjectKey: varchar("pdf_object_key", { length: 512 }),
    coverObjectKey: varchar("cover_object_key", { length: 512 }),
    pageCount: integer("page_count"),
    byteSize: integer("byte_size"),
    sha256: varchar("sha256", { length: 64 }),
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
    index("download_resource_revisions_resource_sort_idx").on(
      table.resourceId,
      table.sortOrder,
    ),
    index("download_resource_revisions_cleanup_pending_idx").on(
      table.cleanupPendingAt,
    ),
    check(
      "download_resource_revisions_artifacts_complete_check",
      sql`(${table.pdfObjectKey} IS NULL AND ${table.coverObjectKey} IS NULL AND ${table.pageCount} IS NULL AND ${table.byteSize} IS NULL AND ${table.sha256} IS NULL) OR (${table.pdfObjectKey} IS NOT NULL AND ${table.coverObjectKey} IS NOT NULL AND ${table.pageCount} IS NOT NULL AND ${table.byteSize} IS NOT NULL AND ${table.sha256} IS NOT NULL)`,
    ),
    check(
      "download_resource_revisions_page_count_positive_check",
      sql`${table.pageCount} IS NULL OR ${table.pageCount} > 0`,
    ),
    check(
      "download_resource_revisions_byte_size_positive_check",
      sql`${table.byteSize} IS NULL OR ${table.byteSize} > 0`,
    ),
    check(
      "download_resource_revisions_sha256_check",
      sql`${table.sha256} IS NULL OR ${table.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "download_resource_revisions_access_check",
      sql`NOT (${table.previewPolicy} = 'contact' AND ${table.downloadPolicy} = 'public')`,
    ),
  ],
);

export const downloadResources = pgTable(
  "download_resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 120 }).notNull(),
    adminLabel: varchar("admin_label", { length: 240 }).notNull(),
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
    index("download_resources_state_idx").on(table.state),
    check(
      "download_resources_row_version_positive_check",
      sql`${table.rowVersion} > 0`,
    ),
    check(
      "download_resources_state_pointer_check",
      sql`(${table.state} = 'published' AND ${table.publishedRevisionId} IS NOT NULL) OR (${table.state} = 'unpublished' AND ${table.publishedRevisionId} IS NULL) OR (${table.state} = 'downline' AND ${table.publishedRevisionId} IS NULL AND ${table.draftRevisionId} IS NOT NULL)`,
    ),
    foreignKey({
      name: "download_resources_published_revision_fk",
      columns: [table.id, table.publishedRevisionId],
      foreignColumns: [
        downloadResourceRevisions.resourceId,
        downloadResourceRevisions.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "download_resources_draft_revision_fk",
      columns: [table.id, table.draftRevisionId],
      foreignColumns: [
        downloadResourceRevisions.resourceId,
        downloadResourceRevisions.id,
      ],
    }).onDelete("restrict"),
  ],
);

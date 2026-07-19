import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./identity";

export const contentStatus = pgEnum("content_status", [
  "draft",
  "published",
  "archived",
]);

export const contentRouteState = pgEnum("content_route_state", [
  "reserved",
  "canonical",
  "alias",
]);

// Defined before `content` so the composite published-revision foreign key can
// use this table. The explicit AnyPgColumn return breaks the circular type
// inference while Drizzle still resolves the reference lazily.
export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentId: uuid("content_id")
      .notNull()
      .references((): AnyPgColumn => content.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    summary: varchar("summary", { length: 500 }),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("content_revisions_content_id_revision_unique").on(
      table.contentId,
      table.revision,
    ),
    check(
      "content_revisions_revision_positive_check",
      sql`${table.revision} > 0`,
    ),
  ],
);

export const content = pgTable(
  "content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    title: varchar("title", { length: 240 }).notNull(),
    summary: varchar("summary", { length: 500 }),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    status: contentStatus("status").default("draft").notNull(),
    revision: integer("revision").default(1).notNull(),
    rowVersion: integer("row_version").default(1).notNull(),
    publishedRevision: integer("published_revision"),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => users.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("content_revision_positive_check", sql`${table.revision} > 0`),
    check("content_row_version_positive_check", sql`${table.rowVersion} > 0`),
    check(
      "content_published_revision_check",
      sql`${table.publishedRevision} IS NULL OR (${table.publishedRevision} > 0 AND ${table.publishedRevision} <= ${table.revision})`,
    ),
    foreignKey({
      name: "content_published_revision_fk",
      columns: [table.id, table.publishedRevision],
      foreignColumns: [contentRevisions.contentId, contentRevisions.revision],
    }).onDelete("restrict"),
  ],
);

export const contentRoutes = pgTable(
  "content_routes",
  {
    slug: varchar("slug", { length: 180 }).primaryKey(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => content.id, { onDelete: "restrict" }),
    state: contentRouteState("state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("content_routes_one_canonical_per_content_unique")
      .on(table.contentId)
      .where(sql`${table.state} = 'canonical'`),
  ],
);

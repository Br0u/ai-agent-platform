import {
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const contentStatus = pgEnum("content_status", [
  "draft",
  "published",
  "archived",
]);

export const content = pgTable("content", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: varchar("type", { length: 64 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  title: varchar("title", { length: 240 }).notNull(),
  summary: varchar("summary", { length: 500 }),
  body: jsonb("body").$type<Record<string, unknown>>().notNull(),
  status: contentStatus("status").default("draft").notNull(),
  authorId: uuid("author_id").references(() => users.id, {
    onDelete: "set null",
  }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

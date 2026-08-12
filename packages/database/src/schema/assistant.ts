import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./identity";

export const assistantInputPolicy = pgTable(
  "assistant_input_policy",
  {
    id: integer("id").default(1).primaryKey(),
    terms: jsonb("terms").$type<string[]>().default([]).notNull(),
    revision: integer("revision").default(1).notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("assistant_input_policy_id_singleton_check", sql`${table.id} = 1`),
    check(
      "assistant_input_policy_revision_positive_check",
      sql`${table.revision} > 0`,
    ),
  ],
);

import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./identity";
import { organizations } from "./organizations";

export const registrationStatus = pgEnum("registration_status", [
  "pending_review",
  "approved",
  "rejected",
  "cancelled",
]);

export const LEGACY_REGISTRATION_COMPANY_NAME =
  "__aap_legacy_missing_company_name_v1__";

export const customerRegistrations = pgTable(
  "customer_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    companyName: varchar("company_name", { length: 240 }).notNull(),
    status: registrationStatus("status").default("pending_review").notNull(),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewNote: text("review_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("customer_registrations_user_id_idx").on(table.userId),
    index("customer_registrations_organization_id_idx").on(
      table.organizationId,
    ),
    index("customer_registrations_reviewer_user_id_idx").on(
      table.reviewerUserId,
    ),
    index("customer_registrations_status_created_id_idx").on(
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

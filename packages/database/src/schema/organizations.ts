import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./identity";

export const organizationStatus = pgEnum("organization_status", [
  "pending_review",
  "active",
  "disabled",
  "rejected",
]);

export const organizationMemberRole = pgEnum("organization_member_role", [
  "owner",
  "admin",
  "member",
]);

export function normalizeOrganizationLegalNameKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

/**
 * The database can enforce the basic key shape, but not Unicode NFKC. All
 * organization create/update writes must pass through this constructor.
 */
export function organizationValuesFromLegalName(legalName: string): {
  legalName: string;
  legalNameKey: string;
} {
  const trimmedLegalName = legalName.trim();
  const legalNameKey = normalizeOrganizationLegalNameKey(legalName);

  if (!legalNameKey) {
    throw new Error(
      "Organization legal name must not be empty after normalization",
    );
  }

  return { legalName: trimmedLegalName, legalNameKey };
}

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legalName: varchar("legal_name", { length: 240 }).notNull(),
    legalNameKey: varchar("legal_name_key", { length: 240 }).notNull(),
    status: organizationStatus("status").default("pending_review").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("organizations_legal_name_key_unique").on(table.legalNameKey),
    check(
      "organizations_legal_name_key_normalized_check",
      sql`${table.legalNameKey} <> '' AND ${table.legalNameKey} = lower(${table.legalNameKey}) AND ${table.legalNameKey} = regexp_replace(${table.legalNameKey}, '^[[:space:]]+|[[:space:]]+$', '', 'g') AND ${table.legalNameKey} !~ '[[:space:]]{2,}'`,
    ),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: organizationMemberRole("role").default("member").notNull(),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
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
    unique("organization_memberships_organization_id_user_id_unique").on(
      table.organizationId,
      table.userId,
    ),
    index("organization_memberships_user_id_idx").on(table.userId),
    index("organization_memberships_assigned_by_user_id_idx").on(
      table.assignedByUserId,
    ),
  ],
);

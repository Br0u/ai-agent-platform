import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const identityRealm = pgEnum("identity_realm", [
  "customer",
  "workforce",
]);

export const userStatus = pgEnum("user_status", [
  "pending_review",
  "active",
  "disabled",
  "rejected",
]);

export const emailVerificationStatus = pgEnum("email_verification_status", [
  "unverified",
  "pending",
  "verified",
]);

export function normalizeIdentityEmail(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function normalizeWorkforceUsername(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    identityRealm: identityRealm("identity_realm").notNull(),
    status: userStatus("status").default("pending_review").notNull(),
    emailVerificationStatus: emailVerificationStatus(
      "email_verification_status",
    )
      .default("unverified")
      .notNull(),
    username: varchar("username", { length: 128 }),
    displayUsername: varchar("display_username", { length: 128 }),
    mustChangePassword: boolean("must_change_password")
      .default(false)
      .notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
    uniqueIndex("users_username_lower_unique").on(
      sql`lower(${table.username})`,
    ),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 128 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    unique("accounts_provider_id_account_id_unique").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    realm: identityRealm("realm").notNull(),
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: varchar("identifier", { length: 320 }).notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const rateLimits = pgTable("rate_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const twoFactors = pgTable(
  "two_factors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").default(true).notNull(),
    failedVerificationCount: integer("failed_verification_count")
      .default(0)
      .notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (table) => [
    unique("two_factors_user_id_unique").on(table.userId),
    index("two_factors_secret_idx").on(table.secret),
  ],
);

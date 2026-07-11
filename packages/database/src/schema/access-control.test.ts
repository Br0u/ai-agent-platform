import { getTableName } from "drizzle-orm";
import { getTableConfig, type AnyPgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "./index";

type SchemaExports = Record<string, unknown>;

const exported = schema as SchemaExports;

function table(name: string): AnyPgTable {
  const value = exported[name];

  expect(value, `schema export ${name} must exist`).toBeDefined();
  return value as AnyPgTable;
}

function config(name: string) {
  return getTableConfig(table(name));
}

function columnNames(name: string) {
  return config(name).columns.map((column) => column.name);
}

function uniqueConstraintNames(name: string) {
  const tableConfig = config(name);

  return [
    ...tableConfig.uniqueConstraints.map((constraint) => constraint.name),
    ...tableConfig.columns
      .filter((column) => column.isUnique)
      .map((column) => column.uniqueName),
  ];
}

function indexNames(name: string) {
  return config(name).indexes.map((index) => index.config.name);
}

function checkConstraintNames(name: string) {
  return config(name).checks.map((constraint) => constraint.name);
}

function foreignKeys(name: string) {
  return config(name).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();

    return {
      columns: reference.columns.map((column) => column.name),
      foreignColumns: reference.foreignColumns.map((column) => column.name),
      foreignTable: getTableName(reference.foreignTable),
      onDelete: foreignKey.onDelete,
    };
  });
}

function expectForeignKey(
  source: string,
  column: string,
  target: string,
  onDelete: string,
) {
  expect(foreignKeys(source)).toContainEqual({
    columns: [column],
    foreignColumns: ["id"],
    foreignTable: target,
    onDelete,
  });
}

describe("identity schema", () => {
  it("stores realm-aware users without temporary role or password columns", () => {
    expect(columnNames("users")).toEqual(
      expect.arrayContaining([
        "identity_realm",
        "status",
        "email_verification_status",
        "must_change_password",
        "two_factor_enabled",
      ]),
    );
    expect(columnNames("users")).not.toContain("role_id");
    expect(columnNames("users")).not.toContain("password_hash");
  });

  it("enforces case-insensitive identity lookup keys while keeping usernames optional", () => {
    const username = config("users").columns.find(
      (column) => column.name === "username",
    );

    expect(indexNames("users")).toEqual(
      expect.arrayContaining([
        "users_email_lower_unique",
        "users_username_lower_unique",
      ]),
    );
    expect(uniqueConstraintNames("users")).not.toEqual(
      expect.arrayContaining(["users_email_unique", "users_username_unique"]),
    );
    expect(username?.notNull).toBe(false);
    expect(uniqueConstraintNames("sessions")).toContain(
      "sessions_token_unique",
    );
    expect(uniqueConstraintNames("rateLimits")).toContain(
      "rate_limits_key_unique",
    );
  });

  it("normalizes email and workforce username lookup values", () => {
    const normalizeEmail = exported.normalizeIdentityEmail as (
      value: string,
    ) => string;
    const normalizeUsername = exported.normalizeWorkforceUsername as (
      value: string,
    ) => string;

    expect(normalizeEmail("  Ａlice@Example.COM  ")).toBe("alice@example.com");
    expect(normalizeUsername("  Ａdmin.User  ")).toBe("admin.user");
  });

  it("provides the optional display username expected by Better Auth", () => {
    expect(columnNames("users")).toContain("display_username");
  });

  it("stores the complete realm-aware session context", () => {
    expect(columnNames("sessions")).toEqual(
      expect.arrayContaining([
        "expires_at",
        "ip_address",
        "user_agent",
        "realm",
        "mfa_verified_at",
      ]),
    );
  });

  it("implements the Better Auth 1.6.23 core and plugin tables", () => {
    expect(columnNames("accounts")).toEqual(
      expect.arrayContaining([
        "account_id",
        "provider_id",
        "user_id",
        "access_token",
        "refresh_token",
        "id_token",
        "access_token_expires_at",
        "refresh_token_expires_at",
        "scope",
        "password",
      ]),
    );
    expect(uniqueConstraintNames("accounts")).toContain(
      "accounts_provider_id_account_id_unique",
    );
    expect(columnNames("verifications")).toEqual(
      expect.arrayContaining([
        "identifier",
        "value",
        "expires_at",
        "created_at",
        "updated_at",
      ]),
    );
    expect(columnNames("rateLimits")).toEqual(
      expect.arrayContaining(["key", "count", "last_request"]),
    );
    expect(columnNames("twoFactors")).toEqual(
      expect.arrayContaining([
        "secret",
        "backup_codes",
        "user_id",
        "verified",
        "failed_verification_count",
        "locked_until",
      ]),
    );

    expectForeignKey("accounts", "user_id", "users", "cascade");
    expectForeignKey("sessions", "user_id", "users", "cascade");
    expectForeignKey("twoFactors", "user_id", "users", "cascade");
  });

  it("maps every Better Auth model and field to its exported Drizzle table", async () => {
    const { betterAuthModels } = await import("../auth-models");

    for (const [modelName, mapping] of Object.entries(betterAuthModels)) {
      expect(mapping.table, `${modelName} table must be exported`).toBe(
        exported[mapping.exportName],
      );
      expect(getTableName(mapping.table)).toBe(mapping.tableName);
      expect(Object.keys(mapping.table)).toEqual(
        expect.arrayContaining(Object.values(mapping.fields)),
      );
    }
  });

  it("publishes the shared adapter mapping from the database package", async () => {
    const databasePackage = await import("../index");

    expect(databasePackage.betterAuthModels).toBeDefined();
    expect(databasePackage.betterAuthAdapterSchema).toBeDefined();
  });
});

describe("authorization schema", () => {
  it("uses UUID primary keys and timezone-aware timestamps", () => {
    for (const exportName of [
      "permissions",
      "roles",
      "userRoles",
      "rolePermissions",
      "organizations",
      "organizationMemberships",
      "customerRegistrations",
      "auditLogs",
    ]) {
      const tableConfig = config(exportName);
      const id = tableConfig.columns.find((column) => column.name === "id");
      const timestampColumns = tableConfig.columns.filter((column) =>
        column.name.endsWith("_at"),
      );

      expect(id?.getSQLType(), `${exportName}.id must be UUID`).toBe("uuid");
      expect(id?.primary, `${exportName}.id must be primary`).toBe(true);
      expect(
        timestampColumns.length,
        `${exportName} must have timestamps`,
      ).toBeGreaterThanOrEqual(1);
      for (const column of timestampColumns) {
        expect(column.getSQLType()).toBe("timestamp with time zone");
      }
    }
  });

  it("deduplicates role assignments and permission grants", () => {
    expect(uniqueConstraintNames("userRoles")).toContain(
      "user_roles_user_id_role_id_unique",
    );
    expect(uniqueConstraintNames("rolePermissions")).toContain(
      "role_permissions_role_id_permission_id_unique",
    );
  });

  it("marks system-managed roles and permissions explicitly", () => {
    expect(columnNames("roles")).toContain("is_system");
    expect(columnNames("permissions")).toContain("managed_by_system");
  });

  it("exports realm-safe identity policy from the package root", async () => {
    const databasePackage = await import("../index");

    expect(databasePackage.canEnterApplication).toBeDefined();
    expect(
      databasePackage.canEnterApplication("workforce", "active", "console"),
    ).toBe(false);
  });

  it("indexes reverse foreign-key lookups", () => {
    expect(indexNames("auditLogs")).toContain("audit_logs_actor_user_id_idx");
    expect(indexNames("userRoles")).toEqual(
      expect.arrayContaining([
        "user_roles_role_id_idx",
        "user_roles_assigned_by_user_id_idx",
      ]),
    );
    expect(indexNames("rolePermissions")).toContain(
      "role_permissions_permission_id_idx",
    );
    expect(indexNames("organizationMemberships")).toEqual(
      expect.arrayContaining([
        "organization_memberships_user_id_idx",
        "organization_memberships_assigned_by_user_id_idx",
      ]),
    );
    expect(indexNames("customerRegistrations")).toEqual(
      expect.arrayContaining([
        "customer_registrations_user_id_idx",
        "customer_registrations_organization_id_idx",
        "customer_registrations_reviewer_user_id_idx",
      ]),
    );
  });

  it("records the actor assigning a role", () => {
    expect(columnNames("userRoles")).toContain("assigned_by_user_id");
    expectForeignKey("userRoles", "assigned_by_user_id", "users", "set null");
  });

  it("defines explicit authorization foreign-key deletion behavior", () => {
    expectForeignKey("userRoles", "user_id", "users", "cascade");
    expectForeignKey("userRoles", "role_id", "roles", "cascade");
    expectForeignKey("rolePermissions", "role_id", "roles", "cascade");
    expectForeignKey(
      "rolePermissions",
      "permission_id",
      "permissions",
      "cascade",
    );
  });
});

describe("organization and registration schema", () => {
  it("normalizes legal names deterministically", () => {
    const normalize = exported.normalizeOrganizationLegalNameKey as (
      value: string,
    ) => string;

    expect(normalize("  ACME\u3000  Technology  ")).toBe("acme technology");
    expect(normalize("ＡＣＭＥ Corp")).toBe("acme corp");
  });

  it("constructs organization values from the legal name and rejects empty keys", () => {
    const valuesFromLegalName = exported.organizationValuesFromLegalName as (
      legalName: string,
    ) => { legalName: string; legalNameKey: string };

    expect(valuesFromLegalName("  ＡＣＭＥ  Corp  ")).toEqual({
      legalName: "ＡＣＭＥ  Corp",
      legalNameKey: "acme corp",
    });
    expect(() => valuesFromLegalName("　\t ")).toThrow(
      "Organization legal name must not be empty after normalization",
    );
  });

  it("adds database-level legal-name key shape constraints", () => {
    expect(checkConstraintNames("organizations")).toContain(
      "organizations_legal_name_key_normalized_check",
    );
  });

  it("enforces unique legal-name and organization membership keys", () => {
    expect(uniqueConstraintNames("organizations")).toContain(
      "organizations_legal_name_key_unique",
    );
    expect(uniqueConstraintNames("organizationMemberships")).toContain(
      "organization_memberships_organization_id_user_id_unique",
    );
  });

  it("records organization status and assigning actor", () => {
    expect(columnNames("organizations")).toContain("status");
    expect(columnNames("organizationMemberships")).toContain(
      "assigned_by_user_id",
    );
    expectForeignKey(
      "organizationMemberships",
      "assigned_by_user_id",
      "users",
      "set null",
    );
  });

  it("records registration review status, reviewer, and note", () => {
    expect(columnNames("customerRegistrations")).toEqual(
      expect.arrayContaining(["status", "reviewer_user_id", "review_note"]),
    );
    expectForeignKey(
      "customerRegistrations",
      "reviewer_user_id",
      "users",
      "set null",
    );
  });

  it("defines explicit organization and registration foreign keys", () => {
    expectForeignKey(
      "organizationMemberships",
      "organization_id",
      "organizations",
      "cascade",
    );
    expectForeignKey("organizationMemberships", "user_id", "users", "cascade");
    expectForeignKey("customerRegistrations", "user_id", "users", "cascade");
    expectForeignKey(
      "customerRegistrations",
      "organization_id",
      "organizations",
      "set null",
    );
  });
});

describe("audit and content ownership", () => {
  it("captures actor, target, request, and metadata context", () => {
    expect(columnNames("auditLogs")).toEqual(
      expect.arrayContaining([
        "actor_realm",
        "actor_user_id",
        "action",
        "target_type",
        "target_id",
        "metadata",
        "ip_address",
        "user_agent",
      ]),
    );
    expectForeignKey("auditLogs", "actor_user_id", "users", "restrict");
  });

  it("preserves content ownership through the new users table", () => {
    expectForeignKey("content", "author_id", "users", "set null");
  });
});

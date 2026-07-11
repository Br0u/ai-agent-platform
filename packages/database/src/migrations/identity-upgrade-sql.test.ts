import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../drizzle/0001_identity_access_control.sql", import.meta.url),
);
const systemOwnershipMigrationPath = fileURLToPath(
  new URL(
    "../../drizzle/0002_system_managed_access_control.sql",
    import.meta.url,
  ),
);

describe("identity upgrade migration SQL", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const systemOwnershipSql = readFileSync(systemOwnershipMigrationPath, "utf8");

  it("replaces user_status without consuming newly-added enum values", () => {
    expect(sql).not.toContain('ALTER TYPE "public"."user_status" ADD VALUE');
    expect(sql).toContain(
      "CREATE TYPE \"public\".\"user_status_new\" AS ENUM('pending_review', 'active', 'disabled', 'rejected')",
    );
    expect(sql).toContain('USING "status"::text::"public"."user_status_new"');
  });

  it("creates case-insensitive identity indexes and reverse FK indexes", () => {
    for (const indexName of [
      "users_email_lower_unique",
      "users_username_lower_unique",
      "audit_logs_actor_user_id_idx",
      "user_roles_role_id_idx",
      "user_roles_assigned_by_user_id_idx",
      "role_permissions_permission_id_idx",
      "organization_memberships_user_id_idx",
      "organization_memberships_assigned_by_user_id_idx",
      "customer_registrations_user_id_idx",
      "customer_registrations_organization_id_idx",
      "customer_registrations_reviewer_user_id_idx",
    ]) {
      expect(sql).toContain(`"${indexName}"`);
    }
  });

  it("preserves audit actors and constrains legal-name keys", () => {
    expect(sql).toContain(
      '"audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict',
    );
    expect(sql).toContain(
      'CONSTRAINT "organizations_legal_name_key_normalized_check" CHECK',
    );
  });

  it("keeps 0001 immutable and adds ownership flags in 0002", () => {
    expect(sql).not.toContain("managed_by_system");
    expect(sql).not.toContain("is_system");
    expect(systemOwnershipSql).toContain(
      'ALTER TABLE "permissions" ADD COLUMN "managed_by_system" boolean DEFAULT false NOT NULL',
    );
    expect(systemOwnershipSql).toContain(
      'ALTER TABLE "roles" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL',
    );
    expect(systemOwnershipSql.match(/ALTER TABLE/gu)).toHaveLength(2);
  });
});

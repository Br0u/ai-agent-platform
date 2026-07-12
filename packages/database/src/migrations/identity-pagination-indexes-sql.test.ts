import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../drizzle/0005_identity_pagination_indexes.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("identity pagination indexes migration", () => {
  it("adds only the audit index justified by acceptance EXPLAIN evidence", () => {
    expect(migration).not.toContain("users_realm_status_name_id_idx");
    expect(migration).toMatch(
      /"audit_logs" USING btree \("created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST\)/iu,
    );
    expect(migration).not.toContain("role_permissions_acceptance");
    expect(migration).not.toContain("sessions_acceptance");
  });
});

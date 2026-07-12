import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../drizzle/0002_session_realm_guard.sql", import.meta.url),
);
const sql = readFileSync(migrationPath, "utf8");

describe("session realm guard migration SQL", () => {
  it("locks the authoritative user and rejects invalid session state", () => {
    expect(sql).toContain("FOR SHARE");
    expect(sql).toContain("NEW.realm <> authoritative_realm");
    expect(sql).toContain("authoritative_status = 'disabled'");
    expect(sql).toContain("authoritative_realm = 'workforce'");
    expect(sql).toContain("authoritative_status <> 'active'");
  });

  it("runs on inserts and identity-boundary updates", () => {
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF user_id, realm");
    expect(sql).toContain("ON sessions");
  });
});

import { describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migration-test-safety";

describe("identity migration test database safety", () => {
  it.each([
    "postgresql://postgres:secret@127.0.0.1:55433/ai_agent_platform_identity_test",
    "postgresql://postgres:secret@localhost:55433/ai_agent_platform_identity_test_ci123",
    "postgres://postgres:secret@[::1]:55433/ai_agent_platform_identity_test_local-42",
  ])("allows a local dedicated identity test database: %s", (databaseUrl) => {
    expect(assertSafeIdentityMigrationTestDatabaseUrl(databaseUrl)).toBe(
      databaseUrl,
    );
  });

  it.each([
    "postgresql://postgres:secret@database.internal:5432/ai_agent_platform_identity_test",
    "postgresql://postgres:secret@127.0.0.1:5432/ai_agent_platform",
    "postgresql://postgres:secret@127.0.0.1:5432/postgres",
    "postgresql://postgres:secret@127.0.0.1:5432/template0",
    "postgresql://postgres:secret@127.0.0.1:5432/template1",
    "postgresql://postgres:secret@127.0.0.1:5432/production",
    "postgresql://postgres:secret@127.0.0.1:5432/ai_agent_platform_identity_test/extra",
    "mysql://root:secret@127.0.0.1:3306/ai_agent_platform_identity_test",
    "not-a-database-url",
  ])(
    "rejects a destructive migration target before setup: %s",
    (databaseUrl) => {
      expect(() =>
        assertSafeIdentityMigrationTestDatabaseUrl(databaseUrl),
      ).toThrow(/Refusing destructive identity migration test/);
    },
  );
});

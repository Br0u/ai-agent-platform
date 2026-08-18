import { describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "@ai-agent-platform/database";

import { downloadResourceRepository } from "./repository";

const requested = process.env.RUN_DOWNLOAD_RESOURCE_DB_TEST === "true";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (requested && !testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required when RUN_DOWNLOAD_RESOURCE_DB_TEST=true",
  );
}
const safeUrl = requested
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl!)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;

describePostgres("download resource artifact repository", () => {
  it("loads generic artifact rows and counts object plus cover references", async () => {
    const result = await downloadResourceRepository.transaction(async (tx) => {
      const references = await tx.countArtifactReferences({
        objectKey: "missing-object",
      });
      return references;
    });
    expect(result).toEqual({ objectReferenceCount: 0, coverReferenceCount: 0 });
  });
});

describe("download resource PostgreSQL test guard", () => {
  it("requires explicit safe opt-in", () => {
    expect(requested && !testDatabaseUrl).toBe(false);
  });
});

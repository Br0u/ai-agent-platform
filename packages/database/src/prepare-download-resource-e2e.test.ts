import { describe, expect, it } from "vitest";

import { assertSafeDownloadResourceE2EDatabaseUrl } from "./prepare-download-resource-e2e";

describe("download resource E2E database preparation", () => {
  it.each([
    "postgresql://postgres:secret@database.internal:5432/ai_agent_platform_identity_test",
    "postgresql://postgres:secret@127.0.0.1:5432/ai_agent_platform",
    "postgresql://postgres:secret@127.0.0.1:5432/ai_agent_platform_download_test",
    "postgresql://postgres:secret@127.0.0.1:5432/postgres",
  ])(
    "refuses an unsafe reset target before any mutation: %s",
    (databaseUrl) => {
      expect(() =>
        assertSafeDownloadResourceE2EDatabaseUrl(databaseUrl),
      ).toThrow(/Refusing destructive identity migration test/u);
    },
  );

  it("accepts only a loopback identity test database", () => {
    const databaseUrl =
      "postgresql://postgres:secret@127.0.0.1:55433/ai_agent_platform_identity_test_download-e2e";
    expect(assertSafeDownloadResourceE2EDatabaseUrl(databaseUrl)).toBe(
      databaseUrl,
    );
  });
});

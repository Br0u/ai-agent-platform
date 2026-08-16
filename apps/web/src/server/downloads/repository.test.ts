import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  lockResult: { rows: [{ locked: true }] },
  unlockResult: { rows: [{ unlocked: true }] },
  connect: vi.fn(),
  pinnedTransaction: vi.fn(),
}));

vi.mock("@ai-agent-platform/database", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@ai-agent-platform/database")>();
  return {
    ...actual,
    getDatabase: () => ({ $client: { connect: mocks.connect } }),
  };
});

vi.mock("drizzle-orm/node-postgres", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("drizzle-orm/node-postgres")>();
  return {
    ...actual,
    drizzle: () => ({ transaction: mocks.pinnedTransaction }),
  };
});

import { downloadResourceRepository } from "./repository";

const source = readFileSync(
  resolve(process.cwd(), "src/server/downloads/repository.ts"),
  "utf8",
);
const integrationSource = readFileSync(
  resolve(
    process.cwd(),
    "src/server/downloads/repository.postgres.integration.test.ts",
  ),
  "utf8",
);

describe("download resource repository contract", () => {
  beforeEach(() => {
    mocks.events.length = 0;
    mocks.lockResult = { rows: [{ locked: true }] };
    mocks.unlockResult = { rows: [{ unlocked: true }] };
    const client = {
      query: vi.fn(async (query: string) => {
        if (query.includes("pg_advisory_unlock")) {
          mocks.events.push("unlock");
          return mocks.unlockResult;
        }
        mocks.events.push("lock");
        return mocks.lockResult;
      }),
      release: vi.fn(() => mocks.events.push("release")),
    };
    mocks.connect.mockReset();
    mocks.connect.mockImplementation(async () => {
      mocks.events.push("connect");
      return client;
    });
    mocks.pinnedTransaction.mockReset();
    mocks.pinnedTransaction.mockImplementation(
      async (work: (tx: object) => Promise<unknown>) => {
        mocks.events.push("transaction");
        const result = await work({});
        mocks.events.push("commit");
        return result;
      },
    );
  });

  it("holds the session advisory lock through commit and post-commit cleanup", async () => {
    await expect(
      downloadResourceRepository.withArtifactMutationLock(
        async () => {
          mocks.events.push("work");
          return "done";
        },
        async (result) => {
          expect(result).toBe("done");
          mocks.events.push("cleanup");
        },
      ),
    ).resolves.toBe("done");

    expect(mocks.events).toEqual([
      "connect",
      "lock",
      "transaction",
      "work",
      "commit",
      "cleanup",
      "unlock",
      "release",
    ]);
  });

  it("unlocks and releases after rollback while preserving both primary and unlock errors", async () => {
    const primary = new Error("business failed");
    mocks.unlockResult = { rows: [{ unlocked: false }] };

    const failure = await downloadResourceRepository
      .withArtifactMutationLock(async () => {
        throw primary;
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([
      primary,
      expect.objectContaining({ message: expect.stringContaining("unlock") }),
    ]);
    expect(mocks.events.at(-2)).toBe("unlock");
    expect(mocks.events.at(-1)).toBe("release");
  });

  it("keeps projections, locking, CAS, cleanup and per-key reference counts in SQL", () => {
    expect(source).toContain('.for("update")');
    expect(source).toContain("downloadResources.rowVersion");
    expect(source).toContain("cleanupPendingAt");
    expect(source).toContain("pdfReferenceCount");
    expect(source).toContain("coverReferenceCount");
    expect(source).toContain(
      "createAuditWriter(createDatabaseAuditRepository(databaseTx))",
    );
    expect(source).not.toContain("pg_advisory_xact_lock");
    expect(source).toContain("4922248911538569540");
    expect(source).toMatch(/state[^\n]+published/u);
    expect(source).toMatch(
      /CASE[\s\S]*materials[\s\S]*software[\s\S]*deployment[\s\S]*whitepapers/u,
    );
  });

  it("requires explicit safe PostgreSQL opt-in instead of silently skipping", () => {
    expect(integrationSource).toContain("RUN_DOWNLOAD_RESOURCE_DB_TEST");
    expect(integrationSource).toContain(
      "assertSafeIdentityMigrationTestDatabaseUrl",
    );
    expect(integrationSource).toMatch(
      /RUN_DOWNLOAD_RESOURCE_DB_TEST[\s\S]*TEST_DATABASE_URL is required/u,
    );
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      RUN_DOWNLOAD_RESOURCE_DB_TEST: "true",
    };
    delete environment.TEST_DATABASE_URL;
    const probe = spawnSync(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "src/server/downloads/repository.postgres.integration.test.ts",
      ],
      { cwd: process.cwd(), encoding: "utf8", env: environment },
    );
    expect(probe.status).not.toBe(0);
    expect(`${probe.stdout}${probe.stderr}`).toContain(
      "TEST_DATABASE_URL is required when RUN_DOWNLOAD_RESOURCE_DB_TEST=true",
    );
  });
});

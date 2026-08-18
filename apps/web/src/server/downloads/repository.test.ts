import { spawnSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  lockResult: { rows: [{ locked: true }] },
  lockResults: [] as Array<{ rows: Array<{ locked: boolean }> }>,
  unlockResult: { rows: [{ unlocked: true }] },
  lockError: undefined as unknown,
  unlockError: undefined as unknown,
  connect: vi.fn(),
  pinnedTransaction: vi.fn(),
}));

vi.mock("@ai-agent-platform/database", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@ai-agent-platform/database")>();
  return {
    ...actual,
    getDatabase: () => ({ $client: { connect: mocks.connect } }),
    getDatabasePool: () => ({ connect: mocks.connect }),
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

import {
  createDownloadResourceRepository,
  downloadResourceRepository,
} from "./repository";

describe("download resource repository contract", () => {
  beforeEach(() => {
    mocks.events.length = 0;
    mocks.lockResult = { rows: [{ locked: true }] };
    mocks.lockResults.length = 0;
    mocks.unlockResult = { rows: [{ unlocked: true }] };
    mocks.lockError = undefined;
    mocks.unlockError = undefined;
    const client = {
      query: vi.fn(async (query: string | { text: string }) => {
        const text = typeof query === "string" ? query : query.text;
        if (text.includes("pg_advisory_unlock")) {
          mocks.events.push("unlock");
          if (mocks.unlockError !== undefined) throw mocks.unlockError;
          return mocks.unlockResult;
        }
        mocks.events.push("lock");
        if (mocks.lockError !== undefined) throw mocks.lockError;
        return mocks.lockResults.shift() ?? mocks.lockResult;
      }),
      release: vi.fn((error?: Error | boolean) =>
        mocks.events.push(error ? "destroy" : "release"),
      ),
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

  it("uses an explicitly supplied database and pool without consulting the singleton", async () => {
    const explicitTransaction = vi.fn(async (work: (tx: object) => unknown) =>
      work({}),
    );
    const repository = createDownloadResourceRepository(
      { transaction: explicitTransaction } as never,
      { connect: mocks.connect } as never,
    );
    await expect(repository.transaction(async () => "explicit")).resolves.toBe(
      "explicit",
    );
    expect(explicitTransaction).toHaveBeenCalledOnce();
  });

  it("releases the pool connection while waiting for the artifact lock", async () => {
    vi.useFakeTimers();
    mocks.lockResults.push(
      { rows: [{ locked: false }] },
      { rows: [{ locked: true }] },
    );
    try {
      const mutation = downloadResourceRepository.withArtifactMutationLock(
        async () => "done",
      );
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(mutation).resolves.toBe("done");
      expect(mocks.events).toEqual([
        "connect",
        "lock",
        "release",
        "connect",
        "lock",
        "transaction",
        "commit",
        "unlock",
        "release",
      ]);
    } finally {
      vi.useRealTimers();
    }
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
    expect(mocks.events.at(-1)).toBe("destroy");
  });

  it.each([undefined, "plain rejection"])(
    "does not swallow a non-Error rejection value %#",
    async (thrownValue) => {
      let rejected = false;
      let reason: unknown = "not rejected";
      try {
        await downloadResourceRepository.withArtifactMutationLock(async () => {
          throw thrownValue;
        });
      } catch (error) {
        rejected = true;
        reason = error;
      }
      expect(rejected).toBe(true);
      expect(reason).toBe(thrownValue);
      expect(mocks.events.slice(-2)).toEqual(["unlock", "release"]);
    },
  );

  it("destroys a connection when advisory lock acquisition has an unknown result", async () => {
    const failure = new Error("lock query failed");
    mocks.lockError = failure;

    await expect(
      downloadResourceRepository.withArtifactMutationLock(async () => "no"),
    ).rejects.toBe(failure);
    expect(mocks.events).toEqual(["connect", "lock", "destroy"]);
  });

  it("destroys a connection when advisory unlock fails", async () => {
    const failure = new Error("unlock query failed");
    mocks.unlockError = failure;

    await expect(
      downloadResourceRepository.withArtifactMutationLock(async () => "done"),
    ).rejects.toBe(failure);
    expect(mocks.events.slice(-2)).toEqual(["unlock", "destroy"]);
  });

  it("normally releases after a business failure when unlock succeeds", async () => {
    const failure = new Error("business failed");

    await expect(
      downloadResourceRepository.withArtifactMutationLock(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(mocks.events.slice(-2)).toEqual(["unlock", "release"]);
  });

  it("returns a stable permission error when no authoritative row qualifies", async () => {
    mocks.pinnedTransaction.mockImplementationOnce(
      async (work: (tx: object) => Promise<unknown>) =>
        work({ execute: vi.fn().mockResolvedValue({ rows: [] }) }),
    );

    await expect(
      downloadResourceRepository.withArtifactMutationLock((tx) =>
        tx.assertActiveWorkforcePermission("user-id", "admin:downloads"),
      ),
    ).rejects.toMatchObject({
      message: "AUTH_PERMISSION_DENIED",
      code: "AUTH_PERMISSION_DENIED",
    });
  });

  it("requires explicit safe PostgreSQL opt-in instead of silently skipping", () => {
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

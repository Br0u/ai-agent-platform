import { describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_RATE_LIMIT_QUOTAS,
  AssistantRateLimitExceededError,
  AssistantRateLimitUnavailableError,
  assistantRateLimitKey,
  createDatabaseAssistantRateLimiter,
} from "./assistant-rate-limit";

const SECRET = "assistant-rate-limit-secret-with-32-bytes";

function fakeDatabase(counts: number[]) {
  const execute = vi.fn(async () => {
    if (execute.mock.calls.length === 1) return { rows: [] };
    const count = counts.shift();
    return { rows: [{ count, lastRequest: 100_000 }] };
  });
  let committed = false;
  const transaction = vi.fn(
    async (callback: (tx: { execute: typeof execute }) => unknown) => {
      const result = await callback({ execute });
      committed = true;
      return result;
    },
  );
  return {
    database: { transaction },
    execute,
    transaction,
    committed: () => committed,
  };
}

describe("assistant application rate limiter", () => {
  it("uses explicit bounded quotas for every scope", () => {
    expect(ASSISTANT_RATE_LIMIT_QUOTAS).toEqual({
      anonymous: { maximumAttempts: 20, windowMs: 60_000 },
      customer: { maximumAttempts: 60, windowMs: 60_000 },
      "admin-test": { maximumAttempts: 20, windowMs: 60_000 },
      "admin-key-reveal": { maximumAttempts: 5, windowMs: 10 * 60_000 },
    });
  });

  it("rejects a missing or shorter-than-32-byte dedicated secret", () => {
    expect(() =>
      createDatabaseAssistantRateLimiter({} as never, { secret: "short" }),
    ).toThrow("ASSISTANT_RATE_LIMIT_SECRET");
    expect(() =>
      createDatabaseAssistantRateLimiter({} as never, {
        secret: "😀".repeat(7),
      }),
    ).toThrow("ASSISTANT_RATE_LIMIT_SECRET");
  });

  it("domain-separates scopes and kinds without putting raw values in keys", () => {
    const values = [
      assistantRateLimitKey(SECRET, "anonymous", "session", "session-secret"),
      assistantRateLimitKey(SECRET, "anonymous", "ip", "203.0.113.10"),
      assistantRateLimitKey(SECRET, "customer", "actor", "customer-id"),
      assistantRateLimitKey(SECRET, "admin-test", "actor", "staff-id"),
      assistantRateLimitKey(
        SECRET,
        "admin-key-reveal",
        "actor",
        "revealing-staff-id",
      ),
    ];

    expect(new Set(values)).toHaveLength(5);
    expect(values[0]).toMatch(/^assistant:anonymous:session:[a-f0-9]{64}$/u);
    expect(values[1]).toMatch(/^assistant:anonymous:ip:[a-f0-9]{64}$/u);
    expect(values[2]).toMatch(/^assistant:customer:actor:[a-f0-9]{64}$/u);
    expect(values[3]).toMatch(/^assistant:admin-test:actor:[a-f0-9]{64}$/u);
    expect(values[4]).toMatch(
      /^assistant:admin-key-reveal:actor:[a-f0-9]{64}$/u,
    );
    expect(values.join("\n")).not.toMatch(
      /session-secret|203\.0\.113\.10|customer-id|staff-id|revealing-staff-id/u,
    );
  });

  it("consumes anonymous session and trusted-IP buckets in one transaction", async () => {
    const fake = fakeDatabase([1, 1]);
    const limiter = createDatabaseAssistantRateLimiter(fake.database as never, {
      secret: SECRET,
      quotas: {
        anonymous: { maximumAttempts: 2, windowMs: 10_000 },
      },
      now: () => 100_000,
    });

    await limiter.consume({
      scope: "anonymous",
      sessionId: "session-secret",
      ipAddress: "203.0.113.10",
    });

    expect(fake.transaction).toHaveBeenCalledOnce();
    expect(fake.execute).toHaveBeenCalledTimes(3);
    expect(fake.committed()).toBe(true);
  });

  it("rolls back the session increment when the IP bucket is exceeded", async () => {
    const fake = fakeDatabase([2, 3]);
    const limiter = createDatabaseAssistantRateLimiter(fake.database as never, {
      secret: SECRET,
      quotas: {
        anonymous: { maximumAttempts: 2, windowMs: 10_000 },
      },
      now: () => 100_500,
    });

    await expect(
      limiter.consume({
        scope: "anonymous",
        sessionId: "session-secret",
        ipAddress: "203.0.113.10",
      }),
    ).rejects.toEqual(new AssistantRateLimitExceededError(10));
    expect(fake.execute).toHaveBeenCalledTimes(3);
    expect(fake.committed()).toBe(false);
  });

  it("does not touch the IP bucket when the session bucket is exceeded", async () => {
    const fake = fakeDatabase([3, 1]);
    const limiter = createDatabaseAssistantRateLimiter(fake.database as never, {
      secret: SECRET,
      quotas: {
        anonymous: { maximumAttempts: 2, windowMs: 10_000 },
      },
      now: () => 100_500,
    });

    await expect(
      limiter.consume({
        scope: "anonymous",
        sessionId: "session-secret",
        ipAddress: "203.0.113.10",
      }),
    ).rejects.toEqual(new AssistantRateLimitExceededError(10));
    expect(fake.execute).toHaveBeenCalledTimes(2);
    expect(fake.committed()).toBe(false);
  });

  it.each(["customer", "admin-test", "admin-key-reveal"] as const)(
    "consumes one actor bucket for %s scope",
    async (scope) => {
      const fake = fakeDatabase([1]);
      const limiter = createDatabaseAssistantRateLimiter(
        fake.database as never,
        {
          secret: SECRET,
          quotas: { [scope]: { maximumAttempts: 2, windowMs: 10_000 } },
          now: () => 100_000,
        },
      );

      await limiter.consume({ scope, actorId: "server-resolved-actor" });
      expect(fake.execute).toHaveBeenCalledTimes(2);
    },
  );

  it("fails closed with a typed error when PostgreSQL is unavailable", async () => {
    const limiter = createDatabaseAssistantRateLimiter(
      {
        transaction: vi.fn(async () => {
          throw new Error("database URL and secret must not escape");
        }),
      } as never,
      { secret: SECRET },
    );

    await expect(
      limiter.consume({ scope: "customer", actorId: "server-actor" }),
    ).rejects.toBeInstanceOf(AssistantRateLimitUnavailableError);
  });
});

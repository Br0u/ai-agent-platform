import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertSafeIdentityMigrationTestDatabaseUrl,
  databaseSchema,
} from "@ai-agent-platform/database";

import {
  AssistantRateLimitExceededError,
  assistantRateLimitKey,
  createDatabaseAssistantRateLimiter,
} from "./assistant-rate-limit";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;
const SECRET = "postgres-assistant-rate-limit-secret-32-bytes";

describePostgres("assistant PostgreSQL rate limiter", () => {
  const pool = new Pool({ connectionString: safeUrl });
  const database = drizzle(pool, { schema: databaseSchema });
  let now = 100_000;

  const limiter = (maximumAttempts = 2, windowMs = 60_000) =>
    createDatabaseAssistantRateLimiter(database, {
      secret: SECRET,
      quotas: {
        anonymous: { maximumAttempts, windowMs },
        customer: { maximumAttempts, windowMs },
        "admin-test": { maximumAttempts, windowMs },
      },
      now: () => now,
    });

  beforeAll(async () => {
    await pool.query("select 1");
  });

  beforeEach(async () => {
    now = 100_000;
    await pool.query("TRUNCATE rate_limits");
  });

  afterAll(async () => pool.end());

  it("shares counts across independently constructed limiter instances", async () => {
    await limiter(1).consume({ scope: "customer", actorId: "customer-1" });
    await expect(
      limiter(1).consume({ scope: "customer", actorId: "customer-1" }),
    ).rejects.toBeInstanceOf(AssistantRateLimitExceededError);

    const rows = await pool.query<{ count: number; key: string }>(
      "SELECT key, count FROM rate_limits WHERE key LIKE 'assistant:%'",
    );
    expect(rows.rows).toEqual([
      {
        key: assistantRateLimitKey(SECRET, "customer", "actor", "customer-1"),
        count: 1,
      },
    ]);
  });

  it("atomically enforces the threshold under concurrent requests", async () => {
    const value = limiter(5);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        value.consume({ scope: "admin-test", actorId: "staff-1" }),
      ),
    );

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(5);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(15);
    expect(
      results
        .filter((result) => result.status === "rejected")
        .every(
          (result) => result.reason instanceof AssistantRateLimitExceededError,
        ),
    ).toBe(true);
    const row = await pool.query<{ count: number }>(
      "SELECT count FROM rate_limits WHERE key LIKE 'assistant:admin-test:actor:%'",
    );
    expect(row.rows).toEqual([{ count: 5 }]);
  });

  it("allows five direct-global requests, blocks the sixth, and resets", async () => {
    const value = limiter();
    const input = { scope: "anonymous" as const, global: true as const };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(value.consume(input)).resolves.toBeUndefined();
    }
    await expect(value.consume(input)).rejects.toBeInstanceOf(
      AssistantRateLimitExceededError,
    );
    now += 60_000;
    await expect(value.consume(input)).resolves.toBeUndefined();

    const rows = await pool.query<{ count: number; key: string }>(
      "SELECT key, count FROM rate_limits WHERE key LIKE 'assistant:anonymous:%'",
    );
    expect(rows.rows).toEqual([
      {
        key: assistantRateLimitKey(SECRET, "anonymous", "global", "direct"),
        count: 1,
      },
    ]);
    expect(rows.rows[0]?.key).not.toMatch(/session|203\.0\.113/u);
  });

  it("stores only the HMAC of a trusted client IP", async () => {
    const ipAddress = "203.0.113.20";
    await limiter().consume({ scope: "anonymous", ipAddress });

    const rows = await pool.query<{ key: string }>(
      "SELECT key FROM rate_limits WHERE key LIKE 'assistant:anonymous:%'",
    );
    expect(rows.rows).toEqual([
      {
        key: assistantRateLimitKey(SECRET, "anonymous", "ip", ipAddress),
      },
    ]);
    expect(rows.rows[0]?.key).not.toContain(ipAddress);
    expect(rows.rows[0]?.key).not.toContain("session");
  });

  it("resets a fixed window and returns a bounded retry duration", async () => {
    const value = limiter(1, 1_000);
    const input = { scope: "customer" as const, actorId: "customer-window" };
    await value.consume(input);
    await expect(value.consume(input)).rejects.toMatchObject({
      retryAfterSeconds: 1,
    });
    now += 1_000;
    await expect(value.consume(input)).resolves.toBeUndefined();
  });

  it("cleans only expired assistant buckets in bounded batches", async () => {
    const expired = now - 25 * 60 * 60 * 1_000;
    await pool.query(
      `INSERT INTO rate_limits (key, count, last_request)
       SELECT 'assistant:anonymous:ip:expired-' || value, 1, $1
       FROM generate_series(1, 150) AS value`,
      [expired],
    );
    await pool.query(
      `INSERT INTO rate_limits (key, count, last_request) VALUES
       ('auth:preserved', 1, $1),
       ('registration:preserved', 1, $1),
       ('assistant:customer:actor:fresh-preserved', 1, $2)`,
      [expired, now],
    );

    await limiter().consume({ scope: "customer", actorId: "cleanup-1" });
    const expiredRows = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM rate_limits WHERE key LIKE 'assistant:%expired-%'",
    );
    expect(expiredRows.rows).toEqual([{ count: "50" }]);
    const preserved = await pool.query<{ key: string }>(
      `SELECT key FROM rate_limits
       WHERE key IN ('auth:preserved', 'registration:preserved',
                     'assistant:customer:actor:fresh-preserved')
       ORDER BY key`,
    );
    expect(preserved.rows).toEqual([
      { key: "assistant:customer:actor:fresh-preserved" },
      { key: "auth:preserved" },
      { key: "registration:preserved" },
    ]);
  });
});

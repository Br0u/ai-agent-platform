import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertSafeIdentityMigrationTestDatabaseUrl,
  databaseSchema,
} from "@ai-agent-platform/database";

import {
  AuthRateLimitError,
  authRateLimitKey,
  createDatabaseAuthRateLimiter,
} from "./rate-limit";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;
const secret = "postgres-rate-limit-test-secret-over-32-characters";

describePostgres("authentication PostgreSQL rate limiter", () => {
  const pool = new Pool({ connectionString: safeUrl });
  const database = drizzle(pool, { schema: databaseSchema });
  let now = 100_000;

  const limiter = (maximumAttempts = 3, windowMs = 60_000) =>
    createDatabaseAuthRateLimiter(database, {
      secret,
      maximumAttempts,
      windowMs,
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

  it("enforces identifier and IP buckets independently at the threshold", async () => {
    const value = limiter();
    for (let index = 0; index < 3; index += 1) {
      await value.consume({
        realm: "customer",
        operation: "login",
        identifier: "same@example.test",
        ipAddress: `203.0.113.${index}`,
      });
    }
    await expect(
      value.consume({
        realm: "customer",
        operation: "login",
        identifier: "same@example.test",
        ipAddress: "203.0.113.99",
      }),
    ).rejects.toBeInstanceOf(AuthRateLimitError);

    await pool.query("TRUNCATE rate_limits");
    for (let index = 0; index < 3; index += 1) {
      await value.consume({
        realm: "workforce",
        operation: "login",
        identifier: `staff-${index}`,
        ipAddress: "203.0.113.100",
      });
    }
    await expect(
      value.consume({
        realm: "workforce",
        operation: "login",
        identifier: "staff-4",
        ipAddress: "203.0.113.100",
      }),
    ).rejects.toBeInstanceOf(AuthRateLimitError);
  });

  it("resets both buckets after the fixed window", async () => {
    const value = limiter(2, 1_000);
    const input = {
      realm: "customer" as const,
      operation: "login" as const,
      identifier: "window@example.test",
      ipAddress: "203.0.113.10",
    };
    await value.consume(input);
    await value.consume(input);
    await expect(value.consume(input)).rejects.toBeInstanceOf(
      AuthRateLimitError,
    );
    now += 1_001;
    await expect(value.consume(input)).resolves.toBeUndefined();
    const counts = await pool.query<{ count: number }>(
      "SELECT count FROM rate_limits WHERE key LIKE 'auth:%' ORDER BY key",
    );
    expect(counts.rows).toEqual([{ count: 1 }, { count: 1 }]);
  });

  it("rolls back the identifier increment when the IP bucket rejects", async () => {
    const value = limiter(1);
    await value.consume({
      realm: "workforce",
      operation: "reauth",
      identifier: "first",
      ipAddress: "203.0.113.11",
    });
    await expect(
      value.consume({
        realm: "workforce",
        operation: "reauth",
        identifier: "rolled-back",
        ipAddress: "203.0.113.11",
      }),
    ).rejects.toBeInstanceOf(AuthRateLimitError);
    const rolledBackKey = authRateLimitKey(
      secret,
      { realm: "workforce", operation: "reauth" },
      "identifier",
      "rolled-back",
    );
    const found = await pool.query("SELECT 1 FROM rate_limits WHERE key = $1", [
      rolledBackKey,
    ]);
    expect(found.rowCount).toBe(0);
  });

  it("serializes concurrent upserts without losing increments", async () => {
    const value = limiter(50);
    const input = {
      realm: "customer" as const,
      operation: "login" as const,
      identifier: "concurrent@example.test",
      ipAddress: "203.0.113.12",
    };
    await Promise.all(Array.from({ length: 20 }, () => value.consume(input)));
    const counts = await pool.query<{ count: number }>(
      "SELECT count FROM rate_limits WHERE key LIKE 'auth:%' ORDER BY key",
    );
    expect(counts.rows).toEqual([{ count: 20 }, { count: 20 }]);
  });

  it("fails closed when PostgreSQL rejects the transaction", async () => {
    const failure = new Error("database unavailable");
    const broken = createDatabaseAuthRateLimiter(
      {
        transaction: async () => {
          throw failure;
        },
      } as unknown as typeof database,
      { secret },
    );
    await expect(
      broken.consume({
        realm: "customer",
        operation: "login",
        identifier: "closed@example.test",
      }),
    ).rejects.toBe(failure);
  });

  it("cleans expired auth buckets in bounded batches without touching other namespaces", async () => {
    const expired = now - 25 * 60 * 60 * 1_000;
    await pool.query(
      `INSERT INTO rate_limits (key, count, last_request)
       SELECT 'auth:customer:login:identifier:expired-' || value, 1, $1
       FROM generate_series(1, 150) AS value`,
      [expired],
    );
    await pool.query(
      `INSERT INTO rate_limits (key, count, last_request) VALUES
       ('registration:expired-preserved', 1, $1),
       ('sign-in:expired-preserved', 1, $1),
       ('auth:customer:login:identifier:fresh-preserved', 1, $2)`,
      [expired, now],
    );

    const value = limiter();
    await value.consume({
      realm: "workforce",
      operation: "recovery",
      identifier: "cleanup-1",
    });
    const first = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM rate_limits WHERE key LIKE 'auth:%expired-%'",
    );
    expect(first.rows).toEqual([{ count: "50" }]);
    await value.consume({
      realm: "workforce",
      operation: "recovery",
      identifier: "cleanup-2",
    });
    const preserved = await pool.query<{ key: string }>(
      `SELECT key FROM rate_limits
       WHERE key IN ('registration:expired-preserved', 'sign-in:expired-preserved',
                     'auth:customer:login:identifier:fresh-preserved')
       ORDER BY key`,
    );
    expect(preserved.rows).toEqual([
      { key: "auth:customer:login:identifier:fresh-preserved" },
      { key: "registration:expired-preserved" },
      { key: "sign-in:expired-preserved" },
    ]);
  });

  it("never cleans inside a configured window longer than default retention", async () => {
    const withinWindow = now - 25 * 60 * 60 * 1_000;
    await pool.query(
      "INSERT INTO rate_limits (key, count, last_request) VALUES ('auth:within-long-window', 1, $1)",
      [withinWindow],
    );
    await limiter(3, 48 * 60 * 60 * 1_000).consume({
      realm: "customer",
      operation: "login",
      identifier: "long-window@example.test",
    });
    const found = await pool.query(
      "SELECT 1 FROM rate_limits WHERE key = 'auth:within-long-window'",
    );
    expect(found.rowCount).toBe(1);
  });
});

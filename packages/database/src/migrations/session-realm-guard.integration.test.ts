import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migration-test-safety";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeTestDatabaseUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeTestDatabaseUrl
  ? describe.sequential
  : describe.skip;
const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

const customerId = "00000000-0000-4000-8000-000000000101";
const workforceId = "00000000-0000-4000-8000-000000000102";

describePostgres("session identity boundary trigger", () => {
  const pool = new Pool({ connectionString: safeTestDatabaseUrl });

  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(drizzle(pool), { migrationsFolder });
    await pool.query(
      `INSERT INTO users (id, name, email, identity_realm, status)
       VALUES
         ($1, 'Customer', 'trigger-customer@example.test', 'customer', 'pending_review'),
         ($2, 'Workforce', 'trigger-workforce@example.test', 'workforce', 'active')`,
      [customerId, workforceId],
    );
  });

  afterAll(async () => pool.end());

  it("allows legal customer states and active workforce only", async () => {
    for (const status of ["pending_review", "active", "rejected"]) {
      await pool.query("UPDATE users SET status = $1 WHERE id = $2", [
        status,
        customerId,
      ]);
      await expect(
        pool.query(
          `INSERT INTO sessions (token, user_id, expires_at, realm)
           VALUES ($1, $2, now() + interval '1 hour', 'customer')`,
          [`customer-${status}`, customerId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    }

    await expect(
      pool.query(
        `INSERT INTO sessions (token, user_id, expires_at, realm)
         VALUES ('workforce-active', $1, now() + interval '1 hour', 'workforce')`,
        [workforceId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it("rejects cross-realm, disabled, and non-active workforce sessions", async () => {
    await expect(
      pool.query(
        `INSERT INTO sessions (token, user_id, expires_at, realm)
         VALUES ('realm-mismatch', $1, now() + interval '1 hour', 'workforce')`,
        [customerId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await pool.query("UPDATE users SET status = 'disabled' WHERE id = $1", [
      customerId,
    ]);
    await expect(
      pool.query(
        `INSERT INTO sessions (token, user_id, expires_at, realm)
         VALUES ('customer-disabled', $1, now() + interval '1 hour', 'customer')`,
        [customerId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await pool.query(
      "UPDATE users SET status = 'pending_review' WHERE id = $1",
      [workforceId],
    );
    await expect(
      pool.query(
        `INSERT INTO sessions (token, user_id, expires_at, realm)
         VALUES ('workforce-pending', $1, now() + interval '1 hour', 'workforce')`,
        [workforceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("serializes login-first with disable-and-revoke", async () => {
    await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [
      workforceId,
    ]);
    const login = await pool.connect();
    const disable = await pool.connect();
    try {
      await login.query("BEGIN");
      await login.query(
        `INSERT INTO sessions (token, user_id, expires_at, realm)
         VALUES ('race-login-first', $1, now() + interval '1 hour', 'workforce')`,
        [workforceId],
      );
      await disable.query("BEGIN");
      let disableSettled = false;
      const disableUser = disable
        .query("UPDATE users SET status = 'disabled' WHERE id = $1", [
          workforceId,
        ])
        .then(() => {
          disableSettled = true;
        });

      await delay(50);
      expect(disableSettled).toBe(false);
      await login.query("COMMIT");
      await disableUser;
      await disable.query("DELETE FROM sessions WHERE user_id = $1", [
        workforceId,
      ]);
      await disable.query("COMMIT");

      const sessions = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM sessions WHERE user_id = $1",
        [workforceId],
      );
      expect(sessions.rows).toEqual([{ count: "0" }]);
    } finally {
      await login.query("ROLLBACK").catch(() => undefined);
      await disable.query("ROLLBACK").catch(() => undefined);
      login.release();
      disable.release();
    }
  });

  it("rejects login after disable obtains the user lock first", async () => {
    await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [
      workforceId,
    ]);
    const disable = await pool.connect();
    const login = await pool.connect();
    try {
      await disable.query("BEGIN");
      await disable.query(
        "UPDATE users SET status = 'disabled' WHERE id = $1",
        [workforceId],
      );
      await login.query("BEGIN");
      let loginSettled = false;
      const insert = login
        .query(
          `INSERT INTO sessions (token, user_id, expires_at, realm)
           VALUES ('race-disable-first', $1, now() + interval '1 hour', 'workforce')`,
          [workforceId],
        )
        .finally(() => {
          loginSettled = true;
        });
      const rejectedInsert = expect(insert).rejects.toMatchObject({
        code: "23514",
      });

      await delay(50);
      expect(loginSettled).toBe(false);
      await disable.query("COMMIT");
      await rejectedInsert;
    } finally {
      await disable.query("ROLLBACK").catch(() => undefined);
      await login.query("ROLLBACK").catch(() => undefined);
      disable.release();
      login.release();
    }
  });

  it("records all seven forward migrations", async () => {
    const journal = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    expect(journal.rows).toEqual([{ count: "7" }]);
  });
});

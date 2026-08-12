import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertSafeIdentityMigrationTestDatabaseUrl,
  databaseSchema,
} from "@ai-agent-platform/database";

import {
  AssistantInputPolicyConflictError,
  createAssistantInputPolicyRepository,
} from "./assistant-input-policy";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;
const ACTOR_ID = "00000000-0000-4000-8000-000000000903";

describePostgres(
  safeUrl
    ? "assistant input policy PostgreSQL repository"
    : "assistant input policy PostgreSQL repository (blocked: TEST_DATABASE_URL is not set)",
  () => {
    const pool = new Pool({ connectionString: safeUrl });
    const database = drizzle(pool, { schema: databaseSchema });
    const repository = createAssistantInputPolicyRepository(database);
    const actor = { realm: "workforce" as const, userId: ACTOR_ID };

    beforeAll(async () => {
      await pool.query("select 1");
    });

    beforeEach(async () => {
      await pool.query(
        "TRUNCATE assistant_input_policy, audit_logs, users CASCADE",
      );
      await pool.query(
        `INSERT INTO users
           (id, name, email, identity_realm, status, email_verification_status)
         VALUES ($1, 'Policy admin', 'policy-admin@example.test', 'workforce', 'active', 'verified')`,
        [ACTOR_ID],
      );
    });

    afterAll(async () => pool.end());

    it("does not allow a stale revision to overwrite the newer policy", async () => {
      await repository.save({
        terms: ["first"],
        expectedRevision: 0,
        actor,
        requestId: "create-1",
      });
      await repository.save({
        terms: ["second"],
        expectedRevision: 1,
        actor,
        requestId: "update-2",
      });

      await expect(
        repository.save({
          terms: ["stale"],
          expectedRevision: 1,
          actor,
          requestId: "stale-3",
        }),
      ).rejects.toBeInstanceOf(AssistantInputPolicyConflictError);
      await expect(repository.load()).resolves.toMatchObject({
        terms: ["second"],
        revision: 2,
      });
    });

    it("allows exactly one simultaneous initial writer", async () => {
      const results = await Promise.allSettled(
        ["left", "right"].map((term, index) =>
          createAssistantInputPolicyRepository(database).save({
            terms: [term],
            expectedRevision: 0,
            actor,
            requestId: `concurrent-${index}`,
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        results
          .filter((result) => result.status === "rejected")
          .every(
            (result) =>
              result.status === "rejected" &&
              result.reason instanceof AssistantInputPolicyConflictError,
          ),
      ).toBe(true);
      const audits = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM audit_logs WHERE action = 'assistant.input_policy_updated'",
      );
      expect(audits.rows).toEqual([{ count: "1" }]);
    });

    it("rolls back the policy write when its audit insert fails", async () => {
      await pool.query(`
        CREATE FUNCTION fail_assistant_input_policy_audit() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.action = 'assistant.input_policy_updated' THEN
            RAISE EXCEPTION 'forced assistant input policy audit failure';
          END IF;
          RETURN NEW;
        END $$
      `);
      await pool.query(`
        CREATE TRIGGER fail_assistant_input_policy_audit
        BEFORE INSERT ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION fail_assistant_input_policy_audit()
      `);
      try {
        await expect(
          repository.save({
            terms: ["blocked"],
            expectedRevision: 0,
            actor,
            requestId: "audit-failure-1",
          }),
        ).rejects.toThrow();
      } finally {
        await pool.query(
          "DROP TRIGGER fail_assistant_input_policy_audit ON audit_logs",
        );
        await pool.query("DROP FUNCTION fail_assistant_input_policy_audit()");
      }
      await expect(repository.load()).resolves.toEqual({
        terms: [],
        revision: 0,
        updatedAt: null,
        updatedBy: null,
      });
    });
  },
);

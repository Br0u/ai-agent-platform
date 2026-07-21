import { randomUUID } from "node:crypto";

import { Pool, type PoolClient, type QueryResult } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";

const environmentUrls = {
  owner: process.env.SKILL_REGISTRY_TEST_DATABASE_URL,
  migrator: process.env.SKILL_REGISTRY_MIGRATOR_DATABASE_URL,
  manager: process.env.SKILL_REGISTRY_DATABASE_URL,
  runtime: process.env.SKILL_REGISTRY_RUNTIME_DATABASE_URL,
};
const environmentNames = {
  owner: "SKILL_REGISTRY_TEST_DATABASE_URL",
  migrator: "SKILL_REGISTRY_MIGRATOR_DATABASE_URL",
  manager: "SKILL_REGISTRY_DATABASE_URL",
  runtime: "SKILL_REGISTRY_RUNTIME_DATABASE_URL",
} as const;
const missingEnvironment = Object.entries(environmentUrls)
  .filter(([, value]) => !value)
  .map(([name]) => environmentNames[name as keyof typeof environmentNames]);
const configured = missingEnvironment.length === 0;
const requiredUrls = configured
  ? assertSameLocalTestDatabase(environmentUrls as Record<string, string>)
  : environmentUrls;
const describePostgres = configured ? describe.sequential : describe.skip;

function pgUrl(value: string | undefined): string {
  return (value ?? "postgresql://skipped@127.0.0.1/skipped").replace(
    "postgresql+psycopg_async://",
    "postgresql://",
  );
}

function assertSameLocalTestDatabase(
  urls: Record<string, string>,
): Record<string, string> {
  const ownerUrl = assertSafeIdentityMigrationTestDatabaseUrl(
    pgUrl(urls.owner),
  );
  const owner = new URL(ownerUrl);
  const expected = `${owner.hostname}:${owner.port || "5432"}${owner.pathname}`;
  for (const [role, value] of Object.entries(urls)) {
    const parsed = new URL(pgUrl(value));
    const actual = `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
    if (actual !== expected) {
      throw new Error(`${role} must target the dedicated local test database`);
    }
  }
  return urls;
}

async function expectDatabaseError(
  client: PoolClient,
  operation: () => Promise<QueryResult>,
  code: string,
): Promise<void> {
  await client.query("SAVEPOINT registry_boundary_assertion");
  try {
    await expect(operation()).rejects.toMatchObject({ code });
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT registry_boundary_assertion");
    await client.query("RELEASE SAVEPOINT registry_boundary_assertion");
  }
}

describePostgres(
  configured
    ? "Skill registry PostgreSQL role boundary"
    : `Skill registry PostgreSQL role boundary (missing ${missingEnvironment.join(", ")})`,
  () => {
    const owner = new Pool({ connectionString: pgUrl(requiredUrls.owner) });
    const manager = new Pool({ connectionString: pgUrl(requiredUrls.manager) });
    const runtime = new Pool({ connectionString: pgUrl(requiredUrls.runtime) });

    afterAll(async () => {
      await Promise.all([owner.end(), manager.end(), runtime.end()]);
    });

    it("allows only reviewed manager writes and keeps runtime isolated", async () => {
      const client = await manager.connect();
      const actorId = randomUUID();
      const reviewerId = randomUUID();
      const skillId = randomUUID();
      const revisionId = randomUUID();
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO skill_registry.skills (id, slug, created_by)
           VALUES ($1, $2, $3)`,
          [skillId, `ts-boundary-${randomUUID()}`, actorId],
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              `INSERT INTO skill_registry.skill_revisions (
                 id, skill_id, revision_no, state, source_type, manifest,
                 created_by, reviewed_by, reviewed_at
               ) VALUES ($1, $2, 2, 'published', 'upload', '{}'::jsonb,
                 $3, $3, now())`,
              [randomUUID(), skillId, actorId],
            ),
          "23514",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              `INSERT INTO skill_registry.skill_revisions (
                 id, skill_id, revision_no, state, source_type, manifest,
                 created_by, reviewed_by, reviewed_at
               ) VALUES ($1, $2, 2, 'pending_review', 'upload', '{}'::jsonb,
                 $3, $3, now())`,
              [randomUUID(), skillId, actorId],
            ),
          "23514",
        );
        await client.query(
          `INSERT INTO skill_registry.skill_revisions (
             id, skill_id, revision_no, state, source_type, manifest, created_by
           ) VALUES ($1, $2, 1, 'pending_review', 'upload', '{}'::jsonb, $3)`,
          [revisionId, skillId, actorId],
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              `UPDATE skill_registry.skill_revisions
               SET state = 'published', reviewed_by = $1, reviewed_at = now()
               WHERE id = $2`,
              [actorId, revisionId],
            ),
          "23514",
        );
        await client.query(
          `UPDATE skill_registry.skill_revisions
           SET state = 'published', reviewed_by = $1, reviewed_at = now()
           WHERE id = $2`,
          [reviewerId, revisionId],
        );
        await client.query(
          `INSERT INTO skill_registry.skill_control_events (
             id, request_id, assertion_nonce, actor, event_type,
             target_id, result_code
           ) VALUES ($1, $2, $3, $4, 'revision_published', $5, 'ok')`,
          [randomUUID(), randomUUID(), randomUUID(), reviewerId, revisionId],
        );
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        await client.query("SET CONSTRAINTS ALL DEFERRED");
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE skill_registry.skill_revisions SET manifest = '{}' WHERE id = $1",
              [revisionId],
            ),
          "42501",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "DELETE FROM skill_registry.skill_revisions WHERE id = $1",
              [revisionId],
            ),
          "42501",
        );
        await expectDatabaseError(
          client,
          () => client.query("TRUNCATE skill_registry.skill_revisions"),
          "42501",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query("CREATE TABLE skill_registry.forbidden(id integer)"),
          "42501",
        );
        await expectDatabaseError(
          client,
          () => client.query("SET session_replication_role = replica"),
          "42501",
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }

      await expect(
        runtime.query("SELECT * FROM skill_registry.skills LIMIT 0"),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("keeps backup read-only and all platform roles outside the registry", async () => {
      const backup = await owner.connect();
      await backup.query("BEGIN");
      try {
        await backup.query("SET LOCAL ROLE ai_agent_backup");
        await expect(
          backup.query("SELECT * FROM skill_registry.skills LIMIT 0"),
        ).resolves.toBeDefined();
        await expectDatabaseError(
          backup,
          () =>
            backup.query(
              "INSERT INTO skill_registry.skills (id, slug, created_by) VALUES ($1, $2, $3)",
              [randomUUID(), `backup-${randomUUID()}`, randomUUID()],
            ),
          "42501",
        );
      } finally {
        await backup.query("ROLLBACK");
        backup.release();
      }

      for (const role of [
        "ai_agent_migrator",
        "ai_agent_runtime",
        "ai_agent_agno_migrator",
        "ai_agent_agno",
        "ai_agent_control_migrator",
        "ai_agent_control",
      ]) {
        const outsider = await owner.connect();
        await outsider.query("BEGIN");
        try {
          await outsider.query(`SET LOCAL ROLE ${role}`);
          await expect(
            outsider.query("SELECT * FROM skill_registry.skills LIMIT 0"),
          ).rejects.toMatchObject({ code: "42501" });
        } finally {
          await outsider.query("ROLLBACK");
          outsider.release();
        }
      }
    });
  },
);

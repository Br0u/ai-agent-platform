import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";

const environmentUrls = {
  owner:
    process.env.ROLE_BOUNDARY_DATABASE_URL ?? process.env.TEST_DATABASE_URL,
  controlMigrator: process.env.AGENT_CONTROL_MIGRATOR_DATABASE_URL,
  controlRuntime: process.env.AGENT_CONTROL_DATABASE_URL,
  platformMigrator: process.env.MIGRATOR_DATABASE_URL,
  platformRuntime: process.env.RUNTIME_DATABASE_URL,
  backup: process.env.BACKUP_DATABASE_URL,
  agnoMigrator: process.env.AGNO_MIGRATOR_DATABASE_URL,
  agnoRuntime: process.env.AGNO_DATABASE_URL,
};

const environmentNames = {
  owner: "ROLE_BOUNDARY_DATABASE_URL (or TEST_DATABASE_URL)",
  controlMigrator: "AGENT_CONTROL_MIGRATOR_DATABASE_URL",
  controlRuntime: "AGENT_CONTROL_DATABASE_URL",
  platformMigrator: "MIGRATOR_DATABASE_URL",
  platformRuntime: "RUNTIME_DATABASE_URL",
  backup: "BACKUP_DATABASE_URL",
  agnoMigrator: "AGNO_MIGRATOR_DATABASE_URL",
  agnoRuntime: "AGNO_DATABASE_URL",
} as const;

const missingEnvironment = Object.entries(environmentUrls)
  .filter(([, value]) => !value)
  .map(([name]) => environmentNames[name as keyof typeof environmentNames]);
const configured = missingEnvironment.length === 0;
const requiredUrls = configured
  ? assertSameLocalTestDatabase(environmentUrls as Record<string, string>)
  : environmentUrls;
const describePostgres = configured ? describe.sequential : describe.skip;

const CONFIG_ID = "10000000-0000-4000-8000-000000000001";
const EVENT_ID = "20000000-0000-4000-8000-000000000001";
const REQUEST_ID = "30000000-0000-4000-8000-000000000001";
const ASSERTION_NONCE = "40000000-0000-4000-8000-000000000001";
const ACTOR_USER_ID = "50000000-0000-4000-8000-000000000001";

function assertSameLocalTestDatabase(
  urls: Record<string, string>,
): Record<string, string> {
  const ownerUrl = assertSafeIdentityMigrationTestDatabaseUrl(urls.owner ?? "");
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

function pgUrl(value: string | undefined): string {
  return (value ?? "postgresql://skipped@127.0.0.1/skipped").replace(
    "postgresql+psycopg_async://",
    "postgresql://",
  );
}

async function expectPermissionDenied(operation: Promise<unknown>) {
  await expect(operation).rejects.toMatchObject({ code: "42501" });
}

describePostgres(
  configured
    ? "Agent control PostgreSQL role boundary"
    : `Agent control PostgreSQL role boundary (missing ${missingEnvironment.join(", ")})`,
  () => {
    const owner = new Pool({ connectionString: pgUrl(requiredUrls.owner) });
    const controlMigrator = new Pool({
      connectionString: pgUrl(requiredUrls.controlMigrator),
    });
    const controlRuntime = new Pool({
      connectionString: pgUrl(requiredUrls.controlRuntime),
    });
    const platformMigrator = new Pool({
      connectionString: pgUrl(requiredUrls.platformMigrator),
    });
    const platformRuntime = new Pool({
      connectionString: pgUrl(requiredUrls.platformRuntime),
    });
    const backup = new Pool({ connectionString: pgUrl(requiredUrls.backup) });
    const agnoMigrator = new Pool({
      connectionString: pgUrl(requiredUrls.agnoMigrator),
    });
    const agnoRuntime = new Pool({
      connectionString: pgUrl(requiredUrls.agnoRuntime),
    });

    const clearFixtures = async () => {
      await controlMigrator.query(
        "DELETE FROM agent_control.active_model_config",
      );
      await controlMigrator.query("DELETE FROM agent_control.control_events");
      await controlMigrator.query("DELETE FROM agent_control.model_configs");
    };

    beforeAll(clearFixtures);

    afterAll(async () => {
      await clearFixtures();
      await Promise.all([
        owner.end(),
        controlMigrator.end(),
        controlRuntime.end(),
        platformMigrator.end(),
        platformRuntime.end(),
        backup.end(),
        agnoMigrator.end(),
        agnoRuntime.end(),
      ]);
    });

    it("allows only the configured runtime model-config and active-pointer writes", async () => {
      await expect(
        controlRuntime.query(
          `INSERT INTO agent_control.model_configs (
            id, provider, model_id, endpoint_id,
            api_key_ciphertext, api_key_nonce, api_key_last_four,
            encryption_key_version, revision, is_current, test_status
          ) VALUES ($1, 'minimax', 'abab-test', 'minimax-official',
            $2, $3, 'test', 1, 1, true, 'untested')`,
          [CONFIG_ID, Buffer.from("ciphertext"), Buffer.from("123456789012")],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        controlRuntime.query(
          `UPDATE agent_control.model_configs
          SET test_status = 'passed', last_tested_at = now(), updated_at = now()
          WHERE id = $1`,
          [CONFIG_ID],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        controlRuntime.query(
          `INSERT INTO agent_control.active_model_config (
            singleton, model_config_id, config_revision, activation_version
          ) VALUES (true, $1, 1, 1)`,
          [CONFIG_ID],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        controlRuntime.query(
          `UPDATE agent_control.active_model_config
          SET activation_version = 2, activated_at = now()
          WHERE singleton`,
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        controlRuntime.query(
          "SELECT id FROM agent_control.model_configs WHERE id = $1",
          [CONFIG_ID],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        controlRuntime.query(
          "SELECT model_config_id FROM agent_control.active_model_config WHERE singleton",
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      await expect(
        controlRuntime.query(
          "UPDATE agent_control.model_configs SET is_current = false WHERE id = $1",
          [CONFIG_ID],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expectPermissionDenied(
        controlRuntime.query(
          "UPDATE agent_control.model_configs SET is_current = true WHERE id = $1",
          [CONFIG_ID],
        ),
      );
      await expectPermissionDenied(
        controlRuntime.query(
          "UPDATE agent_control.model_configs SET model_id = 'forbidden' WHERE id = $1",
          [CONFIG_ID],
        ),
      );
      await expectPermissionDenied(
        controlRuntime.query(
          "DELETE FROM agent_control.model_configs WHERE id = $1",
          [CONFIG_ID],
        ),
      );
    });

    it("keeps control events append-only for the runtime role", async () => {
      await expect(
        controlRuntime.query(
          `INSERT INTO agent_control.control_events (
            id, request_id, assertion_nonce, actor_user_id, action,
            provider, model_id, endpoint_id, config_revision, result
          ) VALUES ($1, $2, $3, $4, 'test', 'minimax', 'abab-test',
            'minimax-official', 1, 'success')`,
          [EVENT_ID, REQUEST_ID, ASSERTION_NONCE, ACTOR_USER_ID],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        controlRuntime.query(
          "SELECT id FROM agent_control.control_events WHERE id = $1",
          [EVENT_ID],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expectPermissionDenied(
        controlRuntime.query(
          "UPDATE agent_control.control_events SET result = 'failure' WHERE id = $1",
          [EVENT_ID],
        ),
      );
      await expectPermissionDenied(
        controlRuntime.query(
          "DELETE FROM agent_control.control_events WHERE id = $1",
          [EVENT_ID],
        ),
      );
    });

    it("denies control runtime schema and table DDL", async () => {
      await expectPermissionDenied(
        controlRuntime.query("CREATE SCHEMA forbidden_agent_control"),
      );
      await expectPermissionDenied(
        controlRuntime.query("DROP SCHEMA agent_control CASCADE"),
      );
      await expectPermissionDenied(
        controlRuntime.query("CREATE TABLE agent_control.forbidden(id int)"),
      );
      await expectPermissionDenied(
        controlRuntime.query("DROP TABLE agent_control.model_configs"),
      );
    });

    it("keeps all platform, backup, and Agno roles out of agent_control", async () => {
      for (const pool of [
        platformMigrator,
        platformRuntime,
        backup,
        agnoMigrator,
        agnoRuntime,
      ]) {
        await expectPermissionDenied(
          pool.query("SELECT * FROM agent_control.model_configs LIMIT 0"),
        );
        await expectPermissionDenied(
          pool.query("SELECT * FROM agent_control.active_model_config LIMIT 0"),
        );
        await expectPermissionDenied(
          pool.query("SELECT * FROM agent_control.control_events LIMIT 0"),
        );
      }
    });

    it("reports the exact information_schema runtime grants", async () => {
      const grants = await owner.query<{
        table_name: string;
        privilege_type: string;
      }>(`SELECT table_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'agent_control'
          AND grantee = 'ai_agent_control'
        ORDER BY table_name, privilege_type`);

      expect(grants.rows).toEqual([
        { table_name: "active_model_config", privilege_type: "INSERT" },
        { table_name: "active_model_config", privilege_type: "SELECT" },
        { table_name: "active_model_config", privilege_type: "UPDATE" },
        { table_name: "control_events", privilege_type: "INSERT" },
        { table_name: "control_events", privilege_type: "SELECT" },
        { table_name: "model_configs", privilege_type: "INSERT" },
        { table_name: "model_configs", privilege_type: "SELECT" },
        { table_name: "model_configs", privilege_type: "UPDATE" },
      ]);
    });
  },
);

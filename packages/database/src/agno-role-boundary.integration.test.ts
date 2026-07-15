import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";

const configuredUrls = {
  owner:
    process.env.ROLE_BOUNDARY_DATABASE_URL ?? process.env.TEST_DATABASE_URL,
  platformMigrator: process.env.MIGRATOR_DATABASE_URL,
  platformRuntime: process.env.RUNTIME_DATABASE_URL,
  backup: process.env.BACKUP_DATABASE_URL,
  agnoMigrator: process.env.AGNO_MIGRATOR_DATABASE_URL,
  agnoRuntime: process.env.AGNO_DATABASE_URL,
};

const configured = Object.values(configuredUrls).every(Boolean);
const requiredUrls = configured
  ? assertSameLocalTestDatabase(configuredUrls as Record<string, string>)
  : configuredUrls;
const describePostgres = configured ? describe.sequential : describe.skip;

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

describePostgres("Agno PostgreSQL role boundary", () => {
  const owner = new Pool({ connectionString: pgUrl(requiredUrls.owner) });
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

  beforeAll(async () => {
    await agnoMigrator.query("DROP TABLE IF EXISTS agno.agno_default_fixture");
    await agnoMigrator.query(`
      CREATE TABLE agno.agno_default_fixture (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        value text NOT NULL
      )
    `);
  });

  afterAll(async () => {
    await agnoMigrator.query("DROP TABLE IF EXISTS agno.agno_default_fixture");
    await Promise.all([
      owner.end(),
      platformMigrator.end(),
      platformRuntime.end(),
      backup.end(),
      agnoMigrator.end(),
      agnoRuntime.end(),
    ]);
  });

  it("denies both Agno roles access to the platform schema", async () => {
    const privileges = await owner.query<{
      runtime_usage: boolean;
      migrator_usage: boolean;
    }>(`SELECT
      has_schema_privilege('ai_agent_agno', 'public', 'USAGE') AS runtime_usage,
      has_schema_privilege('ai_agent_agno_migrator', 'public', 'USAGE') AS migrator_usage`);

    expect(privileges.rows).toEqual([
      { runtime_usage: false, migrator_usage: false },
    ]);
    await expectPermissionDenied(
      agnoRuntime.query("SELECT * FROM public.users"),
    );
    await expectPermissionDenied(
      agnoMigrator.query("SELECT * FROM public.users"),
    );
  });

  it("keeps platform roles out of the Agno schema", async () => {
    await expectPermissionDenied(
      platformRuntime.query("SELECT * FROM agno.agno_sessions"),
    );
    await expectPermissionDenied(
      platformMigrator.query("SELECT * FROM agno.agno_sessions"),
    );
  });

  it("restores current Agno table grants for runtime and backup", async () => {
    await expect(
      agnoRuntime.query("SELECT * FROM agno.agno_sessions LIMIT 0"),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      backup.query("SELECT * FROM agno.agno_sessions LIMIT 0"),
    ).resolves.toMatchObject({ rowCount: 0 });
  });

  it("allows runtime DML and identity sequence use but denies runtime DDL", async () => {
    const inserted = await agnoRuntime.query<{ id: string }>(
      "INSERT INTO agno.agno_default_fixture (value) VALUES ('runtime') RETURNING id::text",
    );
    expect(inserted.rows[0]?.id).toBeDefined();
    await expect(
      agnoRuntime.query(
        "UPDATE agno.agno_default_fixture SET value = 'updated' WHERE id = $1",
        [inserted.rows[0]?.id],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      agnoRuntime.query("DELETE FROM agno.agno_default_fixture WHERE id = $1", [
        inserted.rows[0]?.id,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectPermissionDenied(
      agnoRuntime.query("CREATE TABLE agno.forbidden(id int)"),
    );
  });

  it("allows backup reads but denies sequence usage and update", async () => {
    await agnoMigrator.query(
      "INSERT INTO agno.agno_default_fixture (value) VALUES ('backup')",
    );
    await expect(
      backup.query("SELECT id, value FROM agno.agno_default_fixture"),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      backup.query("SELECT last_value FROM agno.agno_default_fixture_id_seq"),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectPermissionDenied(
      backup.query("SELECT nextval('agno.agno_default_fixture_id_seq')"),
    );
    await expectPermissionDenied(
      backup.query("SELECT setval('agno.agno_default_fixture_id_seq', 1)"),
    );

    const privileges = await owner.query<{
      can_select: boolean;
      can_usage: boolean;
      can_update: boolean;
    }>(`SELECT
      has_sequence_privilege('ai_agent_backup', 'agno.agno_default_fixture_id_seq', 'SELECT') AS can_select,
      has_sequence_privilege('ai_agent_backup', 'agno.agno_default_fixture_id_seq', 'USAGE') AS can_usage,
      has_sequence_privilege('ai_agent_backup', 'agno.agno_default_fixture_id_seq', 'UPDATE') AS can_update`);
    expect(privileges.rows).toEqual([
      { can_select: true, can_usage: false, can_update: false },
    ]);
  });
});

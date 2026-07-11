import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import {
  createDrizzleAccessControlRepository,
  seedAccessControl,
} from "../seed-access-control";
import * as schema from "../schema";
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

describePostgres(
  "system ownership migration from an applied 0001 database",
  () => {
    it("applies pending 0002 before seeding and preserves legacy rows as custom", async () => {
      const appliedMigrationsFolder = mkdtempSync(
        join(tmpdir(), "ai-agent-platform-applied-0001-"),
      );
      mkdirSync(join(appliedMigrationsFolder, "meta"));
      for (const migration of [
        "0000_tired_cardiac.sql",
        "0001_identity_access_control.sql",
      ]) {
        cpSync(
          join(migrationsFolder, migration),
          join(appliedMigrationsFolder, migration),
        );
      }
      const journal = JSON.parse(
        readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
      ) as { entries: unknown[] };
      writeFileSync(
        join(appliedMigrationsFolder, "meta/_journal.json"),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
      );

      const pool = new Pool({ connectionString: safeTestDatabaseUrl });
      const database = drizzle(pool, { schema });
      try {
        await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
        await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
        await pool.query("CREATE SCHEMA public");
        await migrate(database, { migrationsFolder: appliedMigrationsFolder });
        await pool.query(
          `INSERT INTO roles (name, realm_scope) VALUES ('legacy-custom', 'workforce');
         INSERT INTO permissions (key, name) VALUES ('custom:legacy', 'Legacy custom');`,
        );

        await migrate(database, { migrationsFolder });
        await seedAccessControl(createDrizzleAccessControlRepository(database));

        const legacy = await pool.query<{
          is_system: boolean;
          managed_by_system: boolean;
        }>(
          `SELECT r.is_system, p.managed_by_system
         FROM roles r, permissions p
         WHERE r.name = 'legacy-custom' AND p.key = 'custom:legacy'`,
        );
        expect(legacy.rows).toEqual([
          { is_system: false, managed_by_system: false },
        ]);

        const counts = await pool.query<{
          journal: string;
          system_roles: string;
          system_permissions: string;
        }>(
          `SELECT
          (SELECT count(*)::text FROM drizzle.__drizzle_migrations) AS journal,
          (SELECT count(*)::text FROM roles WHERE is_system) AS system_roles,
          (SELECT count(*)::text FROM permissions WHERE managed_by_system) AS system_permissions`,
        );
        expect(counts.rows).toEqual([
          { journal: "3", system_roles: "7", system_permissions: "17" },
        ]);
      } finally {
        await pool.end();
        rmSync(appliedMigrationsFolder, { recursive: true });
      }
    });
  },
);

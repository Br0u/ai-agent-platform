import {
  copyFileSync,
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

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeTestDatabaseUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeTestDatabaseUrl
  ? describe.sequential
  : describe.skip;
const migrationsDirectory = fileURLToPath(
  new URL("../drizzle/", import.meta.url),
);
const seedSql = readFileSync(
  join(migrationsDirectory, "0007_cms_document_seed.sql"),
  "utf8",
);
const finalSeedIdentity = {
  contentId: "019f79c8-9a00-7000-8000-000000000007",
  revisionId: "019f79c8-9a00-7000-9000-000000000007",
  slug: "faq",
} as const;

describePostgres("generated document seed migration", () => {
  it("is a no-op when the actual seed body is applied a second time", async () => {
    const pool = new Pool({ connectionString: safeTestDatabaseUrl });
    const partialMigrations = createThrough0006MigrationFolder();
    try {
      await resetThrough0006(pool, partialMigrations);
      await pool.query(seedSql);
      const first = await readSeedState(pool);

      await expect(pool.query(seedSql)).resolves.toBeDefined();
      const second = await readSeedState(pool);

      expect(first).toEqual(second);
      expect(second.content).toHaveLength(7);
      expect(second.revisions).toHaveLength(7);
      expect(second.routes).toHaveLength(7);
    } finally {
      await pool.end();
      rmSync(partialMigrations, { recursive: true, force: true });
    }
  });

  it("aborts atomically on conflicting fixed identity without overwriting", async () => {
    const pool = new Pool({ connectionString: safeTestDatabaseUrl });
    const partialMigrations = createThrough0006MigrationFolder();
    const target = {
      id: "019f79c8-9a00-7000-8000-000000000007",
      slug: "faq",
    } as const;
    const otherId = "019f79c8-9a00-7000-a000-000000000099";

    try {
      await resetThrough0006(pool, partialMigrations);
      await pool.query(
        `INSERT INTO content (id, type, slug, title, summary, body)
         VALUES ($1::uuid, 'document', 'conflicting-fixed-id', 'fixed-id-owner', 'unchanged', '{"owner":"fixed-id"}'::jsonb),
                ($2::uuid, 'document', $3, 'fixed-slug-owner', 'unchanged', '{"owner":"fixed-slug"}'::jsonb)`,
        [target.id, otherId, target.slug],
      );

      await expect(pool.query(seedSql)).rejects.toThrow(
        `DOCUMENT_SEED_IDENTITY_COLLISION:${target.slug}`,
      );

      const conflicts = await pool.query<{
        id: string;
        slug: string;
        title: string;
        body: { owner: string };
      }>(
        `SELECT id::text, slug, title, body
         FROM content
         WHERE id = ANY($1::uuid[])
         ORDER BY title`,
        [[target.id, otherId]],
      );
      expect(conflicts.rows).toEqual([
        {
          id: target.id,
          slug: "conflicting-fixed-id",
          title: "fixed-id-owner",
          body: { owner: "fixed-id" },
        },
        {
          id: otherId,
          slug: target.slug,
          title: "fixed-slug-owner",
          body: { owner: "fixed-slug" },
        },
      ]);

      const partialWrites = await pool.query<{
        content: string;
        revisions: string;
        routes: string;
      }>(
        `SELECT
           (SELECT count(*) FROM content WHERE slug = ANY($1::text[]) AND id <> $2::uuid)::text AS content,
           (SELECT count(*) FROM content_revisions)::text AS revisions,
           (SELECT count(*) FROM content_routes)::text AS routes`,
        [
          [
            "quick-start",
            "deployment",
            "upgrade",
            "operations",
            "api",
            "hardware",
            "faq",
          ],
          otherId,
        ],
      );
      expect(partialWrites.rows).toEqual([
        { content: "0", revisions: "0", routes: "0" },
      ]);
    } finally {
      await pool.end();
      rmSync(partialMigrations, { recursive: true, force: true });
    }
  });

  it("rejects NULL, actor and timestamp revision drift without overwriting", async () => {
    const pool = new Pool({ connectionString: safeTestDatabaseUrl });
    const partialMigrations = createThrough0006MigrationFolder();
    const actorId = "019f79c8-9a00-7000-a000-000000000077";
    const corruptions = [
      {
        name: "null-summary",
        prepare: () =>
          pool.query(
            `UPDATE content_revisions SET summary = NULL WHERE id = $1::uuid`,
            [finalSeedIdentity.revisionId],
          ),
      },
      {
        name: "unexpected-actor",
        prepare: async () => {
          await pool.query(
            `INSERT INTO users (id, name, email, identity_realm)
             VALUES ($1::uuid, 'seed corruption actor', 'seed-corruption@example.test', 'workforce')`,
            [actorId],
          );
          await pool.query(
            `UPDATE content_revisions SET created_by = $1::uuid WHERE id = $2::uuid`,
            [actorId, finalSeedIdentity.revisionId],
          );
        },
      },
      {
        name: "unexpected-created-at",
        prepare: () =>
          pool.query(
            `UPDATE content_revisions
             SET created_at = '2026-07-19T00:00:01.000Z'::timestamptz
             WHERE id = $1::uuid`,
            [finalSeedIdentity.revisionId],
          ),
      },
    ];

    try {
      for (const corruption of corruptions) {
        await resetThrough0006(pool, partialMigrations);
        await pool.query(seedSql);
        await pool.query(
          `ALTER TABLE content_revisions DISABLE TRIGGER content_revisions_immutable`,
        );
        await corruption.prepare();
        await pool.query(
          `ALTER TABLE content_revisions ENABLE TRIGGER content_revisions_immutable`,
        );
        const before = await readRevisionIdentity(pool);

        await expect(pool.query(seedSql), corruption.name).rejects.toThrow(
          `DOCUMENT_SEED_IDENTITY_COLLISION:${finalSeedIdentity.slug}`,
        );
        expect(await readRevisionIdentity(pool), corruption.name).toEqual(
          before,
        );
      }
    } finally {
      await pool.end();
      rmSync(partialMigrations, { recursive: true, force: true });
    }
  });

  it("fails closed on a partial exact prefix instead of resuming", async () => {
    const pool = new Pool({ connectionString: safeTestDatabaseUrl });
    const partialMigrations = createThrough0006MigrationFolder();
    const stopBeforeOperations = seedSql.indexOf(
      "-- Document seed: operations",
    );
    if (stopBeforeOperations < 0) throw new Error("SEED_PREFIX_MARKER_MISSING");

    try {
      await resetThrough0006(pool, partialMigrations);
      await pool.query(seedSql.slice(0, stopBeforeOperations));
      const before = await readSeedState(pool);
      expect(before.content).toHaveLength(3);
      expect(before.revisions).toHaveLength(3);
      expect(before.routes).toHaveLength(3);

      await expect(pool.query(seedSql)).rejects.toThrow(
        "DOCUMENT_SEED_PARTIAL_STATE",
      );
      expect(await readSeedState(pool)).toEqual(before);
    } finally {
      await pool.end();
      rmSync(partialMigrations, { recursive: true, force: true });
    }
  });
});

function createThrough0006MigrationFolder(): string {
  const directory = mkdtempSync(join(tmpdir(), "cms-through-0006-"));
  const metadata = join(directory, "meta");
  mkdirSync(metadata);

  for (let index = 0; index <= 6; index += 1) {
    const prefix = index.toString().padStart(4, "0");
    const source = [
      "0000_tired_cardiac.sql",
      "0001_identity_access_control.sql",
      "0002_session_realm_guard.sql",
      "0003_registration_company_name.sql",
      "0004_registration_query_indexes.sql",
      "0005_identity_pagination_indexes.sql",
      "0006_cms_documents.sql",
    ][index];
    if (!source.startsWith(prefix)) throw new Error("MIGRATION_FIXTURE_ORDER");
    copyFileSync(join(migrationsDirectory, source), join(directory, source));
  }

  const journal = JSON.parse(
    readFileSync(join(migrationsDirectory, "meta/_journal.json"), "utf8"),
  ) as { version: string; dialect: string; entries: Array<{ idx: number }> };
  journal.entries = journal.entries.filter(({ idx }) => idx <= 6);
  writeFileSync(
    join(metadata, "_journal.json"),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
  return directory;
}

async function resetThrough0006(
  pool: Pool,
  partialMigrations: string,
): Promise<void> {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("CREATE SCHEMA public");
  await migrate(drizzle(pool), { migrationsFolder: partialMigrations });
}

async function readSeedState(pool: Pool) {
  const content = await pool.query(
    `SELECT id::text, slug, title, summary, body, status, revision, row_version, published_revision
     FROM content WHERE type = 'document' ORDER BY slug`,
  );
  const revisions = await pool.query(
    `SELECT id::text, content_id::text, revision, slug, title, summary, body
     FROM content_revisions ORDER BY slug`,
  );
  const routes = await pool.query(
    `SELECT slug, content_id::text, state
     FROM content_routes ORDER BY slug`,
  );
  return {
    content: content.rows,
    revisions: revisions.rows,
    routes: routes.rows,
  };
}

async function readRevisionIdentity(pool: Pool) {
  const result = await pool.query(
    `SELECT id::text, content_id::text, revision, slug, title, summary, body,
            created_by::text, created_at::text
     FROM content_revisions
     WHERE id = $1::uuid`,
    [finalSeedIdentity.revisionId],
  );
  return result.rows;
}

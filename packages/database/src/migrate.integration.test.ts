import {
  copyFile,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";

async function migrationsThrough0011() {
  const folder = await mkdtemp(join(tmpdir(), "download-resource-migrations-"));
  const source = new URL("../drizzle/", import.meta.url);
  await mkdir(join(folder, "meta"));
  for (const entry of await readdir(source)) {
    if (/^00(?:0[0-9]|1[01])_.*\.sql$/u.test(entry))
      await copyFile(new URL(entry, source), join(folder, entry));
  }
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", source), "utf8"),
  ) as { entries: Array<{ idx: number }> };
  await writeFile(
    join(folder, "meta/_journal.json"),
    `${JSON.stringify({ ...journal, entries: journal.entries.filter(({ idx }) => idx <= 11) }, null, 2)}\n`,
  );
  return folder;
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.RUN_DOWNLOAD_RESOURCE_DB_TEST === "true" && !testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required when RUN_DOWNLOAD_RESOURCE_DB_TEST=true",
  );
}
const safeTestDatabaseUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeTestDatabaseUrl
  ? describe.sequential
  : describe.skip;

describePostgres("download resource contraction migration", () => {
  it("backfills 0012 artifacts then removes legacy PDF columns in 0013", async () => {
    const reset = new Pool({ connectionString: safeTestDatabaseUrl });
    await reset.query("DROP SCHEMA IF EXISTS public CASCADE");
    await reset.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await reset.query("CREATE SCHEMA public");
    await reset.end();

    const legacyFolder = await migrationsThrough0011();
    const before = new Pool({ connectionString: safeTestDatabaseUrl });
    const client = await before.connect();
    try {
      await migrate(drizzle(client), { migrationsFolder: legacyFolder });
    } finally {
      client.release();
      await before.end();
      await rm(legacyFolder, { recursive: true, force: true });
    }

    const legacy = new Pool({ connectionString: safeTestDatabaseUrl });
    const inserted = await legacy.query<{ id: string }>(
      `INSERT INTO download_resource_revisions
       (resource_id, name, product, category, resource_type, description, sort_order, preview_policy, download_policy, pdf_object_key, cover_object_key, page_count, byte_size, sha256)
       SELECT id, 'Legacy PDF', '元启', 'materials', '说明书', 'legacy PDF', 999, 'public', 'public', 'downloads/legacy.pdf', 'downloads/legacy.webp', 3, 1024, repeat('a', 64)
       FROM download_resources WHERE key = 'yuanqi-fullstack' RETURNING id::text`,
    );
    await legacy.query(
      "UPDATE download_resources SET draft_revision_id = $1 WHERE key = 'yuanqi-fullstack'",
      [inserted.rows[0]?.id],
    );
    await legacy.end();

    const after = new Pool({ connectionString: safeTestDatabaseUrl });
    const afterClient = await after.connect();
    try {
      await migrate(drizzle(afterClient), {
        migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
      });
    } finally {
      afterClient.release();
      await after.end();
    }

    const verify = new Pool({ connectionString: safeTestDatabaseUrl });
    try {
      const artifact = await verify.query<{
        objectKey: string;
        filename: string;
        mediaType: string;
        byteSize: number;
        sha256: string;
        pageCount: number;
        coverObjectKey: string;
        revisionKind: string;
        slot: string;
      }>(
        `SELECT object_key AS "objectKey", original_filename AS filename,
                media_type AS "mediaType", byte_size AS "byteSize", sha256,
                page_count AS "pageCount", cover_object_key AS "coverObjectKey",
                revision_kind::text AS "revisionKind", slot::text AS slot
         FROM download_resource_artifacts WHERE revision_id = $1`,
        [inserted.rows[0]?.id],
      );
      expect(artifact.rows).toEqual([
        {
          objectKey: "downloads/legacy.pdf",
          filename: "yuanqi-fullstack.pdf",
          mediaType: "application/pdf",
          byteSize: 1024,
          sha256: "a".repeat(64),
          pageCount: 3,
          coverObjectKey: "downloads/legacy.webp",
          revisionKind: "document",
          slot: "document",
        },
      ]);
      const columns = await verify.query<{ columnName: string }>(
        `SELECT column_name AS "columnName" FROM information_schema.columns WHERE table_name = 'download_resource_revisions'`,
      );
      expect(columns.rows.map(({ columnName }) => columnName)).not.toEqual(
        expect.arrayContaining([
          "pdf_object_key",
          "cover_object_key",
          "page_count",
          "byte_size",
          "sha256",
        ]),
      );
      await expect(
        verify.query(
          "INSERT INTO download_resources (key, admin_label) VALUES ('missing-kind', 'missing')",
        ),
      ).rejects.toMatchObject({ code: "23502" });
    } finally {
      await verify.end();
    }
  });
});

import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
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
import { runMigrations } from "./migrate";

async function createMigrationsThrough0011() {
  const folder = await mkdtemp(join(tmpdir(), "download-resource-migrations-"));
  const sourceFolder = new URL("../drizzle/", import.meta.url);
  const targetMeta = join(folder, "meta");
  await mkdir(targetMeta);

  for (const entry of await readdir(sourceFolder)) {
    if (/^00(?:0[0-9]|1[01])_.*\.sql$/u.test(entry)) {
      await copyFile(new URL(entry, sourceFolder), join(folder, entry));
    }
  }

  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", sourceFolder), "utf8"),
  ) as { entries: Array<{ idx: number }> };
  await writeFile(
    join(targetMeta, "_journal.json"),
    `${JSON.stringify(
      { ...journal, entries: journal.entries.filter(({ idx }) => idx <= 11) },
      null,
      2,
    )}\n`,
  );
  return folder;
}

const expectedDocumentSeed = [
  [
    "019f79c8-9a00-7000-8000-000000000001",
    "019f79c8-9a00-7000-9000-000000000001",
    "quick-start",
    "33ddd1cd30f25884725d4cdf0bd0aef0ff85742d0dc382a7e47495b2edf64838",
  ],
  [
    "019f79c8-9a00-7000-8000-000000000002",
    "019f79c8-9a00-7000-9000-000000000002",
    "deployment",
    "08488fdcd68d1c3ba072b4cddf193185c12cd4d19e81255a6a0465efffcb9ec9",
  ],
  [
    "019f79c8-9a00-7000-8000-000000000003",
    "019f79c8-9a00-7000-9000-000000000003",
    "upgrade",
    "f77bdd3eee2ed93f82d5c3a8f84b16f730aa60fa1f23b5525eb0db55bf5c71f9",
  ],
  [
    "019f79c8-9a00-7000-8000-000000000004",
    "019f79c8-9a00-7000-9000-000000000104",
    "operations",
    "83a4f710414e8bd1801e99e9dde25f918c35db833f6bbc655f75b85a3bc3c9e9",
  ],
  [
    "019f79c8-9a00-7000-8000-000000000005",
    "019f79c8-9a00-7000-9000-000000000005",
    "api",
    "544aacad1561d60ebd9e1d87c8f89555139c436f19f7ae0a57cb99822ca64e8d",
  ],
  [
    "019f79c8-9a00-7000-8000-000000000006",
    "019f79c8-9a00-7000-9000-000000000006",
    "hardware",
    "5acbf90b4eea4cfcb78f0a52e4bfd362da32ec96e88c4ab989cdb86f701893c4",
  ],
  [
    "019f79c8-9a00-7000-8000-000000000007",
    "019f79c8-9a00-7000-9000-000000000007",
    "faq",
    "c52d93faddff6e97e7c95b14bba6fce65fc3900289818c6e2cf767ff017a4006",
  ],
] as const;

const expectedDownloadResourceKeys = [
  "yuanqi-fullstack",
  "yuanqi-appliance",
  "yuanqi-cases",
  "yuanqi-folder",
  "yuanqi-usage",
  "mdd2-intro",
  "mdd2-solution",
  "office-appliance",
  "office-doc",
  "office-contract",
  "office-bid",
  "daoban-appliance",
  "daoban-gov",
  "daoban-assistant",
  "vision-folder",
  "vision-solution",
  "vision-intro",
  "vision-usage",
  "mdd2-client",
  "yuanqi-deploy",
  "yuanqi-faq",
  "wp-yuanqi-tech",
] as const;

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

describePostgres("concurrent production migrations", () => {
  it("serializes two migrators and records each journal entry once", async () => {
    const setupPool = new Pool({ connectionString: safeTestDatabaseUrl });
    await setupPool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await setupPool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await setupPool.query("CREATE SCHEMA public");
    await setupPool.end();

    const run = async () => {
      const pool = new Pool({ connectionString: safeTestDatabaseUrl });
      const client = await pool.connect();
      await runMigrations(drizzle(client), client, () => pool.end(), migrate);
    };

    await expect(Promise.all([run(), run()])).resolves.toEqual([
      undefined,
      undefined,
    ]);

    const verifier = new Pool({ connectionString: safeTestDatabaseUrl });
    const journal = await verifier.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    const content = await verifier.query<{
      contentId: string;
      revisionId: string;
      slug: string;
      type: string;
      status: string;
      publishedRevision: number;
      contentChecksum: string;
      revisionChecksum: string;
      source: string;
      canonicalSlug: string;
      routeContentId: string;
    }>(
      `SELECT
         c.id::text AS "contentId",
         cr.id::text AS "revisionId",
         c.slug,
         c.type,
         c.status::text,
         c.published_revision AS "publishedRevision",
         c.body->>'checksum' AS "contentChecksum",
         cr.body->>'checksum' AS "revisionChecksum",
         cr.body->>'source' AS source,
         r.slug AS "canonicalSlug",
         r.content_id::text AS "routeContentId"
       FROM content c
       JOIN content_revisions cr
         ON cr.content_id = c.id AND cr.revision = c.published_revision
       JOIN content_routes r
         ON r.content_id = c.id AND r.state = 'canonical'
       WHERE c.type = 'document'
       ORDER BY (c.body->'navigation'->>'position')::integer`,
    );
    const revisions = await verifier.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM content_revisions cr
       JOIN content c ON c.id = cr.content_id
       WHERE c.type = 'document' AND cr.revision = 1`,
    );
    const routes = await verifier.query<{
      canonical: string;
      reserved: string;
      alias: string;
      total: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE r.state = 'canonical')::text AS canonical,
         count(*) FILTER (WHERE r.state = 'reserved')::text AS reserved,
         count(*) FILTER (WHERE r.state = 'alias')::text AS alias,
         count(*)::text AS total
       FROM content_routes r
       JOIN content c ON c.id = r.content_id
       WHERE c.type = 'document'`,
    );
    expect(content.rows).toEqual(
      expectedDocumentSeed.map(([contentId, revisionId, slug, checksum]) => ({
        contentId,
        revisionId,
        slug,
        type: "document",
        status: "published",
        publishedRevision: slug === "operations" ? 2 : 1,
        contentChecksum: checksum,
        revisionChecksum: checksum,
        source:
          slug === "operations"
            ? expect.stringContaining("/downloads#dl-mdd2-env")
            : expect.any(String),
        canonicalSlug: slug,
        routeContentId: contentId,
      })),
    );
    expect(
      content.rows.find(({ slug }) => slug === "operations")?.source,
    ).not.toContain("/compatibility");
    expect(revisions.rows).toEqual([{ count: "7" }]);
    expect(routes.rows).toEqual([
      { canonical: "7", reserved: "0", alias: "0", total: "7" },
    ]);

    const inputPolicy = await verifier.query<{
      id: number;
      terms: string[];
      revision: number;
    }>(
      "INSERT INTO assistant_input_policy (id) VALUES (1) RETURNING id, terms, revision",
    );
    expect(inputPolicy.rows).toEqual([{ id: 1, terms: [], revision: 1 }]);

    const downloadResources = await verifier.query<{
      key: string;
      state: string;
      draftRevisionId: string | null;
      publishedRevisionId: string | null;
      hasArtifacts: boolean | null;
    }>(
      `SELECT
         resource.key,
         resource.state::text,
         resource.draft_revision_id::text AS "draftRevisionId",
         resource.published_revision_id::text AS "publishedRevisionId",
         revision.pdf_object_key IS NOT NULL AS "hasArtifacts"
       FROM download_resources resource
       LEFT JOIN download_resource_revisions revision
         ON revision.resource_id = resource.id
        AND revision.id = resource.draft_revision_id
       ORDER BY resource.created_at, resource.key`,
    );
    expect(downloadResources.rows.map(({ key }) => key).sort()).toEqual(
      [...expectedDownloadResourceKeys].sort(),
    );
    expect(downloadResources.rows).toHaveLength(22);
    expect(
      downloadResources.rows.filter(({ draftRevisionId }) => draftRevisionId),
    ).toHaveLength(20);
    expect(
      downloadResources.rows
        .filter(({ draftRevisionId }) => !draftRevisionId)
        .map(({ key }) => key)
        .sort(),
    ).toEqual(["mdd2-client", "vision-intro"]);
    expect(
      downloadResources.rows.every(
        ({ state, publishedRevisionId }) =>
          state === "unpublished" && publishedRevisionId === null,
      ),
    ).toBe(true);
    expect(
      downloadResources.rows
        .filter(({ draftRevisionId }) => draftRevisionId)
        .every(({ hasArtifacts }) => hasArtifacts === false),
    ).toBe(true);

    const firstResource = downloadResources.rows.find(
      ({ key }) => key === "yuanqi-fullstack",
    );
    const secondResource = downloadResources.rows.find(
      ({ key }) => key === "yuanqi-appliance",
    );
    expect(firstResource?.draftRevisionId).toBeTruthy();
    expect(secondResource?.draftRevisionId).toBeTruthy();

    await expect(
      verifier.query(
        `INSERT INTO download_resources (key, admin_label, state)
         VALUES ('yuanqi-fullstack', 'duplicate', 'unpublished')`,
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "download_resources_key_unique",
    });
    await expect(
      verifier.query(
        `UPDATE download_resources
         SET draft_revision_id = $1
         WHERE key = 'yuanqi-fullstack'`,
        [secondResource?.draftRevisionId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "download_resources_draft_revision_fk",
    });
    await expect(
      verifier.query(
        `INSERT INTO download_resources (key, admin_label, state)
         VALUES ('invalid-published', 'invalid', 'published')`,
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "download_resources_state_pointer_check",
    });
    await expect(
      verifier.query(
        `INSERT INTO download_resources (key, admin_label, state)
         VALUES ('invalid-downline', 'invalid', 'downline')`,
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "download_resources_state_pointer_check",
    });
    await expect(
      verifier.query(
        `UPDATE download_resources
         SET state = 'unpublished', published_revision_id = draft_revision_id
         WHERE key = 'yuanqi-fullstack'`,
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "download_resources_state_pointer_check",
    });
    await expect(
      verifier.query(
        `INSERT INTO download_resources (key, admin_label, row_version)
         VALUES ('invalid-version', 'invalid', 0)`,
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "download_resources_row_version_positive_check",
    });

    const invalidRevision = (fields: string, values: string) =>
      verifier.query(
        `INSERT INTO download_resource_revisions
           (resource_id, name, product, category, resource_type, description,
            sort_order, preview_policy, download_policy${fields})
         SELECT id, 'invalid', '元启', 'materials', '测试', 'invalid',
                999, 'public', 'contact'${values}
         FROM download_resources WHERE key = 'yuanqi-fullstack'`,
      );
    await expect(
      invalidRevision(", pdf_object_key", ", 'downloads/invalid.pdf'"),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "download_resource_revisions_artifacts_complete_check",
    });
    await expect(
      invalidRevision(
        ", pdf_object_key, cover_object_key, page_count, byte_size, sha256",
        ", 'invalid.pdf', 'invalid.png', 0, 1, repeat('a', 64)",
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "download_resource_revisions_page_count_positive_check",
    });
    await expect(
      invalidRevision(
        ", pdf_object_key, cover_object_key, page_count, byte_size, sha256",
        ", 'invalid.pdf', 'invalid.png', 1, 0, repeat('a', 64)",
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "download_resource_revisions_byte_size_positive_check",
    });
    await expect(
      invalidRevision(
        ", pdf_object_key, cover_object_key, page_count, byte_size, sha256",
        ", 'invalid.pdf', 'invalid.png', 1, 1, repeat('A', 64)",
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "download_resource_revisions_sha256_check",
    });
    await expect(
      verifier.query(
        `INSERT INTO download_resource_revisions
           (resource_id, name, product, category, resource_type, description,
            sort_order, preview_policy, download_policy)
         SELECT id, 'invalid', '元启', 'materials', '测试', 'invalid',
                999, 'contact', 'public'
         FROM download_resources WHERE key = 'yuanqi-fullstack'`,
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "download_resource_revisions_access_check",
    });
    await expect(
      verifier.query(
        `UPDATE download_resource_revisions
         SET cleanup_pending_at = now()
         WHERE id = $1`,
        [firstResource?.draftRevisionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const cleanupRevision = await verifier.query<{ id: string }>(
      `INSERT INTO download_resource_revisions
         (resource_id, name, product, category, resource_type, description,
          sort_order, preview_policy, download_policy, cleanup_pending_at)
       SELECT id, 'cleanup', '元启', 'materials', '测试', 'cleanup',
              999, 'public', 'contact', now()
       FROM download_resources WHERE key = 'yuanqi-fullstack'
       RETURNING id::text`,
    );
    await expect(
      verifier.query(
        `UPDATE download_resources
         SET draft_revision_id = $1
         WHERE key = 'yuanqi-fullstack'`,
        [cleanupRevision.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await verifier.query(
      "DELETE FROM download_resource_revisions WHERE id = $1",
      [cleanupRevision.rows[0]?.id],
    );

    const pointerClient = await verifier.connect();
    const cleanupClient = await verifier.connect();
    const raceRevision = await verifier.query<{ id: string }>(
      `INSERT INTO download_resource_revisions
         (resource_id, name, product, category, resource_type, description,
          sort_order, preview_policy, download_policy)
       SELECT id, 'race', '视觉检索智能体', 'materials', '测试', 'race',
              999, 'public', 'contact'
       FROM download_resources WHERE key = 'vision-intro'
       RETURNING id::text`,
    );
    const raceRevisionId = raceRevision.rows[0]?.id;
    let pointerOpen = false;
    let cleanupOpen = false;

    try {
      await pointerClient.query("BEGIN");
      pointerOpen = true;
      await cleanupClient.query("BEGIN");
      cleanupOpen = true;
      await cleanupClient.query("SET LOCAL statement_timeout = '5s'");
      const cleanupPid = await cleanupClient.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );

      await pointerClient.query(
        `UPDATE download_resources
         SET draft_revision_id = $1
         WHERE key = 'vision-intro'`,
        [raceRevisionId],
      );

      let cleanupSettled = false;
      const cleanupOutcome = cleanupClient
        .query(
          `UPDATE download_resource_revisions
           SET cleanup_pending_at = now()
           WHERE id = $1`,
          [raceRevisionId],
        )
        .then(
          () => {
            cleanupSettled = true;
            return { ok: true as const, error: undefined };
          },
          (error: unknown) => {
            cleanupSettled = true;
            return { ok: false as const, error };
          },
        );

      let cleanupWaitsOnLock = false;
      for (let attempt = 0; attempt < 50 && !cleanupSettled; attempt += 1) {
        const activity = await verifier.query<{ waitEventType: string | null }>(
          `SELECT wait_event_type AS "waitEventType"
           FROM pg_stat_activity
           WHERE pid = $1`,
          [cleanupPid.rows[0]?.pid],
        );
        cleanupWaitsOnLock = activity.rows[0]?.waitEventType === "Lock";
        if (cleanupWaitsOnLock) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(cleanupSettled || cleanupWaitsOnLock).toBe(true);

      if (cleanupWaitsOnLock) {
        await pointerClient.query("COMMIT");
        pointerOpen = false;
      }
      const outcome = await cleanupOutcome;
      if (outcome.ok) {
        await cleanupClient.query("COMMIT");
        cleanupOpen = false;
        if (pointerOpen) {
          await pointerClient.query("COMMIT");
          pointerOpen = false;
        }
      } else {
        expect(outcome.error).toMatchObject({ code: "23514" });
        await cleanupClient.query("ROLLBACK");
        cleanupOpen = false;
      }

      const illegalState = await verifier.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM download_resources resource
         JOIN download_resource_revisions revision
           ON revision.id = resource.draft_revision_id
          AND revision.resource_id = resource.id
         WHERE resource.key = 'vision-intro'
           AND revision.cleanup_pending_at IS NOT NULL`,
      );
      expect(illegalState.rows).toEqual([{ count: "0" }]);
    } finally {
      if (pointerOpen) await pointerClient.query("ROLLBACK");
      if (cleanupOpen) await cleanupClient.query("ROLLBACK");
      cleanupClient.release();
      pointerClient.release();
    }
    await verifier.query(
      "UPDATE download_resources SET draft_revision_id = NULL WHERE key = 'vision-intro'",
    );
    await verifier.query(
      "DELETE FROM download_resource_revisions WHERE id = $1",
      [raceRevisionId],
    );

    await verifier.query("DELETE FROM assistant_input_policy");
    await expect(
      verifier.query("INSERT INTO assistant_input_policy (id) VALUES (2)"),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "assistant_input_policy_id_singleton_check",
    });
    await expect(
      verifier.query(
        "INSERT INTO assistant_input_policy (id, revision) VALUES (1, 0)",
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "assistant_input_policy_revision_positive_check",
    });
    await verifier.end();
    expect(journal.rows).toEqual([{ count: "13" }]);
  });

  it("backfills legacy PDFs into document artifacts and enforces typed artifacts", async () => {
    const setupPool = new Pool({ connectionString: safeTestDatabaseUrl });
    await setupPool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await setupPool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await setupPool.query("CREATE SCHEMA public");
    await setupPool.end();

    const migrationFolder = await createMigrationsThrough0011();
    const beforePool = new Pool({ connectionString: safeTestDatabaseUrl });
    const beforeClient = await beforePool.connect();
    try {
      await migrate(drizzle(beforeClient), {
        migrationsFolder: migrationFolder,
      });
    } finally {
      beforeClient.release();
      await beforePool.end();
      await rm(migrationFolder, { recursive: true, force: true });
    }

    const legacyPool = new Pool({ connectionString: safeTestDatabaseUrl });
    const legacyRevision = await legacyPool.query<{ id: string }>(
      `INSERT INTO download_resource_revisions
         (resource_id, name, product, category, resource_type, description,
          sort_order, preview_policy, download_policy, pdf_object_key,
          cover_object_key, page_count, byte_size, sha256)
       SELECT id, 'Legacy PDF', '元启', 'materials', '说明书', 'legacy PDF',
              999, 'public', 'public', 'downloads/legacy.pdf',
              'downloads/legacy.webp', 3, 1024, repeat('a', 64)
       FROM download_resources
       WHERE key = 'yuanqi-fullstack'
       RETURNING id::text`,
    );
    const seededLegacyRevisionId = legacyRevision.rows[0]?.id;
    const seededLegacyResourceKey = "yuanqi-fullstack";
    const seededLegacyPdfObjectKey = "downloads/legacy.pdf";
    await legacyPool.query(
      `UPDATE download_resources
       SET draft_revision_id = $1
       WHERE key = $2`,
      [seededLegacyRevisionId, seededLegacyResourceKey],
    );
    await legacyPool.end();

    const afterPool = new Pool({ connectionString: safeTestDatabaseUrl });
    const afterClient = await afterPool.connect();
    try {
      await migrate(drizzle(afterClient), {
        migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
      });
    } finally {
      afterClient.release();
      await afterPool.end();
    }

    const verifier = new Pool({ connectionString: safeTestDatabaseUrl });
    try {
      const kinds = await verifier.query<{ key: string; kind: string }>(
        "SELECT key, kind::text FROM download_resources ORDER BY key",
      );
      const kindByKey = new Map(kinds.rows.map(({ key, kind }) => [key, kind]));
      expect(kindByKey.get("mdd2-client")).toBe("software");
      expect(
        [...kindByKey.entries()].filter(([key]) => key !== "mdd2-client"),
      ).toEqual(
        expectedDownloadResourceKeys
          .filter((key) => key !== "mdd2-client")
          .sort()
          .map((key) => [key, "document"]),
      );

      const migratedArtifacts = await verifier.query<{
        resourceKey: string;
        slot: string;
        originalFilename: string;
        mediaType: string;
        objectKey: string;
      }>(
        `SELECT resource.key AS "resourceKey", artifact.slot::text AS slot,
                artifact.original_filename AS "originalFilename",
                artifact.media_type AS "mediaType", artifact.object_key AS "objectKey"
         FROM download_resource_artifacts artifact
         JOIN download_resource_revisions revision ON revision.id = artifact.revision_id
         JOIN download_resources resource ON resource.id = revision.resource_id
         ORDER BY resource.key`,
      );
      expect(
        migratedArtifacts.rows.every(
          (artifact) =>
            artifact.slot === "document" &&
            artifact.originalFilename === `${artifact.resourceKey}.pdf` &&
            artifact.mediaType === "application/pdf",
        ),
      ).toBe(true);
      expect(migratedArtifacts.rows).toContainEqual(
        expect.objectContaining({
          resourceKey: seededLegacyResourceKey,
          objectKey: seededLegacyPdfObjectKey,
        }),
      );

      const softwareRevision = await verifier.query<{ id: string }>(
        `INSERT INTO download_resource_revisions
           (resource_id, resource_kind, name, product, category, resource_type,
            description, sort_order, preview_policy, download_policy, release_version)
         SELECT id, 'software', '码里奥桌面客户端', '码里奥', 'software', '客户端',
                'installer', 1, NULL, 'public', '1.0.0'
         FROM download_resources
         WHERE key = 'mdd2-client'
         RETURNING id::text`,
      );
      const softwareRevisionId = softwareRevision.rows[0]?.id;
      expect(softwareRevisionId).toBeTruthy();

      const insertArtifact = (values: string) =>
        verifier.query(
          `INSERT INTO download_resource_artifacts
             (revision_id, revision_kind, slot, object_key, original_filename,
              extension, media_type, byte_size, sha256, page_count, cover_object_key)
           VALUES ${values}`,
        );
      await expect(
        verifier.query(
          "UPDATE download_resources SET kind = 'document' WHERE key = 'mdd2-client'",
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insertArtifact(
          `('${seededLegacyRevisionId}', 'document', 'windows', 'bad.zip', 'bad.zip', '.zip', 'application/zip', 1, repeat('a', 64), NULL, NULL)`,
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "download_resource_artifacts_kind_slot_file_check",
      });
      await expect(
        insertArtifact(
          `('${softwareRevisionId}', 'software', 'document', 'bad.pdf', 'bad.pdf', '.pdf', 'application/pdf', 1, repeat('a', 64), 1, 'bad.webp')`,
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "download_resource_artifacts_kind_slot_file_check",
      });
      await expect(
        insertArtifact(
          `('${softwareRevisionId}', 'software', 'windows', 'bad.dmg', 'bad.dmg', '.dmg', 'application/x-apple-diskimage', 1, repeat('a', 64), NULL, NULL)`,
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "download_resource_artifacts_kind_slot_file_check",
      });
      await expect(
        insertArtifact(
          `('${softwareRevisionId}', 'software', 'windows', 'bad.zip', 'bad.zip', '.zip', 'application/zip', 0, repeat('a', 64), NULL, NULL)`,
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "download_resource_artifacts_byte_size_positive_check",
      });
      await expect(
        insertArtifact(
          `('${softwareRevisionId}', 'software', 'windows', 'bad.zip', 'bad.zip', '.zip', 'application/zip', 1, repeat('A', 64), NULL, NULL)`,
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "download_resource_artifacts_sha256_check",
      });
      await expect(
        verifier.query(
          `INSERT INTO download_resource_revisions
             (resource_id, resource_kind, name, product, category, resource_type,
              description, sort_order, preview_policy, download_policy, release_version)
           SELECT id, 'software', 'invalid', '码里奥', 'software', '客户端',
                  'invalid', 2, NULL, 'public', NULL
           FROM download_resources WHERE key = 'mdd2-client'`,
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "download_resource_revisions_kind_policy_check",
      });
      await expect(
        verifier.query(
          `INSERT INTO download_resource_revisions
             (resource_id, resource_kind, name, product, category, resource_type,
              description, sort_order, preview_policy, download_policy, release_version)
           SELECT id, 'software', 'invalid', '码里奥', 'software', '客户端',
                  'invalid', 2, 'public', 'public', '1.0.0'
           FROM download_resources WHERE key = 'mdd2-client'`,
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "download_resource_revisions_kind_policy_check",
      });
      await expect(
        verifier.query(
          `INSERT INTO download_resource_revisions
             (resource_id, resource_kind, name, product, category, resource_type,
              description, sort_order, preview_policy, download_policy, release_version)
           SELECT id, 'document', 'invalid', '元启', 'materials', '说明书',
                  'invalid', 2, 'public', 'public', '1.0.0'
           FROM download_resources WHERE key = 'yuanqi-fullstack'`,
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "download_resource_revisions_kind_policy_check",
      });
    } finally {
      await verifier.end();
    }
  });
});

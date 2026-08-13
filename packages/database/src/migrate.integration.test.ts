import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";
import { runMigrations } from "./migrate";

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

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
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
    expect(journal.rows).toEqual([{ count: "11" }]);
  });
});

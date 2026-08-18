import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  assertSafeIdentityMigrationTestDatabaseUrl,
  databaseSchema,
} from "@ai-agent-platform/database";

import { createDownloadResourceRepository } from "./repository";

const requested = process.env.RUN_DOWNLOAD_RESOURCE_DB_TEST === "true";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (requested && !testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required when RUN_DOWNLOAD_RESOURCE_DB_TEST=true",
  );
}
const safeUrl = requested
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl!)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;
const pool = safeUrl ? new Pool({ connectionString: safeUrl }) : undefined;
const database = pool ? drizzle(pool, { schema: databaseSchema }) : undefined;
const repository =
  database && pool
    ? createDownloadResourceRepository(database, pool)
    : undefined;
const fixturePrefix = `artifact-${randomUUID().replaceAll("-", "")}`;

async function cleanupFixtures() {
  if (!database) return;
  const pattern = `${fixturePrefix}-%`;
  await database.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE download_resources
      SET state = 'unpublished', published_revision_id = NULL, draft_revision_id = NULL
      WHERE key LIKE ${pattern}
    `);
    await tx.execute(sql`
      DELETE FROM download_resource_artifacts
      WHERE revision_id IN (
        SELECT id FROM download_resource_revisions
        WHERE resource_id IN (
          SELECT id FROM download_resources WHERE key LIKE ${pattern}
        )
      )
    `);
    await tx.execute(sql`
      DELETE FROM download_resource_revisions
      WHERE resource_id IN (
        SELECT id FROM download_resources WHERE key LIKE ${pattern}
      )
    `);
    await tx.execute(
      sql`DELETE FROM download_resources WHERE key LIKE ${pattern}`,
    );
  });
}

describePostgres("download resource artifact repository", () => {
  beforeEach(cleanupFixtures);
  afterEach(async () => {
    await cleanupFixtures();
  });
  afterAll(async () => {
    await pool?.end();
  });
  it("clones, replaces, removes, counts exclusions, and isolates CAS resources", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const key = `${fixturePrefix}-${suffix}`;
    const objectKey = `test/${suffix}/shared.zip`;
    const result = await repository!.transaction(async (tx) => {
      const first = await tx.insertResource({
        key,
        adminLabel: "Artifact repository fixture",
        kind: "software",
      });
      const source = await tx.insertRevision({
        resourceId: first.id,
        resourceKind: "software",
        name: "Fixture",
        product: "Platform",
        category: "software",
        resourceType: "Installer",
        description: "Repository fixture",
        sortOrder: 0,
        previewPolicy: null,
        downloadPolicy: "public",
        releaseVersion: "1.0.0",
        createdBy: null,
      });
      await tx.insertArtifact({
        revisionId: source.id,
        revisionKind: "software",
        slot: "windows",
        objectKey,
        originalFilename: "fixture.zip",
        extension: ".zip",
        mediaType: "application/zip",
        byteSize: 10,
        sha256: "a".repeat(64),
        pageCount: null,
        coverObjectKey: null,
      });
      const clone = await tx.insertRevision({
        resourceId: first.id,
        resourceKind: "software",
        name: "Fixture",
        product: "Platform",
        category: "software",
        resourceType: "Installer",
        description: "Repository fixture",
        sortOrder: 0,
        previewPolicy: null,
        downloadPolicy: "public",
        releaseVersion: "1.0.1",
        createdBy: null,
      });
      const cloned = await tx.cloneArtifacts({
        sourceRevisionId: source.id,
        revisionId: clone.id,
        revisionKind: "software",
      });
      const replaced = await tx.replaceArtifact({
        ...cloned[0]!,
        id: undefined,
        revisionId: clone.id,
        objectKey: `test/${suffix}/replacement.zip`,
      });
      const removed = await tx.removeArtifact({
        revisionId: clone.id,
        slot: "windows",
      });
      const second = await tx.insertResource({
        key: `${key}-isolation`,
        adminLabel: "Artifact isolation fixture",
        kind: "software",
      });
      const crossResource = await tx.insertRevision({
        resourceId: second.id,
        resourceKind: "software",
        name: "Fixture",
        product: "Platform",
        category: "software",
        resourceType: "Installer",
        description: "Repository fixture",
        sortOrder: 0,
        previewPolicy: null,
        downloadPolicy: "public",
        releaseVersion: "1.0.0",
        createdBy: null,
      });
      await tx.insertArtifact({
        revisionId: crossResource.id,
        revisionKind: "software",
        slot: "windows",
        objectKey,
        originalFilename: "fixture.zip",
        extension: ".zip",
        mediaType: "application/zip",
        byteSize: 10,
        sha256: "a".repeat(64),
        pageCount: null,
        coverObjectKey: null,
      });
      const documentResource = await tx.insertResource({
        key: `${key}-document`,
        adminLabel: "Artifact cover fixture",
        kind: "document",
      });
      const documentRevision = await tx.insertRevision({
        resourceId: documentResource.id,
        resourceKind: "document",
        name: "Fixture",
        product: "Platform",
        category: "materials",
        resourceType: "Document",
        description: "Repository fixture",
        sortOrder: 0,
        previewPolicy: "public",
        downloadPolicy: "public",
        releaseVersion: null,
        createdBy: null,
      });
      const coverKey = `test/${suffix}/cover.webp`;
      await tx.insertArtifact({
        revisionId: documentRevision.id,
        revisionKind: "document",
        slot: "document",
        objectKey: `test/${suffix}/document.pdf`,
        originalFilename: "fixture.pdf",
        extension: ".pdf",
        mediaType: "application/pdf",
        byteSize: 10,
        sha256: "b".repeat(64),
        pageCount: 1,
        coverObjectKey: coverKey,
      });
      const beforeExclusion = await tx.countArtifactReferences({ objectKey });
      const excluded = await tx.countArtifactReferences({
        objectKey,
        excludeRevisionIds: [source.id],
      });
      const coverReferences = await tx.countArtifactReferences({
        objectKey: coverKey,
      });
      const excludedCoverReferences = await tx.countArtifactReferences({
        objectKey: coverKey,
        excludeRevisionIds: [documentRevision.id],
      });
      const updated = await tx.updateResourceCas({
        id: first.id,
        expectedRowVersion: first.rowVersion,
        state: "unpublished",
        publishedRevisionId: null,
        draftRevisionId: source.id,
      });
      const stale = await tx.updateResourceCas({
        id: first.id,
        expectedRowVersion: first.rowVersion,
        state: "unpublished",
        publishedRevisionId: null,
        draftRevisionId: source.id,
      });
      return {
        cloned,
        replaced,
        removed,
        beforeExclusion,
        excluded,
        coverReferences,
        excludedCoverReferences,
        updated,
        stale,
      };
    });
    expect(result.cloned).toEqual([
      expect.objectContaining({ objectKey, slot: "windows" }),
    ]);
    expect(result.replaced.replaced).toMatchObject({ objectKey });
    expect(result.removed).toMatchObject({ slot: "windows" });
    expect(result.beforeExclusion).toEqual({
      objectReferenceCount: 2,
      coverReferenceCount: 0,
    });
    expect(result.excluded).toEqual({
      objectReferenceCount: 1,
      coverReferenceCount: 0,
    });
    expect(result.coverReferences).toEqual({
      objectReferenceCount: 0,
      coverReferenceCount: 1,
    });
    expect(result.excludedCoverReferences).toEqual({
      objectReferenceCount: 0,
      coverReferenceCount: 0,
    });
    expect(result.updated).toMatchObject({ rowVersion: 2 });
    expect(result.stale).toBeNull();
  });
  it("loads generic artifact rows and counts object plus cover references", async () => {
    const result = await repository!.transaction(async (tx) => {
      const references = await tx.countArtifactReferences({
        objectKey: "missing-object",
      });
      return references;
    });
    expect(result).toEqual({ objectReferenceCount: 0, coverReferenceCount: 0 });
  });
});

describe("download resource PostgreSQL test guard", () => {
  it("requires explicit safe opt-in", () => {
    expect(requested && !testDatabaseUrl).toBe(false);
  });
});
import { randomUUID } from "node:crypto";

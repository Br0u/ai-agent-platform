import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DOCUMENT_SEED_MANIFEST,
  generateDocumentSeedSql,
  verifyGeneratedSeed,
} from "./seed";

const checkedInMigration = fileURLToPath(
  new URL("../../database/drizzle/0007_cms_document_seed.sql", import.meta.url),
);
const packageManifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../package.json", import.meta.url)),
    "utf8",
  ),
) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
};

describe("document seed generator", () => {
  it("runs TypeScript seed commands without the tsx CLI IPC server", () => {
    expect(packageManifest.scripts?.["seed:generate"]).toBe(
      "node --import tsx src/seed.ts generate",
    );
    expect(packageManifest.scripts?.["seed:check"]).toBe(
      "node --import tsx src/seed.ts check",
    );
  });

  it("pins the unified type identity used by the remark plugin chain", () => {
    expect(packageManifest.dependencies?.unified).toBe("11.0.0");
  });

  it("uses fixed unique identity and navigation fields", () => {
    expect(DOCUMENT_SEED_MANIFEST).toHaveLength(7);
    expect(new Set(DOCUMENT_SEED_MANIFEST.map((item) => item.id)).size).toBe(7);
    expect(new Set(DOCUMENT_SEED_MANIFEST.map((item) => item.slug)).size).toBe(
      7,
    );
    expect(
      DOCUMENT_SEED_MANIFEST.map(({ slug, code, position }) => ({
        slug,
        code,
        position,
      })),
    ).toEqual([
      { slug: "quick-start", code: "QUICK_START", position: 10 },
      { slug: "deployment", code: "DEPLOYMENT", position: 20 },
      { slug: "upgrade", code: "UPGRADE", position: 30 },
      { slug: "operations", code: "OPERATIONS", position: 40 },
      { slug: "api", code: "API", position: 50 },
      { slug: "hardware", code: "HARDWARE", position: 60 },
      { slug: "faq", code: "FAQ", position: 70 },
    ]);
  });

  it("generates deterministic guarded SQL for all seven documents", () => {
    const first = generateDocumentSeedSql();
    const second = generateDocumentSeedSql();
    expect(first).toBe(second);
    expect(first).toContain("DOCUMENT_SEED_IDENTITY_COLLISION");
    expect(first).toContain("DOCUMENT_SEED_PARTIAL_STATE");
    expect(first).toContain("partial seed prefixes are rejected, not resumed");
    expect(first).toContain("ON CONFLICT DO NOTHING");
    expect(first).toContain("AND \"state\" = 'reserved'");
    for (const field of [
      "id",
      "content_id",
      "revision",
      "slug",
      "title",
      "summary",
      "body",
    ]) {
      expect(first).toContain(`"${field}" IS DISTINCT FROM`);
    }
    expect(first).toContain('"created_by" IS NOT NULL');
    expect(first).toContain('"created_at" IS DISTINCT FROM');
    expect(first).not.toContain(
      "SET \"state\" = 'canonical' WHERE \"state\" = 'canonical'",
    );
    expect(first.match(/INSERT INTO "content" \(/g)).toHaveLength(7);
    expect(first.match(/INSERT INTO \"content_revisions\"/g)).toHaveLength(7);
    expect(first.match(/INSERT INTO \"content_routes\"/g)).toHaveLength(7);
  });

  it("byte-compares through a temporary file and never rewrites the target", () => {
    const directory = mkdtempSync(join(tmpdir(), "cms-document-seed-"));
    const target = join(directory, "seed.sql");
    const expected = generateDocumentSeedSql();
    writeFileSync(target, expected);

    try {
      expect(verifyGeneratedSeed(target)).toBeUndefined();
      writeFileSync(target, `${expected}\n-- drift`);
      expect(() => verifyGeneratedSeed(target)).toThrow(
        "DOCUMENT_SEED_OUT_OF_DATE",
      );
      expect(readFileSync(target, "utf8")).toBe(`${expected}\n-- drift`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("matches the checked-in migration byte-for-byte", () => {
    expect(readFileSync(checkedInMigration, "utf8")).toBe(
      generateDocumentSeedSql(),
    );
  });
});

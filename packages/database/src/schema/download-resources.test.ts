import { readFileSync } from "node:fs";

import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  downloadResourceAccess,
  downloadArtifactSlot,
  downloadResourceCategory,
  downloadResourceArtifacts,
  downloadResourceKind,
  downloadResourceRevisions,
  downloadResources,
  downloadResourceState,
} from "./download-resources";

describe("download resource schema", () => {
  it("defines the resource policy enums", () => {
    expect(downloadResourceState.enumValues).toEqual([
      "unpublished",
      "published",
      "downline",
    ]);
    expect(downloadResourceAccess.enumValues).toEqual(["public", "contact"]);
    expect(downloadResourceCategory.enumValues).toEqual([
      "materials",
      "software",
      "deployment",
      "whitepapers",
    ]);
    expect(downloadResourceKind.enumValues).toEqual(["document", "software"]);
    expect(downloadArtifactSlot.enumValues).toEqual([
      "document",
      "windows",
      "macos",
    ]);
  });

  it("exports resource and revision tables", () => {
    expect(getTableConfig(downloadResources).name).toBe("download_resources");
    expect(getTableConfig(downloadResourceRevisions).name).toBe(
      "download_resource_revisions",
    );
    expect(getTableConfig(downloadResourceArtifacts).name).toBe(
      "download_resource_artifacts",
    );
  });

  it("stores only the required resource and revision fields", () => {
    expect(
      getTableConfig(downloadResources).columns.map((column) => column.name),
    ).toEqual([
      "id",
      "key",
      "admin_label",
      "kind",
      "state",
      "published_revision_id",
      "draft_revision_id",
      "row_version",
      "created_at",
      "updated_at",
    ]);
    expect(
      getTableConfig(downloadResourceRevisions).columns.map(
        (column) => column.name,
      ),
    ).toEqual([
      "id",
      "resource_id",
      "resource_kind",
      "name",
      "product",
      "category",
      "resource_type",
      "description",
      "sort_order",
      "preview_policy",
      "download_policy",
      "release_version",
      "pdf_object_key",
      "cover_object_key",
      "page_count",
      "byte_size",
      "sha256",
      "created_by",
      "created_at",
      "published_at",
      "cleanup_pending_at",
      "cleanup_error_summary",
    ]);
    expect(
      getTableConfig(downloadResourceArtifacts).columns.map(
        (column) => column.name,
      ),
    ).toEqual([
      "id",
      "revision_id",
      "revision_kind",
      "slot",
      "object_key",
      "original_filename",
      "extension",
      "media_type",
      "byte_size",
      "sha256",
      "page_count",
      "cover_object_key",
      "created_at",
    ]);
  });

  it("names the database checks that enforce state, artifact, and policy rules", () => {
    expect(
      getTableConfig(downloadResources).checks.map((check) => check.name),
    ).toEqual(
      expect.arrayContaining([
        "download_resources_row_version_positive_check",
        "download_resources_state_pointer_check",
      ]),
    );
    expect(
      getTableConfig(downloadResourceRevisions).checks.map(
        (check) => check.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "download_resource_revisions_artifacts_complete_check",
        "download_resource_revisions_page_count_positive_check",
        "download_resource_revisions_byte_size_positive_check",
        "download_resource_revisions_sha256_check",
        "download_resource_revisions_access_check",
        "download_resource_revisions_kind_policy_check",
      ]),
    );
    expect(
      getTableConfig(downloadResourceArtifacts).checks.map(
        (check) => check.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "download_resource_artifacts_byte_size_positive_check",
        "download_resource_artifacts_sha256_check",
        "download_resource_artifacts_kind_slot_file_check",
      ]),
    );
  });

  it("keeps both resource pointers scoped to the same resource", () => {
    const foreignKeys = getTableConfig(downloadResources).foreignKeys.map(
      (foreignKey) => {
        const reference = foreignKey.reference();

        return {
          name: foreignKey.getName(),
          columns: reference.columns.map((column) => column.name),
          foreignColumns: reference.foreignColumns.map((column) => column.name),
          foreignTable: getTableName(reference.foreignTable),
        };
      },
    );

    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        {
          name: "download_resources_published_revision_fk",
          columns: ["id", "published_revision_id"],
          foreignColumns: ["resource_id", "id"],
          foreignTable: "download_resource_revisions",
        },
        {
          name: "download_resources_draft_revision_fk",
          columns: ["id", "draft_revision_id"],
          foreignColumns: ["resource_id", "id"],
          foreignTable: "download_resource_revisions",
        },
      ]),
    );
  });

  it("uses a named unique resource key constraint", () => {
    expect(
      getTableConfig(downloadResources).uniqueConstraints.map(
        (constraint) => constraint.name,
      ),
    ).toContain("download_resources_key_unique");
    expect(
      getTableConfig(downloadResources).uniqueConstraints.map(
        (constraint) => constraint.name,
      ),
    ).toContain("download_resources_id_kind_unique");
    expect(
      getTableConfig(downloadResourceRevisions).uniqueConstraints.map(
        (constraint) => constraint.name,
      ),
    ).toContain("download_resource_revisions_id_kind_unique");
  });

  it("ties revision and artifact kinds to their immutable parent kind", () => {
    const revisionForeignKeys = getTableConfig(
      downloadResourceRevisions,
    ).foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return {
        name: foreignKey.getName(),
        columns: reference.columns.map((column) => column.name),
        foreignColumns: reference.foreignColumns.map((column) => column.name),
      };
    });
    const artifactForeignKeys = getTableConfig(
      downloadResourceArtifacts,
    ).foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return {
        name: foreignKey.getName(),
        columns: reference.columns.map((column) => column.name),
        foreignColumns: reference.foreignColumns.map((column) => column.name),
      };
    });

    expect(revisionForeignKeys).toContainEqual({
      name: "download_resource_revisions_resource_kind_fk",
      columns: ["resource_id", "resource_kind"],
      foreignColumns: ["id", "kind"],
    });
    expect(artifactForeignKeys).toContainEqual({
      name: "download_resource_artifacts_revision_kind_fk",
      columns: ["revision_id", "revision_kind"],
      foreignColumns: ["id", "resource_kind"],
    });
  });

  it("keeps the transitional defaults and immutable kind trigger in the migration", () => {
    const migration = readFileSync(
      new URL(
        "../../drizzle/0012_download_resource_artifacts.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration).toContain(
      'ADD COLUMN "kind" "download_resource_kind" DEFAULT \'document\' NOT NULL',
    );
    expect(migration).toContain(
      'ADD COLUMN "resource_kind" "download_resource_kind" DEFAULT \'document\' NOT NULL',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "download_resources_kind_immutable_guard"',
    );
  });

  it("requires a non-null software release version in both schema and migration", () => {
    const schema = readFileSync(
      new URL("./download-resources.ts", import.meta.url),
      "utf8",
    );
    const migration = readFileSync(
      new URL(
        "../../drizzle/0012_download_resource_artifacts.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(schema).toMatch(
      /resourceKind\} = 'software'[\s\S]*releaseVersion\} IS NOT NULL/u,
    );
    expect(migration).toMatch(
      /resource_kind" = 'software'[\s\S]*release_version" IS NOT NULL/u,
    );
  });

  it("seeds the fixed identities and metadata-only drafts", () => {
    const migration = readFileSync(
      new URL("../../drizzle/0011_download_resources.sql", import.meta.url),
      "utf8",
    );
    const resourceKeys = [
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
    ];

    for (const key of resourceKeys) {
      expect(migration).toContain(`'${key}'`);
    }
    expect(migration.match(/019faaaa-0000-7000-8000-[0-9]{12}/g)).toHaveLength(
      42,
    );
    expect(migration.match(/019faaaa-0000-7000-9000-[0-9]{12}/g)).toHaveLength(
      20,
    );
    expect(migration).not.toContain("019faaaa-0000-7000-9000-000000000017");
    expect(migration).not.toContain("019faaaa-0000-7000-9000-000000000019");
    expect(migration.match(/, 'public', 'public',/g)).toHaveLength(5);
    expect(migration.match(/, 'public', 'contact',/g)).toHaveLength(12);
    expect(migration.match(/, 'contact', 'contact',/g)).toHaveLength(3);
    expect(migration).toContain(
      'CREATE TRIGGER "download_resources_clean_pointer_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "download_resource_revisions_cleanup_guard"',
    );
    expect(migration).not.toMatch(/\bGRANT\b/i);
  });

  it("locks every pointer candidate before checking cleanup state", () => {
    const migration = readFileSync(
      new URL("../../drizzle/0011_download_resources.sql", import.meta.url),
      "utf8",
    );
    const pointerGuard = migration.slice(
      migration.indexOf(
        'CREATE FUNCTION "enforce_download_resource_clean_pointer"',
      ),
      migration.indexOf(
        'CREATE TRIGGER "download_resources_clean_pointer_guard"',
      ),
    );
    const lock = pointerGuard.indexOf("PERFORM 1");
    const cleanupCheck = pointerGuard.indexOf("cleanup_pending_at IS NOT NULL");

    expect(lock).toBeGreaterThan(-1);
    expect(pointerGuard.slice(lock, cleanupCheck)).toContain("FOR SHARE");
    expect(cleanupCheck).toBeGreaterThan(lock);

    const cleanupGuard = migration.slice(
      migration.indexOf(
        'CREATE FUNCTION "guard_referenced_download_revision_cleanup"',
      ),
      migration.indexOf(
        'CREATE TRIGGER "download_resource_revisions_cleanup_guard"',
      ),
    );
    expect(cleanupGuard).not.toContain("FOR UPDATE");
  });
});

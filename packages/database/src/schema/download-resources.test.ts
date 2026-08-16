import { readFileSync } from "node:fs";

import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  downloadResourceAccess,
  downloadResourceCategory,
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
  });

  it("exports resource and revision tables", () => {
    expect(getTableConfig(downloadResources).name).toBe("download_resources");
    expect(getTableConfig(downloadResourceRevisions).name).toBe(
      "download_resource_revisions",
    );
  });

  it("stores only the required resource and revision fields", () => {
    expect(
      getTableConfig(downloadResources).columns.map((column) => column.name),
    ).toEqual([
      "id",
      "key",
      "admin_label",
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
      "name",
      "product",
      "category",
      "resource_type",
      "description",
      "sort_order",
      "preview_policy",
      "download_policy",
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
});

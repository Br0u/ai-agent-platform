import { describe, expect, it } from "vitest";

import {
  adminDownloadQuerySchema,
  createDownloadResourceInputSchema,
  deriveAdminStatus,
  downloadResourceAdminDtoSchema,
  downloadResourcePublicDtoSchema,
  mutateDownloadResourceInputSchema,
  saveDownloadDraftInputSchema,
  suggestDownloadPolicies,
} from "./contracts";

const resourceId = "00000000-0000-4000-8000-000000000001";
const revisionId = "00000000-0000-4000-8000-000000000002";

const metadata = {
  name: " 产品说明 ",
  product: " 元启 ",
  category: "materials",
  resourceType: " 产品说明书 ",
  description: " 产品说明 ",
  sortOrder: 10,
  previewPolicy: "public",
  downloadPolicy: "contact",
} as const;

const artifact = {
  pdfObjectKey: "resources/resource.pdf",
  coverObjectKey: "resources/cover.webp",
  pageCount: 3,
  byteSize: 1024,
  sha256: "a".repeat(64),
};

const revision = {
  id: revisionId,
  ...metadata,
  name: "产品说明",
  product: "元启",
  resourceType: "产品说明书",
  description: "产品说明",
  ...artifact,
  createdAt: "2026-08-16T00:00:00.000Z",
  publishedAt: null,
};

describe("download resource contracts", () => {
  it("accepts bounded trimmed create and draft inputs", () => {
    expect(
      createDownloadResourceInputSchema.parse({
        key: "yuanqi-intro",
        adminLabel: " 元启产品介绍 ",
      }),
    ).toEqual({ key: "yuanqi-intro", adminLabel: "元启产品介绍" });

    expect(
      saveDownloadDraftInputSchema.parse({
        id: resourceId,
        expectedRowVersion: 1,
        ...metadata,
      }),
    ).toMatchObject({
      name: "产品说明",
      product: "元启",
      resourceType: "产品说明书",
      description: "产品说明",
    });
  });

  it.each([
    { field: "key", value: "Upper-Case" },
    { field: "key", value: "-bad" },
    { field: "key", value: `a${"b".repeat(120)}` },
    { field: "adminLabel", value: " " },
    { field: "adminLabel", value: "a".repeat(161) },
  ])("rejects invalid create field $field", ({ field, value }) => {
    expect(
      createDownloadResourceInputSchema.safeParse({
        key: "valid-key",
        adminLabel: "Valid",
        [field]: value,
      }).success,
    ).toBe(false);
  });

  it.each([
    { field: "name", value: " " },
    { field: "name", value: "a".repeat(161) },
    { field: "product", value: "a".repeat(121) },
    { field: "resourceType", value: "a".repeat(81) },
    { field: "description", value: "a".repeat(501) },
    { field: "sortOrder", value: -1 },
    { field: "sortOrder", value: 10_001 },
    { field: "sortOrder", value: 1.5 },
    { field: "category", value: "archive" },
    { field: "previewPolicy", value: "contact", downloadPolicy: "public" },
  ])("rejects invalid draft field $field", (replacement) => {
    expect(
      saveDownloadDraftInputSchema.safeParse({
        id: resourceId,
        expectedRowVersion: 1,
        ...metadata,
        ...replacement,
      }).success,
    ).toBe(false);
  });

  it("accepts exactly the three policy pairs", () => {
    for (const [previewPolicy, downloadPolicy] of [
      ["public", "public"],
      ["public", "contact"],
      ["contact", "contact"],
    ] as const) {
      expect(
        saveDownloadDraftInputSchema.safeParse({
          id: resourceId,
          expectedRowVersion: 1,
          ...metadata,
          previewPolicy,
          downloadPolicy,
        }).success,
      ).toBe(true);
    }
  });

  it("requires positive CAS input and deterministic bounded admin queries", () => {
    expect(
      mutateDownloadResourceInputSchema.safeParse({
        id: resourceId,
        expectedRowVersion: 0,
      }).success,
    ).toBe(false);
    expect(adminDownloadQuerySchema.parse({})).toEqual({
      search: "",
      sort: "updated_desc",
      page: 1,
      pageSize: 20,
    });
    expect(
      adminDownloadQuerySchema.safeParse({ unexpected: true }).success,
    ).toBe(false);
  });

  it("keeps category policy defaults as suggestions without overriding choices", () => {
    expect(suggestDownloadPolicies("materials")).toEqual({
      previewPolicy: "public",
      downloadPolicy: "contact",
    });
    expect(suggestDownloadPolicies("software")).toEqual({
      previewPolicy: "contact",
      downloadPolicy: "contact",
    });
    expect(
      saveDownloadDraftInputSchema.parse({
        id: resourceId,
        expectedRowVersion: 1,
        ...metadata,
        previewPolicy: "public",
        downloadPolicy: "public",
      }),
    ).toMatchObject({ previewPolicy: "public", downloadPolicy: "public" });
  });

  it("accepts artifact metadata only when all fields are null or all are present", () => {
    const dto = {
      id: resourceId,
      key: "yuanqi-intro",
      adminLabel: "元启产品介绍",
      state: "published",
      adminStatus: "已发布",
      rowVersion: 1,
      publishedRevision: revision,
      draftRevision: null,
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
    };
    expect(downloadResourceAdminDtoSchema.safeParse(dto).success).toBe(true);
    expect(
      downloadResourceAdminDtoSchema.safeParse({
        ...dto,
        publishedRevision: { ...revision, coverObjectKey: null },
      }).success,
    ).toBe(false);
    expect(
      downloadResourceAdminDtoSchema.safeParse({
        ...dto,
        publishedRevision: {
          ...revision,
          pdfObjectKey: null,
          coverObjectKey: null,
          pageCount: null,
          byteSize: null,
          sha256: null,
        },
      }).success,
    ).toBe(true);
  });

  it("derives admin status in the required priority order", () => {
    const completeDraft = { hasCompleteArtifact: true };
    const healthyPublished = {
      pdfExists: true,
      coverExists: true,
      expectedByteSize: 100,
      actualByteSize: 100,
    };

    expect(
      deriveAdminStatus({
        state: "published",
        publishedRevision: { ...healthyPublished, coverExists: false },
        draftRevision: completeDraft,
      }),
    ).toBe("文件失效");
    expect(
      deriveAdminStatus({
        state: "published",
        publishedRevision: { ...healthyPublished, actualByteSize: 99 },
        draftRevision: completeDraft,
      }),
    ).toBe("文件失效");
    expect(
      deriveAdminStatus({
        state: "published",
        publishedRevision: healthyPublished,
        draftRevision: completeDraft,
      }),
    ).toBe("有待发布更改");
    expect(
      deriveAdminStatus({
        state: "published",
        publishedRevision: healthyPublished,
        draftRevision: null,
      }),
    ).toBe("已发布");
    expect(
      deriveAdminStatus({
        state: "downline",
        publishedRevision: null,
        draftRevision: completeDraft,
      }),
    ).toBe("已下线");
    expect(
      deriveAdminStatus({
        state: "unpublished",
        publishedRevision: null,
        draftRevision: completeDraft,
      }),
    ).toBe("待发布");
    expect(
      deriveAdminStatus({
        state: "unpublished",
        publishedRevision: null,
        draftRevision: { hasCompleteArtifact: false },
      }),
    ).toBe("待上传");
    expect(
      deriveAdminStatus({
        state: "unpublished",
        publishedRevision: null,
        draftRevision: null,
      }),
    ).toBe("空记录");
  });

  it("exposes a strict public DTO without internal storage fields or digests", () => {
    const dto = {
      key: "yuanqi-intro",
      name: "元启产品介绍",
      product: "元启",
      category: "materials",
      resourceType: "产品说明书",
      description: "产品说明",
      sortOrder: 10,
      previewPolicy: "public",
      downloadPolicy: "contact",
      coverUrl: "/api/downloads/yuanqi-intro/cover",
      pageCount: 3,
      byteSize: 1024,
      updatedAt: "2026-08-16T00:00:00.000Z",
    };
    expect(downloadResourcePublicDtoSchema.parse(dto)).toEqual(dto);
    for (const forbidden of ["pdfObjectKey", "coverObjectKey", "sha256"]) {
      expect(
        downloadResourcePublicDtoSchema.safeParse({
          ...dto,
          [forbidden]: "secret",
        }).success,
      ).toBe(false);
    }
  });
});

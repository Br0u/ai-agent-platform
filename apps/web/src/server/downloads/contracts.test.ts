import { describe, expect, it } from "vitest";

import {
  adminDownloadQuerySchema,
  deriveAdminStatus,
  downloadResourcePublicDtoSchema,
  mutateDownloadResourceInputSchema,
  suggestDownloadPolicies,
  typedCreateDownloadResourceInputSchema,
  typedDownloadResourceAdminDtoSchema,
  typedSaveDownloadDraftInputSchema,
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

describe("download resource contracts", () => {
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

  it("uses the discriminated public DTO without internal storage fields or digests", () => {
    const document = {
      kind: "document",
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
    expect(downloadResourcePublicDtoSchema.parse(document)).toEqual(document);
    for (const forbidden of ["pdfObjectKey", "coverObjectKey", "sha256"]) {
      expect(
        downloadResourcePublicDtoSchema.safeParse({
          ...document,
          [forbidden]: "secret",
        }).success,
      ).toBe(false);
    }
  });

  it("requires an immutable kind when creating a typed resource", () => {
    expect(
      typedCreateDownloadResourceInputSchema.safeParse({
        key: "mdd2-client",
        adminLabel: "码里奥桌面客户端",
      }).success,
    ).toBe(false);
    expect(
      typedCreateDownloadResourceInputSchema.parse({
        key: "mdd2-client",
        adminLabel: " 码里奥桌面客户端 ",
        kind: "software",
      }),
    ).toEqual({
      key: "mdd2-client",
      adminLabel: "码里奥桌面客户端",
      kind: "software",
    });
  });

  it("keeps document policies and isolates software draft metadata", () => {
    expect(
      typedSaveDownloadDraftInputSchema.parse({
        id: resourceId,
        expectedRowVersion: 1,
        kind: "document",
        ...metadata,
      }),
    ).toMatchObject({ kind: "document", previewPolicy: "public" });

    const softwareDraft = {
      id: resourceId,
      expectedRowVersion: 1,
      kind: "software",
      name: "码里奥桌面客户端",
      product: "码里奥",
      category: "software",
      resourceType: "桌面客户端",
      description: "企业级智能编码客户端",
      sortOrder: 20,
      releaseVersion: " v2.0.0 ",
    };
    expect(
      typedSaveDownloadDraftInputSchema.parse(softwareDraft),
    ).toMatchObject({
      kind: "software",
      releaseVersion: "v2.0.0",
    });
    for (const releaseVersion of [" ", "\nv2.0.0", "v2.0.0\t", "v2\n.0.0"]) {
      expect(
        typedSaveDownloadDraftInputSchema.safeParse({
          ...softwareDraft,
          releaseVersion,
        }).success,
      ).toBe(false);
    }
    expect(
      typedSaveDownloadDraftInputSchema.safeParse({
        ...softwareDraft,
        previewPolicy: "public",
      }).success,
    ).toBe(false);
  });

  it("models typed admin resources with kind-specific artifacts", () => {
    const dto = {
      id: resourceId,
      key: "mdd2-client",
      adminLabel: "码里奥桌面客户端",
      kind: "software",
      state: "unpublished",
      adminStatus: "待发布",
      rowVersion: 1,
      publishedRevision: null,
      draftRevision: {
        id: revisionId,
        kind: "software",
        name: "码里奥桌面客户端",
        product: "码里奥",
        category: "software",
        resourceType: "桌面客户端",
        description: "企业级智能编码客户端",
        sortOrder: 20,
        releaseVersion: "v2.0.0",
        artifacts: [
          {
            slot: "windows",
            objectKey: "objects/resource/revision-windows.exe",
            originalFilename: "mario.exe",
            extension: ".exe",
            mediaType: "application/vnd.microsoft.portable-executable",
            byteSize: 240_000_000,
            sha256: "a".repeat(64),
          },
        ],
        createdAt: "2026-08-18T00:00:00.000Z",
        publishedAt: null,
      },
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
    };
    expect(typedDownloadResourceAdminDtoSchema.parse(dto)).toMatchObject({
      kind: "software",
      draftRevision: {
        artifacts: [
          expect.objectContaining({
            sha256: "a".repeat(64),
            mediaType: "application/vnd.microsoft.portable-executable",
            extension: ".exe",
          }),
        ],
      },
    });
    expect(
      typedDownloadResourceAdminDtoSchema.safeParse({
        ...dto,
        rowVersion: "1",
      }).success,
    ).toBe(false);
  });

  it("keeps document fields and exposes only public software artifacts in one public contract", () => {
    const document = {
      kind: "document",
      key: "yuanqi-intro",
      name: "元启产品介绍",
      product: "元启",
      category: "materials",
      resourceType: "产品说明书",
      description: "产品说明",
      sortOrder: 10,
      previewPolicy: "public",
      downloadPolicy: "contact",
      coverUrl: "/api/v1/downloads/yuanqi-intro/cover",
      pageCount: 3,
      byteSize: 1024,
      updatedAt: "2026-08-18T00:00:00.000Z",
    };
    expect(downloadResourcePublicDtoSchema.parse(document)).toMatchObject({
      kind: "document",
      coverUrl: document.coverUrl,
      pageCount: 3,
      previewPolicy: "public",
      downloadPolicy: "contact",
    });

    const software = {
      kind: "software",
      key: "mdd2-client",
      name: "码里奥桌面客户端",
      product: "码里奥",
      category: "software",
      resourceType: "桌面客户端",
      description: "企业级智能编码客户端",
      sortOrder: 20,
      releaseVersion: "v2.0.0",
      platforms: {
        windows: {
          filename: "mario.exe",
          byteSize: 240_000_000,
          downloadUrl: "/api/v1/downloads/mdd2-client/download/windows",
        },
        macos: null,
      },
      updatedAt: "2026-08-18T00:00:00.000Z",
    };
    expect(downloadResourcePublicDtoSchema.parse(software)).toMatchObject({
      kind: "software",
      releaseVersion: "v2.0.0",
    });
    for (const forbidden of ["objectKey", "sha256"]) {
      expect(
        downloadResourcePublicDtoSchema.safeParse({
          ...software,
          platforms: {
            ...software.platforms,
            windows: { ...software.platforms.windows, [forbidden]: "secret" },
          },
        }).success,
      ).toBe(false);
    }
    expect(
      downloadResourcePublicDtoSchema.safeParse({
        ...software,
        platforms: { windows: null, macos: null },
      }).success,
    ).toBe(false);
    expect(
      downloadResourcePublicDtoSchema.safeParse({
        ...software,
        previewPolicy: "public",
      }).success,
    ).toBe(false);
  });
});

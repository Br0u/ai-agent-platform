import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeRevision = {
  id: string;
  resourceId: string;
  name: string;
  product: string;
  category: string;
  resourceType: string;
  description: string;
  sortOrder: number;
  previewPolicy: string;
  downloadPolicy: string;
  pdfObjectKey: string | null;
  coverObjectKey: string | null;
  pageCount: number | null;
  byteSize: number | null;
  sha256: string | null;
  createdBy: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  cleanupPendingAt: Date | null;
  cleanupErrorSummary: string | null;
};
type FakeResource = {
  id: string;
  key: string;
  adminLabel: string;
  state: string;
  publishedRevisionId: string | null;
  draftRevisionId: string | null;
  publishedRevision: FakeRevision | null;
  draftRevision: FakeRevision | null;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
};
type CommitInput = {
  resourceId: string;
  revisionId: string;
  kind: "pdf" | "cover";
};
type ResourceUpdate = {
  id: string;
  expectedRowVersion: number;
  state: string;
  publishedRevisionId: string | null;
  draftRevisionId: string | null;
};
type ArtifactRefInput = {
  pdfObjectKey: string;
  coverObjectKey: string;
  excludeRevisionId?: string;
};
type RevisionInput = Omit<
  FakeRevision,
  "createdAt" | "publishedAt" | "cleanupPendingAt" | "cleanupErrorSummary"
> & { id?: string };
type TransactionWork = (tx: ReturnType<typeof transaction>) => Promise<unknown>;

const wiring = vi.hoisted(() => ({
  allow: vi.fn(async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
  })),
  files: new Map<string, number>(),
  cleanupFailures: new Set<string>(),
  commitFailures: new Set<"pdf" | "cover">(),
  failInsertRevision: false,
  failCleanupPersist: false,
  failAllRemoves: false,
  finalizationFailure: false,
  openedPdfSize: null as number | null,
  lastReadable: { destroy: vi.fn() },
  denyTransactionPermission: false,
  abortAfterPdf: null as AbortController | null,
  abortAfterCover: null as AbortController | null,
  abortOnInsert: null as AbortController | null,
  resources: new Map<string, FakeResource>(),
  revisions: new Map<string, FakeRevision>(),
  audits: [] as unknown[],
}));

vi.mock("../auth/access", () => ({ requirePermission: wiring.allow }));
vi.mock("./file-store", () => ({
  createDownloadFileStore: () => {
    const storeIdentity = {};
    return {
      createStage: vi.fn(async () => ({ storeIdentity })),
      commit: vi.fn(async (_stage: unknown, input: CommitInput) => {
        if (
          typeof _stage === "object" &&
          _stage !== null &&
          "storeIdentity" in _stage &&
          _stage.storeIdentity !== storeIdentity
        ) {
          throw new Error("Invalid or consumed stage");
        }
        if (wiring.commitFailures.has(input.kind))
          throw new Error("commit failure");
        const key = `objects/${input.resourceId}/${input.revisionId}.${input.kind === "pdf" ? "pdf" : "webp"}`;
        wiring.files.set(key, input.kind === "pdf" ? 123 : 45);
        if (input.kind === "pdf") wiring.abortAfterPdf?.abort();
        if (input.kind === "cover") wiring.abortAfterCover?.abort();
        return key;
      }),
      stat: vi.fn(async (key: string) => {
        const size = wiring.files.get(key);
        if (size === undefined) throw new Error("ENOENT");
        return { size };
      }),
      open: vi.fn(async (key: string, range?: unknown) => {
        const size =
          key.endsWith(".pdf") && wiring.openedPdfSize !== null
            ? wiring.openedPdfSize
            : wiring.files.get(key);
        if (size === undefined) throw new Error("ENOENT");
        wiring.lastReadable = { destroy: vi.fn() };
        return { key, range, size, readable: wiring.lastReadable };
      }),
      remove: vi.fn(async (key: string) => {
        if (wiring.failAllRemoves || wiring.cleanupFailures.has(key))
          throw new Error("filesystem failure");
        wiring.files.delete(key);
      }),
    };
  },
}));
vi.mock("./repository", () => ({
  downloadResourceRepository: {
    listAdmin: vi.fn(async () => ({
      items: [...wiring.resources.values()],
      total: wiring.resources.size,
    })),
    getAdminById: vi.fn(async (id: string) => wiring.resources.get(id) ?? null),
    listPublic: vi.fn(async () =>
      [...wiring.resources.values()]
        .filter((resource) => resource.state === "published")
        .map((resource) => ({
          key: resource.key,
          updatedAt: resource.updatedAt,
          ...resource.publishedRevision,
        })),
    ),
    getPublicByKey: vi.fn(async (key: string) => {
      const resource = [...wiring.resources.values()].find(
        (candidate) => candidate.key === key && candidate.state === "published",
      );
      return resource
        ? {
            key: resource.key,
            updatedAt: resource.updatedAt,
            ...resource.publishedRevision,
          }
        : null;
    }),
    transaction: async (work: TransactionWork) => work(transaction()),
    withArtifactMutationLock: async (
      work: TransactionWork,
      cleanup?: (result: unknown) => Promise<void>,
    ) => {
      const result = await work(transaction());
      await cleanup?.(result);
      if (wiring.finalizationFailure)
        throw new Error("lock finalization failed");
      return result;
    },
  },
}));

function transaction() {
  return {
    assertActiveWorkforcePermission: vi.fn(async () => {
      if (wiring.denyTransactionPermission)
        throw new Error("AUTH_PERMISSION_DENIED");
    }),
    lockResource: async (id: string) => wiring.resources.get(id) ?? null,
    insertResource: async (input: { key: string; adminLabel: string }) => {
      const resource = resourceRow(input);
      wiring.resources.set(resource.id, resource);
      return {
        id: resource.id,
        key: resource.key,
        adminLabel: resource.adminLabel,
        state: resource.state,
        publishedRevisionId: resource.publishedRevisionId,
        draftRevisionId: resource.draftRevisionId,
        rowVersion: resource.rowVersion,
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
      };
    },
    insertRevision: async (input: RevisionInput) => {
      if (wiring.failInsertRevision) throw new Error("database failure");
      const revision = revisionRow(input);
      wiring.revisions.set(revision.id, revision);
      wiring.abortOnInsert?.abort();
      return revision;
    },
    updateResourceCas: async (input: ResourceUpdate) => {
      const resource = wiring.resources.get(input.id);
      if (!resource || resource.rowVersion !== input.expectedRowVersion)
        return null;
      resource.state = input.state;
      resource.publishedRevisionId = input.publishedRevisionId;
      resource.draftRevisionId = input.draftRevisionId;
      resource.publishedRevision = input.publishedRevisionId
        ? (wiring.revisions.get(input.publishedRevisionId) ?? null)
        : null;
      resource.draftRevision = input.draftRevisionId
        ? (wiring.revisions.get(input.draftRevisionId) ?? null)
        : null;
      resource.rowVersion += 1;
      resource.updatedAt = new Date();
      return {
        id: resource.id,
        key: resource.key,
        adminLabel: resource.adminLabel,
        state: resource.state,
        publishedRevisionId: resource.publishedRevisionId,
        draftRevisionId: resource.draftRevisionId,
        rowVersion: resource.rowVersion,
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
      };
    },
    markRevisionPublished: async (id: string) => {
      const revision = wiring.revisions.get(id);
      if (!revision) return null;
      revision.publishedAt = new Date();
      return revision;
    },
    markRevisionCleanupPending: async (id: string) => {
      const revision = wiring.revisions.get(id);
      if (!revision) return null;
      revision.cleanupPendingAt = new Date();
      return revision;
    },
    listCleanupPendingRevisions: async (resourceId: string) =>
      [...wiring.revisions.values()].filter(
        (revision) =>
          revision.resourceId === resourceId && revision.cleanupPendingAt,
      ),
    deleteCleanupRevision: async (id: string) => wiring.revisions.delete(id),
    deleteDetachedRevision: async (id: string) => wiring.revisions.delete(id),
    countArtifactReferences: async ({
      pdfObjectKey,
      coverObjectKey,
      excludeRevisionId,
    }: ArtifactRefInput) => ({
      pdfReferenceCount: [...wiring.revisions.values()].filter(
        (revision) =>
          revision.id !== excludeRevisionId &&
          revision.pdfObjectKey === pdfObjectKey,
      ).length,
      coverReferenceCount: [...wiring.revisions.values()].filter(
        (revision) =>
          revision.id !== excludeRevisionId &&
          revision.coverObjectKey === coverObjectKey,
      ).length,
    }),
    getPreviewRevision: async (id: string) => {
      const revision = wiring.revisions.get(id);
      return revision?.cleanupPendingAt ? null : (revision ?? null);
    },
    setCleanupError: async (id: string, summary: string) => {
      if (wiring.failCleanupPersist)
        throw new Error("cleanup persistence failed");
      const revision = wiring.revisions.get(id);
      if (revision) revision.cleanupErrorSummary = summary;
      return revision ?? null;
    },
    appendAudit: async (event: unknown) => wiring.audits.push(event),
  };
}

function resourceRow(input: { key: string; adminLabel: string }) {
  const resource = {
    id: randomUUID(),
    key: input.key,
    adminLabel: input.adminLabel,
    state: "unpublished",
    publishedRevisionId: null,
    draftRevisionId: null,
    publishedRevision: null,
    draftRevision: null,
    rowVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return resource;
}

function revisionRow(input: RevisionInput): FakeRevision {
  return {
    id: input.id ?? randomUUID(),
    resourceId: input.resourceId,
    name: input.name,
    product: input.product,
    category: input.category,
    resourceType: input.resourceType,
    description: input.description,
    sortOrder: input.sortOrder,
    previewPolicy: input.previewPolicy,
    downloadPolicy: input.downloadPolicy,
    pdfObjectKey: input.pdfObjectKey ?? null,
    coverObjectKey: input.coverObjectKey ?? null,
    pageCount: input.pageCount ?? null,
    byteSize: input.byteSize ?? null,
    sha256: input.sha256 ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date(),
    publishedAt: null,
    cleanupPendingAt: null,
    cleanupErrorSummary: null,
  };
}

function metadata(id: string, expectedRowVersion: number) {
  return {
    id,
    expectedRowVersion,
    name: "产品介绍",
    product: "元启",
    category: "materials",
    resourceType: "产品介绍",
    description: "说明",
    sortOrder: 1,
    previewPolicy: "public",
    downloadPolicy: "contact",
  } as const;
}

function upload(id: string, expectedRowVersion: number) {
  return {
    id,
    expectedRowVersion,
    pdfStage: {} as never,
    coverStage: {} as never,
    pageCount: 1,
    byteSize: 123,
    sha256: "a".repeat(64),
  };
}

describe("downloadResourceService lifecycle", () => {
  beforeEach(() => {
    wiring.allow.mockClear();
    wiring.files.clear();
    wiring.cleanupFailures.clear();
    wiring.commitFailures.clear();
    wiring.failInsertRevision = false;
    wiring.failCleanupPersist = false;
    wiring.failAllRemoves = false;
    wiring.finalizationFailure = false;
    wiring.openedPdfSize = null;
    wiring.lastReadable = { destroy: vi.fn() };
    wiring.denyTransactionPermission = false;
    wiring.abortAfterPdf = null;
    wiring.abortAfterCover = null;
    wiring.abortOnInsert = null;
    wiring.resources.clear();
    wiring.revisions.clear();
    wiring.audits.length = 0;
  });

  it.each([
    [
      "metadata draft uploads then publishes",
      ["save", "upload", "publish"],
      { state: "published", published: true, draft: false },
    ],
    [
      "published metadata draft is pending",
      ["save", "upload", "publish", "save"],
      { state: "published", published: true, draft: true },
    ],
    [
      "downline moves published revision to draft",
      ["save", "upload", "publish", "downline"],
      { state: "downline", published: false, draft: true },
    ],
    [
      "downline draft republishes",
      ["save", "upload", "publish", "downline", "publish"],
      { state: "published", published: true, draft: false },
    ],
  ])("%s", async (_name, actions, expected) => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-intro",
      adminLabel: "元启介绍",
    });
    for (const action of actions) {
      const current = wiring.resources.get(created.id)!;
      if (action === "save")
        await downloadResourceService.saveDraft(
          metadata(created.id, current.rowVersion),
        );
      if (action === "upload")
        await downloadResourceService.attachUploadedPdf(
          upload(created.id, current.rowVersion),
        );
      if (action === "publish")
        await downloadResourceService.publish({
          id: created.id,
          expectedRowVersion: current.rowVersion,
        });
      if (action === "downline")
        await downloadResourceService.downline({
          id: created.id,
          expectedRowVersion: current.rowVersion,
        });
    }
    const resource = wiring.resources.get(created.id)!;
    expect({
      state: resource.state,
      published: Boolean(resource.publishedRevision),
      draft: Boolean(resource.draftRevision),
    }).toEqual(expected);
  });

  it("replaces a published revision, then cleans detached unique artifacts after commit", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-replace",
      adminLabel: "替换",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    const old = wiring.resources.get(created.id)!.publishedRevision!;
    await downloadResourceService.saveDraft(metadata(created.id, 4));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 5));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 6,
    });
    expect(wiring.resources.get(created.id)!.publishedRevision!.id).not.toBe(
      old.id,
    );
    expect(wiring.files.has(old.pdfObjectKey!)).toBe(false);
    expect(wiring.files.has(old.coverObjectKey!)).toBe(false);
  });

  it("hydrates mutation DTOs even though database writes return plain resource rows", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-flat-row",
      adminLabel: "平面行",
    });
    const saved = await downloadResourceService.saveDraft(
      metadata(created.id, 1),
    );
    expect(saved.draftRevision?.name).toBe("产品介绍");
    const uploaded = await downloadResourceService.attachUploadedPdf(
      upload(created.id, 2),
    );
    expect(uploaded.draftRevision?.pdfObjectKey).toContain(".pdf");
    const published = await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    expect(published.publishedRevision?.name).toBe("产品介绍");
    expect(published.draftRevision).toBeNull();
  });

  it("keeps public updatedAt bound to the published revision after a draft save", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-public-date",
      adminLabel: "公开时间",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    const resource = wiring.resources.get(created.id)!;
    resource.publishedRevision!.publishedAt = new Date(
      "2024-01-02T03:04:05.000Z",
    );
    resource.updatedAt = new Date("2025-06-07T08:09:10.000Z");
    const published = (await downloadResourceService.listPublicResources())[0]!;
    expect(published.updatedAt).toBe("2024-01-02T03:04:05.000Z");
    await downloadResourceService.saveDraft(metadata(created.id, 4));
    const afterDraftSave = (
      await downloadResourceService.listPublicResources()
    )[0]!;
    expect(afterDraftSave.updatedAt).toBe(published.updatedAt);
  });

  it("hides a published resource whose revision lacks a publication timestamp", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-missing-published-at",
      adminLabel: "发布时间异常",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    wiring.resources.get(created.id)!.publishedRevision!.publishedAt = null;
    expect(await downloadResourceService.listPublicResources()).toEqual([]);
  });

  it("publishes a metadata-only draft without deleting its shared PDF or cover", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-metadata-publish",
      adminLabel: "元数据发布",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    const old = wiring.resources.get(created.id)!.publishedRevision!;
    await downloadResourceService.saveDraft(metadata(created.id, 4));
    const draft = wiring.resources.get(created.id)!.draftRevision!;
    expect(draft.pdfObjectKey).toBe(old.pdfObjectKey);
    expect(draft.coverObjectKey).toBe(old.coverObjectKey);
    const published = await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 5,
    });
    expect(published.state).toBe("published");
    expect(published.publishedRevision?.id).toBe(draft.id);
    expect(wiring.revisions.has(old.id)).toBe(false);
    expect(wiring.files.has(old.pdfObjectKey!)).toBe(true);
    expect(wiring.files.has(old.coverObjectKey!)).toBe(true);
  });

  it("rejects a separately valid stale rowVersion without changing pointers or files", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-stale",
      adminLabel: "版本冲突",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    const resource = wiring.resources.get(created.id)!;
    const published = resource.publishedRevision!;
    await expect(
      downloadResourceService.saveDraft(metadata(created.id, 3)),
    ).rejects.toThrow("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT");
    expect(wiring.resources.get(created.id)!.publishedRevision?.id).toBe(
      published.id,
    );
    expect(wiring.files.has(published.pdfObjectKey!)).toBe(true);
    expect(wiring.files.has(published.coverObjectKey!)).toBe(true);
  });

  it("retains a cleanup row on deletion failure and retries it with the next mutation", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-retry",
      adminLabel: "重试",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    const old = wiring.resources.get(created.id)!.publishedRevision!;
    wiring.cleanupFailures.add(old.pdfObjectKey!);
    await downloadResourceService.saveDraft(metadata(created.id, 4));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 5));
    const context = { ipAddress: "203.0.113.8", userAgent: "download-admin" };
    await downloadResourceService.publish(
      {
        id: created.id,
        expectedRowVersion: 6,
      },
      context,
    );
    expect(wiring.revisions.get(old.id)?.cleanupPendingAt).toBeTruthy();
    expect(wiring.revisions.get(old.id)?.cleanupErrorSummary).toContain(
      "filesystem cleanup failed",
    );
    wiring.cleanupFailures.clear();
    await downloadResourceService.saveDraft(metadata(created.id, 7));
    expect(wiring.revisions.has(old.id)).toBe(false);
    expect(wiring.files.has(old.pdfObjectKey!)).toBe(false);
    expect(wiring.files.has(old.coverObjectKey!)).toBe(false);
    expect(
      wiring.audits.some(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "event" in event &&
          event.event === "download_resource.cleanup_failed" &&
          (event as { ipAddress?: string }).ipAddress === context.ipAddress &&
          (event as { userAgent?: string }).userAgent === context.userAgent &&
          "metadata" in event &&
          typeof event.metadata === "object" &&
          event.metadata !== null &&
          Object.keys(event.metadata).sort().join(",") ===
            "errorCategory,key,result,revisionId,rowVersion",
      ),
    ).toBe(true);
  });

  it("records request context on ordinary lifecycle audits without adding it to metadata", async () => {
    const { downloadResourceService } = await import("./service");
    const context = {
      ipAddress: "198.51.100.42",
      userAgent: "content-operator",
    };
    await downloadResourceService.createResource(
      { key: "yuanqi-audit-context", adminLabel: "审计上下文" },
      context,
    );
    const event = wiring.audits.at(-1) as {
      ipAddress?: string;
      userAgent?: string;
      metadata: Record<string, unknown>;
    };
    expect(event.ipAddress).toBe(context.ipAddress);
    expect(event.userAgent).toBe(context.userAgent);
    expect(Object.keys(event.metadata).sort()).toEqual([
      "key",
      "result",
      "revisionId",
      "rowVersion",
    ]);
  });

  it.each([
    "pre-cancelled",
    "after-pdf",
    "after-cover",
    "after-insert",
  ] as const)(
    "compensates newly committed artifacts when upload is aborted %s",
    async (point) => {
      const { downloadResourceService } = await import("./service");
      const created = await downloadResourceService.createResource({
        key: `yuanqi-abort-${point}`,
        adminLabel: "上传取消",
      });
      await downloadResourceService.saveDraft(metadata(created.id, 1));
      const controller = new AbortController();
      if (point === "pre-cancelled") controller.abort();
      if (point === "after-pdf") wiring.abortAfterPdf = controller;
      if (point === "after-cover") wiring.abortAfterCover = controller;
      if (point === "after-insert") wiring.abortOnInsert = controller;
      await expect(
        downloadResourceService.attachUploadedPdf(
          upload(created.id, 2),
          { ipAddress: "192.0.2.19", userAgent: "abort-test" },
          controller.signal,
        ),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(wiring.files).toHaveLength(0);
      expect(
        wiring.resources.get(created.id)!.draftRevision?.pdfObjectKey,
      ).toBeNull();
    },
  );

  it("removes newly committed artifacts when the cover or database step fails", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-rollback",
      adminLabel: "回滚",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    wiring.commitFailures.add("cover");
    await expect(
      downloadResourceService.attachUploadedPdf(upload(created.id, 2)),
    ).rejects.toThrow("commit failure");
    expect(wiring.files).toHaveLength(0);
    wiring.commitFailures.clear();
    wiring.failInsertRevision = true;
    await expect(
      downloadResourceService.attachUploadedPdf(upload(created.id, 2)),
    ).rejects.toThrow("database failure");
    expect(wiring.files).toHaveLength(0);
    expect(
      wiring.resources.get(created.id)!.draftRevision?.pdfObjectKey,
    ).toBeNull();
  });

  it("does not compensate committed upload artifacts after post-commit or lock finalization failure", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-post-commit",
      adminLabel: "提交后",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    wiring.finalizationFailure = true;
    await expect(
      downloadResourceService.attachUploadedPdf(upload(created.id, 2)),
    ).rejects.toThrow("lock finalization failed");
    expect(wiring.files).toHaveLength(2);
    expect(
      wiring.resources.get(created.id)!.draftRevision?.pdfObjectKey,
    ).toContain(".pdf");
  });

  it("keeps newly committed upload artifacts when post-commit cleanup persistence fails", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-cleanup-commit",
      adminLabel: "清理提交后",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    const old = wiring.resources.get(created.id)!.publishedRevision!;
    wiring.cleanupFailures.add(old.pdfObjectKey!);
    wiring.failCleanupPersist = true;
    await downloadResourceService.saveDraft(metadata(created.id, 4));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 5));
    await expect(
      downloadResourceService.publish({
        id: created.id,
        expectedRowVersion: 6,
      }),
    ).rejects.toThrow("cleanup persistence failed");
    expect(wiring.files).toHaveLength(4);
    expect(wiring.resources.get(created.id)!.publishedRevision?.id).not.toBe(
      old.id,
    );
  });

  it("surfaces an aggregate when pre-commit upload compensation also fails", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-compensation",
      adminLabel: "补偿",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    wiring.commitFailures.add("cover");
    wiring.failAllRemoves = true;
    await expect(
      downloadResourceService.attachUploadedPdf(upload(created.id, 2)),
    ).rejects.toBeInstanceOf(AggregateError);
  });

  it("accepts a staged upload only from the shared resource file store", async () => {
    const { downloadResourceFileStore, downloadResourceService } = await import(
      "./service"
    );
    const created = await downloadResourceService.createResource({
      key: "yuanqi-stage-provenance",
      adminLabel: "上传归属",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await expect(
      downloadResourceService.attachUploadedPdf({
        ...upload(created.id, 2),
        pdfStage: await downloadResourceFileStore.createStage(".pdf"),
        coverStage: await downloadResourceFileStore.createStage(".webp"),
      }),
    ).resolves.toMatchObject({
      draftRevision: { pdfObjectKey: expect.stringContaining(".pdf") },
    });
  });

  it("cleans mixed shared artifact references as one detached batch", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-mixed-refs",
      adminLabel: "混合引用",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    const draft = wiring.resources.get(created.id)!.draftRevision!;
    const otherCover = `objects/${created.id}/${randomUUID()}.webp`;
    const pending = revisionRow({
      ...draft,
      id: randomUUID(),
      coverObjectKey: otherCover,
    });
    pending.cleanupPendingAt = new Date();
    wiring.revisions.set(pending.id, pending);
    wiring.files.set(otherCover, 45);
    await downloadResourceService.removeDraftFile({
      id: created.id,
      expectedRowVersion: 3,
    });
    expect(wiring.files.has(draft.pdfObjectKey!)).toBe(false);
    expect(wiring.files.has(draft.coverObjectKey!)).toBe(false);
    expect(wiring.files.has(otherCover)).toBe(false);
    expect(wiring.revisions.has(pending.id)).toBe(false);
  });

  it("rejects a PDF whose opened descriptor size changed after catalog stat", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-toctou",
      adminLabel: "读取竞态",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    wiring.openedPdfSize = 122;
    await expect(
      downloadResourceService.getPublicArtifact("yuanqi-toctou", "preview"),
    ).resolves.toBeNull();
    expect(wiring.lastReadable.destroy).toHaveBeenCalledOnce();
  });

  it("requires the read gate and repeats exact permission in the mutation transaction", async () => {
    const { downloadResourceService } = await import("./service");
    wiring.allow.mockRejectedValueOnce(new Error("AUTH_PERMISSION_DENIED"));
    await expect(
      downloadResourceService.listAdminResources({}),
    ).rejects.toThrow("AUTH_PERMISSION_DENIED");
    wiring.denyTransactionPermission = true;
    await expect(
      downloadResourceService.createResource({
        key: "yuanqi-permission",
        adminLabel: "权限",
      }),
    ).rejects.toThrow("AUTH_PERMISSION_DENIED");
    expect(wiring.resources).toHaveLength(0);
  });

  it.each([
    [
      "published pending draft",
      ["save", "upload", "publish", "save"],
      "discardDraft",
      { state: "published", draft: false },
    ],
    [
      "downline draft",
      ["save", "upload", "publish", "downline"],
      "discardDraft",
      { state: "unpublished", draft: false },
    ],
    [
      "nonpublic file draft",
      ["save", "upload"],
      "removeDraftFile",
      { state: "unpublished", draft: true },
    ],
  ])("%s can %s", async (_name, actions, operation, expected) => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: `resource-${randomUUID().slice(0, 8)}`,
      adminLabel: "资源",
    });
    for (const action of actions) {
      const current = wiring.resources.get(created.id)!;
      if (action === "save")
        await downloadResourceService.saveDraft(
          metadata(created.id, current.rowVersion),
        );
      if (action === "upload")
        await downloadResourceService.attachUploadedPdf(
          upload(created.id, current.rowVersion),
        );
      if (action === "publish")
        await downloadResourceService.publish({
          id: created.id,
          expectedRowVersion: current.rowVersion,
        });
      if (action === "downline")
        await downloadResourceService.downline({
          id: created.id,
          expectedRowVersion: current.rowVersion,
        });
    }
    const current = wiring.resources.get(created.id)!;
    await downloadResourceService[
      operation as "discardDraft" | "removeDraftFile"
    ]({ id: created.id, expectedRowVersion: current.rowVersion });
    const resource = wiring.resources.get(created.id)!;
    expect({
      state: resource.state,
      draft: Boolean(resource.draftRevision),
    }).toEqual(expected);
    if (operation === "removeDraftFile")
      expect(resource.draftRevision?.pdfObjectKey).toBeNull();
  });

  it("rejects an unsafe lifecycle transition and stale or invalid inputs before pointer loss", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-reject",
      adminLabel: "拒绝",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await expect(
      downloadResourceService.publish({
        id: created.id,
        expectedRowVersion: 2,
      }),
    ).rejects.toThrow();
    await expect(
      downloadResourceService.saveDraft({
        ...metadata(created.id, 999),
        key: "mutable-key",
      }),
    ).rejects.toThrow();
    await expect(
      downloadResourceService.saveDraft({
        ...metadata(created.id, 2),
        previewPolicy: "contact",
        downloadPolicy: "public",
      }),
    ).rejects.toThrow();
    expect(wiring.resources.get(created.id)!.draftRevision).not.toBeNull();
  });

  it("rejects downline with a pending draft and public file removal", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-public",
      adminLabel: "公开",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    await downloadResourceService.saveDraft(metadata(created.id, 4));
    await expect(
      downloadResourceService.downline({
        id: created.id,
        expectedRowVersion: 5,
      }),
    ).rejects.toThrow();
    await downloadResourceService.discardDraft({
      id: created.id,
      expectedRowVersion: 5,
    });
    await expect(
      downloadResourceService.removeDraftFile({
        id: created.id,
        expectedRowVersion: 6,
      }),
    ).rejects.toThrow();
  });

  it("enforces public policy, validates current file sizes, and never exposes admin object keys", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource({
      key: "yuanqi-read",
      adminLabel: "读取",
    });
    await downloadResourceService.saveDraft(metadata(created.id, 1));
    await downloadResourceService.attachUploadedPdf(upload(created.id, 2));
    await downloadResourceService.publish({
      id: created.id,
      expectedRowVersion: 3,
    });
    expect(await downloadResourceService.listPublicResources()).toHaveLength(1);
    expect(
      await downloadResourceService.getPublicArtifact("yuanqi-read", "cover"),
    ).toBeTruthy();
    await expect(
      downloadResourceService.getPublicArtifact("yuanqi-read", "download"),
    ).resolves.toBeNull();
    const draft = await downloadResourceService.getAdminDraftArtifact(
      created.id,
      "pdf",
      undefined,
    );
    expect(draft).toBeNull();
    const key = wiring.resources.get(created.id)!.publishedRevision!
      .pdfObjectKey!;
    wiring.files.delete(key);
    expect(await downloadResourceService.listPublicResources()).toHaveLength(0);
    expect(
      (await downloadResourceService.getAdminResource(created.id))?.adminStatus,
    ).toBe("文件失效");
  });
});

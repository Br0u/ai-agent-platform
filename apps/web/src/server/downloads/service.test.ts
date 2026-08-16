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
  resources: new Map<string, FakeResource>(),
  revisions: new Map<string, FakeRevision>(),
  audits: [] as unknown[],
}));

vi.mock("../auth/access", () => ({ requirePermission: wiring.allow }));
vi.mock("./file-store", () => ({
  createDownloadFileStore: () => ({
    commit: vi.fn(async (_stage: unknown, input: CommitInput) => {
      if (wiring.commitFailures.has(input.kind))
        throw new Error("commit failure");
      const key = `objects/${input.resourceId}/${input.revisionId}.${input.kind === "pdf" ? "pdf" : "webp"}`;
      wiring.files.set(key, input.kind === "pdf" ? 123 : 45);
      return key;
    }),
    stat: vi.fn(async (key: string) => {
      const size = wiring.files.get(key);
      if (size === undefined) throw new Error("ENOENT");
      return { size };
    }),
    open: vi.fn(async (key: string, range?: unknown) => ({ key, range })),
    remove: vi.fn(async (key: string) => {
      if (wiring.cleanupFailures.has(key))
        throw new Error("filesystem failure");
      wiring.files.delete(key);
    }),
  }),
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
      return result;
    },
  },
}));

function transaction() {
  return {
    assertActiveWorkforcePermission: vi.fn(async () => undefined),
    lockResource: async (id: string) => wiring.resources.get(id) ?? null,
    insertResource: async (input: { key: string; adminLabel: string }) => {
      const resource = resourceRow(input);
      wiring.resources.set(resource.id, resource);
      return resource;
    },
    insertRevision: async (input: RevisionInput) => {
      if (wiring.failInsertRevision) throw new Error("database failure");
      const revision = revisionRow(input);
      wiring.revisions.set(revision.id, revision);
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
      return resource;
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
      const revision = wiring.revisions.get(id);
      if (revision) revision.cleanupErrorSummary = summary;
      return revision ?? null;
    },
    appendAudit: async (event: unknown) => wiring.audits.push(event),
  };
}

function resourceRow(input: { key: string; adminLabel: string }) {
  return {
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

const actor = { userId: "11111111-1111-4111-8111-111111111111" };

describe("downloadResourceService lifecycle", () => {
  beforeEach(() => {
    wiring.allow.mockClear();
    wiring.files.clear();
    wiring.cleanupFailures.clear();
    wiring.commitFailures.clear();
    wiring.failInsertRevision = false;
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
    const created = await downloadResourceService.createResource(
      { key: "yuanqi-intro", adminLabel: "元启介绍" },
      actor,
    );
    for (const action of actions) {
      const current = wiring.resources.get(created.id)!;
      if (action === "save")
        await downloadResourceService.saveDraft(
          metadata(created.id, current.rowVersion),
          actor,
        );
      if (action === "upload")
        await downloadResourceService.attachUploadedPdf(
          upload(created.id, current.rowVersion),
          actor,
        );
      if (action === "publish")
        await downloadResourceService.publish(
          { id: created.id, expectedRowVersion: current.rowVersion },
          actor,
        );
      if (action === "downline")
        await downloadResourceService.downline(
          { id: created.id, expectedRowVersion: current.rowVersion },
          actor,
        );
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
    const created = await downloadResourceService.createResource(
      { key: "yuanqi-replace", adminLabel: "替换" },
      actor,
    );
    await downloadResourceService.saveDraft(metadata(created.id, 1), actor);
    await downloadResourceService.attachUploadedPdf(
      upload(created.id, 2),
      actor,
    );
    await downloadResourceService.publish(
      { id: created.id, expectedRowVersion: 3 },
      actor,
    );
    const old = wiring.resources.get(created.id)!.publishedRevision!;
    await downloadResourceService.saveDraft(metadata(created.id, 4), actor);
    await downloadResourceService.attachUploadedPdf(
      upload(created.id, 5),
      actor,
    );
    await downloadResourceService.publish(
      { id: created.id, expectedRowVersion: 6 },
      actor,
    );
    expect(wiring.resources.get(created.id)!.publishedRevision!.id).not.toBe(
      old.id,
    );
    expect(wiring.files.has(old.pdfObjectKey!)).toBe(false);
    expect(wiring.files.has(old.coverObjectKey!)).toBe(false);
  });

  it("retains a cleanup row on deletion failure and retries it with the next mutation", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource(
      { key: "yuanqi-retry", adminLabel: "重试" },
      actor,
    );
    await downloadResourceService.saveDraft(metadata(created.id, 1), actor);
    await downloadResourceService.attachUploadedPdf(
      upload(created.id, 2),
      actor,
    );
    await downloadResourceService.publish(
      { id: created.id, expectedRowVersion: 3 },
      actor,
    );
    const old = wiring.resources.get(created.id)!.publishedRevision!;
    wiring.cleanupFailures.add(old.pdfObjectKey!);
    await downloadResourceService.saveDraft(metadata(created.id, 4), actor);
    await downloadResourceService.attachUploadedPdf(
      upload(created.id, 5),
      actor,
    );
    await downloadResourceService.publish(
      { id: created.id, expectedRowVersion: 6 },
      actor,
    );
    expect(wiring.revisions.get(old.id)?.cleanupPendingAt).toBeTruthy();
    expect(wiring.revisions.get(old.id)?.cleanupErrorSummary).toContain(
      "filesystem failure",
    );
    wiring.cleanupFailures.clear();
    await downloadResourceService.saveDraft(metadata(created.id, 7), actor);
    expect(wiring.revisions.has(old.id)).toBe(false);
    expect(wiring.files.has(old.pdfObjectKey!)).toBe(false);
    expect(wiring.files.has(old.coverObjectKey!)).toBe(false);
    expect(
      wiring.audits.some(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "event" in event &&
          event.event === "download_resource.cleanup_failed",
      ),
    ).toBe(true);
  });

  it("removes newly committed artifacts when the cover or database step fails", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource(
      { key: "yuanqi-rollback", adminLabel: "回滚" },
      actor,
    );
    await downloadResourceService.saveDraft(metadata(created.id, 1), actor);
    wiring.commitFailures.add("cover");
    await expect(
      downloadResourceService.attachUploadedPdf(upload(created.id, 2), actor),
    ).rejects.toThrow("commit failure");
    expect(wiring.files).toHaveLength(0);
    wiring.commitFailures.clear();
    wiring.failInsertRevision = true;
    await expect(
      downloadResourceService.attachUploadedPdf(upload(created.id, 2), actor),
    ).rejects.toThrow("database failure");
    expect(wiring.files).toHaveLength(0);
    expect(
      wiring.resources.get(created.id)!.draftRevision?.pdfObjectKey,
    ).toBeNull();
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
    const created = await downloadResourceService.createResource(
      { key: `resource-${randomUUID().slice(0, 8)}`, adminLabel: "资源" },
      actor,
    );
    for (const action of actions) {
      const current = wiring.resources.get(created.id)!;
      if (action === "save")
        await downloadResourceService.saveDraft(
          metadata(created.id, current.rowVersion),
          actor,
        );
      if (action === "upload")
        await downloadResourceService.attachUploadedPdf(
          upload(created.id, current.rowVersion),
          actor,
        );
      if (action === "publish")
        await downloadResourceService.publish(
          { id: created.id, expectedRowVersion: current.rowVersion },
          actor,
        );
      if (action === "downline")
        await downloadResourceService.downline(
          { id: created.id, expectedRowVersion: current.rowVersion },
          actor,
        );
    }
    const current = wiring.resources.get(created.id)!;
    await downloadResourceService[
      operation as "discardDraft" | "removeDraftFile"
    ]({ id: created.id, expectedRowVersion: current.rowVersion }, actor);
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
    const created = await downloadResourceService.createResource(
      { key: "yuanqi-reject", adminLabel: "拒绝" },
      actor,
    );
    await downloadResourceService.saveDraft(metadata(created.id, 1), actor);
    await expect(
      downloadResourceService.publish(
        { id: created.id, expectedRowVersion: 2 },
        actor,
      ),
    ).rejects.toThrow();
    await expect(
      downloadResourceService.saveDraft(
        { ...metadata(created.id, 999), key: "mutable-key" },
        actor,
      ),
    ).rejects.toThrow();
    await expect(
      downloadResourceService.saveDraft(
        {
          ...metadata(created.id, 2),
          previewPolicy: "contact",
          downloadPolicy: "public",
        },
        actor,
      ),
    ).rejects.toThrow();
    expect(wiring.resources.get(created.id)!.draftRevision).not.toBeNull();
  });

  it("rejects downline with a pending draft and public file removal", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource(
      { key: "yuanqi-public", adminLabel: "公开" },
      actor,
    );
    await downloadResourceService.saveDraft(metadata(created.id, 1), actor);
    await downloadResourceService.attachUploadedPdf(
      upload(created.id, 2),
      actor,
    );
    await downloadResourceService.publish(
      { id: created.id, expectedRowVersion: 3 },
      actor,
    );
    await downloadResourceService.saveDraft(metadata(created.id, 4), actor);
    await expect(
      downloadResourceService.downline(
        { id: created.id, expectedRowVersion: 5 },
        actor,
      ),
    ).rejects.toThrow();
    await downloadResourceService.discardDraft(
      { id: created.id, expectedRowVersion: 5 },
      actor,
    );
    await expect(
      downloadResourceService.removeDraftFile(
        { id: created.id, expectedRowVersion: 6 },
        actor,
      ),
    ).rejects.toThrow();
  });

  it("enforces public policy, validates current file sizes, and never exposes admin object keys", async () => {
    const { downloadResourceService } = await import("./service");
    const created = await downloadResourceService.createResource(
      { key: "yuanqi-read", adminLabel: "读取" },
      actor,
    );
    await downloadResourceService.saveDraft(metadata(created.id, 1), actor);
    await downloadResourceService.attachUploadedPdf(
      upload(created.id, 2),
      actor,
    );
    await downloadResourceService.publish(
      { id: created.id, expectedRowVersion: 3 },
      actor,
    );
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
      actor,
    );
    expect(draft).toBeNull();
    const key = wiring.resources.get(created.id)!.publishedRevision!
      .pdfObjectKey!;
    wiring.files.delete(key);
    expect(await downloadResourceService.listPublicResources()).toHaveLength(0);
    expect(
      (await downloadResourceService.getAdminResource(created.id, actor))
        ?.adminStatus,
    ).toBe("文件失效");
  });
});

import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-08-18T00:00:00.000Z");
const sha = "a".repeat(64);
type Artifact = {
  id: string;
  revisionId: string;
  revisionKind: "document" | "software";
  slot: "document" | "windows" | "macos";
  objectKey: string;
  originalFilename: string;
  extension: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  pageCount: number | null;
  coverObjectKey: string | null;
  createdAt: Date;
};
type Revision = {
  id: string;
  resourceId: string;
  resourceKind: "document" | "software";
  name: string;
  product: string;
  category: "materials" | "software" | "deployment" | "whitepapers";
  resourceType: string;
  description: string;
  sortOrder: number;
  previewPolicy: "public" | "contact" | null;
  downloadPolicy: "public" | "contact";
  releaseVersion: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  cleanupPendingAt: Date | null;
  cleanupErrorSummary: string | null;
  artifacts: Artifact[];
};
type Resource = {
  id: string;
  key: string;
  adminLabel: string;
  kind: "document" | "software";
  state: "unpublished" | "published" | "downline";
  publishedRevisionId: string | null;
  draftRevisionId: string | null;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
  publishedRevision: Revision | null;
  draftRevision: Revision | null;
};

const wiring = vi.hoisted(() => ({
  files: new Map<string, number>(),
  resources: new Map<string, Resource>(),
  revisions: new Map<string, Revision>(),
  audits: [] as unknown[],
  failUpdate: false,
  failRemove: new Set<string>(),
  failAllRemoves: false,
  failPostCommit: false,
  failUnlock: false,
  openSize: null as number | null,
  readable: { destroy: vi.fn() },
  abortOnAudit: null as AbortController | null,
}));

vi.mock("../auth/access", () => ({
  requirePermission: vi.fn(async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
  })),
}));
vi.mock("./file-store", () => ({
  createDownloadFileStore: () => ({
    inspect: vi.fn(async (key: string, expected?: number) => {
      const size = wiring.files.get(key);
      if (size === undefined || (expected !== undefined && size !== expected))
        throw new Error("ENOENT");
      return { size };
    }),
    commitArtifact: vi.fn(
      async (
        _stage: unknown,
        input: {
          resourceId: string;
          revisionId: string;
          slot: string;
          extension: string;
        },
      ) => {
        const key = `objects/${input.resourceId}/${input.revisionId}/${input.slot}${input.extension}`;
        wiring.files.set(key, input.slot === "document" ? 10 : 20);
        return key;
      },
    ),
    remove: vi.fn(async (key: string) => {
      if (wiring.failAllRemoves || wiring.failRemove.has(key))
        throw new Error("filesystem failure");
      wiring.files.delete(key);
    }),
    open: vi.fn(async (key: string) => {
      const size = wiring.openSize ?? wiring.files.get(key);
      if (size === undefined) throw new Error("ENOENT");
      wiring.readable = { destroy: vi.fn() };
      return { size, readable: wiring.readable };
    }),
  }),
}));

function state() {
  return structuredClone({
    resources: [...wiring.resources],
    revisions: [...wiring.revisions],
  });
}
function restore(value: ReturnType<typeof state>) {
  wiring.resources = new Map(value.resources);
  wiring.revisions = new Map(value.revisions);
}
function transaction() {
  return {
    assertActiveWorkforcePermission: vi.fn(async () => undefined),
    lockResource: vi.fn(async (id: string) => wiring.resources.get(id) ?? null),
    insertResource: vi.fn(
      async (input: Pick<Resource, "key" | "adminLabel" | "kind">) => ({
        id: randomUUID(),
        ...input,
        state: "unpublished" as const,
        publishedRevisionId: null,
        draftRevisionId: null,
        rowVersion: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ),
    insertRevision: vi.fn(
      async (
        input: Omit<
          Revision,
          | "artifacts"
          | "createdAt"
          | "publishedAt"
          | "cleanupPendingAt"
          | "cleanupErrorSummary"
        > & { id?: string },
      ) => {
        const revision: Revision = {
          ...input,
          id: input.id ?? randomUUID(),
          createdAt: now,
          publishedAt: null,
          cleanupPendingAt: null,
          cleanupErrorSummary: null,
          artifacts: [],
        };
        wiring.revisions.set(revision.id, revision);
        return revision;
      },
    ),
    cloneArtifacts: vi.fn(
      async (input: {
        sourceRevisionId: string;
        revisionId: string;
        revisionKind: Revision["resourceKind"];
      }) =>
        (wiring.revisions.get(input.sourceRevisionId)?.artifacts ?? []).map(
          (artifact) => ({
            ...artifact,
            id: randomUUID(),
            revisionId: input.revisionId,
            revisionKind: input.revisionKind,
          }),
        ),
    ),
    replaceArtifact: vi.fn(
      async (input: Omit<Artifact, "id" | "createdAt">) => {
        const revision = wiring.revisions.get(input.revisionId)!;
        const replaced =
          revision.artifacts.find((item) => item.slot === input.slot) ?? null;
        const artifact: Artifact = {
          ...input,
          id: randomUUID(),
          createdAt: now,
        };
        revision.artifacts = [
          ...revision.artifacts.filter((item) => item.slot !== input.slot),
          artifact,
        ];
        return { artifact, replaced };
      },
    ),
    removeArtifact: vi.fn(
      async ({
        revisionId,
        slot,
      }: {
        revisionId: string;
        slot: Artifact["slot"];
      }) => {
        const revision = wiring.revisions.get(revisionId)!;
        const artifact =
          revision.artifacts.find((item) => item.slot === slot) ?? null;
        revision.artifacts = revision.artifacts.filter(
          (item) => item.slot !== slot,
        );
        return artifact;
      },
    ),
    updateResourceCas: vi.fn(
      async (input: {
        id: string;
        expectedRowVersion: number;
        state: Resource["state"];
        publishedRevisionId: string | null;
        draftRevisionId: string | null;
      }) => {
        const resource = wiring.resources.get(input.id);
        if (
          !resource ||
          wiring.failUpdate ||
          resource.rowVersion !== input.expectedRowVersion
        )
          return null;
        Object.assign(resource, {
          state: input.state,
          publishedRevisionId: input.publishedRevisionId,
          draftRevisionId: input.draftRevisionId,
          publishedRevision: input.publishedRevisionId
            ? (wiring.revisions.get(input.publishedRevisionId) ?? null)
            : null,
          draftRevision: input.draftRevisionId
            ? (wiring.revisions.get(input.draftRevisionId) ?? null)
            : null,
          rowVersion: resource.rowVersion + 1,
          updatedAt: now,
        });
        return { ...resource };
      },
    ),
    markRevisionCleanupPending: vi.fn(async (id: string) => {
      const revision = wiring.revisions.get(id)!;
      revision.cleanupPendingAt = now;
      return revision;
    }),
    listCleanupPendingRevisions: vi.fn(async (resourceId: string) =>
      [...wiring.revisions.values()].filter(
        (item) =>
          item.resourceId === resourceId && item.cleanupPendingAt !== null,
      ),
    ),
    markRevisionPublished: vi.fn(async (id: string) => {
      const revision = wiring.revisions.get(id)!;
      revision.publishedAt = now;
      return revision;
    }),
    deleteArtifactsForRevision: vi.fn(async (id: string) => {
      const revision = wiring.revisions.get(id)!;
      const items = revision.artifacts;
      revision.artifacts = [];
      return items;
    }),
    deleteCleanupRevision: vi.fn(async (id: string) =>
      wiring.revisions.delete(id),
    ),
    setCleanupError: vi.fn(async (id: string) => {
      const revision = wiring.revisions.get(id)!;
      revision.cleanupErrorSummary = "filesystem cleanup failed";
      return revision;
    }),
    countArtifactReferences: vi.fn(
      async ({
        objectKey,
        excludeRevisionIds = [],
      }: {
        objectKey: string;
        excludeRevisionIds?: string[];
      }) => {
        const items = [...wiring.revisions.values()]
          .filter((revision) => !excludeRevisionIds.includes(revision.id))
          .flatMap((revision) => revision.artifacts);
        return {
          objectReferenceCount: items.filter(
            (item) => item.objectKey === objectKey,
          ).length,
          coverReferenceCount: items.filter(
            (item) => item.coverObjectKey === objectKey,
          ).length,
        };
      },
    ),
    appendAudit: vi.fn(async (audit: unknown) => {
      wiring.audits.push(audit);
      wiring.abortOnAudit?.abort();
    }),
  };
}
vi.mock("./repository", () => ({
  downloadResourceRepository: {
    transaction: async (
      work: (tx: ReturnType<typeof transaction>) => Promise<unknown>,
    ) => work(transaction()),
    withArtifactMutationLock: async (
      work: (tx: ReturnType<typeof transaction>) => Promise<unknown>,
      cleanup?: (result: never) => Promise<void>,
    ) => {
      const before = state();
      let result: unknown;
      try {
        result = await work(transaction());
      } catch (error) {
        restore(before);
        throw error;
      }
      await cleanup?.(result as never);
      if (wiring.failPostCommit) throw new Error("cleanup failed");
      if (wiring.failUnlock) throw new Error("unlock failed");
      return result;
    },
    listAdmin: vi.fn(async () => ({
      items: [...wiring.resources.values()],
      total: wiring.resources.size,
    })),
    getAdminById: vi.fn(async (id: string) => wiring.resources.get(id) ?? null),
    listPublic: vi.fn(async () =>
      [...wiring.resources.values()]
        .filter((item) => item.state === "published" && item.publishedRevision)
        .map((item) => ({
          key: item.key,
          updatedAt: item.updatedAt,
          ...item.publishedRevision!,
        })),
    ),
    getPublicByKey: vi.fn(async (key: string) => {
      const item = [...wiring.resources.values()].find(
        (candidate) => candidate.key === key && candidate.state === "published",
      );
      return item?.publishedRevision
        ? {
            key: item.key,
            updatedAt: item.updatedAt,
            ...item.publishedRevision,
          }
        : null;
    }),
  },
}));

import { downloadResourceService } from "./service";
function artifact(
  revisionId: string,
  slot: Artifact["slot"],
  key: string,
): Artifact {
  const document = slot === "document";
  wiring.files.set(key, document ? 10 : 20);
  if (document) wiring.files.set(`${key}.cover`, 3);
  return {
    id: randomUUID(),
    revisionId,
    revisionKind: document ? "document" : "software",
    slot,
    objectKey: key,
    originalFilename: document ? "file.pdf" : "file.zip",
    extension: document ? ".pdf" : ".zip",
    mediaType: document ? "application/pdf" : "application/zip",
    byteSize: document ? 10 : 20,
    sha256: sha,
    pageCount: document ? 1 : null,
    coverObjectKey: document ? `${key}.cover` : null,
    createdAt: now,
  };
}
function resource(
  kind: Resource["kind"],
  items: Artifact[] = [],
  status: Resource["state"] = "unpublished",
) {
  const revisionId = randomUUID();
  const revision: Revision = {
    id: revisionId,
    resourceId: randomUUID(),
    resourceKind: kind,
    name: "Resource",
    product: "Platform",
    category: "software",
    resourceType: "Package",
    description: "Download",
    sortOrder: 0,
    previewPolicy: kind === "document" ? "public" : null,
    downloadPolicy: "public",
    releaseVersion: kind === "software" ? "1.0.0" : null,
    createdAt: now,
    publishedAt: status === "published" ? now : null,
    cleanupPendingAt: null,
    cleanupErrorSummary: null,
    artifacts: items.map((item) => ({ ...item, revisionId })),
  };
  const value: Resource = {
    id: revision.resourceId,
    key: `resource-${wiring.resources.size}`,
    adminLabel: "Resource",
    kind,
    state: status,
    publishedRevisionId: status === "published" ? revisionId : null,
    draftRevisionId: status === "published" ? null : revisionId,
    rowVersion: 1,
    createdAt: now,
    updatedAt: now,
    publishedRevision: status === "published" ? revision : null,
    draftRevision: status === "published" ? null : revision,
  };
  wiring.resources.set(value.id, value);
  wiring.revisions.set(revisionId, revision);
  return value;
}
const upload = (id: string, expectedRowVersion = 1) => ({
  id,
  expectedRowVersion,
  slot: "windows" as const,
  stage: {},
  originalFilename: "new.zip",
  extension: ".zip" as const,
  mediaType: "application/zip",
  byteSize: 20,
  sha256: sha,
});
beforeEach(() => {
  wiring.files.clear();
  wiring.resources.clear();
  wiring.revisions.clear();
  wiring.audits.length = 0;
  wiring.failUpdate = false;
  wiring.failRemove.clear();
  wiring.failAllRemoves = false;
  wiring.failPostCommit = false;
  wiring.failUnlock = false;
  wiring.openSize = null;
  wiring.abortOnAudit = null;
});

describe("typed download artifact lifecycle", () => {
  it.each([
    { slots: ["windows"] as const },
    { slots: ["macos"] as const },
    { slots: ["windows", "macos"] as const },
  ])("publishes software with $slots platform artifacts", async ({ slots }) => {
    const value = resource("software");
    const draft = value.draftRevision!;
    draft.artifacts = slots.map((slot) =>
      artifact(draft.id, slot, `objects/${slot}`),
    );
    await expect(
      downloadResourceService.publishTyped({
        id: value.id,
        expectedRowVersion: 1,
      }),
    ).resolves.toMatchObject({ dto: { kind: "software", state: "published" } });
  });
  it("rejects zero-artifact software", async () => {
    const value = resource("software");
    await expect(
      downloadResourceService.publishTyped({
        id: value.id,
        expectedRowVersion: 1,
      }),
    ).rejects.toThrow("DOWNLOAD_RESOURCE_NOT_PUBLISHABLE");
  });
  it("clones then replaces a slot after commit", async () => {
    const value = resource("software");
    const draft = value.draftRevision!;
    draft.artifacts = [artifact(draft.id, "windows", "objects/old")];
    await downloadResourceService.attachUploadedArtifact(upload(value.id));
    expect(value.draftRevision!.artifacts).toEqual([
      expect.objectContaining({
        slot: "windows",
        objectKey: expect.stringContaining("/windows.zip"),
      }),
    ]);
    expect(wiring.files.has("objects/old")).toBe(false);
  });
  it("compensates new objects only for a rolled-back business mutation", async () => {
    const value = resource("software", [
      artifact("old", "windows", "objects/old"),
    ]);
    wiring.failUpdate = true;
    await expect(
      downloadResourceService.attachUploadedArtifact(upload(value.id)),
    ).rejects.toThrow("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT");
    expect(
      [...wiring.files].some(([key]) => key.includes("/windows.zip")),
    ).toBe(false);
  });
  it("preserves the business failure when pre-commit compensation also fails", async () => {
    const value = resource("software", [
      artifact("old", "windows", "objects/old"),
    ]);
    wiring.failUpdate = true;
    wiring.failAllRemoves = true;
    await expect(
      downloadResourceService.attachUploadedArtifact(upload(value.id)),
    ).rejects.toMatchObject({
      name: "AggregateError",
      errors: [
        expect.objectContaining({
          message: "DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT",
        }),
        expect.any(Error),
      ],
    });
  });
  it.each(["cleanup", "unlock"])(
    "retains committed object after post-commit %s failure",
    async (failure) => {
      const value = resource("software", [
        artifact("old", "windows", "objects/old"),
      ]);
      if (failure === "cleanup") wiring.failPostCommit = true;
      else wiring.failUnlock = true;
      await expect(
        downloadResourceService.attachUploadedArtifact(upload(value.id)),
      ).rejects.toThrow();
      expect(
        [...wiring.files].some(([key]) => key.includes("/windows.zip")),
      ).toBe(true);
    },
  );
  it("rejects public TOCTOU primary size mismatch and destroys the opened stream", async () => {
    const value = resource("document", [], "published");
    const published = value.publishedRevision!;
    published.artifacts = [
      artifact(published.id, "document", "objects/document"),
    ];
    wiring.openSize = 9;
    await expect(
      downloadResourceService.getPublicArtifact(value.key, "preview"),
    ).resolves.toBeNull();
    expect(wiring.readable.destroy).toHaveBeenCalledOnce();
  });
  it("returns only complete published discriminated public DTOs", async () => {
    const document = resource("document", [], "published");
    const publishedDocument = document.publishedRevision!;
    publishedDocument.artifacts = [
      artifact(publishedDocument.id, "document", "objects/public-document"),
    ];
    const emptySoftware = resource("software", [], "published");
    const software = resource("software", [], "published");
    const publishedSoftware = software.publishedRevision!;
    publishedSoftware.artifacts = [
      artifact(publishedSoftware.id, "macos", "objects/public-macos"),
    ];
    const result = await downloadResourceService.listTypedPublicResources();
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: document.key, kind: "document" }),
        expect.objectContaining({
          key: software.key,
          kind: "software",
          platforms: expect.objectContaining({ macos: expect.any(Object) }),
        }),
      ]),
    );
    expect(result).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: emptySoftware.key }),
      ]),
    );
  });
  it("writes precise create and cleanup audit metadata", async () => {
    await downloadResourceService.createTypedResource({
      key: "audit-resource",
      adminLabel: "Audit",
      kind: "software",
    });
    expect(wiring.audits).toContainEqual(
      expect.objectContaining({
        event: "download_resource.created",
        metadata: expect.objectContaining({ revisionId: null }),
      }),
    );
    const value = resource("software", [
      artifact("old", "windows", "objects/remove"),
    ]);
    const revisionId = value.draftRevisionId!;
    wiring.failRemove.add("objects/remove");
    await downloadResourceService.discardDraft({
      id: value.id,
      expectedRowVersion: 1,
    });
    expect(wiring.audits).toContainEqual(
      expect.objectContaining({
        event: "download_resource.cleanup_failed",
        metadata: expect.objectContaining({ revisionId }),
      }),
    );
  });
  it("rolls back abort after audit and rejects stale CAS", async () => {
    const value = resource("software", [
      artifact("old", "windows", "objects/old"),
    ]);
    const controller = new AbortController();
    wiring.abortOnAudit = controller;
    await expect(
      downloadResourceService.attachUploadedArtifact(
        upload(value.id),
        {},
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(wiring.resources.get(value.id)?.rowVersion).toBe(1);
    await expect(
      downloadResourceService.attachUploadedArtifact(upload(value.id, 2)),
    ).rejects.toThrow("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT");
  });
});

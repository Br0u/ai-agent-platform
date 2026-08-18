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
      }) => {
        const artifacts = (
            wiring.revisions.get(input.sourceRevisionId)?.artifacts ?? []
          ).map((artifact) => ({
            ...artifact,
            id: randomUUID(),
            revisionId: input.revisionId,
            revisionKind: input.revisionKind,
          })),
          revision = wiring.revisions.get(input.revisionId);
        if (revision) revision.artifacts = artifacts;
        return artifacts;
      },
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
        const next = {
          ...resource,
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
        };
        wiring.resources.set(input.id, next);
        return next;
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
function currentResource(id: string): Resource {
  const value = wiring.resources.get(id);
  if (!value) throw new Error("Missing fake resource");
  return value;
}
const draftInput = (
  id: string,
  expectedRowVersion: number,
  kind: "document" | "software",
) =>
  kind === "document"
    ? {
        id,
        expectedRowVersion,
        kind,
        name: "Resource",
        product: "Platform",
        category: "software" as const,
        resourceType: "Package",
        description: "Download",
        sortOrder: 0,
        previewPolicy: "public" as const,
        downloadPolicy: "public" as const,
      }
    : {
        id,
        expectedRowVersion,
        kind,
        name: "Resource",
        product: "Platform",
        category: "software" as const,
        resourceType: "Package",
        description: "Download",
        sortOrder: 0,
        releaseVersion: "2.0.0",
      };
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
  it("clones published artifact metadata into a draft without copying objects", async () => {
    const value = resource("software", [], "published");
    const published = value.publishedRevision!;
    published.artifacts = [
      artifact(published.id, "windows", "objects/published-installer"),
    ];
    const filesBefore = [...wiring.files];
    const result = await downloadResourceService.saveTypedDraft(
      draftInput(value.id, 1, "software"),
    );
    expect(result.resource.draftRevision?.artifacts).toEqual([
      expect.objectContaining({
        objectKey: "objects/published-installer",
        revisionId: result.resource.draftRevision?.id,
      }),
    ]);
    expect([...wiring.files]).toEqual(filesBefore);
    expect(result.resource.publishedRevision?.id).toBe(published.id);
  });
  it("preserves a published release, files, and public DTO when replacement fails", async () => {
    const value = resource("software", [], "published");
    const published = value.publishedRevision!;
    published.artifacts = [
      artifact(published.id, "windows", "objects/release"),
    ];
    const before = await downloadResourceService.listTypedPublicResources();
    await downloadResourceService.saveTypedDraft(
      draftInput(value.id, 1, "software"),
    );
    wiring.failUpdate = true;
    await expect(
      downloadResourceService.attachUploadedArtifact(upload(value.id, 2)),
    ).rejects.toThrow("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT");
    const current = wiring.resources.get(value.id)!;
    expect(current.publishedRevisionId).toBe(published.id);
    expect(wiring.files.get("objects/release")).toBe(20);
    await expect(
      downloadResourceService.listTypedPublicResources(),
    ).resolves.toEqual(before);
  });
  it("clones then replaces a slot after commit", async () => {
    const value = resource("software");
    const draft = value.draftRevision!;
    draft.artifacts = [artifact(draft.id, "windows", "objects/old")];
    await downloadResourceService.attachUploadedArtifact(upload(value.id));
    expect(wiring.resources.get(value.id)?.draftRevision?.artifacts).toEqual([
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
  it("deletes a shared pending document primary and cover only after the whole batch is detached", async () => {
    const value = resource("document", [
      artifact("old", "document", "objects/shared.pdf"),
    ]);
    const current = value.draftRevision!;
    const pending: Revision = {
      ...structuredClone(current),
      id: randomUUID(),
      cleanupPendingAt: now,
      artifacts: current.artifacts.map((item) => ({
        ...item,
        id: randomUUID(),
        revisionId: "pending",
      })),
    };
    for (const item of pending.artifacts) item.revisionId = pending.id;
    wiring.revisions.set(pending.id, pending);
    await downloadResourceService.discardDraft({
      id: value.id,
      expectedRowVersion: 1,
    });
    expect(wiring.files.has("objects/shared.pdf")).toBe(false);
    expect(wiring.files.has("objects/shared.pdf.cover")).toBe(false);
  });
  it.each([
    {
      kind: "document" as const,
      slot: "document" as const,
      key: "objects/cross.pdf",
    },
    {
      kind: "software" as const,
      slot: "windows" as const,
      key: "objects/cross.zip",
    },
  ])(
    "keeps cross-resource $kind object references",
    async ({ kind, slot, key }) => {
      const owner = resource(kind, [artifact("owner", slot, key)]);
      const other = resource(kind, [], "published");
      const otherRevision = other.publishedRevision!;
      otherRevision.artifacts = owner.draftRevision!.artifacts.map((item) => ({
        ...item,
        id: randomUUID(),
        revisionId: otherRevision.id,
      }));
      await downloadResourceService.discardDraft({
        id: owner.id,
        expectedRowVersion: 1,
      });
      expect(wiring.files.has(key)).toBe(true);
      if (kind === "document")
        expect(wiring.files.has(`${key}.cover`)).toBe(true);
    },
  );
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
  it.each([
    { name: "valid document", mutate: () => undefined, publishes: true },
    {
      name: "missing document artifact",
      mutate: (revision: Revision) => (revision.artifacts = []),
      publishes: false,
    },
    {
      name: "missing cover metadata",
      mutate: (revision: Revision) =>
        (revision.artifacts[0]!.coverObjectKey = null),
      publishes: false,
    },
    {
      name: "missing physical cover file",
      mutate: (revision: Revision) =>
        wiring.files.delete(revision.artifacts[0]!.coverObjectKey!),
      publishes: false,
    },
    {
      name: "missing page metadata",
      mutate: (revision: Revision) => (revision.artifacts[0]!.pageCount = null),
      publishes: false,
    },
    {
      name: "missing primary file",
      mutate: (revision: Revision) =>
        wiring.files.delete(revision.artifacts[0]!.objectKey),
      publishes: false,
    },
    {
      name: "mismatched primary size",
      mutate: (revision: Revision) =>
        wiring.files.set(revision.artifacts[0]!.objectKey, 9),
      publishes: false,
    },
    {
      name: "cover with unrelated byte size",
      mutate: (revision: Revision) =>
        wiring.files.set(revision.artifacts[0]!.coverObjectKey!, 999),
      publishes: true,
    },
  ])("document publish is $name", async ({ mutate, publishes }) => {
    const value = resource("document");
    const draft = value.draftRevision!;
    draft.artifacts = [artifact(draft.id, "document", "objects/document")];
    mutate(draft);
    const publication = downloadResourceService.publishTyped({
      id: value.id,
      expectedRowVersion: 1,
    });
    if (publishes)
      await expect(publication).resolves.toMatchObject({
        dto: { kind: "document", state: "published" },
      });
    else
      await expect(publication).rejects.toThrow(
        "DOWNLOAD_RESOURCE_NOT_PUBLISHABLE",
      );
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
    expect(result).toEqual([
      {
        key: document.key,
        kind: "document",
        name: "Resource",
        product: "Platform",
        category: "software",
        resourceType: "Package",
        description: "Download",
        sortOrder: 0,
        previewPolicy: "public",
        downloadPolicy: "public",
        coverUrl: `/api/v1/downloads/${document.key}/cover?revision=${publishedDocument.id}`,
        pageCount: 1,
        byteSize: 10,
        updatedAt: now.toISOString(),
      },
      {
        key: software.key,
        kind: "software",
        name: "Resource",
        product: "Platform",
        category: "software",
        resourceType: "Package",
        description: "Download",
        sortOrder: 0,
        releaseVersion: "1.0.0",
        platforms: {
          windows: null,
          macos: {
            filename: "file.zip",
            byteSize: 20,
            downloadUrl: `/api/v1/downloads/${software.key}/macos`,
          },
        },
        updatedAt: now.toISOString(),
      },
    ]);
    expect(
      result.find((item) => item.key === emptySoftware.key),
    ).toBeUndefined();
    wiring.files.delete("objects/public-macos");
    await expect(
      downloadResourceService.listTypedPublicResources(),
    ).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: software.key })]),
    );
  });
  it("rolls back a real immutable-kind service mutation", async () => {
    const value = resource("document");
    const revisionIds = [...wiring.revisions.keys()];
    await expect(
      downloadResourceService.saveTypedDraft(
        draftInput(value.id, 1, "software"),
      ),
    ).rejects.toThrow("DOWNLOAD_RESOURCE_KIND_IMMUTABLE");
    expect(wiring.resources.get(value.id)?.rowVersion).toBe(1);
    expect([...wiring.revisions.keys()]).toEqual(revisionIds);
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
    await downloadResourceService.discardDraft(
      { id: value.id, expectedRowVersion: 1 },
      { ipAddress: "203.0.113.8", userAgent: "cleanup-test" },
    );
    expect(wiring.audits).toContainEqual({
      event: "download_resource.cleanup_failed",
      actor: {
        realm: "workforce",
        userId: "11111111-1111-4111-8111-111111111111",
      },
      target: { type: "download_resource", id: value.id },
      ipAddress: "203.0.113.8",
      userAgent: "cleanup-test",
      metadata: {
        key: value.key,
        rowVersion: 2,
        revisionId,
        result: "failure",
        errorCategory: "filesystem",
      },
    });
  });
  it("emits complete post-CAS audit envelopes for lifecycle mutations", async () => {
    const context = { ipAddress: "203.0.113.7", userAgent: "audit-test" };
    await downloadResourceService.createTypedResource(
      { key: "audit-complete", adminLabel: "Audit", kind: "software" },
      context,
    );
    const document = resource("document", [
      artifact("draft", "document", "objects/audit.pdf"),
    ]);
    await downloadResourceService.saveTypedDraft(
      draftInput(document.id, 1, "document"),
      context,
    );
    const savedRevisionId = currentResource(document.id).draftRevisionId;
    if (!savedRevisionId) throw new Error("Missing saved revision");
    await downloadResourceService.attachUploadedArtifact(
      {
        id: document.id,
        expectedRowVersion: 2,
        slot: "document",
        stage: {},
        coverStage: {},
        originalFilename: "audit.pdf",
        extension: ".pdf",
        mediaType: "application/pdf",
        pageCount: 1,
        byteSize: 10,
        sha256: sha,
      },
      context,
    );
    const uploadedRevisionId = currentResource(document.id).draftRevisionId;
    if (!uploadedRevisionId) throw new Error("Missing uploaded revision");
    await downloadResourceService.publishTyped(
      { id: document.id, expectedRowVersion: 3 },
      context,
    );
    const publishedRevisionId = currentResource(
      document.id,
    ).publishedRevisionId;
    if (!publishedRevisionId) throw new Error("Missing published revision");
    await downloadResourceService.downline(
      { id: document.id, expectedRowVersion: 4 },
      context,
    );
    const software = resource("software", [
      artifact("draft", "windows", "objects/audit.zip"),
    ]);
    await downloadResourceService.removeDraftArtifact(
      { id: software.id, expectedRowVersion: 1, slot: "windows" },
      context,
    );
    const removedRevisionId = currentResource(software.id).draftRevisionId;
    if (!removedRevisionId) throw new Error("Missing removed revision");
    await downloadResourceService.discardDraft(
      { id: software.id, expectedRowVersion: 2 },
      context,
    );
    const events = wiring.audits as Array<{
      event: string;
      actor: unknown;
      target: unknown;
      ipAddress?: string;
      userAgent?: string;
      metadata: {
        key: string;
        rowVersion: number;
        revisionId: string | null;
        result: string;
      };
    }>;
    expect(events.map((entry) => entry.event)).toEqual([
      "download_resource.created",
      "download_resource.draft_saved",
      "download_resource.uploaded",
      "download_resource.published",
      "download_resource.downlined",
      "download_resource.file_removed",
      "download_resource.draft_discarded",
    ]);
    for (const entry of events) {
      expect(entry).toMatchObject({
        actor: {
          realm: "workforce",
          userId: "11111111-1111-4111-8111-111111111111",
        },
        target: { type: "download_resource" },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          key: expect.any(String),
          rowVersion: expect.any(Number),
          result: "success",
        },
      });
    }
    expect(events.map((entry) => entry.metadata)).toEqual([
      {
        key: "audit-complete",
        rowVersion: 1,
        revisionId: null,
        result: "success",
      },
      {
        key: document.key,
        rowVersion: 2,
        revisionId: savedRevisionId,
        result: "success",
      },
      {
        key: document.key,
        rowVersion: 3,
        revisionId: uploadedRevisionId,
        result: "success",
      },
      {
        key: document.key,
        rowVersion: 4,
        revisionId: publishedRevisionId,
        result: "success",
      },
      {
        key: document.key,
        rowVersion: 5,
        revisionId: publishedRevisionId,
        result: "success",
      },
      {
        key: software.key,
        rowVersion: 2,
        revisionId: removedRevisionId,
        result: "success",
      },
      {
        key: software.key,
        rowVersion: 3,
        revisionId: removedRevisionId,
        result: "success",
      },
    ]);
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

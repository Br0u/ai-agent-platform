import "server-only";

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

import type { AuditWriteInput } from "../auth/audit";
import { requirePermission, type WorkforceActor } from "../auth/access";
import {
  adminDownloadQuerySchema,
  createDownloadResourceInputSchema,
  deriveAdminStatus,
  downloadResourceAdminDtoSchema,
  downloadResourcePublicDtoSchema,
  mutateDownloadResourceInputSchema,
  saveDownloadDraftInputSchema,
  type DownloadResourceAdminDto,
  type DownloadResourcePublicDto,
} from "./contracts";
import {
  createDownloadFileStore,
  type DownloadArtifactKind,
  type DownloadStage,
} from "./file-store";
import { downloadResourceRepository } from "./repository";

type Revision = {
  id: string;
  resourceId: string;
  name: string;
  product: string;
  category: "materials" | "software" | "deployment" | "whitepapers";
  resourceType: string;
  description: string;
  sortOrder: number;
  previewPolicy: "public" | "contact";
  downloadPolicy: "public" | "contact";
  pdfObjectKey: string | null;
  coverObjectKey: string | null;
  pageCount: number | null;
  byteSize: number | null;
  sha256: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  cleanupPendingAt?: Date | null;
};

type Resource = {
  id: string;
  key: string;
  adminLabel: string;
  state: "unpublished" | "published" | "downline";
  publishedRevisionId: string | null;
  draftRevisionId: string | null;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
  publishedRevision: Revision | null;
  draftRevision: Revision | null;
};

type MutationInput = z.infer<typeof mutateDownloadResourceInputSchema>;
type DraftMetadata = Omit<
  z.infer<typeof saveDownloadDraftInputSchema>,
  "id" | "expectedRowVersion"
>;
type Transaction = Parameters<
  Parameters<typeof downloadResourceRepository.transaction>[0]
>[0];
type CleanupPlan = {
  revision: Revision;
  removePdf: boolean;
  removeCover: boolean;
};

const attachUploadedPdfInputSchema = mutateDownloadResourceInputSchema
  .safeExtend({
    pdfStage: z.unknown(),
    coverStage: z.unknown(),
    pageCount: z.number().int().positive(),
    byteSize: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

function inputError(field: string): never {
  throw new Error(`DOWNLOAD_RESOURCE_INPUT_INVALID:${field}`);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    inputError(result.error.issues[0]?.path.join(".") || "input");
  return result.data;
}

export const downloadResourceFileStore = createDownloadFileStore(
  process.env.DOWNLOAD_RESOURCE_ROOT ??
    path.join(tmpdir(), "ai-agent-platform-downloads"),
);

function completeArtifact(revision: Revision): revision is Revision & {
  pdfObjectKey: string;
  coverObjectKey: string;
  pageCount: number;
  byteSize: number;
  sha256: string;
} {
  return (
    revision.pdfObjectKey !== null &&
    revision.coverObjectKey !== null &&
    revision.pageCount !== null &&
    revision.byteSize !== null &&
    revision.sha256 !== null
  );
}

function revisionInput(
  resourceId: string,
  source: Revision | null,
  metadata: DraftMetadata,
  actor: WorkforceActor,
  artifacts: Partial<
    Pick<
      Revision,
      "pdfObjectKey" | "coverObjectKey" | "pageCount" | "byteSize" | "sha256"
    >
  > = {},
) {
  return {
    resourceId,
    name: metadata.name,
    product: metadata.product,
    category: metadata.category,
    resourceType: metadata.resourceType,
    description: metadata.description,
    sortOrder: metadata.sortOrder,
    previewPolicy: metadata.previewPolicy,
    downloadPolicy: metadata.downloadPolicy,
    pdfObjectKey: artifacts.pdfObjectKey ?? source?.pdfObjectKey ?? null,
    coverObjectKey: artifacts.coverObjectKey ?? source?.coverObjectKey ?? null,
    pageCount: artifacts.pageCount ?? source?.pageCount ?? null,
    byteSize: artifacts.byteSize ?? source?.byteSize ?? null,
    sha256: artifacts.sha256 ?? source?.sha256 ?? null,
    createdBy: actor.userId,
  };
}

function audit(
  event: Extract<
    AuditWriteInput,
    { event: `download_resource.${string}` }
  >["event"],
  actor: WorkforceActor,
  resource: Resource,
  revisionId: string | null,
): AuditWriteInput {
  const base = {
    event,
    actor: { realm: "workforce" as const, userId: actor.userId },
    target: { type: "download_resource" as const, id: resource.id },
    metadata: {
      key: resource.key,
      rowVersion: resource.rowVersion,
      result: "success" as const,
    },
  };
  if (event === "download_resource.created") {
    return { ...base, event, metadata: { ...base.metadata, revisionId } };
  }
  if (revisionId === null)
    throw new Error("Download revision audit invariant violated");
  return {
    ...base,
    event,
    metadata: { ...base.metadata, revisionId },
  } as AuditWriteInput;
}

function cleanupAudit(
  actor: WorkforceActor,
  resource: Resource,
  revision: Revision,
): AuditWriteInput {
  return {
    event: "download_resource.cleanup_failed",
    actor: { realm: "workforce", userId: actor.userId },
    target: { type: "download_resource", id: resource.id },
    metadata: {
      key: resource.key,
      rowVersion: resource.rowVersion,
      revisionId: revision.id,
      result: "failure",
      errorCategory: "filesystem",
    },
  };
}

function assertCurrent(
  resource: Resource | null,
  input: MutationInput,
): asserts resource is Resource {
  if (!resource) throw new Error("DOWNLOAD_RESOURCE_NOT_FOUND");
  if (resource.rowVersion !== input.expectedRowVersion) {
    throw new Error("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT");
  }
}

async function update(
  tx: Transaction,
  resource: Resource,
  input: MutationInput,
  state: Resource["state"],
  publishedRevision: Revision | null,
  draftRevision: Revision | null,
) {
  const updated = (await tx.updateResourceCas({
    id: resource.id,
    expectedRowVersion: input.expectedRowVersion,
    state,
    publishedRevisionId: publishedRevision?.id ?? null,
    draftRevisionId: draftRevision?.id ?? null,
  })) as Omit<Resource, "publishedRevision" | "draftRevision"> | null;
  if (!updated) throw new Error("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT");
  return { ...resource, ...updated, publishedRevision, draftRevision };
}

async function cleanupPlansForMutation(
  tx: Transaction,
  resourceId: string,
  detached: Revision | null,
) {
  const pending = (await tx.listCleanupPendingRevisions(
    resourceId,
  )) as Revision[];
  if (detached && !completeArtifact(detached)) {
    await tx.deleteDetachedRevision(detached.id);
    detached = null;
  }
  const candidates = detached ? [...pending, detached] : pending;
  const plans: CleanupPlan[] = [];
  for (const revision of candidates) {
    const refs = await tx.countArtifactReferences({
      pdfObjectKey: revision.pdfObjectKey!,
      coverObjectKey: revision.coverObjectKey!,
      excludeRevisionId: revision.id,
    });
    const otherCandidates = candidates.filter(
      (candidate) => candidate.id !== revision.id,
    );
    const pdfReferenceCount =
      refs.pdfReferenceCount -
      otherCandidates.filter(
        (candidate) => candidate.pdfObjectKey === revision.pdfObjectKey,
      ).length;
    const coverReferenceCount =
      refs.coverReferenceCount -
      otherCandidates.filter(
        (candidate) => candidate.coverObjectKey === revision.coverObjectKey,
      ).length;
    if (revision.id === detached?.id) {
      if (pdfReferenceCount > 0 && coverReferenceCount > 0) {
        await tx.deleteDetachedRevision(revision.id);
        continue;
      }
      await tx.markRevisionCleanupPending(revision.id);
    }
    plans.push({
      revision,
      removePdf: pdfReferenceCount === 0,
      removeCover: coverReferenceCount === 0,
    });
  }
  return plans;
}

async function cleanupPlans(
  plans: readonly CleanupPlan[],
  actor: WorkforceActor,
  resource: Resource,
) {
  const store = downloadResourceFileStore;
  for (const plan of plans) {
    try {
      if (plan.removePdf) await store.remove(plan.revision.pdfObjectKey!);
      if (plan.removeCover) await store.remove(plan.revision.coverObjectKey!);
      await downloadResourceRepository.transaction((tx) =>
        tx.deleteCleanupRevision(plan.revision.id),
      );
    } catch {
      const summary = "filesystem cleanup failed";
      await downloadResourceRepository.transaction(async (tx) => {
        await tx.setCleanupError(plan.revision.id, summary);
        await tx.appendAudit(cleanupAudit(actor, resource, plan.revision));
      });
    }
  }
}

async function stats(revision: Revision | null) {
  if (!revision || !completeArtifact(revision)) {
    return { pdfExists: false, coverExists: false, actualByteSize: 0 };
  }
  const store = downloadResourceFileStore;
  const [pdf, cover] = await Promise.all([
    store.stat(revision.pdfObjectKey).catch(() => null),
    store.stat(revision.coverObjectKey).catch(() => null),
  ]);
  return {
    pdfExists: pdf !== null,
    coverExists: cover !== null,
    actualByteSize: pdf?.size ?? 0,
  };
}

async function adminDto(resource: Resource): Promise<DownloadResourceAdminDto> {
  const publishedStats = await stats(resource.publishedRevision);
  return parse(downloadResourceAdminDtoSchema, {
    id: resource.id,
    key: resource.key,
    adminLabel: resource.adminLabel,
    state: resource.state,
    rowVersion: resource.rowVersion,
    adminStatus: deriveAdminStatus({
      state: resource.state,
      publishedRevision: resource.publishedRevision
        ? {
            ...publishedStats,
            expectedByteSize: resource.publishedRevision.byteSize ?? 0,
          }
        : null,
      draftRevision: resource.draftRevision
        ? { hasCompleteArtifact: completeArtifact(resource.draftRevision) }
        : null,
    }),
    publishedRevision: dtoRevision(resource.publishedRevision),
    draftRevision: dtoRevision(resource.draftRevision),
    createdAt: resource.createdAt.toISOString(),
    updatedAt: resource.updatedAt.toISOString(),
  });
}

function dtoRevision(revision: Revision | null) {
  if (!revision) return null;
  return {
    id: revision.id,
    name: revision.name,
    product: revision.product,
    category: revision.category,
    resourceType: revision.resourceType,
    description: revision.description,
    sortOrder: revision.sortOrder,
    previewPolicy: revision.previewPolicy,
    downloadPolicy: revision.downloadPolicy,
    pdfObjectKey: revision.pdfObjectKey,
    coverObjectKey: revision.coverObjectKey,
    pageCount: revision.pageCount,
    byteSize: revision.byteSize,
    sha256: revision.sha256,
    createdAt: revision.createdAt.toISOString(),
    publishedAt: revision.publishedAt?.toISOString() ?? null,
  };
}

async function verifiedPublic(
  resource: { key: string; updatedAt: Date } & Revision,
) {
  if (!completeArtifact(resource)) return null;
  const artifactStats = await stats(resource);
  if (
    !artifactStats.pdfExists ||
    !artifactStats.coverExists ||
    artifactStats.actualByteSize !== resource.byteSize
  )
    return null;
  return parse(downloadResourcePublicDtoSchema, {
    key: resource.key,
    name: resource.name,
    product: resource.product,
    category: resource.category,
    resourceType: resource.resourceType,
    description: resource.description,
    sortOrder: resource.sortOrder,
    previewPolicy: resource.previewPolicy,
    downloadPolicy: resource.downloadPolicy,
    coverUrl: `/api/downloads/${resource.key}/cover`,
    pageCount: resource.pageCount,
    byteSize: resource.byteSize,
    updatedAt: resource.updatedAt.toISOString(),
  });
}

async function authenticated() {
  return requirePermission("admin:downloads");
}

export const downloadResourceService = {
  async listAdminResources(rawQuery: unknown) {
    await authenticated();
    const query = parse(adminDownloadQuerySchema, rawQuery);
    const result = await downloadResourceRepository.listAdmin(query);
    return {
      total: result.total,
      items: await Promise.all((result.items as Resource[]).map(adminDto)),
    };
  },

  async getAdminResource(id: unknown) {
    await authenticated();
    const parsedId = parse(mutateDownloadResourceInputSchema.shape.id, id);
    const resource = (await downloadResourceRepository.getAdminById(
      parsedId,
    )) as Resource | null;
    return resource ? adminDto(resource) : null;
  },

  async listPublicResources(): Promise<DownloadResourcePublicDto[]> {
    const resources = (await downloadResourceRepository.listPublic()) as ({
      key: string;
      updatedAt: Date;
    } & Revision)[];
    return (await Promise.all(resources.map(verifiedPublic))).filter(
      (resource): resource is DownloadResourcePublicDto => resource !== null,
    );
  },

  async getPublicArtifact(
    key: unknown,
    kind: "cover" | "preview" | "download",
    range?: unknown,
  ) {
    if (typeof key !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(key))
      return null;
    const resource = (await downloadResourceRepository.getPublicByKey(key)) as
      | ({ key: string; updatedAt: Date } & Revision)
      | null;
    if (!resource || !completeArtifact(resource)) return null;
    const artifactStats = await stats(resource);
    if (
      !artifactStats.pdfExists ||
      !artifactStats.coverExists ||
      artifactStats.actualByteSize !== resource.byteSize
    )
      return null;
    if (kind === "preview" && resource.previewPolicy !== "public") return null;
    if (kind === "download" && resource.downloadPolicy !== "public")
      return null;
    const objectKey =
      kind === "cover" ? resource.coverObjectKey : resource.pdfObjectKey;
    const opened = await downloadResourceFileStore.open(
      objectKey,
      range as { start: number; end: number } | undefined,
    );
    if (kind !== "cover" && opened.size !== resource.byteSize) {
      opened.readable.destroy();
      return null;
    }
    return opened;
  },

  async getAdminDraftArtifact(
    id: unknown,
    kind: DownloadArtifactKind,
    range?: unknown,
  ) {
    await authenticated();
    const parsedId = parse(mutateDownloadResourceInputSchema.shape.id, id);
    if (kind !== "pdf" && kind !== "cover") inputError("kind");
    const resource = (await downloadResourceRepository.getAdminById(
      parsedId,
    )) as Resource | null;
    const revision = resource?.draftRevision;
    if (!revision || !completeArtifact(revision)) return null;
    const objectKey =
      kind === "cover" ? revision.coverObjectKey : revision.pdfObjectKey;
    return downloadResourceFileStore.open(
      objectKey,
      range as { start: number; end: number } | undefined,
    );
  },

  async createResource(rawInput: unknown) {
    const actor = await authenticated();
    const input = parse(createDownloadResourceInputSchema, rawInput);
    return downloadResourceRepository.transaction(async (tx) => {
      await tx.assertActiveWorkforcePermission(actor.userId, "admin:downloads");
      const created = (await tx.insertResource(input)) as Omit<
        Resource,
        "publishedRevision" | "draftRevision"
      >;
      const snapshot = {
        ...created,
        publishedRevision: null,
        draftRevision: null,
      };
      await tx.appendAudit(
        audit("download_resource.created", actor, snapshot, null),
      );
      return adminDto(snapshot);
    });
  },

  async saveDraft(rawInput: unknown) {
    const actor = await authenticated();
    const input = parse(saveDownloadDraftInputSchema, rawInput);
    return downloadResourceRepository
      .withArtifactMutationLock(
        async (tx) => {
          await tx.assertActiveWorkforcePermission(
            actor.userId,
            "admin:downloads",
          );
          const current = (await tx.lockResource(input.id)) as Resource | null;
          assertCurrent(current, input);
          const source = current.draftRevision ?? current.publishedRevision;
          const previousDraft = current.draftRevision;
          const draft = (await tx.insertRevision(
            revisionInput(current.id, source, input, actor),
          )) as Revision;
          const updated = await update(
            tx,
            current,
            input,
            current.state,
            current.publishedRevision,
            draft,
          );
          const cleanup = await cleanupPlansForMutation(
            tx,
            current.id,
            previousDraft,
          );
          await tx.appendAudit(
            audit("download_resource.draft_saved", actor, updated, draft.id),
          );
          return {
            dto: await adminDto(updated),
            resource: updated,
            cleanup,
          };
        },
        async ({ resource, cleanup }) => cleanupPlans(cleanup, actor, resource),
      )
      .then(({ dto }) => dto);
  },

  async attachUploadedPdf(rawInput: unknown) {
    const actor = await authenticated();
    const input = parse(attachUploadedPdfInputSchema, rawInput);
    const store = downloadResourceFileStore;
    const revisionId = randomUUID();
    const committed: string[] = [];
    let businessCommitted = false;
    try {
      return await downloadResourceRepository
        .withArtifactMutationLock(
          async (tx) => {
            await tx.assertActiveWorkforcePermission(
              actor.userId,
              "admin:downloads",
            );
            const current = (await tx.lockResource(
              input.id,
            )) as Resource | null;
            assertCurrent(current, input);
            if (!current.draftRevision)
              throw new Error("DOWNLOAD_RESOURCE_UPLOAD_REQUIRES_DRAFT");
            const previousDraft = current.draftRevision;
            const pdfObjectKey = await store.commit(
              input.pdfStage as DownloadStage,
              { resourceId: current.id, revisionId, kind: "pdf" },
            );
            committed.push(pdfObjectKey);
            const coverObjectKey = await store.commit(
              input.coverStage as DownloadStage,
              { resourceId: current.id, revisionId, kind: "cover" },
            );
            committed.push(coverObjectKey);
            const draft = (await tx.insertRevision({
              ...revisionInput(
                current.id,
                current.draftRevision,
                current.draftRevision,
                actor,
                {
                  pdfObjectKey,
                  coverObjectKey,
                  pageCount: input.pageCount,
                  byteSize: input.byteSize,
                  sha256: input.sha256,
                },
              ),
              id: revisionId,
            })) as Revision;
            const updated = await update(
              tx,
              current,
              input,
              current.state,
              current.publishedRevision,
              draft,
            );
            const cleanup = await cleanupPlansForMutation(
              tx,
              current.id,
              previousDraft,
            );
            await tx.appendAudit(
              audit("download_resource.uploaded", actor, updated, draft.id),
            );
            return {
              dto: await adminDto(updated),
              resource: updated,
              cleanup,
            };
          },
          async ({ resource, cleanup }) => {
            businessCommitted = true;
            await cleanupPlans(cleanup, actor, resource);
          },
        )
        .then(({ dto }) => dto);
    } catch (error) {
      if (businessCommitted) throw error;
      const cleanupErrors: unknown[] = [];
      for (const key of committed) {
        await store.remove(key).catch((cleanupError: unknown) => {
          cleanupErrors.push(cleanupError);
        });
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "Upload artifact compensation failed",
        );
      }
      throw error;
    }
  },

  async publish(rawInput: unknown) {
    const actor = await authenticated();
    const input = parse(mutateDownloadResourceInputSchema, rawInput);
    return downloadResourceRepository
      .withArtifactMutationLock(
        async (tx) => {
          await tx.assertActiveWorkforcePermission(
            actor.userId,
            "admin:downloads",
          );
          const current = (await tx.lockResource(input.id)) as Resource | null;
          assertCurrent(current, input);
          const draft = current.draftRevision;
          const previousPublished = current.publishedRevision;
          if (!draft || !completeArtifact(draft))
            throw new Error("DOWNLOAD_RESOURCE_NOT_PUBLISHABLE");
          const actual = await stats(draft);
          if (
            !actual.pdfExists ||
            !actual.coverExists ||
            actual.actualByteSize !== draft.byteSize
          )
            throw new Error("DOWNLOAD_RESOURCE_NOT_PUBLISHABLE");
          const updated = await update(
            tx,
            current,
            input,
            "published",
            draft,
            null,
          );
          const publishedRevision = (await tx.markRevisionPublished(
            draft.id,
          )) as Revision | null;
          if (!publishedRevision)
            throw new Error("DOWNLOAD_RESOURCE_NOT_PUBLISHABLE");
          const published = { ...updated, publishedRevision };
          const cleanup = await cleanupPlansForMutation(
            tx,
            current.id,
            previousPublished,
          );
          await tx.appendAudit(
            audit("download_resource.published", actor, published, draft.id),
          );
          return {
            dto: await adminDto(published),
            resource: published,
            cleanup,
          };
        },
        async ({ resource, cleanup }) => cleanupPlans(cleanup, actor, resource),
      )
      .then(({ dto }) => dto);
  },

  async downline(rawInput: unknown) {
    const actor = await authenticated();
    const input = parse(mutateDownloadResourceInputSchema, rawInput);
    return downloadResourceRepository
      .withArtifactMutationLock(
        async (tx) => {
          await tx.assertActiveWorkforcePermission(
            actor.userId,
            "admin:downloads",
          );
          const current = (await tx.lockResource(input.id)) as Resource | null;
          assertCurrent(current, input);
          if (
            current.state !== "published" ||
            !current.publishedRevision ||
            current.draftRevision
          )
            throw new Error("DOWNLOAD_RESOURCE_NOT_DOWNLINEABLE");
          const publishedRevision = current.publishedRevision;
          const updated = await update(
            tx,
            current,
            input,
            "downline",
            null,
            publishedRevision,
          );
          await tx.appendAudit(
            audit(
              "download_resource.downlined",
              actor,
              updated,
              publishedRevision.id,
            ),
          );
          return {
            dto: await adminDto(updated),
            resource: updated,
            cleanup: await cleanupPlansForMutation(tx, current.id, null),
          };
        },
        async ({ resource, cleanup }) => cleanupPlans(cleanup, actor, resource),
      )
      .then(({ dto }) => dto);
  },

  async discardDraft(rawInput: unknown) {
    const actor = await authenticated();
    const input = parse(mutateDownloadResourceInputSchema, rawInput);
    return downloadResourceRepository
      .withArtifactMutationLock(
        async (tx) => {
          await tx.assertActiveWorkforcePermission(
            actor.userId,
            "admin:downloads",
          );
          const current = (await tx.lockResource(input.id)) as Resource | null;
          assertCurrent(current, input);
          if (!current.draftRevision)
            throw new Error("DOWNLOAD_RESOURCE_NO_DRAFT");
          const previousDraft = current.draftRevision;
          const state =
            current.state === "downline" ? "unpublished" : current.state;
          const updated = await update(
            tx,
            current,
            input,
            state,
            current.publishedRevision,
            null,
          );
          const cleanup = await cleanupPlansForMutation(
            tx,
            current.id,
            previousDraft,
          );
          await tx.appendAudit(
            audit(
              "download_resource.draft_discarded",
              actor,
              updated,
              previousDraft.id,
            ),
          );
          return {
            dto: await adminDto(updated),
            resource: updated,
            cleanup,
          };
        },
        async ({ resource, cleanup }) => cleanupPlans(cleanup, actor, resource),
      )
      .then(({ dto }) => dto);
  },

  async removeDraftFile(rawInput: unknown) {
    const actor = await authenticated();
    const input = parse(mutateDownloadResourceInputSchema, rawInput);
    return downloadResourceRepository
      .withArtifactMutationLock(
        async (tx) => {
          await tx.assertActiveWorkforcePermission(
            actor.userId,
            "admin:downloads",
          );
          const current = (await tx.lockResource(input.id)) as Resource | null;
          assertCurrent(current, input);
          if (
            current.state === "published" ||
            !current.draftRevision ||
            !completeArtifact(current.draftRevision)
          )
            throw new Error("DOWNLOAD_RESOURCE_FILE_NOT_REMOVABLE");
          const previousDraft = current.draftRevision;
          const draft = (await tx.insertRevision(
            revisionInput(current.id, null, previousDraft, actor),
          )) as Revision;
          const updated = await update(
            tx,
            current,
            input,
            current.state,
            current.publishedRevision,
            draft,
          );
          const cleanup = await cleanupPlansForMutation(
            tx,
            current.id,
            previousDraft,
          );
          await tx.appendAudit(
            audit("download_resource.file_removed", actor, updated, draft.id),
          );
          return {
            dto: await adminDto(updated),
            resource: updated,
            cleanup,
          };
        },
        async ({ resource, cleanup }) => cleanupPlans(cleanup, actor, resource),
      )
      .then(({ dto }) => dto);
  },
};

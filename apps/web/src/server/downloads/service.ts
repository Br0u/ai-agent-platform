import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  AuditWriteInput,
  DownloadResourceAuditMetadata,
  DownloadResourceCleanupFailedAuditMetadata,
  DownloadResourceCreatedAuditMetadata,
} from "../auth/audit";
import { requirePermission, type WorkforceActor } from "../auth/access";
import {
  adminDownloadQuerySchema,
  artifactSlotSchema,
  deriveAdminStatus,
  downloadResourcePublicDtoSchema,
  mutateDownloadResourceInputSchema,
  typedCreateDownloadResourceInputSchema,
  typedDownloadResourceAdminDtoSchema,
  typedSaveDownloadDraftInputSchema,
  type DownloadResourcePublicDto,
  type TypedDownloadResourceAdminDto,
} from "./contracts";
import { createDownloadFileStore, type DownloadStage } from "./file-store";
import {
  downloadResourceRepository,
  type DownloadResourceAggregate as Resource,
  type DownloadResourceArtifact as Artifact,
  type DownloadResourceRevision as Revision,
  type DownloadResourceTransaction as Transaction,
} from "./repository";
type MutationInput = z.infer<typeof mutateDownloadResourceInputSchema>;
type Context = { ipAddress?: string; userAgent?: string };

const uploadArtifactInputSchema = mutateDownloadResourceInputSchema
  .safeExtend({
    slot: artifactSlotSchema,
    stage: z.custom<DownloadStage>(),
    originalFilename: z.string().trim().min(1).max(255),
    extension: z.enum([".pdf", ".exe", ".msi", ".zip", ".dmg", ".pkg"]),
    mediaType: z.string().trim().min(1).max(128),
    byteSize: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    pageCount: z.number().int().positive().optional(),
    coverStage: z.custom<DownloadStage>().optional(),
  })
  .strict();
const byteRangeSchema = z
  .object({ start: z.number().int().min(0), end: z.number().int().min(0) })
  .strict()
  .refine(({ start, end }) => start <= end)
  .optional();

export const downloadResourceFileStore = createDownloadFileStore(
  process.env.DOWNLOAD_RESOURCE_ROOT,
);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(
      `DOWNLOAD_RESOURCE_INPUT_INVALID:${result.error.issues[0]?.path.join(".") || "input"}`,
    );
  return result.data;
}
function file(revision: Revision, slot: Artifact["slot"]) {
  return (
    revision.artifacts.find((candidate) => candidate.slot === slot) ?? null
  );
}
function completeDocument(revision: Revision) {
  const document = file(revision, "document");
  return (
    revision.resourceKind === "document" &&
    document?.extension === ".pdf" &&
    document.mediaType === "application/pdf" &&
    document.pageCount !== null &&
    document.coverObjectKey !== null
  );
}
function completeSoftwareMetadata(revision: Revision) {
  return (
    revision.resourceKind === "software" &&
    revision.releaseVersion !== null &&
    revision.releaseVersion.trim().length > 0
  );
}
function hasInstaller(revision: Revision) {
  return revision.artifacts.some(
    (candidate) => candidate.slot === "windows" || candidate.slot === "macos",
  );
}
async function filesIntact(revision: Revision) {
  try {
    await Promise.all(
      revision.artifacts.flatMap((candidate) => [
        downloadResourceFileStore.inspect(
          candidate.objectKey,
          candidate.byteSize,
        ),
        ...(candidate.slot === "document" && candidate.coverObjectKey
          ? [downloadResourceFileStore.inspect(candidate.coverObjectKey)]
          : []),
      ]),
    );
    return true;
  } catch {
    return false;
  }
}
async function publishable(revision: Revision) {
  return revision.resourceKind === "document"
    ? completeDocument(revision) && (await filesIntact(revision))
    : completeSoftwareMetadata(revision) &&
        hasInstaller(revision) &&
        (await filesIntact(revision));
}
function assertCurrent(
  resource: Resource | null,
  input: MutationInput,
): asserts resource is Resource {
  if (!resource) throw new Error("DOWNLOAD_RESOURCE_NOT_FOUND");
  if (resource.rowVersion !== input.expectedRowVersion)
    throw new Error("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT");
}
function throwIfAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return;
  const error = new Error("Download upload aborted");
  error.name = "AbortError";
  throw error;
}

function revisionDto(revision: Revision) {
  const base = {
    id: revision.id,
    name: revision.name,
    product: revision.product,
    category: revision.category,
    resourceType: revision.resourceType,
    description: revision.description,
    sortOrder: revision.sortOrder,
    createdAt: revision.createdAt.toISOString(),
    publishedAt: revision.publishedAt?.toISOString() ?? null,
    artifacts: revision.artifacts.map((candidate) => ({
      slot: candidate.slot,
      objectKey: candidate.objectKey,
      originalFilename: candidate.originalFilename,
      extension: candidate.extension,
      mediaType: candidate.mediaType,
      byteSize: candidate.byteSize,
      sha256: candidate.sha256,
      ...(candidate.slot === "document"
        ? {
            pageCount: candidate.pageCount,
            coverObjectKey: candidate.coverObjectKey,
          }
        : {}),
    })),
  };
  return revision.resourceKind === "document"
    ? {
        ...base,
        kind: "document" as const,
        previewPolicy: revision.previewPolicy,
        downloadPolicy: revision.downloadPolicy,
      }
    : {
        ...base,
        kind: "software" as const,
        releaseVersion: revision.releaseVersion,
      };
}
async function typedAdminDto(
  resource: Resource,
): Promise<TypedDownloadResourceAdminDto> {
  const publishedIntact = resource.publishedRevision
    ? await filesIntact(resource.publishedRevision)
    : false;
  return parse(typedDownloadResourceAdminDtoSchema, {
    id: resource.id,
    key: resource.key,
    adminLabel: resource.adminLabel,
    kind: resource.kind,
    state: resource.state,
    rowVersion: resource.rowVersion,
    adminStatus: deriveAdminStatus({
      state: resource.state,
      publishedRevision: resource.publishedRevision
        ? {
            pdfExists: publishedIntact,
            coverExists: publishedIntact,
            expectedByteSize: 1,
            actualByteSize: publishedIntact ? 1 : 0,
          }
        : null,
      draftRevision: resource.draftRevision
        ? { hasCompleteArtifact: await publishable(resource.draftRevision) }
        : null,
    }),
    publishedRevision: resource.publishedRevision
      ? revisionDto(resource.publishedRevision)
      : null,
    draftRevision: resource.draftRevision
      ? revisionDto(resource.draftRevision)
      : null,
    createdAt: resource.createdAt.toISOString(),
    updatedAt: resource.updatedAt.toISOString(),
  });
}
function revisionInput(
  resource: Resource,
  input: z.infer<typeof typedSaveDownloadDraftInputSchema>,
  actor: WorkforceActor,
) {
  return {
    resourceId: resource.id,
    resourceKind: resource.kind,
    name: input.name,
    product: input.product,
    category: input.category,
    resourceType: input.resourceType,
    description: input.description,
    sortOrder: input.sortOrder,
    previewPolicy: input.kind === "document" ? input.previewPolicy : null,
    downloadPolicy:
      input.kind === "document" ? input.downloadPolicy : ("public" as const),
    releaseVersion: input.kind === "software" ? input.releaseVersion : null,
    createdBy: actor.userId,
  };
}
async function update(
  tx: Transaction,
  resource: Resource,
  input: MutationInput,
  state: Resource["state"],
  publishedRevision: Revision | null,
  draftRevision: Revision | null,
) {
  const updated = await tx.updateResourceCas({
    id: resource.id,
    expectedRowVersion: input.expectedRowVersion,
    state,
    publishedRevisionId: publishedRevision?.id ?? null,
    draftRevisionId: draftRevision?.id ?? null,
  });
  if (!updated) throw new Error("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT");
  return {
    ...resource,
    ...updated,
    publishedRevision,
    draftRevision,
  };
}
function auditEnvelope(
  actor: WorkforceActor,
  resource: Resource,
  context: Context,
): Pick<AuditWriteInput, "actor" | "target" | "ipAddress" | "userAgent"> {
  return {
    actor: { realm: "workforce", userId: actor.userId },
    target: { type: "download_resource", id: resource.id },
    ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {}),
  };
}
function createdAudit(
  actor: WorkforceActor,
  resource: Resource,
  context: Context,
): Extract<AuditWriteInput, { event: "download_resource.created" }> {
  const metadata: DownloadResourceCreatedAuditMetadata = {
    key: resource.key,
    rowVersion: resource.rowVersion,
    revisionId: null,
    result: "success",
  };
  return {
    event: "download_resource.created",
    ...auditEnvelope(actor, resource, context),
    metadata,
  };
}
type RevisionAuditEvent =
  | "download_resource.draft_saved"
  | "download_resource.uploaded"
  | "download_resource.published"
  | "download_resource.downlined"
  | "download_resource.draft_discarded"
  | "download_resource.file_removed";
function revisionAudit(
  event: RevisionAuditEvent,
  actor: WorkforceActor,
  resource: Resource,
  revisionId: string,
  context: Context,
): Extract<AuditWriteInput, { event: RevisionAuditEvent }> {
  const metadata: DownloadResourceAuditMetadata = {
    key: resource.key,
    rowVersion: resource.rowVersion,
    revisionId,
    result: "success",
  };
  return { event, ...auditEnvelope(actor, resource, context), metadata };
}
function cleanupFailureAudit(
  actor: WorkforceActor,
  resource: Resource,
  revision: Revision,
  context: Context,
): Extract<AuditWriteInput, { event: "download_resource.cleanup_failed" }> {
  const metadata: DownloadResourceCleanupFailedAuditMetadata = {
    key: resource.key,
    rowVersion: resource.rowVersion,
    revisionId: revision.id,
    result: "failure",
    errorCategory: "filesystem",
  };
  return {
    event: "download_resource.cleanup_failed",
    ...auditEnvelope(actor, resource, context),
    metadata,
  };
}
async function cleanup(
  tx: Transaction,
  resourceId: string,
  detached: Revision | null,
) {
  if (detached) await tx.markRevisionCleanupPending(detached.id);
  return tx.listCleanupPendingRevisions(resourceId);
}
async function cleanupObjects(
  revisions: Revision[],
  actor: WorkforceActor,
  resource: Resource,
  context: Context,
) {
  if (revisions.length === 0) return;
  const excludedRevisionIds = revisions.map((revision) => revision.id);
  try {
    for (const objectKey of new Set(
      revisions.flatMap((revision) =>
        revision.artifacts.flatMap((candidate) => [
          candidate.objectKey,
          ...(candidate.coverObjectKey ? [candidate.coverObjectKey] : []),
        ]),
      ),
    )) {
      const counts = await downloadResourceRepository.transaction((tx) =>
        tx.countArtifactReferences({
          objectKey,
          excludeRevisionIds: excludedRevisionIds,
        }),
      );
      if (counts.objectReferenceCount + counts.coverReferenceCount === 0)
        await downloadResourceFileStore.remove(objectKey);
    }
    await downloadResourceRepository.transaction(async (tx) => {
      for (const revision of revisions) {
        await tx.deleteArtifactsForRevision(revision.id);
        await tx.deleteCleanupRevision(revision.id);
      }
    });
  } catch {
    await downloadResourceRepository.transaction(async (tx) => {
      for (const revision of revisions) {
        await tx.setCleanupError(revision.id, "filesystem cleanup failed");
        await tx.appendAudit(
          cleanupFailureAudit(actor, resource, revision, context),
        );
      }
    });
  }
}
async function authenticated() {
  return requirePermission("admin:downloads");
}

export const downloadResourceService = {
  async listTypedAdminResources(rawQuery: unknown) {
    await authenticated();
    const result = await downloadResourceRepository.listAdmin(
      parse(adminDownloadQuerySchema, rawQuery),
    );
    return {
      total: result.total,
      items: await Promise.all(result.items.map(typedAdminDto)),
    };
  },
  async getTypedAdminResource(id: unknown) {
    await authenticated();
    const resource = await downloadResourceRepository.getAdminById(
      parse(mutateDownloadResourceInputSchema.shape.id, id),
    );
    return resource ? typedAdminDto(resource) : null;
  },
  async createTypedResource(rawInput: unknown, context: Context = {}) {
    const actor = await authenticated();
    const input = parse(typedCreateDownloadResourceInputSchema, rawInput);
    return downloadResourceRepository.transaction(async (tx) => {
      await tx.assertActiveWorkforcePermission(actor.userId, "admin:downloads");
      const created = await tx.insertResource(input);
      const resource: Resource = {
        ...created,
        publishedRevision: null,
        draftRevision: null,
      };
      await tx.appendAudit(createdAudit(actor, resource, context));
      return typedAdminDto(resource);
    });
  },
  async saveTypedDraft(rawInput: unknown, context: Context = {}) {
    const actor = await authenticated();
    const input = parse(typedSaveDownloadDraftInputSchema, rawInput);
    return downloadResourceRepository.withArtifactMutationLock(
      async (tx) => {
        await tx.assertActiveWorkforcePermission(
          actor.userId,
          "admin:downloads",
        );
        const current = await tx.lockResource(input.id);
        assertCurrent(current, input);
        if (current.kind !== input.kind)
          throw new Error("DOWNLOAD_RESOURCE_KIND_IMMUTABLE");
        const previousDraft = current.draftRevision;
        const source = previousDraft ?? current.publishedRevision;
        const inserted = await tx.insertRevision(
          revisionInput(current, input, actor),
        );
        const cloned = source
          ? await tx.cloneArtifacts({
              sourceRevisionId: source.id,
              revisionId: inserted.id,
              revisionKind: current.kind,
            })
          : [];
        const draft: Revision = { ...inserted, artifacts: cloned };
        const resource = await update(
          tx,
          current,
          input,
          current.state,
          current.publishedRevision,
          draft,
        );
        const pending = await cleanup(tx, current.id, previousDraft);
        await tx.appendAudit(
          revisionAudit(
            "download_resource.draft_saved",
            actor,
            resource,
            draft.id,
            context,
          ),
        );
        return { dto: await typedAdminDto(resource), resource, pending };
      },
      async ({ resource, pending }) =>
        cleanupObjects(pending, actor, resource, context),
    );
  },
  async attachUploadedArtifact(
    rawInput: unknown,
    context: Context = {},
    signal?: AbortSignal,
  ) {
    const actor = await authenticated();
    const input = parse(uploadArtifactInputSchema, rawInput);
    const revisionId = randomUUID();
    const committed: string[] = [];
    let businessCommitted = false;
    try {
      throwIfAborted(signal);
      const objectKey = await downloadResourceFileStore.commitArtifact(
        input.stage,
        {
          resourceId: input.id,
          revisionId,
          slot: input.slot,
          extension: input.extension,
        },
      );
      committed.push(objectKey);
      throwIfAborted(signal);
      let coverObjectKey: string | null = null;
      if (input.slot === "document") {
        if (
          input.extension !== ".pdf" ||
          !input.pageCount ||
          input.coverStage === undefined
        )
          throw new Error("DOWNLOAD_RESOURCE_INPUT_INVALID:document");
        coverObjectKey = await downloadResourceFileStore.commitArtifact(
          input.coverStage,
          {
            resourceId: input.id,
            revisionId,
            slot: "document",
            extension: ".webp",
          },
        );
        committed.push(coverObjectKey);
        throwIfAborted(signal);
      }
      return await downloadResourceRepository.withArtifactMutationLock(
        async (tx) => {
          throwIfAborted(signal);
          await tx.assertActiveWorkforcePermission(
            actor.userId,
            "admin:downloads",
          );
          const current = await tx.lockResource(input.id);
          assertCurrent(current, input);
          if (
            current.kind === "document"
              ? input.slot !== "document"
              : input.slot === "document"
          )
            throw new Error("DOWNLOAD_RESOURCE_ARTIFACT_SLOT_MISMATCH");
          const previousDraft = current.draftRevision;
          if (!previousDraft)
            throw new Error("DOWNLOAD_RESOURCE_UPLOAD_REQUIRES_DRAFT");
          const inserted = await tx.insertRevision({
            resourceId: current.id,
            resourceKind: current.kind,
            name: previousDraft.name,
            product: previousDraft.product,
            category: previousDraft.category,
            resourceType: previousDraft.resourceType,
            description: previousDraft.description,
            sortOrder: previousDraft.sortOrder,
            previewPolicy: previousDraft.previewPolicy,
            downloadPolicy: previousDraft.downloadPolicy,
            releaseVersion: previousDraft.releaseVersion,
            createdBy: actor.userId,
            id: revisionId,
          });
          const cloned = await tx.cloneArtifacts({
            sourceRevisionId: previousDraft.id,
            revisionId,
            revisionKind: current.kind,
          });
          const replacement = await tx.replaceArtifact({
            revisionId,
            revisionKind: current.kind,
            slot: input.slot,
            objectKey,
            originalFilename: input.originalFilename,
            extension: input.extension,
            mediaType: input.mediaType,
            byteSize: input.byteSize,
            sha256: input.sha256,
            pageCount:
              input.slot === "document" ? (input.pageCount ?? null) : null,
            coverObjectKey,
          });
          throwIfAborted(signal);
          const draft: Revision = {
            ...inserted,
            artifacts: [
              ...cloned.filter((candidate) => candidate.slot !== input.slot),
              replacement.artifact,
            ],
          };
          const resource = await update(
            tx,
            current,
            input,
            current.state,
            current.publishedRevision,
            draft,
          );
          throwIfAborted(signal);
          const pending = await cleanup(tx, current.id, previousDraft);
          throwIfAborted(signal);
          await tx.appendAudit(
            revisionAudit(
              "download_resource.uploaded",
              actor,
              resource,
              draft.id,
              context,
            ),
          );
          const dto = await typedAdminDto(resource);
          throwIfAborted(signal);
          return { dto, resource, pending };
        },
        async ({ resource, pending }) => {
          businessCommitted = true;
          await cleanupObjects(pending, actor, resource, context);
        },
      );
    } catch (error) {
      if (businessCommitted) throw error;
      const compensationFailures: unknown[] = [];
      await Promise.all(
        committed.map(async (key) => {
          try {
            await downloadResourceFileStore.remove(key);
          } catch (cleanupError) {
            compensationFailures.push(cleanupError);
          }
        }),
      );
      if (compensationFailures.length)
        throw new AggregateError(
          [error, ...compensationFailures],
          "Upload artifact compensation failed",
        );
      throw error;
    }
  },
  async publishTyped(rawInput: unknown, context: Context = {}) {
    const actor = await authenticated();
    const input = parse(mutateDownloadResourceInputSchema, rawInput);
    return downloadResourceRepository.withArtifactMutationLock(
      async (tx) => {
        await tx.assertActiveWorkforcePermission(
          actor.userId,
          "admin:downloads",
        );
        const current = await tx.lockResource(input.id);
        assertCurrent(current, input);
        const draft = current.draftRevision;
        if (!draft || !(await publishable(draft)))
          throw new Error("DOWNLOAD_RESOURCE_NOT_PUBLISHABLE");
        const updated = await update(
          tx,
          current,
          input,
          "published",
          draft,
          null,
        );
        const published = await tx.markRevisionPublished(draft.id);
        if (!published) throw new Error("DOWNLOAD_RESOURCE_NOT_PUBLISHABLE");
        const resource: Resource = {
          ...updated,
          publishedRevision: { ...published, artifacts: draft.artifacts },
        };
        const pending = await cleanup(
          tx,
          current.id,
          current.publishedRevision,
        );
        await tx.appendAudit(
          revisionAudit(
            "download_resource.published",
            actor,
            resource,
            draft.id,
            context,
          ),
        );
        return { dto: await typedAdminDto(resource), resource, pending };
      },
      async ({ resource, pending }) =>
        cleanupObjects(pending, actor, resource, context),
    );
  },
  async downlineTyped(rawInput: unknown, context: Context = {}) {
    const actor = await authenticated();
    const input = parse(mutateDownloadResourceInputSchema, rawInput);
    return downloadResourceRepository.withArtifactMutationLock(
      async (tx) => {
        await tx.assertActiveWorkforcePermission(
          actor.userId,
          "admin:downloads",
        );
        const current = await tx.lockResource(input.id);
        assertCurrent(current, input);
        if (
          current.state !== "published" ||
          !current.publishedRevision ||
          current.draftRevision
        )
          throw new Error("DOWNLOAD_RESOURCE_NOT_DOWNLINEABLE");
        const resource = await update(
          tx,
          current,
          input,
          "downline",
          null,
          current.publishedRevision,
        );
        await tx.appendAudit(
          revisionAudit(
            "download_resource.downlined",
            actor,
            resource,
            current.publishedRevision.id,
            context,
          ),
        );
        return {
          resource,
          dto: await typedAdminDto(resource),
          pending: [],
        };
      },
      async ({ resource, pending }) =>
        cleanupObjects(pending, actor, resource, context),
    );
  },
  async discardTyped(rawInput: unknown, context: Context = {}) {
    const actor = await authenticated();
    const input = parse(mutateDownloadResourceInputSchema, rawInput);
    return downloadResourceRepository.withArtifactMutationLock(
      async (tx) => {
        await tx.assertActiveWorkforcePermission(
          actor.userId,
          "admin:downloads",
        );
        const current = await tx.lockResource(input.id);
        assertCurrent(current, input);
        if (!current.draftRevision)
          throw new Error("DOWNLOAD_RESOURCE_NO_DRAFT");
        const previousDraft = current.draftRevision;
        const resource = await update(
          tx,
          current,
          input,
          current.state === "downline" ? "unpublished" : current.state,
          current.publishedRevision,
          null,
        );
        const pending = await cleanup(tx, current.id, previousDraft);
        await tx.appendAudit(
          revisionAudit(
            "download_resource.draft_discarded",
            actor,
            resource,
            previousDraft.id,
            context,
          ),
        );
        return { resource, dto: await typedAdminDto(resource), pending };
      },
      async ({ resource, pending }) =>
        cleanupObjects(pending, actor, resource, context),
    );
  },
  async removeDraftArtifact(rawInput: unknown, context: Context = {}) {
    const actor = await authenticated();
    const input = parse(
      mutateDownloadResourceInputSchema
        .safeExtend({ slot: artifactSlotSchema })
        .strict(),
      rawInput,
    );
    return downloadResourceRepository.withArtifactMutationLock(
      async (tx) => {
        await tx.assertActiveWorkforcePermission(
          actor.userId,
          "admin:downloads",
        );
        const current = await tx.lockResource(input.id);
        assertCurrent(current, input);
        const previousDraft = current.draftRevision;
        if (
          !previousDraft ||
          (current.kind === "document"
            ? input.slot !== "document"
            : input.slot === "document")
        )
          throw new Error("DOWNLOAD_RESOURCE_FILE_NOT_REMOVABLE");
        const inserted = await tx.insertRevision({
          resourceId: current.id,
          resourceKind: current.kind,
          name: previousDraft.name,
          product: previousDraft.product,
          category: previousDraft.category,
          resourceType: previousDraft.resourceType,
          description: previousDraft.description,
          sortOrder: previousDraft.sortOrder,
          previewPolicy: previousDraft.previewPolicy,
          downloadPolicy: previousDraft.downloadPolicy,
          releaseVersion: previousDraft.releaseVersion,
          createdBy: actor.userId,
        });
        const cloned = await tx.cloneArtifacts({
          sourceRevisionId: previousDraft.id,
          revisionId: inserted.id,
          revisionKind: current.kind,
        });
        const removed = await tx.removeArtifact({
          revisionId: inserted.id,
          slot: input.slot,
        });
        if (!removed) throw new Error("DOWNLOAD_RESOURCE_FILE_NOT_REMOVABLE");
        const draft: Revision = {
          ...inserted,
          artifacts: cloned.filter(
            (candidate) => candidate.slot !== input.slot,
          ),
        };
        const resource = await update(
          tx,
          current,
          input,
          current.state,
          current.publishedRevision,
          draft,
        );
        const pending = await cleanup(tx, current.id, previousDraft);
        await tx.appendAudit(
          revisionAudit(
            "download_resource.file_removed",
            actor,
            resource,
            draft.id,
            context,
          ),
        );
        return { dto: await typedAdminDto(resource), resource, pending };
      },
      async ({ resource, pending }) =>
        cleanupObjects(pending, actor, resource, context),
    );
  },
  async listPublicResources(): Promise<DownloadResourcePublicDto[]> {
    const resources = await downloadResourceRepository.listPublic();
    const published = await Promise.all(
      resources.map(async (row) => {
        const revision = row;
        if (!revision.publishedAt || !(await publishable(revision)))
          return null;
        if (revision.resourceKind === "document") {
          const document = file(revision, "document");
          if (
            !document ||
            !document.coverObjectKey ||
            document.pageCount === null ||
            revision.previewPolicy === null
          )
            return null;
          return parse(downloadResourcePublicDtoSchema, {
            kind: "document",
            key: row.key,
            name: revision.name,
            product: revision.product,
            category: revision.category,
            resourceType: revision.resourceType,
            description: revision.description,
            sortOrder: revision.sortOrder,
            previewPolicy: revision.previewPolicy,
            downloadPolicy: revision.downloadPolicy,
            coverUrl: `/api/v1/downloads/${row.key}/cover?revision=${revision.id}`,
            pageCount: document.pageCount,
            byteSize: document.byteSize,
            updatedAt: revision.publishedAt.toISOString(),
          });
        }
        const windows = file(revision, "windows");
        const macos = file(revision, "macos");
        if (!windows && !macos) return null;
        return parse(downloadResourcePublicDtoSchema, {
          kind: "software",
          key: row.key,
          name: revision.name,
          product: revision.product,
          category: revision.category,
          resourceType: revision.resourceType,
          description: revision.description,
          sortOrder: revision.sortOrder,
          releaseVersion: revision.releaseVersion,
          platforms: {
            windows: windows
              ? {
                  filename: windows.originalFilename,
                  byteSize: windows.byteSize,
                  downloadUrl: `/api/v1/downloads/${row.key}/download/windows`,
                }
              : null,
            macos: macos
              ? {
                  filename: macos.originalFilename,
                  byteSize: macos.byteSize,
                  downloadUrl: `/api/v1/downloads/${row.key}/download/macos`,
                }
              : null,
          },
          updatedAt: revision.publishedAt.toISOString(),
        });
      }),
    );
    return published.filter(
      (item): item is DownloadResourcePublicDto => item !== null,
    );
  },
  async openPublishedArtifact(
    key: unknown,
    slot: Artifact["slot"],
    range?: unknown,
    documentAccess: "cover" | "preview" | "download" = "download",
    expectedRevisionId?: unknown,
  ) {
    if (typeof key !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(key))
      return null;
    const resource = await downloadResourceRepository.getPublicByKey(key);
    if (!resource || !resource.publishedAt || !(await publishable(resource)))
      return null;
    const artifact = file(resource, slot);
    if (!artifact) return null;
    if (resource.resourceKind === "document") {
      if (slot !== "document" || !artifact.coverObjectKey) return null;
      if (
        (documentAccess === "cover" && expectedRevisionId !== resource.id) ||
        (documentAccess === "preview" && resource.previewPolicy !== "public") ||
        (documentAccess === "download" && resource.downloadPolicy !== "public")
      )
        return null;
    } else if (slot === "document") return null;
    const opened = await downloadResourceFileStore.open(
      resource.resourceKind === "document" && documentAccess === "cover"
        ? artifact.coverObjectKey!
        : artifact.objectKey,
      parse(byteRangeSchema, range),
    );
    if (
      !(resource.resourceKind === "document" && documentAccess === "cover") &&
      opened.size !== artifact.byteSize
    ) {
      opened.readable.destroy();
      return null;
    }
    return {
      ...opened,
      filename:
        resource.resourceKind === "document"
          ? `${resource.name}.${documentAccess === "cover" ? "webp" : "pdf"}`
          : artifact.originalFilename,
      mediaType:
        resource.resourceKind === "document" && documentAccess === "cover"
          ? "image/webp"
          : artifact.mediaType,
      extension: artifact.extension,
      byteSize: artifact.byteSize,
      revisionId: resource.id,
    };
  },
  async openAdminDraftArtifact(
    id: unknown,
    kind: "cover" | "document",
    range?: unknown,
  ) {
    await authenticated();
    const resource = await downloadResourceRepository.getAdminById(
      parse(mutateDownloadResourceInputSchema.shape.id, id),
    );
    const document = resource?.draftRevision
      ? file(resource.draftRevision, "document")
      : null;
    if (!document || !document.coverObjectKey) return null;
    return downloadResourceFileStore.open(
      kind === "cover" ? document.coverObjectKey : document.objectKey,
      parse(byteRangeSchema, range),
    );
  },
};

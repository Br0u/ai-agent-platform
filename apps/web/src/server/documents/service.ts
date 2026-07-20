import "server-only";

import {
  compileSafeDocument,
  type SafeDocumentBodyV1,
} from "@ai-agent-platform/document-content";

import type { AuditWriteInput } from "../auth/audit";
import {
  createDocumentInputSchema,
  documentDtoSchema,
  documentPageDtoSchema,
  DocumentError,
  mutateDocumentInputSchema,
  parseAdminDocumentQuery,
  saveDocumentInputSchema,
  selectedDocumentDtoSchema,
  type AdminDocumentQuery,
  type CreateDocumentInput,
  type DocumentDto,
  type DocumentListItemDto,
  type DocumentPageDto,
  type DocumentStatus,
  type MutateDocumentInput,
  type SelectedDocumentDto,
  type SaveDocumentInput,
} from "./contracts";

export type DocumentActor = { userId: string };
export type DocumentRequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type LockedDocument = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: SafeDocumentBodyV1;
  status: DocumentStatus;
  revision: number;
  rowVersion: number;
  publishedRevision: number | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  updatedAt: Date;
};

export type DocumentAuditEvent = Extract<
  AuditWriteInput,
  { event: `document.${string}` }
>;

export interface DocumentTransaction {
  assertActiveWorkforcePermission(
    userId: string,
    permission: "admin:docs" | "admin:docs:delete",
    options?: { requireSuperAdmin?: boolean },
  ): Promise<void>;
  lockDocument(id: string): Promise<LockedDocument | null>;
  insertDocument(input: {
    actorUserId: string;
    slug: string;
    title: string;
    summary: string;
    body: SafeDocumentBodyV1;
  }): Promise<LockedDocument>;
  reserveSlug(slug: string, documentId: string): Promise<void>;
  appendRevision(input: {
    documentId: string;
    revision: number;
    slug: string;
    title: string;
    summary: string;
    body: SafeDocumentBodyV1;
    actorUserId: string;
  }): Promise<void>;
  saveDraft(input: {
    documentId: string;
    slug: string;
    title: string;
    summary: string;
    body: SafeDocumentBodyV1;
    revision: number;
    rowVersion: number;
  }): Promise<LockedDocument>;
  lockRouteState(
    slug: string,
    documentId: string,
  ): Promise<"reserved" | "canonical" | "alias" | null>;
  lockCanonicalSlug(documentId: string): Promise<string | null>;
  demoteCanonicalToAlias(slug: string, documentId: string): Promise<void>;
  promoteReservedToCanonical(slug: string, documentId: string): Promise<void>;
  publishDocument(input: {
    documentId: string;
    revision: number;
    rowVersion: number;
    actorUserId: string;
  }): Promise<LockedDocument>;
  archiveDocument(input: {
    documentId: string;
    rowVersion: number;
    actorUserId: string;
  }): Promise<LockedDocument>;
  deleteDocument(input: {
    documentId: string;
    rowVersion: number;
    actorUserId: string;
  }): Promise<LockedDocument>;
  restoreDocument(input: {
    documentId: string;
    rowVersion: number;
  }): Promise<LockedDocument>;
  appendAudit(event: DocumentAuditEvent): Promise<void>;
}

export interface DocumentRepository {
  transaction<T>(work: (tx: DocumentTransaction) => Promise<T>): Promise<T>;
  list(
    query: AdminDocumentQuery,
    actorUserId: string,
  ): Promise<{ items: DocumentListItemDto[]; total: number }>;
  getById(id: string, actorUserId: string): Promise<SelectedDocumentDto | null>;
}

const SOURCE_SAFETY_ERROR_PREFIXES = [
  "DOCUMENT_URL_INVALID:",
  "DOCUMENT_MARKDOWN_UNSUPPORTED:",
  "DOCUMENT_DIRECTIVE_INVALID:",
  "DOCUMENT_MARKDOWN_LIMIT:",
  "DOCUMENT_RENDER_MODEL_INVALID:",
] as const;

function mapCompilerError(error: unknown): never {
  if (error instanceof DocumentError) throw error;
  if (error instanceof Error) {
    if (
      error.message.startsWith("DOCUMENT_INPUT_INVALID:") ||
      error.message.startsWith("DOCUMENT_INPUT_TOO_LARGE:")
    ) {
      throw new DocumentError("DOCUMENT_INPUT_INVALID");
    }
    if (
      SOURCE_SAFETY_ERROR_PREFIXES.some((prefix) =>
        error.message.startsWith(prefix),
      )
    ) {
      throw new DocumentError("DOCUMENT_SOURCE_UNSAFE");
    }
  }
  throw error;
}

function compileDraft(input: unknown): {
  draft: CreateDocumentInput;
  body: SafeDocumentBodyV1;
} {
  const parsed = createDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DocumentError(
      "DOCUMENT_INPUT_INVALID",
      parsed.error.issues[0]?.path.join(".") || "input",
    );
  }
  try {
    return { draft: parsed.data, body: compileSafeDocument(parsed.data) };
  } catch (error) {
    mapCompilerError(error);
  }
}

function parseMutation(input: unknown): MutateDocumentInput {
  const parsed = mutateDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DocumentError(
      "DOCUMENT_INPUT_INVALID",
      parsed.error.issues[0]?.path.join(".") || "input",
    );
  }
  return parsed.data;
}

function parseSave(input: unknown): SaveDocumentInput {
  const parsed = saveDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DocumentError(
      "DOCUMENT_INPUT_INVALID",
      parsed.error.issues[0]?.path.join(".") || "input",
    );
  }
  return parsed.data;
}

function assertCas(
  document: LockedDocument,
  input: Pick<MutateDocumentInput, "expectedRevision" | "expectedRowVersion">,
): void {
  if (
    document.revision !== input.expectedRevision ||
    document.rowVersion !== input.expectedRowVersion
  ) {
    throw new DocumentError("DOCUMENT_REVISION_CONFLICT");
  }
}

function contextFields(context: DocumentRequestContext) {
  return {
    ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {}),
  };
}

function documentAudit(
  event: DocumentAuditEvent["event"],
  actorUserId: string,
  document: Pick<LockedDocument, "id" | "slug" | "revision">,
  context: DocumentRequestContext,
): DocumentAuditEvent {
  return {
    event,
    actor: { realm: "workforce", userId: actorUserId },
    target: { type: "document", id: document.id },
    metadata: {
      slug: document.slug,
      revision: document.revision,
      result: "success",
    },
    ...contextFields(context),
  } as DocumentAuditEvent;
}

function safeDocumentDto(document: LockedDocument): DocumentDto {
  const candidate = {
    id: document.id,
    slug: document.slug,
    title: document.title,
    summary: document.summary,
    body: document.body,
    status: document.status,
    revision: document.revision,
    rowVersion: document.rowVersion,
    publishedRevision: document.publishedRevision,
    publishedAt: document.publishedAt?.toISOString() ?? null,
    archivedAt: document.archivedAt?.toISOString() ?? null,
    deletedAt: document.deletedAt?.toISOString() ?? null,
    deleted: document.deletedAt !== null,
    updatedAt: document.updatedAt.toISOString(),
  };
  const parsed = documentDtoSchema.safeParse(candidate);
  if (!parsed.success) throw new Error("Document DTO invariant violated");
  return parsed.data;
}

export function createDocumentService(repository: DocumentRepository) {
  async function authorizedLock(
    tx: DocumentTransaction,
    actor: DocumentActor,
    input: MutateDocumentInput,
    permission: "admin:docs" | "admin:docs:delete",
  ): Promise<LockedDocument> {
    await tx.assertActiveWorkforcePermission(actor.userId, permission, {
      requireSuperAdmin: permission === "admin:docs:delete",
    });
    const document = await tx.lockDocument(input.id);
    if (!document) throw new DocumentError("DOCUMENT_NOT_FOUND");
    assertCas(document, input);
    return document;
  }

  return {
    async list(
      rawQuery: unknown,
      actor: DocumentActor,
    ): Promise<DocumentPageDto> {
      const query = parseAdminDocumentQuery(rawQuery);
      const result = await repository.list(query, actor.userId);
      const parsed = documentPageDtoSchema.safeParse({
        ...result,
        page: query.page,
        pageSize: query.pageSize,
      });
      if (!parsed.success)
        throw new Error("Document page DTO invariant violated");
      return parsed.data;
    },

    async getById(
      id: unknown,
      actor: DocumentActor,
    ): Promise<SelectedDocumentDto | null> {
      const parsed = mutateDocumentInputSchema.shape.id.safeParse(id);
      if (!parsed.success)
        throw new DocumentError("DOCUMENT_INPUT_INVALID", "id");
      const result = await repository.getById(parsed.data, actor.userId);
      if (!result) return null;
      const safeResult = selectedDocumentDtoSchema.safeParse(result);
      if (!safeResult.success)
        throw new Error("Document DTO invariant violated");
      return safeResult.data;
    },

    async create(
      rawInput: unknown,
      actor: DocumentActor,
      context: DocumentRequestContext = {},
    ): Promise<DocumentDto> {
      const { draft, body } = compileDraft(rawInput);
      return repository.transaction(async (tx) => {
        await tx.assertActiveWorkforcePermission(actor.userId, "admin:docs");
        const created = await tx.insertDocument({
          actorUserId: actor.userId,
          slug: draft.slug,
          title: draft.title,
          summary: draft.summary,
          body,
        });
        await tx.reserveSlug(draft.slug, created.id);
        await tx.appendRevision({
          documentId: created.id,
          revision: created.revision,
          slug: draft.slug,
          title: draft.title,
          summary: draft.summary,
          body,
          actorUserId: actor.userId,
        });
        await tx.appendAudit(
          documentAudit("document.created", actor.userId, created, context),
        );
        return safeDocumentDto(created);
      });
    },

    async save(
      rawInput: unknown,
      actor: DocumentActor,
      context: DocumentRequestContext = {},
    ): Promise<DocumentDto> {
      const input = parseSave(rawInput);
      const { draft, body } = compileDraft({
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        source: input.source,
        navigation: input.navigation,
      });
      return repository.transaction(async (tx) => {
        const current = await authorizedLock(tx, actor, input, "admin:docs");
        if (current.deletedAt)
          throw new DocumentError("DOCUMENT_STATE_CONFLICT");
        if (draft.slug !== current.slug) {
          await tx.reserveSlug(draft.slug, current.id);
        }
        const revision = current.revision + 1;
        const updated = await tx.saveDraft({
          documentId: current.id,
          slug: draft.slug,
          title: draft.title,
          summary: draft.summary,
          body,
          revision,
          rowVersion: current.rowVersion + 1,
        });
        await tx.appendRevision({
          documentId: current.id,
          revision,
          slug: draft.slug,
          title: draft.title,
          summary: draft.summary,
          body,
          actorUserId: actor.userId,
        });
        await tx.appendAudit(
          documentAudit("document.draft_saved", actor.userId, updated, context),
        );
        return safeDocumentDto(updated);
      });
    },

    async publish(
      rawInput: unknown,
      actor: DocumentActor,
      context: DocumentRequestContext = {},
    ): Promise<DocumentDto> {
      const input = parseMutation(rawInput);
      return repository.transaction(async (tx) => {
        const current = await authorizedLock(tx, actor, input, "admin:docs");
        if (current.deletedAt)
          throw new DocumentError("DOCUMENT_NOT_PUBLISHABLE");
        if (
          current.status === "published" &&
          current.publishedRevision === current.revision
        ) {
          throw new DocumentError("DOCUMENT_STATE_CONFLICT");
        }

        const targetRouteState = await tx.lockRouteState(
          current.slug,
          current.id,
        );
        const canonicalSlug = await tx.lockCanonicalSlug(current.id);
        if (canonicalSlug !== current.slug) {
          if (targetRouteState !== "reserved") {
            throw new DocumentError("DOCUMENT_NOT_PUBLISHABLE");
          }
          if (canonicalSlug) {
            await tx.demoteCanonicalToAlias(canonicalSlug, current.id);
          }
          await tx.promoteReservedToCanonical(current.slug, current.id);
        } else if (targetRouteState !== "canonical") {
          throw new DocumentError("DOCUMENT_NOT_PUBLISHABLE");
        }

        const updated = await tx.publishDocument({
          documentId: current.id,
          revision: current.revision,
          rowVersion: current.rowVersion + 1,
          actorUserId: actor.userId,
        });
        await tx.appendAudit(
          documentAudit("document.published", actor.userId, updated, context),
        );
        return safeDocumentDto(updated);
      });
    },

    async archive(
      rawInput: unknown,
      actor: DocumentActor,
      context: DocumentRequestContext = {},
    ): Promise<DocumentDto> {
      const input = parseMutation(rawInput);
      return repository.transaction(async (tx) => {
        const current = await authorizedLock(tx, actor, input, "admin:docs");
        if (current.deletedAt || current.status !== "published") {
          throw new DocumentError("DOCUMENT_STATE_CONFLICT");
        }
        const updated = await tx.archiveDocument({
          documentId: current.id,
          rowVersion: current.rowVersion + 1,
          actorUserId: actor.userId,
        });
        await tx.appendAudit(
          documentAudit("document.archived", actor.userId, updated, context),
        );
        return safeDocumentDto(updated);
      });
    },

    async delete(
      rawInput: unknown,
      actor: DocumentActor,
      context: DocumentRequestContext = {},
    ): Promise<DocumentDto> {
      const input = parseMutation(rawInput);
      return repository.transaction(async (tx) => {
        const current = await authorizedLock(
          tx,
          actor,
          input,
          "admin:docs:delete",
        );
        if (current.deletedAt)
          throw new DocumentError("DOCUMENT_STATE_CONFLICT");
        const updated = await tx.deleteDocument({
          documentId: current.id,
          rowVersion: current.rowVersion + 1,
          actorUserId: actor.userId,
        });
        await tx.appendAudit(
          documentAudit("document.deleted", actor.userId, updated, context),
        );
        return safeDocumentDto(updated);
      });
    },

    async restore(
      rawInput: unknown,
      actor: DocumentActor,
      context: DocumentRequestContext = {},
    ): Promise<DocumentDto> {
      const input = parseMutation(rawInput);
      return repository.transaction(async (tx) => {
        const current = await authorizedLock(
          tx,
          actor,
          input,
          "admin:docs:delete",
        );
        if (!current.deletedAt)
          throw new DocumentError("DOCUMENT_STATE_CONFLICT");
        const updated = await tx.restoreDocument({
          documentId: current.id,
          rowVersion: current.rowVersion + 1,
        });
        await tx.appendAudit(
          documentAudit("document.restored", actor.userId, updated, context),
        );
        return safeDocumentDto(updated);
      });
    },
  };
}

export type DocumentService = ReturnType<typeof createDocumentService>;

import {
  DOCUMENT_LIMITS,
  safeDocumentBodyV1Schema,
  type DocumentDraftInput,
} from "@ai-agent-platform/document-content";
import { z } from "zod";

export const DOCUMENT_STATUSES = ["draft", "published", "archived"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_SORTS = [
  "updated_desc",
  "updated_asc",
  "title_asc",
  "title_desc",
] as const;
export type DocumentSort = (typeof DOCUMENT_SORTS)[number];

export const documentIdSchema = z.string().uuid();
export const documentRevisionSchema = z.coerce.number().int().positive();
export const documentRowVersionSchema = z.coerce.number().int().positive();
const documentRevisionValueSchema = z.number().int().positive();

const documentNavigationSchema = z
  .object({
    label: z.string().trim().min(1).max(DOCUMENT_LIMITS.navigationLabel),
    code: z
      .string()
      .min(1)
      .max(DOCUMENT_LIMITS.navigationCode)
      .regex(/^[A-Z0-9][A-Z0-9_-]*$/u),
    position: z.coerce.number().int().min(0).max(DOCUMENT_LIMITS.position),
  })
  .strict();

export const documentDraftSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(DOCUMENT_LIMITS.slug)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    title: z.string().trim().min(1).max(DOCUMENT_LIMITS.title),
    summary: z.string().trim().min(1).max(DOCUMENT_LIMITS.summary),
    source: z
      .string()
      .min(1)
      .refine(
        (value) =>
          Buffer.byteLength(value, "utf8") <= DOCUMENT_LIMITS.sourceBytes,
      ),
    navigation: documentNavigationSchema,
  })
  .strict() satisfies z.ZodType<DocumentDraftInput>;

export const createDocumentInputSchema = documentDraftSchema;

export const saveDocumentInputSchema = documentDraftSchema.extend({
  id: documentIdSchema,
  expectedRevision: documentRevisionSchema,
  expectedRowVersion: documentRowVersionSchema,
});

export const mutateDocumentInputSchema = z
  .object({
    id: documentIdSchema,
    expectedRevision: documentRevisionSchema,
    expectedRowVersion: documentRowVersionSchema,
  })
  .strict();

export const adminDocumentQuerySchema = z
  .object({
    search: z.string().trim().max(120).default(""),
    status: z.enum(DOCUMENT_STATUSES).optional(),
    sort: z.enum(DOCUMENT_SORTS).default("updated_desc"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce
      .number()
      .pipe(z.union([z.literal(10), z.literal(20), z.literal(50)]))
      .default(20),
  })
  .strict();

export type AdminDocumentQuery = z.infer<typeof adminDocumentQuerySchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentInputSchema>;
export type SaveDocumentInput = z.infer<typeof saveDocumentInputSchema>;
export type MutateDocumentInput = z.infer<typeof mutateDocumentInputSchema>;

export const documentListItemDtoSchema = z
  .object({
    id: documentIdSchema,
    slug: documentDraftSchema.shape.slug,
    title: documentDraftSchema.shape.title,
    summary: documentDraftSchema.shape.summary,
    status: z.enum(DOCUMENT_STATUSES),
    revision: documentRevisionValueSchema,
    rowVersion: documentRevisionValueSchema,
    publishedRevision: documentRevisionValueSchema.nullable(),
    deleted: z.boolean(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const documentPageDtoSchema = z
  .object({
    items: z.array(documentListItemDtoSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]),
  })
  .strict();

export const documentDtoSchema = documentListItemDtoSchema
  .extend({
    body: safeDocumentBodyV1Schema,
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    archivedAt: z.string().datetime({ offset: true }).nullable(),
    deletedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export const selectedDocumentDtoSchema = documentDtoSchema
  .extend({ revisionId: documentIdSchema })
  .strict();

export type DocumentListItemDto = z.infer<typeof documentListItemDtoSchema>;
export type DocumentPageDto = z.infer<typeof documentPageDtoSchema>;
export type DocumentDto = z.infer<typeof documentDtoSchema>;
export type SelectedDocumentDto = z.infer<typeof selectedDocumentDtoSchema>;

export const DOCUMENT_ERROR_CODES = [
  "DOCUMENT_INPUT_INVALID",
  "DOCUMENT_SOURCE_UNSAFE",
  "DOCUMENT_NOT_FOUND",
  "DOCUMENT_SLUG_CONFLICT",
  "DOCUMENT_REVISION_CONFLICT",
  "DOCUMENT_NOT_PUBLISHABLE",
  "DOCUMENT_STATE_CONFLICT",
  "AUTH_PERMISSION_DENIED",
] as const;

export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[number];

export class DocumentError extends Error {
  constructor(
    readonly code: DocumentErrorCode,
    readonly field?: string,
  ) {
    super(code);
    this.name = "DocumentError";
  }
}

export function parseAdminDocumentQuery(input: unknown): AdminDocumentQuery {
  const parsed = adminDocumentQuerySchema.safeParse(input);
  if (!parsed.success) throw new DocumentError("DOCUMENT_INPUT_INVALID");
  return parsed.data;
}

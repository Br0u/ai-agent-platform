import { z } from "zod";

export const DOWNLOAD_RESOURCE_CATEGORIES = [
  "materials",
  "software",
  "deployment",
  "whitepapers",
] as const;
export const DOWNLOAD_RESOURCE_STATES = [
  "unpublished",
  "published",
  "downline",
] as const;
export const DOWNLOAD_RESOURCE_POLICIES = ["public", "contact"] as const;
export const DOWNLOAD_RESOURCE_ADMIN_STATUSES = [
  "文件失效",
  "有待发布更改",
  "已发布",
  "已下线",
  "待发布",
  "待上传",
  "空记录",
] as const;

const idSchema = z.string().uuid();
const keySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const adminLabelSchema = z.string().trim().min(1).max(160);
const nameSchema = z.string().trim().min(1).max(160);
const productSchema = z.string().trim().min(1).max(120);
const resourceTypeSchema = z.string().trim().min(1).max(80);
const descriptionSchema = z.string().trim().min(1).max(500);
const rowVersionSchema = z.coerce.number().int().positive();
const categorySchema = z.enum(DOWNLOAD_RESOURCE_CATEGORIES);
const policySchema = z.enum(DOWNLOAD_RESOURCE_POLICIES);

const draftMetadataSchema = z
  .object({
    name: nameSchema,
    product: productSchema,
    category: categorySchema,
    resourceType: resourceTypeSchema,
    description: descriptionSchema,
    sortOrder: z.number().int().min(0).max(10_000),
    previewPolicy: policySchema,
    downloadPolicy: policySchema,
  })
  .strict()
  .refine(
    ({ previewPolicy, downloadPolicy }) =>
      previewPolicy === "public" || downloadPolicy === "contact",
    { path: ["downloadPolicy"], message: "Invalid access policy pair" },
  );

export const createDownloadResourceInputSchema = z
  .object({ key: keySchema, adminLabel: adminLabelSchema })
  .strict();

export const saveDownloadDraftInputSchema = draftMetadataSchema
  .safeExtend({ id: idSchema, expectedRowVersion: rowVersionSchema })
  .strict();

export const mutateDownloadResourceInputSchema = z
  .object({ id: idSchema, expectedRowVersion: rowVersionSchema })
  .strict();

export const adminDownloadQuerySchema = z
  .object({
    search: z.string().trim().max(120).default(""),
    category: categorySchema.optional(),
    state: z.enum(DOWNLOAD_RESOURCE_STATES).optional(),
    sort: z
      .enum(["updated_desc", "updated_asc", "sort_asc"])
      .default("updated_desc"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce
      .number()
      .pipe(z.union([z.literal(10), z.literal(20), z.literal(50)]))
      .default(20),
  })
  .strict();

const artifactMetadataSchema = z
  .object({
    pdfObjectKey: z.string().trim().min(1).max(512).nullable(),
    coverObjectKey: z.string().trim().min(1).max(512).nullable(),
    pageCount: z.number().int().positive().nullable(),
    byteSize: z.number().int().positive().nullable(),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .nullable(),
  })
  .strict()
  .superRefine((artifact, context) => {
    const values = Object.values(artifact);
    if (
      !values.every((value) => value === null) &&
      values.some((value) => value === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Artifact metadata must be empty or complete",
      });
    }
  });

const revisionDtoSchema = draftMetadataSchema
  .safeExtend({
    id: idSchema,
    ...artifactMetadataSchema.shape,
    createdAt: z.string().datetime({ offset: true }),
    publishedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((revision, context) => {
    const parsed = artifactMetadataSchema.safeParse({
      pdfObjectKey: revision.pdfObjectKey,
      coverObjectKey: revision.coverObjectKey,
      pageCount: revision.pageCount,
      byteSize: revision.byteSize,
      sha256: revision.sha256,
    });
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        message: "Artifact metadata must be empty or complete",
      });
    }
  });

export const downloadResourceAdminDtoSchema = z
  .object({
    id: idSchema,
    key: keySchema,
    adminLabel: adminLabelSchema,
    state: z.enum(DOWNLOAD_RESOURCE_STATES),
    adminStatus: z.enum(DOWNLOAD_RESOURCE_ADMIN_STATUSES),
    rowVersion: z.number().int().positive(),
    publishedRevision: revisionDtoSchema.nullable(),
    draftRevision: revisionDtoSchema.nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const downloadResourcePublicDtoSchema = draftMetadataSchema
  .safeExtend({
    key: keySchema,
    coverUrl: z.string().trim().min(1).max(2_048),
    pageCount: z.number().int().positive(),
    byteSize: z.number().int().positive(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type CreateDownloadResourceInput = z.infer<
  typeof createDownloadResourceInputSchema
>;
export type SaveDownloadDraftInput = z.infer<
  typeof saveDownloadDraftInputSchema
>;
export type MutateDownloadResourceInput = z.infer<
  typeof mutateDownloadResourceInputSchema
>;
export type AdminDownloadQuery = z.infer<typeof adminDownloadQuerySchema>;
export type DownloadResourceAdminDto = z.infer<
  typeof downloadResourceAdminDtoSchema
>;
export type DownloadResourcePublicDto = z.infer<
  typeof downloadResourcePublicDtoSchema
>;

export function suggestDownloadPolicies(
  category: (typeof DOWNLOAD_RESOURCE_CATEGORIES)[number],
) {
  return category === "materials"
    ? ({ previewPolicy: "public", downloadPolicy: "contact" } as const)
    : ({ previewPolicy: "contact", downloadPolicy: "contact" } as const);
}

type AdminStatusInput = {
  state: (typeof DOWNLOAD_RESOURCE_STATES)[number];
  publishedRevision: {
    pdfExists: boolean;
    coverExists: boolean;
    expectedByteSize: number;
    actualByteSize: number;
  } | null;
  draftRevision: { hasCompleteArtifact: boolean } | null;
};

export function deriveAdminStatus({
  state,
  publishedRevision,
  draftRevision,
}: AdminStatusInput): (typeof DOWNLOAD_RESOURCE_ADMIN_STATUSES)[number] {
  if (
    publishedRevision !== null &&
    (!publishedRevision.pdfExists ||
      !publishedRevision.coverExists ||
      publishedRevision.expectedByteSize !== publishedRevision.actualByteSize)
  ) {
    return "文件失效";
  }
  if (state === "published") {
    if (publishedRevision === null) return "文件失效";
    return draftRevision === null ? "已发布" : "有待发布更改";
  }
  if (state === "downline") return "已下线";
  if (draftRevision === null) return "空记录";
  return draftRevision.hasCompleteArtifact ? "待发布" : "待上传";
}

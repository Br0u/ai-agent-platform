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
export const artifactSlotSchema = z.enum(["document", "windows", "macos"]);
export const releaseVersionSchema = z
  .string()
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
  .trim()
  .min(1)
  .max(40);

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

const typedDraftMetadataSchema = z
  .object({
    name: nameSchema,
    product: productSchema,
    category: categorySchema,
    resourceType: resourceTypeSchema,
    description: descriptionSchema,
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .strict();

const typedDocumentDraftSchema = typedDraftMetadataSchema
  .safeExtend({
    kind: z.literal("document"),
    previewPolicy: policySchema,
    downloadPolicy: policySchema,
  })
  .strict()
  .refine(
    ({ previewPolicy, downloadPolicy }) =>
      previewPolicy === "public" || downloadPolicy === "contact",
    { path: ["downloadPolicy"], message: "Invalid access policy pair" },
  );

const typedSoftwareDraftSchema = typedDraftMetadataSchema
  .safeExtend({
    kind: z.literal("software"),
    releaseVersion: releaseVersionSchema,
  })
  .strict();

export const typedCreateDownloadResourceInputSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        key: keySchema,
        adminLabel: adminLabelSchema,
        kind: z.literal("document"),
      })
      .strict(),
    z
      .object({
        key: keySchema,
        adminLabel: adminLabelSchema,
        kind: z.literal("software"),
      })
      .strict(),
  ],
);

export const typedSaveDownloadDraftInputSchema = z.discriminatedUnion("kind", [
  typedDocumentDraftSchema
    .safeExtend({ id: idSchema, expectedRowVersion: rowVersionSchema })
    .strict(),
  typedSoftwareDraftSchema
    .safeExtend({ id: idSchema, expectedRowVersion: rowVersionSchema })
    .strict(),
]);

const objectKeySchema = z.string().trim().min(1).max(512);
const extensionSchema = z.string().trim().min(1).max(16);
const mediaTypeSchema = z.string().trim().min(1).max(128);
const filenameSchema = z.string().trim().min(1).max(255);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

const typedArtifactMetadataSchema = z
  .object({
    objectKey: objectKeySchema,
    originalFilename: filenameSchema,
    extension: extensionSchema,
    mediaType: mediaTypeSchema,
    byteSize: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict();

const typedDocumentArtifactDtoSchema = typedArtifactMetadataSchema
  .safeExtend({
    slot: z.literal("document"),
    extension: z.literal(".pdf"),
    mediaType: z.literal("application/pdf"),
    pageCount: z.number().int().positive(),
    coverObjectKey: objectKeySchema,
  })
  .strict();

const typedWindowsArtifactDtoSchema = typedArtifactMetadataSchema
  .safeExtend({
    slot: z.literal("windows"),
    extension: z.enum([".exe", ".msi", ".zip"]),
  })
  .strict()
  .refine(
    ({ extension, mediaType }) =>
      ({
        ".exe": "application/vnd.microsoft.portable-executable",
        ".msi": "application/x-msi",
        ".zip": "application/zip",
      })[extension] === mediaType,
    { path: ["mediaType"], message: "Invalid Windows artifact media type" },
  );

const typedMacosArtifactDtoSchema = typedArtifactMetadataSchema
  .safeExtend({
    slot: z.literal("macos"),
    extension: z.enum([".dmg", ".pkg", ".zip"]),
  })
  .strict()
  .refine(
    ({ extension, mediaType }) =>
      ({
        ".dmg": "application/x-apple-diskimage",
        ".pkg": "application/vnd.apple.installer+xml",
        ".zip": "application/zip",
      })[extension] === mediaType,
    { path: ["mediaType"], message: "Invalid macOS artifact media type" },
  );

const typedSoftwareArtifactsSchema = z
  .array(
    z.discriminatedUnion("slot", [
      typedWindowsArtifactDtoSchema,
      typedMacosArtifactDtoSchema,
    ]),
  )
  .max(2)
  .refine(
    (artifacts) =>
      new Set(artifacts.map((artifact) => artifact.slot)).size ===
      artifacts.length,
    { message: "Artifact slots must be unique" },
  );

const typedRevisionBaseSchema = z
  .object({
    id: idSchema,
    createdAt: z.string().datetime({ offset: true }),
    publishedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

const typedDocumentRevisionDtoSchema = typedDocumentDraftSchema
  .safeExtend({
    ...typedRevisionBaseSchema.shape,
    artifacts: z.array(typedDocumentArtifactDtoSchema).max(1),
  })
  .strict();

const typedSoftwareRevisionDtoSchema = typedSoftwareDraftSchema
  .safeExtend({
    ...typedRevisionBaseSchema.shape,
    artifacts: typedSoftwareArtifactsSchema,
  })
  .strict();

export const typedDownloadResourceRevisionDtoSchema = z.discriminatedUnion(
  "kind",
  [typedDocumentRevisionDtoSchema, typedSoftwareRevisionDtoSchema],
);

const typedAdminResourceBaseSchema = z
  .object({
    id: idSchema,
    key: keySchema,
    adminLabel: adminLabelSchema,
    state: z.enum(DOWNLOAD_RESOURCE_STATES),
    adminStatus: z.enum(DOWNLOAD_RESOURCE_ADMIN_STATUSES),
    rowVersion: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const typedDownloadResourceAdminDtoSchema = z.discriminatedUnion(
  "kind",
  [
    typedAdminResourceBaseSchema
      .safeExtend({
        kind: z.literal("document"),
        publishedRevision: typedDocumentRevisionDtoSchema.nullable(),
        draftRevision: typedDocumentRevisionDtoSchema.nullable(),
      })
      .strict(),
    typedAdminResourceBaseSchema
      .safeExtend({
        kind: z.literal("software"),
        publishedRevision: typedSoftwareRevisionDtoSchema.nullable(),
        draftRevision: typedSoftwareRevisionDtoSchema.nullable(),
      })
      .strict(),
  ],
);

const typedPublicBaseSchema = z
  .object({
    key: keySchema,
    name: nameSchema,
    product: productSchema,
    category: categorySchema,
    resourceType: resourceTypeSchema,
    description: descriptionSchema,
    sortOrder: z.number().int().min(0).max(10_000),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const typedPublicPlatformSchema = z
  .object({
    filename: filenameSchema,
    byteSize: z.number().int().positive(),
    downloadUrl: z.string().trim().min(1).max(2_048),
  })
  .strict();

export const downloadResourcePublicDtoSchema = z.discriminatedUnion("kind", [
  typedPublicBaseSchema
    .safeExtend({
      kind: z.literal("document"),
      previewPolicy: policySchema,
      downloadPolicy: policySchema,
      coverUrl: z.string().trim().min(1).max(2_048),
      pageCount: z.number().int().positive(),
      byteSize: z.number().int().positive(),
    })
    .strict()
    .refine(
      ({ previewPolicy, downloadPolicy }) =>
        previewPolicy === "public" || downloadPolicy === "contact",
      { path: ["downloadPolicy"], message: "Invalid access policy pair" },
    ),
  typedPublicBaseSchema
    .safeExtend({
      kind: z.literal("software"),
      releaseVersion: releaseVersionSchema,
      platforms: z
        .object({
          windows: typedPublicPlatformSchema.nullable(),
          macos: typedPublicPlatformSchema.nullable(),
        })
        .strict()
        .refine(({ windows, macos }) => windows !== null || macos !== null, {
          message: "Software resources require a platform artifact",
        }),
    })
    .strict(),
]);

export type MutateDownloadResourceInput = z.infer<
  typeof mutateDownloadResourceInputSchema
>;
export type AdminDownloadQuery = z.infer<typeof adminDownloadQuerySchema>;
export type DownloadResourcePublicDto = z.infer<
  typeof downloadResourcePublicDtoSchema
>;
export type TypedCreateDownloadResourceInput = z.infer<
  typeof typedCreateDownloadResourceInputSchema
>;
export type TypedSaveDownloadDraftInput = z.infer<
  typeof typedSaveDownloadDraftInputSchema
>;
export type TypedDownloadResourceRevisionDto = z.infer<
  typeof typedDownloadResourceRevisionDtoSchema
>;
export type TypedDownloadResourceAdminDto = z.infer<
  typeof typedDownloadResourceAdminDtoSchema
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

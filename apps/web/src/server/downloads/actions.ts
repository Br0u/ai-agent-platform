import "server-only";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { AuthAccessError, requirePermission } from "../auth/access";
import {
  artifactSlotSchema,
  mutateDownloadResourceInputSchema,
  typedCreateDownloadResourceInputSchema,
  typedDownloadResourceAdminDtoSchema,
  typedSaveDownloadDraftInputSchema,
  type TypedDownloadResourceAdminDto,
} from "./contracts";
import { downloadResourceService } from "./service";

const INVALID = "字段值无效";
const LOGIN_REDIRECT = "/staff/login?returnTo=%2Fadmin%2Fdownloads" as const;
const PASSWORD_REDIRECT =
  "/staff/change-password?returnTo=%2Fadmin%2Fdownloads" as const;

type DownloadRequestContext = { ipAddress?: string; userAgent?: string };
export type DownloadResourceActionErrorState =
  | { kind: "validation_error"; fieldErrors: Record<string, string[]> }
  | {
      kind: "authentication_required";
      code: "AUTH_SESSION_REQUIRED" | "AUTH_REALM_MISMATCH";
      redirectTo: typeof LOGIN_REDIRECT;
    }
  | {
      kind: "account_setup_required";
      code: "AUTH_PASSWORD_CHANGE_REQUIRED";
      redirectTo: typeof PASSWORD_REDIRECT;
    }
  | {
      kind: "access_error";
      code:
        | "AUTH_PERMISSION_DENIED"
        | "AUTH_ACCOUNT_DISABLED"
        | "AUTH_ACCOUNT_NOT_ACTIVE";
    }
  | { kind: "conflict" }
  | { kind: "domain_error" }
  | { kind: "internal_error" };

export type TypedDownloadResourceActionState =
  | { kind: "idle" }
  | { kind: "success"; resource: TypedDownloadResourceAdminDto }
  | DownloadResourceActionErrorState;

type TypedDownloadActionsDependencies = {
  access: {
    requirePermission(permission: "admin:downloads"): Promise<unknown>;
  };
  cache: {
    revalidatePath(path: string, type?: "layout" | "page"): void;
    updateTag(tag: string): void;
  };
  getContext(): DownloadRequestContext;
  reportInternalError(incident: {
    event: "download_resource.action_internal_error";
    errorName: string;
  }): void;
};

type DownloadActionErrorDependencies = Pick<
  TypedDownloadActionsDependencies,
  "reportInternalError"
>;

type TypedDownloadActionsDependenciesWithService =
  TypedDownloadActionsDependencies & {
    service: {
      createTypedResource(
        input: unknown,
        context?: DownloadRequestContext,
      ): Promise<TypedDownloadResourceAdminDto>;
      saveTypedDraft(
        input: unknown,
        context?: DownloadRequestContext,
      ): Promise<{ dto: TypedDownloadResourceAdminDto }>;
      publishTyped(
        input: unknown,
        context?: DownloadRequestContext,
      ): Promise<{ dto: TypedDownloadResourceAdminDto }>;
      downlineTyped(
        input: unknown,
        context?: DownloadRequestContext,
      ): Promise<{ dto: TypedDownloadResourceAdminDto }>;
      discardTyped(
        input: unknown,
        context?: DownloadRequestContext,
      ): Promise<{ dto: TypedDownloadResourceAdminDto }>;
      removeDraftArtifact(
        input: unknown,
        context?: DownloadRequestContext,
      ): Promise<{ dto: TypedDownloadResourceAdminDto }>;
    };
  };

type Parsed<T, State = TypedDownloadResourceActionState> =
  | { success: true; data: T }
  | { success: false; state: State };

function read(
  formData: FormData,
  names: readonly string[],
):
  | { values: Record<string, string> }
  | { fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  const values: Record<string, string> = {};
  const allowed = new Set(names);
  for (const [name] of formData) {
    if (!allowed.has(name)) fieldErrors[name] = [INVALID];
  }
  for (const name of names) {
    const entries = formData.getAll(name);
    if (entries.length !== 1 || typeof entries[0] !== "string") {
      fieldErrors[name] = [INVALID];
      continue;
    }
    values[name] = entries[0];
  }
  return Object.keys(fieldErrors).length ? { fieldErrors } : { values };
}

function fieldErrors(error: z.ZodError) {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    result[field] ??= [INVALID];
  }
  return result;
}

function parsed<
  T,
  State extends {
    kind: "validation_error";
    fieldErrors: Record<string, string[]>;
  } = Extract<TypedDownloadResourceActionState, { kind: "validation_error" }>,
>(schema: z.ZodType<T>, value: unknown): Parsed<T, State> {
  const result = schema.safeParse(value);
  return result.success
    ? { success: true, data: result.data }
    : {
        success: false,
        state: {
          kind: "validation_error",
          fieldErrors: fieldErrors(result.error),
        } as State,
      };
}

function canonicalPositive(value: string): number | null {
  if (!/^[1-9][0-9]*$/u.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

function canonicalNonnegative(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

function safeErrorState(
  error: unknown,
  dependencies: DownloadActionErrorDependencies,
): DownloadResourceActionErrorState {
  if (error instanceof AuthAccessError) {
    if (
      error.code === "AUTH_SESSION_REQUIRED" ||
      error.code === "AUTH_REALM_MISMATCH"
    )
      return {
        kind: "authentication_required",
        code: error.code,
        redirectTo: LOGIN_REDIRECT,
      };
    if (error.code === "AUTH_PASSWORD_CHANGE_REQUIRED")
      return {
        kind: "account_setup_required",
        code: error.code,
        redirectTo: PASSWORD_REDIRECT,
      };
    return {
      kind: "access_error",
      code: error.code as
        | "AUTH_PERMISSION_DENIED"
        | "AUTH_ACCOUNT_DISABLED"
        | "AUTH_ACCOUNT_NOT_ACTIVE",
    };
  }
  if (
    error instanceof Error &&
    error.message === "DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT"
  )
    return { kind: "conflict" };
  if (
    error instanceof Error &&
    new Set([
      "DOWNLOAD_RESOURCE_NOT_PUBLISHABLE",
      "DOWNLOAD_RESOURCE_NOT_FOUND",
      "DOWNLOAD_RESOURCE_NOT_DOWNLINEABLE",
      "DOWNLOAD_RESOURCE_NO_DRAFT",
      "DOWNLOAD_RESOURCE_FILE_NOT_REMOVABLE",
    ]).has(error.message)
  )
    return { kind: "domain_error" };
  try {
    dependencies.reportInternalError({
      event: "download_resource.action_internal_error",
      errorName:
        error instanceof Error && /^[A-Za-z0-9_]{1,64}$/u.test(error.name)
          ? error.name
          : "UnknownError",
    });
  } catch {
    // Diagnostics must never change a safe action response.
  }
  return { kind: "internal_error" };
}

function invalidate(
  dependencies: Pick<
    TypedDownloadActionsDependencies,
    "cache" | "reportInternalError"
  >,
) {
  for (const operation of [
    () => dependencies.cache.revalidatePath("/admin/downloads"),
    () => dependencies.cache.updateTag("downloads"),
    () => dependencies.cache.revalidatePath("/downloads", "layout"),
  ]) {
    try {
      operation();
    } catch (error) {
      try {
        dependencies.reportInternalError({
          event: "download_resource.action_internal_error",
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      } catch {
        // Best-effort invalidation diagnostics only.
      }
    }
  }
}

function reportInternalError(incident: {
  event: "download_resource.action_internal_error";
  errorName: string;
}) {
  try {
    console.error(incident);
  } catch {
    // Console availability must not affect the action result.
  }
}

function typedCreateInput(
  formData: FormData,
): Parsed<
  z.infer<typeof typedCreateDownloadResourceInputSchema>,
  TypedDownloadResourceActionState
> {
  const result = read(formData, ["key", "adminLabel", "kind"]);
  if ("fieldErrors" in result)
    return { success: false, state: { kind: "validation_error", ...result } };
  return parsed<
    z.infer<typeof typedCreateDownloadResourceInputSchema>,
    Extract<TypedDownloadResourceActionState, { kind: "validation_error" }>
  >(typedCreateDownloadResourceInputSchema, result.values);
}

function typedDraftInput(
  formData: FormData,
): Parsed<
  z.infer<typeof typedSaveDownloadDraftInputSchema>,
  TypedDownloadResourceActionState
> {
  const kind = formData.get("kind");
  const names =
    kind === "document"
      ? [
          "id",
          "expectedRowVersion",
          "kind",
          "name",
          "product",
          "category",
          "resourceType",
          "description",
          "sortOrder",
          "previewPolicy",
          "downloadPolicy",
        ]
      : kind === "software"
        ? [
            "id",
            "expectedRowVersion",
            "kind",
            "name",
            "product",
            "category",
            "resourceType",
            "description",
            "sortOrder",
            "releaseVersion",
          ]
        : null;
  if (!names)
    return {
      success: false,
      state: { kind: "validation_error", fieldErrors: { kind: [INVALID] } },
    };
  const result = read(formData, names);
  if ("fieldErrors" in result)
    return { success: false, state: { kind: "validation_error", ...result } };
  const expectedRowVersion = canonicalPositive(
    result.values.expectedRowVersion,
  );
  const sortOrder = canonicalNonnegative(result.values.sortOrder);
  const errors: Record<string, string[]> = {};
  if (expectedRowVersion === null) errors.expectedRowVersion = [INVALID];
  if (sortOrder === null) errors.sortOrder = [INVALID];
  if (Object.keys(errors).length)
    return {
      success: false,
      state: { kind: "validation_error", fieldErrors: errors },
    };
  return parsed<
    z.infer<typeof typedSaveDownloadDraftInputSchema>,
    Extract<TypedDownloadResourceActionState, { kind: "validation_error" }>
  >(typedSaveDownloadDraftInputSchema, {
    ...result.values,
    expectedRowVersion,
    sortOrder,
  });
}

function typedArtifactInput(formData: FormData): Parsed<
  z.infer<typeof mutateDownloadResourceInputSchema> & {
    slot: z.infer<typeof artifactSlotSchema>;
  },
  TypedDownloadResourceActionState
> {
  const result = read(formData, ["id", "expectedRowVersion", "slot"]);
  if ("fieldErrors" in result)
    return { success: false, state: { kind: "validation_error", ...result } };
  const expectedRowVersion = canonicalPositive(
    result.values.expectedRowVersion,
  );
  if (expectedRowVersion === null)
    return {
      success: false,
      state: {
        kind: "validation_error",
        fieldErrors: { expectedRowVersion: [INVALID] },
      },
    };
  return parsed<
    z.infer<typeof mutateDownloadResourceInputSchema> & {
      slot: z.infer<typeof artifactSlotSchema>;
    },
    Extract<TypedDownloadResourceActionState, { kind: "validation_error" }>
  >(
    mutateDownloadResourceInputSchema
      .safeExtend({ slot: artifactSlotSchema })
      .strict(),
    { ...result.values, expectedRowVersion },
  );
}

function typedMutationInput(
  formData: FormData,
): Parsed<
  z.infer<typeof mutateDownloadResourceInputSchema>,
  TypedDownloadResourceActionState
> {
  const result = read(formData, ["id", "expectedRowVersion"]);
  if ("fieldErrors" in result)
    return { success: false, state: { kind: "validation_error", ...result } };
  const expectedRowVersion = canonicalPositive(
    result.values.expectedRowVersion,
  );
  if (expectedRowVersion === null)
    return {
      success: false,
      state: {
        kind: "validation_error",
        fieldErrors: { expectedRowVersion: [INVALID] },
      },
    };
  return parsed<
    z.infer<typeof mutateDownloadResourceInputSchema>,
    Extract<TypedDownloadResourceActionState, { kind: "validation_error" }>
  >(mutateDownloadResourceInputSchema, {
    ...result.values,
    expectedRowVersion,
  });
}

export function createTypedDownloadResourceActions(
  dependencies: TypedDownloadActionsDependenciesWithService,
) {
  const fail = (error: unknown): DownloadResourceActionErrorState =>
    safeErrorState(error, dependencies);
  async function mutate(
    input: Parsed<
      z.infer<typeof mutateDownloadResourceInputSchema>,
      TypedDownloadResourceActionState
    >,
    mutation: (
      value: z.infer<typeof mutateDownloadResourceInputSchema>,
      context: DownloadRequestContext,
    ) => Promise<{ dto: TypedDownloadResourceAdminDto }>,
  ): Promise<TypedDownloadResourceActionState> {
    if (!input.success) return input.state;
    try {
      await dependencies.access.requirePermission("admin:downloads");
      const result = await mutation(input.data, dependencies.getContext());
      const resource = typedDownloadResourceAdminDtoSchema.parse(result.dto);
      invalidate(dependencies);
      return { kind: "success", resource };
    } catch (error) {
      return fail(error);
    }
  }
  return {
    async createTypedDownloadResourceAction(
      _previous: TypedDownloadResourceActionState,
      formData: FormData,
    ): Promise<TypedDownloadResourceActionState> {
      const parsedCreate = typedCreateInput(formData);
      if (!parsedCreate.success) return parsedCreate.state;
      try {
        await dependencies.access.requirePermission("admin:downloads");
        const resource = typedDownloadResourceAdminDtoSchema.parse(
          await dependencies.service.createTypedResource(
            parsedCreate.data,
            dependencies.getContext(),
          ),
        );
        invalidate(dependencies);
        return { kind: "success", resource };
      } catch (error) {
        return fail(error);
      }
    },
    async saveTypedDownloadDraftAction(
      _previous: TypedDownloadResourceActionState,
      formData: FormData,
    ): Promise<TypedDownloadResourceActionState> {
      const parsedDraft = typedDraftInput(formData);
      if (!parsedDraft.success) return parsedDraft.state;
      try {
        await dependencies.access.requirePermission("admin:downloads");
        const result = await dependencies.service.saveTypedDraft(
          parsedDraft.data,
          dependencies.getContext(),
        );
        const resource = typedDownloadResourceAdminDtoSchema.parse(result.dto);
        invalidate(dependencies);
        return { kind: "success", resource };
      } catch (error) {
        return fail(error);
      }
    },
    publishTypedDownloadResourceAction: (
      _previous: TypedDownloadResourceActionState,
      formData: FormData,
    ) =>
      mutate(typedMutationInput(formData), dependencies.service.publishTyped),
    downlineTypedDownloadResourceAction: (
      _previous: TypedDownloadResourceActionState,
      formData: FormData,
    ) =>
      mutate(typedMutationInput(formData), dependencies.service.downlineTyped),
    discardTypedDownloadDraftAction: (
      _previous: TypedDownloadResourceActionState,
      formData: FormData,
    ) =>
      mutate(typedMutationInput(formData), dependencies.service.discardTyped),
    removeDownloadDraftArtifactAction: (
      _previous: TypedDownloadResourceActionState,
      formData: FormData,
    ) => {
      const input = typedArtifactInput(formData);
      if (!input.success) return Promise.resolve(input.state);
      return mutate(input, dependencies.service.removeDraftArtifact);
    },
  };
}

export function createDefaultTypedDownloadResourceActions(
  context: DownloadRequestContext = {},
) {
  return createTypedDownloadResourceActions({
    service: downloadResourceService,
    access: { requirePermission },
    cache: { revalidatePath, updateTag },
    getContext: () => context,
    reportInternalError,
  });
}

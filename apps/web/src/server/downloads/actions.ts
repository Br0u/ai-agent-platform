import "server-only";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { AuthAccessError, requirePermission } from "../auth/access";
import {
  createDownloadResourceInputSchema,
  mutateDownloadResourceInputSchema,
  saveDownloadDraftInputSchema,
} from "./contracts";
import { downloadResourceService } from "./service";

const INVALID = "字段值无效";
const LOGIN_REDIRECT = "/staff/login?returnTo=%2Fadmin%2Fdownloads" as const;
const PASSWORD_REDIRECT =
  "/staff/change-password?returnTo=%2Fadmin%2Fdownloads" as const;

type DownloadRequestContext = { ipAddress?: string; userAgent?: string };
type DownloadMutationInput = z.infer<typeof mutateDownloadResourceInputSchema>;

export type DownloadResourceActionState =
  | { kind: "idle" }
  | { kind: "success" }
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

type DownloadActionService = {
  createResource(
    input: unknown,
    context?: DownloadRequestContext,
  ): Promise<unknown>;
  saveDraft(input: unknown, context?: DownloadRequestContext): Promise<unknown>;
  publish(input: unknown, context?: DownloadRequestContext): Promise<unknown>;
  downline(input: unknown, context?: DownloadRequestContext): Promise<unknown>;
  discardDraft(
    input: unknown,
    context?: DownloadRequestContext,
  ): Promise<unknown>;
  removeDraftFile(
    input: unknown,
    context?: DownloadRequestContext,
  ): Promise<unknown>;
};

type DownloadActionsDependencies = {
  service: DownloadActionService;
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

type Parsed<T> =
  | { success: true; data: T }
  | { success: false; state: DownloadResourceActionState };

export function createDownloadResourceActionState(): DownloadResourceActionState {
  return { kind: "idle" };
}

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

function parsed<T>(schema: z.ZodType<T>, value: unknown): Parsed<T> {
  const result = schema.safeParse(value);
  return result.success
    ? { success: true, data: result.data }
    : {
        success: false,
        state: {
          kind: "validation_error",
          fieldErrors: fieldErrors(result.error),
        },
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

function createInput(
  formData: FormData,
): Parsed<z.infer<typeof createDownloadResourceInputSchema>> {
  const result = read(formData, ["key", "adminLabel"]);
  if ("fieldErrors" in result)
    return { success: false, state: { kind: "validation_error", ...result } };
  return parsed(createDownloadResourceInputSchema, result.values);
}

function mutationInput(formData: FormData): Parsed<DownloadMutationInput> {
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
  return parsed(mutateDownloadResourceInputSchema, {
    ...result.values,
    expectedRowVersion,
  });
}

function draftInput(
  formData: FormData,
): Parsed<z.infer<typeof saveDownloadDraftInputSchema>> {
  const result = read(formData, [
    "id",
    "expectedRowVersion",
    "name",
    "product",
    "category",
    "resourceType",
    "description",
    "sortOrder",
    "previewPolicy",
    "downloadPolicy",
  ]);
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
  return parsed(saveDownloadDraftInputSchema, {
    ...result.values,
    expectedRowVersion,
    sortOrder,
  });
}

function safeErrorState(
  error: unknown,
  dependencies: DownloadActionsDependencies,
): DownloadResourceActionState {
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
    error.message.startsWith("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT")
  )
    return { kind: "conflict" };
  if (error instanceof Error && error.message.startsWith("DOWNLOAD_RESOURCE_"))
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

function invalidate(dependencies: DownloadActionsDependencies) {
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

export function createDownloadResourceActions(
  dependencies: DownloadActionsDependencies,
) {
  async function run<T>(
    input: Parsed<T>,
    mutation: (value: T, context: DownloadRequestContext) => Promise<unknown>,
  ): Promise<DownloadResourceActionState> {
    if (!input.success) return input.state;
    try {
      await dependencies.access.requirePermission("admin:downloads");
      await mutation(input.data, dependencies.getContext());
    } catch (error) {
      return safeErrorState(error, dependencies);
    }
    invalidate(dependencies);
    return { kind: "success" };
  }

  return {
    createDownloadResourceAction: (
      _previous: DownloadResourceActionState,
      formData: FormData,
    ) => run(createInput(formData), dependencies.service.createResource),
    saveDownloadDraftAction: (
      _previous: DownloadResourceActionState,
      formData: FormData,
    ) => run(draftInput(formData), dependencies.service.saveDraft),
    publishDownloadResourceAction: (
      _previous: DownloadResourceActionState,
      formData: FormData,
    ) => run(mutationInput(formData), dependencies.service.publish),
    downlineDownloadResourceAction: (
      _previous: DownloadResourceActionState,
      formData: FormData,
    ) => run(mutationInput(formData), dependencies.service.downline),
    discardDownloadDraftAction: (
      _previous: DownloadResourceActionState,
      formData: FormData,
    ) => run(mutationInput(formData), dependencies.service.discardDraft),
    removeDownloadDraftFileAction: (
      _previous: DownloadResourceActionState,
      formData: FormData,
    ) => run(mutationInput(formData), dependencies.service.removeDraftFile),
  };
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

export function createDefaultDownloadResourceActions(
  context: DownloadRequestContext = {},
) {
  return createDownloadResourceActions({
    service: downloadResourceService,
    access: { requirePermission },
    cache: { revalidatePath, updateTag },
    getContext: () => context,
    reportInternalError,
  });
}

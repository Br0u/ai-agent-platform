import "server-only";

import { revalidatePath, updateTag } from "next/cache";

import { DOCUMENT_LIMITS } from "@ai-agent-platform/document-content";

import {
  AuthAccessError,
  requirePermission,
  type AuthAccessErrorCode,
} from "../auth/access";
import {
  requireSensitiveWorkforceAction,
  SensitiveActionError,
} from "../auth/sensitive-action";
import {
  createDocumentInputSchema,
  DOCUMENT_ERROR_CODES,
  mutateDocumentInputSchema,
  saveDocumentInputSchema,
  type CreateDocumentInput,
  type DocumentErrorCode,
  type MutateDocumentInput,
  type SaveDocumentInput,
} from "./contracts";
import { createDatabaseDocumentRepository } from "./repository";
import { createDocumentService, type DocumentActor } from "./service";

const REAUTH_REDIRECT = "/staff/re-auth?returnTo=%2Fadmin%2Fdocs" as const;
const LOGIN_REDIRECT = "/staff/login?returnTo=%2Fadmin%2Fdocs" as const;
const PASSWORD_REDIRECT =
  "/staff/change-password?returnTo=%2Fadmin%2Fdocs" as const;
const TOTP_REDIRECT = "/staff/two-factor?returnTo=%2Fadmin%2Fdocs" as const;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const INVALID_FIELD_MESSAGE = "字段值无效";
const DOCUMENT_DOMAIN_CODES = new Set<string>(DOCUMENT_ERROR_CODES);
const SAFE_ERROR_NAMES = new Set([
  "Error",
  "AuthAccessError",
  "DocumentError",
  "SensitiveActionError",
]);
const SAFE_ERROR_CODE = /^(?:[0-9A-Z]{5}|[A-Z][A-Z0-9_]{1,63})$/u;

type SensitiveActionCode = "AUTH_REAUTH_REQUIRED" | "AUTH_MFA_REQUIRED";
type DocumentActionErrorCode = DocumentErrorCode | "DOCUMENT_INTERNAL_ERROR";
type AuthenticationRequiredCode =
  | "AUTH_SESSION_REQUIRED"
  | "AUTH_REALM_MISMATCH";
type AccountSetupRequiredCode =
  | "AUTH_PASSWORD_CHANGE_REQUIRED"
  | "AUTH_TOTP_SETUP_REQUIRED";
type SafeAccessErrorCode = Exclude<
  AuthAccessErrorCode,
  | AuthenticationRequiredCode
  | AccountSetupRequiredCode
  | "AUTH_PERMISSION_DENIED"
>;

export type DocumentActionState =
  | { kind: "idle" }
  | { kind: "success" }
  | { kind: "validation_error"; fieldErrors: Record<string, string[]> }
  | { kind: "domain_error"; code: DocumentActionErrorCode }
  | {
      kind: "authentication_required";
      code: AuthenticationRequiredCode;
      redirectTo: typeof LOGIN_REDIRECT;
    }
  | {
      kind: "account_setup_required";
      code: "AUTH_PASSWORD_CHANGE_REQUIRED";
      redirectTo: typeof PASSWORD_REDIRECT;
    }
  | {
      kind: "account_setup_required";
      code: "AUTH_TOTP_SETUP_REQUIRED";
      redirectTo: typeof TOTP_REDIRECT;
    }
  | { kind: "access_error"; code: SafeAccessErrorCode }
  | {
      kind: "reauth_required";
      code: SensitiveActionCode;
      redirectTo: typeof REAUTH_REDIRECT;
    };

type DocumentActionService = {
  create(
    input: CreateDocumentInput,
    actor: DocumentActor,
  ): Promise<{ id: string }>;
  save(input: SaveDocumentInput, actor: DocumentActor): Promise<{ id: string }>;
  publish(
    input: MutateDocumentInput,
    actor: DocumentActor,
  ): Promise<{ id: string }>;
  archive(
    input: MutateDocumentInput,
    actor: DocumentActor,
  ): Promise<{ id: string }>;
  delete(
    input: MutateDocumentInput,
    actor: DocumentActor,
  ): Promise<{ id: string }>;
  restore(
    input: MutateDocumentInput,
    actor: DocumentActor,
  ): Promise<{ id: string }>;
};

export type DocumentActionIncident = Readonly<{
  event: "document.action_internal_error";
  errorName: string;
  code: string;
}>;

type DocumentActionsDependencies = {
  service: DocumentActionService;
  access: {
    requirePermission(permission: "admin:docs"): Promise<DocumentActor>;
    requireSensitivePermission(
      permission: "admin:docs" | "admin:docs:delete",
    ): Promise<DocumentActor>;
  };
  cache: {
    revalidatePath(path: string, type?: "layout" | "page"): void;
    updateTag(tag: string): void;
  };
  reportInternalError(incident: DocumentActionIncident): void;
};

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; state: DocumentActionState };

const DRAFT_FIELDS = [
  "slug",
  "title",
  "summary",
  "source",
  "navigationLabel",
  "navigationCode",
  "navigationPosition",
] as const;
const MUTATION_FIELDS = [
  "id",
  "expectedRevision",
  "expectedRowVersion",
] as const;

function readUniqueStrings(
  formData: FormData,
  fields: readonly string[],
): {
  values: Record<string, string | undefined>;
  fieldErrors: Record<string, string[]>;
} {
  const values: Record<string, string | undefined> = {};
  const fieldErrors: Record<string, string[]> = {};
  for (const field of fields) {
    const matches = formData.getAll(field);
    if (matches.length !== 1 || typeof matches[0] !== "string") {
      fieldErrors[field] = [INVALID_FIELD_MESSAGE];
      continue;
    }
    values[field] = matches[0];
  }
  return { values, fieldErrors };
}

function addCanonicalIntegerError(
  values: Record<string, string | undefined>,
  fieldErrors: Record<string, string[]>,
  field: string,
  minimum: 0 | 1,
  maximum: number,
): void {
  const value = values[field];
  if (value === undefined || !/^\d+$/u.test(value)) {
    fieldErrors[field] = [INVALID_FIELD_MESSAGE];
    return;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    fieldErrors[field] = [INVALID_FIELD_MESSAGE];
  }
}

function zodFieldName(path: PropertyKey[]): string {
  if (path[0] !== "navigation") return String(path[0] ?? "form");
  return (
    {
      label: "navigationLabel",
      code: "navigationCode",
      position: "navigationPosition",
    }[String(path[1])] ?? "navigation"
  );
}

function schemaFieldErrors(issues: ReadonlyArray<{ path: PropertyKey[] }>) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = zodFieldName(issue.path);
    fieldErrors[field] ??= [INVALID_FIELD_MESSAGE];
  }
  return fieldErrors;
}

function invalidState(
  fieldErrors: Record<string, string[]>,
): ParseResult<never> {
  return {
    success: false,
    state: { kind: "validation_error", fieldErrors },
  };
}

function readDraftFields(formData: FormData) {
  const result = readUniqueStrings(formData, DRAFT_FIELDS);
  addCanonicalIntegerError(
    result.values,
    result.fieldErrors,
    "navigationPosition",
    0,
    DOCUMENT_LIMITS.position,
  );
  return result;
}

function parseDraftForm(formData: FormData): ParseResult<CreateDocumentInput> {
  const { values, fieldErrors } = readDraftFields(formData);
  if (Object.keys(fieldErrors).length) return invalidState(fieldErrors);

  const parsed = createDocumentInputSchema.safeParse(draftCandidate(values));
  if (!parsed.success)
    return invalidState(schemaFieldErrors(parsed.error.issues));
  return { success: true, data: parsed.data };
}

function draftCandidate(values: Record<string, string | undefined>) {
  return {
    slug: values.slug,
    title: values.title,
    summary: values.summary,
    source: values.source,
    navigation: {
      label: values.navigationLabel,
      code: values.navigationCode,
      position: values.navigationPosition,
    },
  };
}

function readMutationFields(formData: FormData) {
  const result = readUniqueStrings(formData, MUTATION_FIELDS);
  addCanonicalIntegerError(
    result.values,
    result.fieldErrors,
    "expectedRevision",
    1,
    MAX_DATABASE_INTEGER,
  );
  addCanonicalIntegerError(
    result.values,
    result.fieldErrors,
    "expectedRowVersion",
    1,
    MAX_DATABASE_INTEGER,
  );
  return result;
}

function parseMutationForm(
  formData: FormData,
): ParseResult<MutateDocumentInput> {
  const { values, fieldErrors } = readMutationFields(formData);
  if (Object.keys(fieldErrors).length) return invalidState(fieldErrors);
  const parsed = mutateDocumentInputSchema.safeParse(values);
  if (!parsed.success)
    return invalidState(schemaFieldErrors(parsed.error.issues));
  return { success: true, data: parsed.data };
}

function parseSaveForm(formData: FormData): ParseResult<SaveDocumentInput> {
  const draft = readDraftFields(formData);
  const mutation = readMutationFields(formData);
  const fieldErrors = { ...draft.fieldErrors, ...mutation.fieldErrors };
  if (Object.keys(fieldErrors).length) return invalidState(fieldErrors);
  const parsed = saveDocumentInputSchema.safeParse({
    ...draftCandidate(draft.values),
    ...mutation.values,
  });
  if (!parsed.success)
    return invalidState(schemaFieldErrors(parsed.error.issues));
  return { success: true, data: parsed.data };
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function internalIncident(error: unknown): DocumentActionIncident {
  const name =
    error instanceof Error && SAFE_ERROR_NAMES.has(error.name)
      ? error.name
      : "UnknownError";
  const code = errorCode(error);
  return Object.freeze({
    event: "document.action_internal_error",
    errorName: name,
    code: code && SAFE_ERROR_CODE.test(code) ? code : "UNCLASSIFIED",
  });
}

function reportSafely(
  report: DocumentActionsDependencies["reportInternalError"],
  error: unknown,
): void {
  try {
    report(internalIncident(error));
  } catch {
    // Diagnostics must never change the stable public action result.
  }
}

function errorState(
  error: unknown,
  report: DocumentActionsDependencies["reportInternalError"],
): DocumentActionState {
  if (error instanceof AuthAccessError) {
    switch (error.code) {
      case "AUTH_PERMISSION_DENIED":
        return { kind: "domain_error", code: error.code };
      case "AUTH_SESSION_REQUIRED":
      case "AUTH_REALM_MISMATCH":
        return {
          kind: "authentication_required",
          code: error.code,
          redirectTo: LOGIN_REDIRECT,
        };
      case "AUTH_PASSWORD_CHANGE_REQUIRED":
        return {
          kind: "account_setup_required",
          code: error.code,
          redirectTo: PASSWORD_REDIRECT,
        };
      case "AUTH_TOTP_SETUP_REQUIRED":
        return {
          kind: "account_setup_required",
          code: error.code,
          redirectTo: TOTP_REDIRECT,
        };
      default:
        return { kind: "access_error", code: error.code };
    }
  }
  if (error instanceof SensitiveActionError) {
    return {
      kind: "reauth_required",
      code: error.code,
      redirectTo: REAUTH_REDIRECT,
    };
  }
  const code = errorCode(error);
  if (code && DOCUMENT_DOMAIN_CODES.has(code)) {
    return { kind: "domain_error", code: code as DocumentErrorCode };
  }
  reportSafely(report, error);
  return { kind: "domain_error", code: "DOCUMENT_INTERNAL_ERROR" };
}

function attemptInvalidation(
  invalidate: () => void,
  report: DocumentActionsDependencies["reportInternalError"],
): void {
  try {
    invalidate();
  } catch (error) {
    reportSafely(report, error);
  }
}

export function createDocumentActions(
  dependencies: DocumentActionsDependencies,
) {
  async function runMutation<T>(input: {
    parsed: ParseResult<T>;
    authorize: () => Promise<DocumentActor>;
    mutate: (data: T, actor: DocumentActor) => Promise<{ id: string }>;
    invalidatePublic: boolean;
  }): Promise<DocumentActionState> {
    if (!input.parsed.success) return input.parsed.state;
    try {
      const actor = await input.authorize();
      await input.mutate(input.parsed.data, actor);
    } catch (error) {
      return errorState(error, dependencies.reportInternalError);
    }
    attemptInvalidation(
      () => dependencies.cache.revalidatePath("/admin/docs"),
      dependencies.reportInternalError,
    );
    if (input.invalidatePublic) {
      attemptInvalidation(
        () => dependencies.cache.updateTag("documents"),
        dependencies.reportInternalError,
      );
      attemptInvalidation(
        () => dependencies.cache.revalidatePath("/docs", "layout"),
        dependencies.reportInternalError,
      );
    }
    return { kind: "success" };
  }

  function createDocumentAction(
    _previous: DocumentActionState,
    formData: FormData,
  ) {
    return runMutation({
      parsed: parseDraftForm(formData),
      authorize: () => dependencies.access.requirePermission("admin:docs"),
      mutate: dependencies.service.create,
      invalidatePublic: false,
    });
  }

  function saveDocumentAction(
    _previous: DocumentActionState,
    formData: FormData,
  ) {
    return runMutation({
      parsed: parseSaveForm(formData),
      authorize: () => dependencies.access.requirePermission("admin:docs"),
      mutate: dependencies.service.save,
      invalidatePublic: false,
    });
  }

  function sensitiveMutation(
    formData: FormData,
    permission: "admin:docs" | "admin:docs:delete",
    mutate: DocumentActionService["publish" | "archive" | "delete" | "restore"],
  ) {
    return runMutation({
      parsed: parseMutationForm(formData),
      authorize: () =>
        dependencies.access.requireSensitivePermission(permission),
      mutate,
      invalidatePublic: true,
    });
  }

  function publishDocumentAction(
    _previous: DocumentActionState,
    formData: FormData,
  ) {
    return sensitiveMutation(
      formData,
      "admin:docs",
      dependencies.service.publish,
    );
  }

  function archiveDocumentAction(
    _previous: DocumentActionState,
    formData: FormData,
  ) {
    return sensitiveMutation(
      formData,
      "admin:docs",
      dependencies.service.archive,
    );
  }

  function deleteDocumentAction(
    _previous: DocumentActionState,
    formData: FormData,
  ) {
    return sensitiveMutation(
      formData,
      "admin:docs:delete",
      dependencies.service.delete,
    );
  }

  function restoreDocumentAction(
    _previous: DocumentActionState,
    formData: FormData,
  ) {
    return sensitiveMutation(
      formData,
      "admin:docs:delete",
      dependencies.service.restore,
    );
  }

  return {
    createDocumentAction,
    saveDocumentAction,
    publishDocumentAction,
    archiveDocumentAction,
    deleteDocumentAction,
    restoreDocumentAction,
  };
}

function reportDocumentInternalError(incident: DocumentActionIncident): void {
  try {
    console.error(incident);
  } catch {
    // A failed diagnostics sink must never change the public action result.
  }
}

function createDefaultDocumentActions() {
  return createDocumentActions({
    service: createDocumentService(createDatabaseDocumentRepository()),
    access: {
      requirePermission,
      requireSensitivePermission: requireSensitiveWorkforceAction,
    },
    cache: { revalidatePath, updateTag },
    reportInternalError: reportDocumentInternalError,
  });
}

export async function createDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  "use server";
  return createDefaultDocumentActions().createDocumentAction(
    previous,
    formData,
  );
}

export async function saveDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  "use server";
  return createDefaultDocumentActions().saveDocumentAction(previous, formData);
}

export async function publishDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  "use server";
  return createDefaultDocumentActions().publishDocumentAction(
    previous,
    formData,
  );
}

export async function archiveDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  "use server";
  return createDefaultDocumentActions().archiveDocumentAction(
    previous,
    formData,
  );
}

export async function deleteDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  "use server";
  return createDefaultDocumentActions().deleteDocumentAction(
    previous,
    formData,
  );
}

export async function restoreDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  "use server";
  return createDefaultDocumentActions().restoreDocumentAction(
    previous,
    formData,
  );
}

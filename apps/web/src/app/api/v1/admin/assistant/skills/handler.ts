import {
  isCanonicalAdminSkillPath,
  type AdminSkillPermissionFlags,
} from "@/features/assistant/admin-skill-contract";
import {
  AuthAccessError,
  requirePermission,
  type AccessService,
  type WorkforceActor,
} from "@/server/auth/access";
import { createAuditWriter } from "@/server/auth/audit";
import {
  SensitiveActionError,
  requireSensitiveWorkforceActionEvidence,
} from "@/server/auth/sensitive-action";
import {
  AdminSkillCommandError,
  createAdminSkillCommands,
  type AdminSkillReviewInput,
  type AuthorizedSkillCommand,
} from "@/server/assistant/admin-skill-commands";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import {
  SkillRegistryClientError,
  createSkillRegistryClient,
  resolveSkillRegistrySettings,
  type SkillRegistryClient,
} from "@/server/assistant/skill-registry-client";
import {
  MutationRequestError,
  requireTrustedJsonMutation,
  requireTrustedMultipartMutation,
} from "@/server/http/require-trusted-mutation";
import { cancelUnreadRequestBody } from "@/server/http/cancel-request-body";
import {
  BoundedMultipartError,
  readBoundedSkillUploadMultipart,
  type BoundedSkillUpload,
} from "@/server/http/read-bounded-multipart";
import {
  readBoundedJson,
  type JsonReadResult,
} from "@/server/http/read-bounded-json";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX_REVIEW_BODY_BYTES = 8 * 1024;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;

type PublicSkillErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "reauth_required"
  | "validation_error"
  | "payload_too_large"
  | "not_found"
  | "review_denied"
  | "state_conflict"
  | "registry_bad_gateway"
  | "registry_unavailable";

const ERROR_MESSAGES: Readonly<Record<PublicSkillErrorCode, string>> = {
  authentication_required: "Authentication required",
  permission_denied: "Permission denied",
  reauth_required: "Recent password and MFA verification required",
  validation_error: "Invalid skill request",
  payload_too_large: "Skill upload is too large",
  not_found: "Skill revision was not found",
  review_denied: "Skill review is not allowed",
  state_conflict: "Skill revision state has changed",
  registry_bad_gateway: "Skill Registry returned an invalid response",
  registry_unavailable: "Skill Registry is unavailable",
};

type PublicError = {
  code: PublicSkillErrorCode;
  status: number;
};

type DynamicRevisionContext = {
  params: Promise<{ skillId: string; revisionId: string }>;
};

type DynamicFileContext = {
  params: Promise<{ skillId: string; revisionId: string; path: string[] }>;
};

type SkillCommands = ReturnType<typeof createAdminSkillCommands>;

function defaultRegistryClient(): SkillRegistryClient {
  return createSkillRegistryClient({
    settings: resolveSkillRegistrySettings({
      NODE_ENV: process.env.NODE_ENV,
      SKILL_REGISTRY_ALLOW_LOOPBACK: process.env.SKILL_REGISTRY_ALLOW_LOOPBACK,
      SKILL_REGISTRY_INTERNAL_URL: process.env.SKILL_REGISTRY_INTERNAL_URL,
      SKILL_REGISTRY_CONTROL_KEY: process.env.SKILL_REGISTRY_CONTROL_KEY,
      OS_SECURITY_KEY: process.env.OS_SECURITY_KEY,
      AGENT_CONFIG_CONTROL_KEY: process.env.AGENT_CONFIG_CONTROL_KEY,
    }),
  });
}

function createDefaultCommands(): SkillCommands {
  let client: SkillRegistryClient | undefined;
  let audit: ReturnType<typeof createAuditWriter> | undefined;
  const lazyClient: SkillRegistryClient = {
    listSkills: (input) =>
      (client ??= defaultRegistryClient()).listSkills(input),
    getRevision: (input) =>
      (client ??= defaultRegistryClient()).getRevision(input),
    getFile: (input) => (client ??= defaultRegistryClient()).getFile(input),
    uploadSkill: (input) =>
      (client ??= defaultRegistryClient()).uploadSkill(input),
    reviewRevision: (input) =>
      (client ??= defaultRegistryClient()).reviewRevision(input),
  };
  return createAdminSkillCommands({
    requireTrustedUploadMutation: requireTrustedMultipartMutation,
    requireTrustedJsonMutation,
    requirePermission,
    requireSensitiveAction: requireSensitiveWorkforceActionEvidence,
    audit: { write: (input) => (audit ??= createAuditWriter()).write(input) },
    client: lazyClient,
  });
}

function errorBody(requestId: string, code: PublicSkillErrorCode) {
  return {
    version: "1" as const,
    requestId,
    error: {
      code,
      message: ERROR_MESSAGES[code],
      retryable:
        code === "registry_bad_gateway" || code === "registry_unavailable",
    },
    ...(code === "reauth_required" ? { redirectTo: "/staff/re-auth" } : {}),
  };
}

function classifyError(error: unknown): PublicError {
  if (error instanceof MutationRequestError) {
    return { code: "permission_denied", status: 403 };
  }
  if (error instanceof BoundedMultipartError) {
    return error.code === "invalid_multipart"
      ? { code: "validation_error", status: 400 }
      : { code: "payload_too_large", status: 413 };
  }
  if (error instanceof AuthAccessError) {
    return {
      code:
        error.status === 401 ? "authentication_required" : "permission_denied",
      status: error.status,
    };
  }
  if (error instanceof SensitiveActionError) {
    return { code: "reauth_required", status: 401 };
  }
  if (error instanceof AdminSkillCommandError) {
    if (error.code === "authorization_failed") {
      return { code: "permission_denied", status: 403 };
    }
    if (error.code === "validation_error") {
      return { code: "validation_error", status: 400 };
    }
    return { code: "registry_unavailable", status: 503 };
  }
  if (error instanceof SkillRegistryClientError) {
    if (error.code === "ARCHIVE_TOO_LARGE") {
      return { code: "payload_too_large", status: 413 };
    }
    if (
      error.code === "SKILL_NOT_FOUND" ||
      error.code === "REVISION_NOT_FOUND" ||
      error.code === "FILE_NOT_FOUND"
    ) {
      return { code: "not_found", status: 404 };
    }
    if (error.code === "REVIEW_SELF_APPROVAL_DENIED") {
      return { code: "review_denied", status: 403 };
    }
    if (
      error.code === "REVISION_STATE_CONFLICT" ||
      error.code === "REVIEW_BLOCKED" ||
      error.code === "SKILL_NAME_CONFLICT" ||
      error.code === "ASSERTION_REPLAY"
    ) {
      return { code: "state_conflict", status: 409 };
    }
    if (
      error.code === "invalid_request" ||
      error.code === "VALIDATION_ERROR" ||
      error.code.startsWith("ARCHIVE_") ||
      error.code === "MANIFEST_INVALID" ||
      error.code === "SKILL_BINARY_FILE" ||
      error.code === "SKILL_FILE_NOT_UTF8" ||
      error.code === "SKILL_FILE_TOO_LARGE" ||
      error.code === "SKILL_SCRIPT_SHEBANG_UNSUPPORTED"
    ) {
      return { code: "validation_error", status: 400 };
    }
    if (
      error.code === "invalid_response" ||
      error.code === "response_too_large" ||
      error.code === "RESPONSE_TOO_LARGE"
    ) {
      return { code: "registry_bad_gateway", status: 502 };
    }
  }
  return { code: "registry_unavailable", status: 503 };
}

function errorResponse(error: unknown, requestId: string): Response {
  const mapped = classifyError(error);
  return Response.json(errorBody(requestId, mapped.code), {
    status: mapped.status,
    headers: NO_STORE_HEADERS,
  });
}

function permissionFlags(actor: WorkforceActor): AdminSkillPermissionFlags {
  return {
    canUpload: actor.permissions.includes("admin:assistant:skills:upload"),
    canManageConnections: actor.permissions.includes(
      "admin:assistant:skills:connections",
    ),
    canReview: actor.permissions.includes("admin:assistant:skills:review"),
    canConfigure: actor.permissions.includes(
      "admin:assistant:skills:configure",
    ),
  };
}

function parsePagination(
  request: Request,
): { limit: number; offset: number } | null {
  try {
    const parameters = new URL(request.url).searchParams;
    if (
      [...parameters.keys()].some((key) => key !== "limit" && key !== "offset")
    ) {
      return null;
    }
    const limits = parameters.getAll("limit");
    const offsets = parameters.getAll("offset");
    if (limits.length > 1 || offsets.length > 1) return null;
    const rawLimit = limits[0] ?? "25";
    const rawOffset = offsets[0] ?? "0";
    if (
      !/^[1-9][0-9]{0,2}$/u.test(rawLimit) ||
      !/^(?:0|[1-9][0-9]{0,6})$/u.test(rawOffset)
    ) {
      return null;
    }
    const limit = Number(rawLimit);
    const offset = Number(rawOffset);
    return limit <= 100 && offset <= 1_000_000 ? { limit, offset } : null;
  } catch {
    return null;
  }
}

function exactRevisionParams(
  value: unknown,
): { skillId: string; revisionId: string } | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return null;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 2 ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (key !== "skillId" && key !== "revisionId"),
      )
    )
      return null;
    const skill = Reflect.getOwnPropertyDescriptor(value, "skillId");
    const revision = Reflect.getOwnPropertyDescriptor(value, "revisionId");
    if (
      skill === undefined ||
      !("value" in skill) ||
      revision === undefined ||
      !("value" in revision) ||
      typeof skill.value !== "string" ||
      !UUID.test(skill.value) ||
      typeof revision.value !== "string" ||
      !UUID.test(revision.value)
    )
      return null;
    return { skillId: skill.value, revisionId: revision.value };
  } catch {
    return null;
  }
}

function exactFileParams(value: unknown): {
  skillId: string;
  revisionId: string;
  path: string[];
} | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 3 ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (key !== "skillId" && key !== "revisionId" && key !== "path"),
      )
    ) {
      return null;
    }
    const skill = Reflect.getOwnPropertyDescriptor(value, "skillId");
    const revision = Reflect.getOwnPropertyDescriptor(value, "revisionId");
    const path = Reflect.getOwnPropertyDescriptor(value, "path");
    if (
      skill === undefined ||
      !("value" in skill) ||
      revision === undefined ||
      !("value" in revision) ||
      path === undefined ||
      !("value" in path) ||
      typeof skill.value !== "string" ||
      !UUID.test(skill.value) ||
      typeof revision.value !== "string" ||
      !UUID.test(revision.value) ||
      !Array.isArray(path.value) ||
      Reflect.getPrototypeOf(path.value) !== Array.prototype
    ) {
      return null;
    }
    const segments: string[] = [];
    if (path.value.length < 1 || path.value.length > 32) return null;
    const ownPathKeys = Reflect.ownKeys(path.value);
    if (ownPathKeys.length !== path.value.length + 1) return null;
    for (let index = 0; index < path.value.length; index += 1) {
      const segment = Reflect.getOwnPropertyDescriptor(
        path.value,
        String(index),
      );
      if (
        segment === undefined ||
        !("value" in segment) ||
        typeof segment.value !== "string"
      ) {
        return null;
      }
      segments.push(segment.value);
    }
    return {
      skillId: skill.value,
      revisionId: revision.value,
      path: segments,
    };
  } catch {
    return null;
  }
}

function hasOnlyPairedSurrogates(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function parseReviewBody(
  value: unknown,
): Omit<AdminSkillReviewInput, "skillId" | "revisionId"> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return null;
    const input = value as Record<string, unknown>;
    const keys = Reflect.ownKeys(input);
    const expected = ["decision", "reason", "expectedState", "attestations"];
    if (
      keys.length !== expected.length ||
      keys.some((key) => typeof key !== "string" || !expected.includes(key))
    )
      return null;
    for (const key of expected) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      )
        return null;
    }
    const attestations = input.attestations;
    if (
      typeof attestations !== "object" ||
      attestations === null ||
      Array.isArray(attestations)
    )
      return null;
    const attestationKeys = [
      "contentReviewed",
      "usageRightsConfirmed",
      "executionRiskAccepted",
      "independentReviewerConfirmed",
    ];
    const actualAttestationKeys = Reflect.ownKeys(attestations);
    if (
      actualAttestationKeys.length !== 4 ||
      actualAttestationKeys.some(
        (key) => typeof key !== "string" || !attestationKeys.includes(key),
      )
    )
      return null;
    for (const key of attestationKeys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(attestations, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.value !== true
      )
        return null;
    }
    if (
      (input.decision !== "approve" && input.decision !== "reject") ||
      input.expectedState !== "pending_review" ||
      (input.decision === "approve" && input.reason !== null) ||
      (input.decision === "reject" &&
        (typeof input.reason !== "string" ||
          input.reason.trim() !== input.reason ||
          input.reason.length === 0 ||
          Array.from(input.reason).length > 500 ||
          Buffer.byteLength(input.reason, "utf8") > 2_048 ||
          !hasOnlyPairedSurrogates(input.reason) ||
          CONTROL_CHARACTER.test(input.reason)))
    )
      return null;
    return {
      decision: input.decision,
      reason: input.reason as string | null,
      expectedState: "pending_review",
      attestations: {
        contentReviewed: true,
        usageRightsConfirmed: true,
        executionRiskAccepted: true,
        independentReviewerConfirmed: true,
      },
    };
  } catch {
    return null;
  }
}

const defaultReadDependencies = {
  access: { requirePermission },
  requestIdFactory: () => crypto.randomUUID(),
};

function publicRequestId(request: Request, factory: () => string): string {
  try {
    return resolveAssistantRequestId(request, factory);
  } catch {
    return crypto.randomUUID();
  }
}

function registryRequestId(factory: () => string): string {
  try {
    const requestId = factory();
    if (!UUID.test(requestId)) throw new Error();
    return requestId;
  } catch {
    throw new AdminSkillCommandError("registry_unavailable");
  }
}

export function createAdminSkillListHandler(
  overrides: {
    access?: Pick<AccessService, "requirePermission">;
    client?: Pick<SkillRegistryClient, "listSkills">;
    requestIdFactory?: () => string;
  } = {},
) {
  const dependencies = { ...defaultReadDependencies, ...overrides };
  return async function GET(request: Request): Promise<Response> {
    const requestId = publicRequestId(request, dependencies.requestIdFactory);
    let actor: WorkforceActor;
    try {
      actor = await dependencies.access.requirePermission(
        "admin:assistant:skills",
      );
    } catch (error) {
      return errorResponse(error, requestId);
    }
    const page = parsePagination(request);
    if (page === null)
      return errorResponse(
        new AdminSkillCommandError("validation_error"),
        requestId,
      );
    try {
      const client = dependencies.client ?? defaultRegistryClient();
      const response = await client.listSkills({
        actor: actor.userId,
        requestId: registryRequestId(dependencies.requestIdFactory),
        ...page,
      });
      return Response.json(
        { ...response, requestId, permissions: permissionFlags(actor) },
        { headers: NO_STORE_HEADERS },
      );
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

export function createAdminSkillRevisionHandler(
  overrides: {
    access?: Pick<AccessService, "requirePermission">;
    client?: Pick<SkillRegistryClient, "getRevision">;
    requestIdFactory?: () => string;
  } = {},
) {
  const dependencies = { ...defaultReadDependencies, ...overrides };
  return async function GET(
    request: Request,
    routeContext: DynamicRevisionContext,
  ): Promise<Response> {
    const requestId = publicRequestId(request, dependencies.requestIdFactory);
    let actor: WorkforceActor;
    try {
      actor = await dependencies.access.requirePermission(
        "admin:assistant:skills:review",
      );
    } catch (error) {
      return errorResponse(error, requestId);
    }
    let params: { skillId: string; revisionId: string } | null = null;
    try {
      params = exactRevisionParams(await routeContext.params);
    } catch {
      params = null;
    }
    if (params === null)
      return errorResponse(
        new AdminSkillCommandError("validation_error"),
        requestId,
      );
    try {
      const client = dependencies.client ?? defaultRegistryClient();
      const response = await client.getRevision({
        actor: actor.userId,
        requestId: registryRequestId(dependencies.requestIdFactory),
        ...params,
      });
      return Response.json(
        { ...response, requestId },
        { headers: NO_STORE_HEADERS },
      );
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

export function createAdminSkillFileHandler(
  overrides: {
    access?: Pick<AccessService, "requirePermission">;
    client?: Pick<SkillRegistryClient, "getFile">;
    requestIdFactory?: () => string;
  } = {},
) {
  const dependencies = { ...defaultReadDependencies, ...overrides };
  return async function GET(
    request: Request,
    routeContext: DynamicFileContext,
  ): Promise<Response> {
    const requestId = publicRequestId(request, dependencies.requestIdFactory);
    let actor: WorkforceActor;
    try {
      actor = await dependencies.access.requirePermission(
        "admin:assistant:skills:review",
      );
    } catch (error) {
      return errorResponse(error, requestId);
    }
    let value: Awaited<DynamicFileContext["params"]> | null = null;
    try {
      value = await routeContext.params;
    } catch {
      value = null;
    }
    const fileParams = exactFileParams(value);
    const segments = fileParams?.path;
    if (
      fileParams === null ||
      !Array.isArray(segments) ||
      segments.some(
        (segment) =>
          typeof segment !== "string" ||
          segment.length === 0 ||
          segment === "." ||
          segment === ".." ||
          segment.includes("/") ||
          segment.includes("\\"),
      )
    )
      return errorResponse(
        new AdminSkillCommandError("validation_error"),
        requestId,
      );
    const path = segments.join("/");
    if (!isCanonicalAdminSkillPath(path))
      return errorResponse(
        new AdminSkillCommandError("validation_error"),
        requestId,
      );
    try {
      const client = dependencies.client ?? defaultRegistryClient();
      const response = await client.getFile({
        actor: actor.userId,
        requestId: registryRequestId(dependencies.requestIdFactory),
        skillId: fileParams.skillId,
        revisionId: fileParams.revisionId,
        path,
      });
      return Response.json(
        { ...response, requestId },
        { headers: NO_STORE_HEADERS },
      );
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

export function createAdminSkillUploadHandler(
  overrides: {
    commands?: Pick<SkillCommands, "authorize" | "upload">;
    readMultipart?: (request: Request) => Promise<BoundedSkillUpload>;
    requestIdFactory?: () => string;
  } = {},
) {
  const readMultipart =
    overrides.readMultipart ?? readBoundedSkillUploadMultipart;
  const requestIdFactory =
    overrides.requestIdFactory ?? (() => crypto.randomUUID());
  return async function POST(request: Request): Promise<Response> {
    const fallbackRequestId = publicRequestId(request, requestIdFactory);
    let commands: Pick<SkillCommands, "authorize" | "upload">;
    let context: AuthorizedSkillCommand;
    try {
      commands = overrides.commands ?? createDefaultCommands();
      context = await commands.authorize(request, "upload");
    } catch (error) {
      await cancelUnreadRequestBody(request, error);
      return errorResponse(error, fallbackRequestId);
    }
    let input: BoundedSkillUpload | null = null;
    try {
      input = await readMultipart(request);
      const response = await commands.upload(context, input);
      return Response.json(
        { ...response, requestId: context.requestId },
        { status: 201, headers: NO_STORE_HEADERS },
      );
    } catch (error) {
      return errorResponse(error, context.requestId);
    } finally {
      input = null;
    }
  };
}

export function createAdminSkillReviewHandler(
  overrides: {
    commands?: Pick<SkillCommands, "authorize" | "review">;
    readJson?: (
      request: Request,
      maximumBytes: number,
    ) => Promise<JsonReadResult>;
    requestIdFactory?: () => string;
  } = {},
) {
  const readJson = overrides.readJson ?? readBoundedJson;
  const requestIdFactory =
    overrides.requestIdFactory ?? (() => crypto.randomUUID());
  return async function POST(
    request: Request,
    routeContext: DynamicRevisionContext,
  ): Promise<Response> {
    const fallbackRequestId = publicRequestId(request, requestIdFactory);
    let commands: Pick<SkillCommands, "authorize" | "review">;
    let context: AuthorizedSkillCommand;
    try {
      commands = overrides.commands ?? createDefaultCommands();
      context = await commands.authorize(request, "review");
    } catch (error) {
      await cancelUnreadRequestBody(request, error);
      return errorResponse(error, fallbackRequestId);
    }
    let params: { skillId: string; revisionId: string } | null = null;
    try {
      params = exactRevisionParams(await routeContext.params);
    } catch {
      params = null;
    }
    if (params === null) {
      const error = new AdminSkillCommandError("validation_error");
      await cancelUnreadRequestBody(request, error);
      return errorResponse(error, context.requestId);
    }
    const length = request.headers.get("content-length");
    const oversized =
      length !== null &&
      /^\d+$/u.test(length) &&
      Number(length) > MAX_REVIEW_BODY_BYTES;
    if (oversized) {
      await cancelUnreadRequestBody(request);
      return Response.json(errorBody(context.requestId, "payload_too_large"), {
        status: 413,
        headers: NO_STORE_HEADERS,
      });
    }
    let read: JsonReadResult;
    let readFailure: unknown;
    try {
      read = await readJson(request, MAX_REVIEW_BODY_BYTES);
    } catch (error) {
      readFailure = error;
      read = { ok: false };
    }
    if (!read.ok) {
      await cancelUnreadRequestBody(request, readFailure);
      return Response.json(errorBody(context.requestId, "validation_error"), {
        status: 400,
        headers: NO_STORE_HEADERS,
      });
    }
    let input = parseReviewBody(read.value);
    if (input === null)
      return errorResponse(
        new AdminSkillCommandError("validation_error"),
        context.requestId,
      );
    try {
      const response = await commands.review(context, { ...params, ...input });
      return Response.json(
        { ...response, requestId: context.requestId },
        { headers: NO_STORE_HEADERS },
      );
    } catch (error) {
      return errorResponse(error, context.requestId);
    } finally {
      input = null;
    }
  };
}

export const adminSkillListHandler = createAdminSkillListHandler();
export const adminSkillUploadHandler = createAdminSkillUploadHandler();
export const adminSkillRevisionHandler = createAdminSkillRevisionHandler();
export const adminSkillFileHandler = createAdminSkillFileHandler();
export const adminSkillReviewHandler = createAdminSkillReviewHandler();

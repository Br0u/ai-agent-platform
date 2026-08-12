import {
  parseAdminInputPolicySaveInput,
  type AdminInputPolicySnapshot,
} from "@/features/assistant/admin-input-policy-contract";
import {
  ASSISTANT_INPUT_POLICY_MAX_SOURCE_BYTES,
  AssistantInputPolicyValidationError,
  normalizeAssistantInputTerms,
} from "@/features/assistant/assistant-input-policy";
import {
  AuthAccessError,
  requirePermission,
  type AccessService,
  type WorkforceActor,
} from "@/server/auth/access";
import { resolveTrustedRequestIp } from "@/server/auth/shared-options";
import {
  AssistantInputPolicyConflictError,
  createAssistantInputPolicyRepository,
  type AssistantInputPolicySnapshot,
} from "@/server/assistant/assistant-input-policy";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import {
  MutationRequestError,
  requireTrustedJsonMutation,
} from "@/server/http/require-trusted-mutation";
import {
  readBoundedJson,
  type JsonReadResult,
} from "@/server/http/read-bounded-json";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_REQUEST_BODY_BYTES =
  ASSISTANT_INPUT_POLICY_MAX_SOURCE_BYTES * 6 + 1024;
const MAX_USER_AGENT_LENGTH = 512;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;

type Repository = ReturnType<typeof createAssistantInputPolicyRepository>;

type Dependencies = {
  access: Pick<AccessService, "requirePermission">;
  repository?: Pick<Repository, "load" | "save">;
  requireTrustedMutation(request: Request): void;
  readJson(request: Request, maximumBytes: number): Promise<JsonReadResult>;
  requestIdFactory(): string;
  resolveIpAddress(headers: Headers): string | undefined;
};

function publicSnapshot(
  value: AssistantInputPolicySnapshot,
  canConfigure: boolean,
): AdminInputPolicySnapshot {
  return {
    version: "1",
    revision: value.revision,
    termCount: value.terms.length,
    ...(canConfigure ? { terms: value.terms } : {}),
    updatedAt: value.updatedAt,
    canConfigure,
  };
}

function safeUserAgent(headers: Headers): string | undefined {
  const value = headers.get("user-agent")?.trim();
  return value &&
    value.length <= MAX_USER_AGENT_LENGTH &&
    !CONTROL_CHARACTER.test(value)
    ? value
    : undefined;
}

function errorResponse(
  requestId: string,
  code:
    | "authentication_required"
    | "permission_denied"
    | "validation_error"
    | "configuration_conflict"
    | "storage_unavailable",
  status: number,
) {
  return Response.json(
    {
      version: "1",
      requestId,
      error: {
        code,
        message:
          code === "configuration_conflict"
            ? "内容规则已被更新，请刷新后重试"
            : code === "storage_unavailable"
              ? "内容规则暂时不可用"
              : code === "authentication_required"
                ? "Authentication required"
                : code === "permission_denied"
                  ? "Permission denied"
                  : "内容规则请求无效",
        retryable: code === "storage_unavailable",
      },
    },
    { status, headers: NO_STORE },
  );
}

function mappedError(error: unknown, requestId: string): Response {
  if (error instanceof AuthAccessError) {
    return errorResponse(
      requestId,
      error.status === 401 ? "authentication_required" : "permission_denied",
      error.status,
    );
  }
  if (error instanceof MutationRequestError) {
    return errorResponse(requestId, "permission_denied", 403);
  }
  if (error instanceof AssistantInputPolicyConflictError) {
    return errorResponse(requestId, "configuration_conflict", 409);
  }
  if (error instanceof AssistantInputPolicyValidationError) {
    return errorResponse(requestId, "validation_error", 422);
  }
  return errorResponse(requestId, "storage_unavailable", 503);
}

export async function loadAdminInputPolicySnapshot(
  actor: WorkforceActor,
  repository: Pick<Repository, "load"> = createAssistantInputPolicyRepository(),
): Promise<AdminInputPolicySnapshot> {
  return publicSnapshot(
    await repository.load(),
    actor.permissions.includes("admin:assistant:configure"),
  );
}

export function createAdminInputPolicyHandlers(
  overrides: Partial<Dependencies> = {},
) {
  const dependencies: Omit<Dependencies, "repository"> = {
    access: overrides.access ?? { requirePermission },
    requireTrustedMutation:
      overrides.requireTrustedMutation ?? requireTrustedJsonMutation,
    readJson: overrides.readJson ?? readBoundedJson,
    requestIdFactory: overrides.requestIdFactory ?? (() => crypto.randomUUID()),
    resolveIpAddress:
      overrides.resolveIpAddress ??
      ((headers) => resolveTrustedRequestIp(headers)),
  };
  const repository = () =>
    overrides.repository ?? createAssistantInputPolicyRepository();

  return {
    GET: async function GET(request: Request): Promise<Response> {
      const requestId = resolveAssistantRequestId(
        request,
        dependencies.requestIdFactory,
      );
      try {
        const actor =
          await dependencies.access.requirePermission("admin:assistant");
        return Response.json(
          await loadAdminInputPolicySnapshot(actor, repository()),
          { headers: NO_STORE },
        );
      } catch (error) {
        return mappedError(error, requestId);
      }
    },

    PUT: async function PUT(request: Request): Promise<Response> {
      const requestId = resolveAssistantRequestId(
        request,
        dependencies.requestIdFactory,
      );
      try {
        dependencies.requireTrustedMutation(request);
        const actor = await dependencies.access.requirePermission(
          "admin:assistant:configure",
        );
        const read = await dependencies.readJson(
          request,
          MAX_REQUEST_BODY_BYTES,
        );
        const input = read.ok
          ? parseAdminInputPolicySaveInput(read.value)
          : null;
        if (input === null) {
          return errorResponse(requestId, "validation_error", 422);
        }
        const { terms } = normalizeAssistantInputTerms(input.source);
        const userAgent = safeUserAgent(request.headers);
        const ipAddress = dependencies.resolveIpAddress(request.headers);
        const saved = await repository().save({
          terms,
          expectedRevision: input.expectedRevision,
          actor: { realm: "workforce", userId: actor.userId },
          requestId,
          ...(ipAddress === undefined ? {} : { ipAddress }),
          ...(userAgent === undefined ? {} : { userAgent }),
        });
        return Response.json(publicSnapshot(saved, true), {
          headers: NO_STORE,
        });
      } catch (error) {
        return mappedError(error, requestId);
      }
    },
  };
}

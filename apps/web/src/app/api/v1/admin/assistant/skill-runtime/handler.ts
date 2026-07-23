import {
  parseAdminSkillActivationCommand,
  parseAdminSkillCandidateCommand,
  parseAdminSkillDiscardCommand,
  parseAdminSkillRollbackCommand,
  parseAdminSkillRuntimeSnapshot,
  type AdminSkillRuntimeSnapshot,
} from "@/features/assistant/admin-skill-runtime-contract";
import {
  AuthAccessError,
  requirePermission,
  type WorkforceActor,
} from "@/server/auth/access";
import { createAuditWriter } from "@/server/auth/audit";
import {
  SensitiveActionError,
  requireSensitiveWorkforceActionEvidence,
} from "@/server/auth/sensitive-action";
import {
  AdminSkillRuntimeCommandError,
  createAdminSkillRuntimeCommands,
  type AuthorizedSkillRuntimeCommand,
} from "@/server/assistant/admin-skill-runtime-commands";
import {
  createAgentSkillControlClient,
  resolveAgentSkillControlSettings,
  type AgentSkillControlClient,
} from "@/server/assistant/agent-skill-control-client";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import {
  createSkillRegistryClient,
  resolveSkillRegistrySettings,
  type SkillRegistryRuntimeClient,
} from "@/server/assistant/skill-registry-client";
import {
  MutationRequestError,
  requireTrustedJsonMutation,
} from "@/server/http/require-trusted-mutation";
import {
  readBoundedJson,
  type JsonReadResult,
} from "@/server/http/read-bounded-json";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type Commands = ReturnType<typeof createAdminSkillRuntimeCommands>;
type DynamicSetContext = { params: Promise<{ setId: string }> };
type SnapshotOptions = {
  registry?: SkillRegistryRuntimeClient;
  agent?: AgentSkillControlClient;
  requestIdFactory?: () => string;
};

type PublicErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "reauth_required"
  | "validation_error"
  | "candidate_invalid"
  | "skill_set_not_found"
  | "activation_conflict"
  | "activation_busy"
  | "runtime_busy"
  | "artifact_invalid"
  | "skill_validation_failed"
  | "activation_timeout"
  | "activation_result_unknown"
  | "runtime_degraded"
  | "storage_unavailable";

function defaultRegistry(): SkillRegistryRuntimeClient {
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

function defaultAgent(): AgentSkillControlClient {
  return createAgentSkillControlClient({
    settings: resolveAgentSkillControlSettings({
      AGENTOS_INTERNAL_URL: process.env.AGENTOS_INTERNAL_URL,
      OS_SECURITY_KEY: process.env.OS_SECURITY_KEY,
      AGENT_CONFIG_CONTROL_KEY: process.env.AGENT_CONFIG_CONTROL_KEY,
    }),
  });
}

function defaultCommands(): Commands {
  let registry: SkillRegistryRuntimeClient | undefined;
  let agent: AgentSkillControlClient | undefined;
  let audit: ReturnType<typeof createAuditWriter> | undefined;
  const lazyRegistry: SkillRegistryRuntimeClient = {
    runtimeStatus: (input) =>
      (registry ??= defaultRegistry()).runtimeStatus(input),
    listAvailableRevisions: (input) =>
      (registry ??= defaultRegistry()).listAvailableRevisions(input),
    createSkillSet: (input) =>
      (registry ??= defaultRegistry()).createSkillSet(input),
    discardSkillSet: (input) =>
      (registry ??= defaultRegistry()).discardSkillSet(input),
    clonePreviousSkillSet: (input) =>
      (registry ??= defaultRegistry()).clonePreviousSkillSet(input),
  };
  const lazyAgent: AgentSkillControlClient = {
    runtimeStatus: (input) => (agent ??= defaultAgent()).runtimeStatus(input),
    activate: (input) => (agent ??= defaultAgent()).activate(input),
  };
  return createAdminSkillRuntimeCommands({
    requireTrustedMutation: requireTrustedJsonMutation,
    requireSensitiveAction: requireSensitiveWorkforceActionEvidence,
    audit: { write: (input) => (audit ??= createAuditWriter()).write(input) },
    registry: lazyRegistry,
    agent: lazyAgent,
  });
}

export async function loadAdminSkillRuntimeSnapshot(
  actor: WorkforceActor,
  options: SnapshotOptions = {},
): Promise<AdminSkillRuntimeSnapshot> {
  const requestId = (options.requestIdFactory ?? (() => crypto.randomUUID()))();
  if (!UUID.test(requestId)) throw new TypeError("Invalid request ID");
  const registry = options.registry ?? defaultRegistry();
  const agent = options.agent ?? defaultAgent();
  const [available, registryRuntime, agentRuntime] = await Promise.all([
    registry.listAvailableRevisions({
      actor: actor.userId,
      requestId,
      limit: 100,
      offset: 0,
    }),
    registry.runtimeStatus({ actor: actor.userId, requestId }),
    agent.runtimeStatus({ actor: actor.userId, requestId }),
  ]);
  const snapshot = {
    version: "1" as const,
    available,
    registry: registryRuntime,
    agent: agentRuntime,
    permissions: {
      canRead: actor.permissions.includes("admin:assistant:skills"),
      canConfigure: actor.permissions.includes(
        "admin:assistant:skills:configure",
      ),
    },
  };
  const parsed = parseAdminSkillRuntimeSnapshot(snapshot);
  if (parsed === null) throw new TypeError("Invalid Skill runtime snapshot");
  return parsed;
}

function errorBody(requestId: string, code: PublicErrorCode) {
  const messages: Record<PublicErrorCode, string> = {
    authentication_required: "Authentication required",
    permission_denied: "Permission denied",
    reauth_required: "Recent password and MFA verification required",
    validation_error: "Invalid Skill runtime request",
    candidate_invalid: "Skill candidate is invalid",
    skill_set_not_found: "Skill candidate was not found",
    activation_conflict: "Skill runtime has changed",
    activation_busy: "Another Skill activation is in progress",
    runtime_busy: "Previous Skill runtime is still draining",
    artifact_invalid: "Skill artifact is invalid",
    skill_validation_failed: "Skill validation failed",
    activation_timeout: "Skill activation timed out",
    activation_result_unknown: "Skill activation result is being reconciled",
    runtime_degraded: "Skill runtime is unavailable",
    storage_unavailable: "Skill runtime storage is unavailable",
  };
  return {
    version: "1",
    requestId,
    error: {
      code,
      message: messages[code],
      retryable: [
        "activation_busy",
        "runtime_busy",
        "activation_timeout",
        "activation_result_unknown",
        "runtime_degraded",
        "storage_unavailable",
      ].includes(code),
    },
    ...(code === "reauth_required" ? { redirectTo: "/staff/re-auth" } : {}),
  };
}

function errorResponse(error: unknown, requestId: string): Response {
  let code: PublicErrorCode = "runtime_degraded";
  let status = 503;
  if (error instanceof AuthAccessError) {
    code =
      error.status === 401 ? "authentication_required" : "permission_denied";
    status = error.status;
  } else if (error instanceof SensitiveActionError) {
    code = "reauth_required";
    status = 401;
  } else if (error instanceof MutationRequestError) {
    code = "validation_error";
    status = 400;
  } else if (error instanceof AdminSkillRuntimeCommandError) {
    code =
      error.code === "authorization_failed" ? "permission_denied" : error.code;
    if (code === "permission_denied") status = 403;
    else if (code === "validation_error" || code === "candidate_invalid")
      status = 400;
    else if (code === "skill_set_not_found") status = 404;
    else if (code === "activation_conflict") status = 409;
    else if (code === "artifact_invalid" || code === "skill_validation_failed")
      status = 422;
    else if (code === "activation_busy" || code === "runtime_busy")
      status = 423;
    else if (code === "activation_timeout") status = 504;
  }
  return Response.json(errorBody(requestId, code), {
    status,
    headers: NO_STORE,
  });
}

async function readJson(request: Request): Promise<JsonReadResult> {
  try {
    return await readBoundedJson(request, 8 * 1024);
  } catch {
    return { ok: false };
  }
}

async function authorize(
  request: Request,
  commands: Commands | undefined,
  fallbackRequestId: string,
): Promise<
  { commands: Commands; context: AuthorizedSkillRuntimeCommand } | Response
> {
  try {
    const active = commands ?? defaultCommands();
    return { commands: active, context: await active.authorize(request) };
  } catch (error) {
    return errorResponse(error, fallbackRequestId);
  }
}

export function createSkillRuntimeListHandler(
  options: {
    requirePermission?: typeof requirePermission;
    loadSnapshot?: typeof loadAdminSkillRuntimeSnapshot;
    requestIdFactory?: () => string;
  } = {},
) {
  return async function GET(request: Request): Promise<Response> {
    const requestId = resolveAssistantRequestId(
      request,
      options.requestIdFactory ?? (() => crypto.randomUUID()),
    );
    try {
      const actor = await (options.requirePermission ?? requirePermission)(
        "admin:assistant:skills",
      );
      const snapshot = await (
        options.loadSnapshot ?? loadAdminSkillRuntimeSnapshot
      )(actor);
      return Response.json({ ...snapshot, requestId }, { headers: NO_STORE });
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

export function createSkillCandidateHandler(
  options: {
    commands?: Commands;
    requestIdFactory?: () => string;
  } = {},
) {
  return async function POST(request: Request): Promise<Response> {
    const fallback = resolveAssistantRequestId(
      request,
      options.requestIdFactory ?? (() => crypto.randomUUID()),
    );
    const authorized = await authorize(request, options.commands, fallback);
    if (authorized instanceof Response) return authorized;
    const read = await readJson(request);
    const input = read.ok ? parseAdminSkillCandidateCommand(read.value) : null;
    if (input === null)
      return errorResponse(
        new AdminSkillRuntimeCommandError("validation_error"),
        fallback,
      );
    try {
      const result = await authorized.commands.createCandidate(
        authorized.context,
        input,
      );
      return Response.json(
        { version: "1", requestId: input.requestId, set: result.set },
        { status: 201, headers: NO_STORE },
      );
    } catch (error) {
      return errorResponse(error, input.requestId);
    }
  };
}

export function createSkillCandidateActivateHandler(
  options: {
    commands?: Commands;
    requestIdFactory?: () => string;
  } = {},
) {
  return async function POST(
    request: Request,
    route: DynamicSetContext,
  ): Promise<Response> {
    const fallback = resolveAssistantRequestId(
      request,
      options.requestIdFactory ?? (() => crypto.randomUUID()),
    );
    const authorized = await authorize(request, options.commands, fallback);
    if (authorized instanceof Response) return authorized;
    const read = await readJson(request);
    const input = read.ok ? parseAdminSkillActivationCommand(read.value) : null;
    let setId = "";
    try {
      setId = (await route.params).setId;
    } catch {
      /* invalid below */
    }
    if (input === null) {
      return errorResponse(
        new AdminSkillRuntimeCommandError("validation_error"),
        fallback,
      );
    }
    try {
      const activation = await authorized.commands.activateCandidate(
        authorized.context,
        setId,
        input,
      );
      return Response.json(
        { version: "1", requestId: input.requestId, activation },
        { headers: NO_STORE },
      );
    } catch (error) {
      return errorResponse(error, input.requestId);
    }
  };
}

export function createSkillCandidateDiscardHandler(
  options: {
    commands?: Commands;
    requestIdFactory?: () => string;
  } = {},
) {
  return async function POST(
    request: Request,
    route: DynamicSetContext,
  ): Promise<Response> {
    const fallback = resolveAssistantRequestId(
      request,
      options.requestIdFactory ?? (() => crypto.randomUUID()),
    );
    const authorized = await authorize(request, options.commands, fallback);
    if (authorized instanceof Response) return authorized;
    const read = await readJson(request);
    const input = read.ok ? parseAdminSkillDiscardCommand(read.value) : null;
    let setId = "";
    try {
      setId = (await route.params).setId;
    } catch {
      /* invalid below */
    }
    if (input === null) {
      return errorResponse(
        new AdminSkillRuntimeCommandError("validation_error"),
        fallback,
      );
    }
    try {
      const result = await authorized.commands.discardCandidate(
        authorized.context,
        setId,
        input,
      );
      return Response.json(
        { version: "1", requestId: input.requestId, set: result.set },
        { headers: NO_STORE },
      );
    } catch (error) {
      return errorResponse(error, input.requestId);
    }
  };
}

export function createSkillRollbackHandler(
  options: {
    commands?: Commands;
    requestIdFactory?: () => string;
  } = {},
) {
  return async function POST(request: Request): Promise<Response> {
    const fallback = resolveAssistantRequestId(
      request,
      options.requestIdFactory ?? (() => crypto.randomUUID()),
    );
    const authorized = await authorize(request, options.commands, fallback);
    if (authorized instanceof Response) return authorized;
    const read = await readJson(request);
    const input = read.ok ? parseAdminSkillRollbackCommand(read.value) : null;
    if (input === null) {
      return errorResponse(
        new AdminSkillRuntimeCommandError("validation_error"),
        fallback,
      );
    }
    try {
      const activation = await authorized.commands.rollback(
        authorized.context,
        input,
      );
      return Response.json(
        { version: "1", requestId: input.activationRequestId, activation },
        { headers: NO_STORE },
      );
    } catch (error) {
      return errorResponse(error, input.activationRequestId);
    }
  };
}

export const skillRuntimeListHandler = createSkillRuntimeListHandler();
export const skillCandidateHandler = createSkillCandidateHandler();
export const skillCandidateActivateHandler =
  createSkillCandidateActivateHandler();
export const skillCandidateDiscardHandler =
  createSkillCandidateDiscardHandler();
export const skillRollbackHandler = createSkillRollbackHandler();

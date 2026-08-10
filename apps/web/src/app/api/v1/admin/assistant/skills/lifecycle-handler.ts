import { createAuditWriter } from "@/server/auth/audit";
import {
  SensitiveActionError,
  requireSensitiveWorkforceActionEvidence,
} from "@/server/auth/sensitive-action";
import {
  AdminSkillLifecycleCommandError,
  createAdminSkillLifecycleCommands,
  type SkillLifecycleOperation,
} from "@/server/assistant/admin-skill-lifecycle-commands";
import {
  createAgentSkillControlClient,
  resolveAgentSkillControlSettings,
  type AgentSkillControlClient,
} from "@/server/assistant/agent-skill-control-client";
import {
  SkillRegistryClientError,
  createSkillRegistryClient,
  resolveSkillRegistrySettings,
  type CompleteSkillRegistryClient,
} from "@/server/assistant/skill-registry-client";
import {
  MutationRequestError,
  requireTrustedJsonMutation,
} from "@/server/http/require-trusted-mutation";
import { readBoundedJson } from "@/server/http/read-bounded-json";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type RouteContext = { params: Promise<{ skillId: string }> };
type LifecycleCommands = ReturnType<typeof createAdminSkillLifecycleCommands>;

type Dependencies = {
  registry: CompleteSkillRegistryClient;
  commands: LifecycleCommands;
  requestIdFactory(): string;
};

function defaultRegistry(): CompleteSkillRegistryClient {
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

function resolveDependencies(overrides: Partial<Dependencies>): Dependencies {
  const registry = overrides.registry ?? defaultRegistry();
  return {
    registry,
    commands:
      overrides.commands ??
      createAdminSkillLifecycleCommands({
        requireTrustedMutation: requireTrustedJsonMutation,
        requireSensitiveAction: requireSensitiveWorkforceActionEvidence,
        audit: createAuditWriter(),
        registry,
        agent: defaultAgent(),
      }),
    requestIdFactory: overrides.requestIdFactory ?? (() => crypto.randomUUID()),
  };
}

function errorResponse(
  requestId: string,
  code:
    | "permission_denied"
    | "reauth_required"
    | "validation_error"
    | "not_found"
    | "state_conflict"
    | "result_unknown"
    | "runtime_unavailable",
  status: number,
) {
  return Response.json(
    {
      version: "1",
      requestId,
      error: { code },
      ...(code === "reauth_required" ? { redirectTo: "/staff/re-auth" } : {}),
    },
    { status, headers: NO_STORE },
  );
}

function mappedError(error: unknown, requestId: string): Response {
  if (error instanceof SensitiveActionError) {
    return errorResponse(requestId, "reauth_required", 401);
  }
  if (error instanceof MutationRequestError) {
    return errorResponse(requestId, "permission_denied", 403);
  }
  if (error instanceof AdminSkillLifecycleCommandError) {
    if (error.code === "authorization_failed")
      return errorResponse(requestId, "permission_denied", 403);
    if (error.code === "validation_error")
      return errorResponse(requestId, "validation_error", 400);
    if (error.code === "state_conflict")
      return errorResponse(requestId, "state_conflict", 409);
    if (error.code === "result_unknown")
      return errorResponse(requestId, "result_unknown", 503);
  }
  if (error instanceof SkillRegistryClientError) {
    if (error.code === "SKILL_NOT_FOUND")
      return errorResponse(requestId, "not_found", 404);
    if (
      error.code === "SKILL_ACTIVE" ||
      error.code === "SKILL_CHANGED" ||
      error.code === "ASSERTION_REPLAY"
    )
      return errorResponse(requestId, "state_conflict", 409);
    if (error.code === "invalid_request" || error.code === "VALIDATION_ERROR")
      return errorResponse(requestId, "validation_error", 400);
  }
  return errorResponse(requestId, "runtime_unavailable", 503);
}

function parseRequestId(value: unknown): string | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  )
    return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== "requestId") return null;
  const requestId = Reflect.get(value, "requestId");
  return typeof requestId === "string" && UUID.test(requestId)
    ? requestId
    : null;
}

async function findSkill(
  registry: CompleteSkillRegistryClient,
  actor: string,
  requestIdFactory: () => string,
  skillId: string,
) {
  for (let offset = 0; offset <= 1_000_000; offset += 100) {
    const page = await registry.listSkills({
      actor,
      requestId: requestIdFactory(),
      limit: 100,
      offset,
    });
    const skill = page.skills.find((item) => item.id === skillId);
    if (skill !== undefined) return skill;
    if (page.page.returned < 100) return null;
  }
  throw new SkillRegistryClientError("invalid_response");
}

async function listSkillRevisionIds(
  registry: CompleteSkillRegistryClient,
  actor: string,
  requestIdFactory: () => string,
  skillId: string,
): Promise<Set<string>> {
  const revisionIds = new Set<string>();
  for (let offset = 0; offset <= 1_000_000; offset += 100) {
    const page = await registry.listAvailableRevisions({
      actor,
      requestId: requestIdFactory(),
      limit: 100,
      offset,
    });
    for (const item of page.items) {
      if (item.skillId === skillId) revisionIds.add(item.revisionId);
    }
    if (offset + page.items.length >= page.total) return revisionIds;
  }
  throw new SkillRegistryClientError("invalid_response");
}

export function createSkillLifecycleHandler(
  operation: SkillLifecycleOperation,
  overrides: Partial<Dependencies> = {},
) {
  return async function handle(
    request: Request,
    route: RouteContext,
  ): Promise<Response> {
    let dependencies: Dependencies;
    let fallbackRequestId = crypto.randomUUID();
    try {
      dependencies = resolveDependencies(overrides);
      fallbackRequestId = dependencies.requestIdFactory();
      const context = await dependencies.commands.authorize(request);
      const read = await readBoundedJson(request, 1024);
      const requestId = read.ok ? parseRequestId(read.value) : null;
      const skillId = (await route.params).skillId;
      if (requestId === null || !UUID.test(skillId))
        return errorResponse(fallbackRequestId, "validation_error", 400);

      const actor = context.actor.userId;
      const [skill, skillRevisionIds, runtime] = await Promise.all([
        findSkill(
          dependencies.registry,
          actor,
          dependencies.requestIdFactory,
          skillId,
        ),
        listSkillRevisionIds(
          dependencies.registry,
          actor,
          dependencies.requestIdFactory,
          skillId,
        ),
        dependencies.registry.runtimeStatus({
          actor,
          requestId: dependencies.requestIdFactory(),
        }),
      ]);
      if (skill === null) return errorResponse(requestId, "not_found", 404);

      const activeIds = runtime.active?.revisionIds ?? [];
      const withoutSkill = activeIds.filter((id) => !skillRevisionIds.has(id));
      let nextRevisionIds = withoutSkill;
      if (operation === "enable") {
        if (!skillRevisionIds.has(skill.revisionId))
          return errorResponse(requestId, "state_conflict", 409);
        nextRevisionIds = [...withoutSkill, skill.revisionId];
      }

      const needsActivation =
        (operation === "enable" &&
          (!skill.enabled || !activeIds.includes(skill.revisionId))) ||
        ((operation === "disable" || operation === "delete") && skill.enabled);
      if (needsActivation) {
        await dependencies.commands.applySkillSet(context, {
          operation,
          skillId,
          expectedActivationVersion: runtime.activationVersion,
          nextRevisionIds,
          requestId,
        });
      }
      if (operation === "delete") {
        await dependencies.registry.archiveSkill({
          actor,
          requestId: dependencies.requestIdFactory(),
          assuredAt: context.assuredAt,
          skillId,
          expectedArtifactSha256: skill.replacementToken,
        });
      }
      return Response.json(
        { version: "1", requestId, skillId, enabled: operation === "enable" },
        { headers: NO_STORE },
      );
    } catch (error) {
      return mappedError(error, fallbackRequestId);
    }
  };
}

import "server-only";

import { createHash } from "node:crypto";

import type { WorkforceActor } from "@/server/auth/access";
import type { AuditWriteInput } from "@/server/auth/audit";
import type { WorkforceAssuranceEvidence } from "@/server/auth/sensitive-action";
import {
  AgentSkillControlClientError,
  type AgentSkillControlClient,
} from "./agent-skill-control-client";
import {
  SkillRegistryClientError,
  type SkillRegistryRuntimeClient,
} from "./skill-registry-client";

const AUTHORIZED = Symbol("authorized-skill-lifecycle-command");
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type SkillLifecycleOperation = "enable" | "disable" | "replace" | "delete";
export type AdminSkillLifecycleCommandErrorCode =
  | "authorization_failed"
  | "validation_error"
  | "state_conflict"
  | "result_unknown"
  | "runtime_unavailable";

export class AdminSkillLifecycleCommandError extends Error {
  constructor(readonly code: AdminSkillLifecycleCommandErrorCode) {
    super("Skill lifecycle command failed");
    Object.defineProperty(this, "name", {
      value: "AdminSkillLifecycleCommandError",
      configurable: true,
    });
  }
}

export type AuthorizedSkillLifecycleCommand = Readonly<{
  [AUTHORIZED]: true;
  actor: WorkforceActor;
  assuredAt: number;
}>;

type Dependencies = {
  requireTrustedMutation(request: Request): void;
  requireSensitiveAction(
    permission: "admin:assistant:skills:configure",
    options: { recentWithinSeconds: 600; mfaRequired: true },
  ): Promise<WorkforceAssuranceEvidence>;
  audit: { write(input: AuditWriteInput): Promise<void> };
  registry: SkillRegistryRuntimeClient;
  agent: AgentSkillControlClient;
};

type ApplySkillSetInput = {
  operation: SkillLifecycleOperation;
  skillId: string;
  expectedActivationVersion: number;
  nextRevisionIds: string[];
  requestId: string;
};

function derivedRequestId(requestId: string, purpose: string): string {
  const hex = createHash("sha256")
    .update(`${requestId}:${purpose}`, "utf8")
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex
    .slice(12, 16)
    .join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function mappedError(error: unknown): AdminSkillLifecycleCommandError {
  if (
    (error instanceof AgentSkillControlClientError &&
      error.code === "activation_result_unknown") ||
    (error instanceof SkillRegistryClientError &&
      error.code === "idempotency_conflict")
  ) {
    return new AdminSkillLifecycleCommandError("result_unknown");
  }
  if (
    (error instanceof AgentSkillControlClientError &&
      error.code === "activation_conflict") ||
    (error instanceof SkillRegistryClientError &&
      error.code === "skill_set_state_conflict")
  ) {
    return new AdminSkillLifecycleCommandError("state_conflict");
  }
  return new AdminSkillLifecycleCommandError("runtime_unavailable");
}

export function createAdminSkillLifecycleCommands(dependencies: Dependencies) {
  const grants = new WeakSet<object>();

  return {
    async authorize(request: Request): Promise<AuthorizedSkillLifecycleCommand> {
      dependencies.requireTrustedMutation(request);
      const evidence = await dependencies.requireSensitiveAction(
        "admin:assistant:skills:configure",
        { recentWithinSeconds: 600, mfaRequired: true },
      );
      const context = Object.freeze({
        [AUTHORIZED]: true as const,
        actor: Object.freeze({
          ...evidence.actor,
          permissions: Object.freeze([...evidence.actor.permissions]) as string[],
        }),
        assuredAt: evidence.assuredAt,
      });
      grants.add(context);
      return context;
    },

    async applySkillSet(
      context: AuthorizedSkillLifecycleCommand,
      input: ApplySkillSetInput,
    ): Promise<{ activationVersion: number }> {
      if (!grants.delete(context)) {
        throw new AdminSkillLifecycleCommandError("authorization_failed");
      }
      if (
        !["enable", "disable", "replace", "delete"].includes(input.operation) ||
        !UUID.test(input.skillId) ||
        !UUID.test(input.requestId) ||
        !Number.isSafeInteger(input.expectedActivationVersion) ||
        input.expectedActivationVersion < 0 ||
        input.nextRevisionIds.length > 16 ||
        input.nextRevisionIds.some((id) => !UUID.test(id)) ||
        new Set(input.nextRevisionIds).size !== input.nextRevisionIds.length
      ) {
        throw new AdminSkillLifecycleCommandError("validation_error");
      }

      const actor = context.actor.userId;
      const [beforeRegistry, beforeAgent] = await Promise.all([
        dependencies.registry.runtimeStatus({
          actor,
          requestId: derivedRequestId(input.requestId, "before-registry"),
        }),
        dependencies.agent.runtimeStatus({
          actor,
          requestId: derivedRequestId(input.requestId, "before-agent"),
        }),
      ]);
      if (
        beforeRegistry.activationVersion !== input.expectedActivationVersion ||
        beforeAgent.activationVersion !== input.expectedActivationVersion ||
        (beforeRegistry.active?.id ?? null) !== beforeAgent.activeSetId ||
        beforeAgent.activeSetId !== beforeAgent.loadedSetId
      ) {
        throw new AdminSkillLifecycleCommandError("state_conflict");
      }

      const candidateRequestId = derivedRequestId(input.requestId, "candidate");
      const activationRequestId = derivedRequestId(input.requestId, "activation");
      let candidateId: string | null = null;
      let activationVersion = input.expectedActivationVersion;
      let result: "success" | "failure" = "failure";
      try {
        const candidate = await dependencies.registry.createSkillSet({
          actor,
          requestId: candidateRequestId,
          assuredAt: context.assuredAt,
          revisionIds: input.nextRevisionIds,
        });
        candidateId = candidate.set.id;
        try {
          const activated = await dependencies.agent.activate({
            actor,
            requestId: activationRequestId,
            setId: candidateId,
            expectedActivationVersion: input.expectedActivationVersion,
            assuredAt: context.assuredAt,
          });
          activationVersion = activated.activationVersion;
        } catch (error) {
          if (
            !(
              error instanceof AgentSkillControlClientError &&
              error.code === "activation_result_unknown"
            )
          ) {
            await dependencies.registry
              .discardSkillSet({
                actor,
                requestId: derivedRequestId(input.requestId, "discard"),
                assuredAt: context.assuredAt,
                setId: candidateId,
              })
              .catch(() => undefined);
          }
          throw error;
        }
        const [afterRegistry, afterAgent] = await Promise.all([
          dependencies.registry.runtimeStatus({
            actor,
            requestId: derivedRequestId(input.requestId, "after-registry"),
          }),
          dependencies.agent.runtimeStatus({
            actor,
            requestId: derivedRequestId(input.requestId, "after-agent"),
          }),
        ]);
        if (
          afterRegistry.active?.id !== candidateId ||
          afterAgent.activeSetId !== candidateId ||
          afterAgent.loadedSetId !== candidateId ||
          afterRegistry.activationVersion !== activationVersion ||
          afterAgent.activationVersion !== activationVersion
        ) {
          throw new AdminSkillLifecycleCommandError("result_unknown");
        }
        result = "success";
      } catch (error) {
        if (error instanceof AdminSkillLifecycleCommandError) throw error;
        throw mappedError(error);
      } finally {
        try {
          await dependencies.audit.write({
            event: "assistant.skill_runtime_changed",
            actor: { realm: "workforce", userId: actor },
            target: { type: "system", id: input.skillId },
            metadata: {
              operation: input.operation,
              setId: candidateId,
              activationVersion,
              revisionCount: input.nextRevisionIds.length,
              requestId: input.requestId,
              activationRequestId,
              result,
            },
          });
        } catch {
          if (result === "success") {
            throw new AdminSkillLifecycleCommandError("result_unknown");
          }
        }
      }
      return { activationVersion };
    },
  };
}

import "server-only";

import type {
  AdminSkillActivationCommand,
  AdminSkillCandidateCommand,
  AdminSkillDiscardCommand,
  AdminSkillRollbackCommand,
} from "@/features/assistant/admin-skill-runtime-contract";
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

const AUTHORIZED_SKILL_RUNTIME_COMMAND = Symbol(
  "authorized-skill-runtime-command",
);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type AdminSkillRuntimeCommandErrorCode =
  | "authorization_failed"
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

export class AdminSkillRuntimeCommandError extends Error {
  constructor(readonly code: AdminSkillRuntimeCommandErrorCode) {
    super("Skill runtime command failed");
    Object.defineProperty(this, "name", {
      value: "AdminSkillRuntimeCommandError",
      configurable: true,
    });
  }
}

export type AuthorizedSkillRuntimeCommand = Readonly<{
  [AUTHORIZED_SKILL_RUNTIME_COMMAND]: true;
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

function mapFailure(error: unknown): AdminSkillRuntimeCommandErrorCode {
  if (error instanceof AgentSkillControlClientError) {
    const code = error.code;
    if (
      [
        "candidate_invalid",
        "activation_conflict",
        "activation_busy",
        "runtime_busy",
        "artifact_invalid",
        "skill_validation_failed",
        "activation_timeout",
        "activation_result_unknown",
        "runtime_degraded",
        "storage_unavailable",
      ].includes(code)
    ) {
      return code as AdminSkillRuntimeCommandErrorCode;
    }
    return code === "authorization_failed"
      ? "authorization_failed"
      : "runtime_degraded";
  }
  if (error instanceof SkillRegistryClientError) {
    if (error.code === "candidate_invalid") return "candidate_invalid";
    if (error.code === "skill_set_not_found") return "skill_set_not_found";
    if (
      error.code === "skill_set_state_conflict" ||
      error.code === "idempotency_conflict" ||
      error.code === "ASSERTION_REPLAY"
    ) {
      return "activation_conflict";
    }
    if (error.code === "AUTHORIZATION_FAILED") return "authorization_failed";
    return "storage_unavailable";
  }
  return "runtime_degraded";
}

export function createAdminSkillRuntimeCommands(dependencies: Dependencies) {
  const grants = new WeakSet<object>();

  function consume(context: AuthorizedSkillRuntimeCommand): void {
    if (
      typeof context !== "object" ||
      context === null ||
      !grants.delete(context)
    ) {
      throw new AdminSkillRuntimeCommandError("authorization_failed");
    }
  }

  async function audit(
    context: AuthorizedSkillRuntimeCommand,
    operation: "create" | "activate" | "discard" | "rollback",
    setId: string | null,
    activationVersion: number,
    revisionCount: number,
    requestId: string | null,
    activationRequestId: string | null,
    result: "success" | "failure",
  ): Promise<void> {
    try {
      await dependencies.audit.write({
        event: "assistant.skill_runtime_changed",
        actor: { realm: "workforce", userId: context.actor.userId },
        target: { type: "system", id: "maduoduo-skill-runtime" },
        metadata: {
          operation,
          setId,
          activationVersion,
          revisionCount,
          requestId,
          activationRequestId,
          result,
        },
      });
    } catch {
      throw new AdminSkillRuntimeCommandError("storage_unavailable");
    }
  }

  async function withAudit<T>(
    context: AuthorizedSkillRuntimeCommand,
    operation: "create" | "activate" | "discard" | "rollback",
    setId: string | null,
    activationVersion: number,
    revisionCount: number,
    requestId: string | null,
    activationRequestId: string | null,
    execute: () => Promise<T>,
  ): Promise<T> {
    let result: T;
    try {
      result = await execute();
    } catch (error) {
      await audit(
        context,
        operation,
        setId,
        activationVersion,
        revisionCount,
        requestId,
        activationRequestId,
        "failure",
      );
      if (error instanceof AdminSkillRuntimeCommandError) throw error;
      throw new AdminSkillRuntimeCommandError(mapFailure(error));
    }
    try {
      await audit(
        context,
        operation,
        setId,
        activationVersion,
        revisionCount,
        requestId,
        activationRequestId,
        "success",
      );
    } catch {
      throw new AdminSkillRuntimeCommandError("activation_result_unknown");
    }
    return result;
  }

  return {
    async authorize(request: Request): Promise<AuthorizedSkillRuntimeCommand> {
      dependencies.requireTrustedMutation(request);
      const evidence = await dependencies.requireSensitiveAction(
        "admin:assistant:skills:configure",
        { recentWithinSeconds: 600, mfaRequired: true },
      );
      const context = Object.freeze({
        [AUTHORIZED_SKILL_RUNTIME_COMMAND]: true as const,
        actor: Object.freeze({
          ...evidence.actor,
          permissions: Object.freeze([
            ...evidence.actor.permissions,
          ]) as string[],
        }),
        assuredAt: evidence.assuredAt,
      });
      grants.add(context);
      return context;
    },

    async createCandidate(
      context: AuthorizedSkillRuntimeCommand,
      input: AdminSkillCandidateCommand,
    ) {
      consume(context);
      if (
        input.agentId !== "maduoduo" ||
        !UUID.test(input.requestId) ||
        input.revisionIds.length > 16 ||
        input.revisionIds.some((revisionId) => !UUID.test(revisionId)) ||
        new Set(input.revisionIds).size !== input.revisionIds.length
      ) {
        throw new AdminSkillRuntimeCommandError("validation_error");
      }
      return withAudit(
        context,
        "create",
        null,
        0,
        input.revisionIds.length,
        input.requestId,
        null,
        () =>
          dependencies.registry.createSkillSet({
            actor: context.actor.userId,
            requestId: input.requestId,
            assuredAt: context.assuredAt,
            revisionIds: input.revisionIds,
          }),
      );
    },

    async activateCandidate(
      context: AuthorizedSkillRuntimeCommand,
      setId: string,
      input: AdminSkillActivationCommand,
    ) {
      consume(context);
      if (
        !UUID.test(setId) ||
        !UUID.test(input.requestId) ||
        !Number.isSafeInteger(input.expectedActivationVersion) ||
        input.expectedActivationVersion < 0
      ) {
        throw new AdminSkillRuntimeCommandError("validation_error");
      }
      return withAudit(
        context,
        "activate",
        setId,
        input.expectedActivationVersion,
        0,
        null,
        input.requestId,
        () =>
          dependencies.agent.activate({
            actor: context.actor.userId,
            requestId: input.requestId,
            setId,
            expectedActivationVersion: input.expectedActivationVersion,
            assuredAt: context.assuredAt,
          }),
      );
    },

    async discardCandidate(
      context: AuthorizedSkillRuntimeCommand,
      setId: string,
      input: AdminSkillDiscardCommand,
    ) {
      consume(context);
      if (!UUID.test(setId) || !UUID.test(input.requestId)) {
        throw new AdminSkillRuntimeCommandError("validation_error");
      }
      return withAudit(
        context,
        "discard",
        setId,
        0,
        0,
        input.requestId,
        null,
        () =>
          dependencies.registry.discardSkillSet({
            actor: context.actor.userId,
            requestId: input.requestId,
            assuredAt: context.assuredAt,
            setId,
          }),
      );
    },

    async rollback(
      context: AuthorizedSkillRuntimeCommand,
      input: AdminSkillRollbackCommand,
    ) {
      consume(context);
      if (
        !UUID.test(input.expectedPreviousSetId) ||
        !UUID.test(input.requestId) ||
        !UUID.test(input.activationRequestId) ||
        input.requestId === input.activationRequestId ||
        !Number.isSafeInteger(input.expectedActivationVersion) ||
        input.expectedActivationVersion < 1
      ) {
        throw new AdminSkillRuntimeCommandError("validation_error");
      }
      return withAudit(
        context,
        "rollback",
        input.expectedPreviousSetId,
        input.expectedActivationVersion,
        0,
        input.requestId,
        input.activationRequestId,
        async () => {
          const candidate = await dependencies.registry.clonePreviousSkillSet({
            actor: context.actor.userId,
            requestId: input.requestId,
            assuredAt: context.assuredAt,
            expectedActivationVersion: input.expectedActivationVersion,
            expectedPreviousSetId: input.expectedPreviousSetId,
          });
          return dependencies.agent.activate({
            actor: context.actor.userId,
            requestId: input.activationRequestId,
            setId: candidate.set.id,
            expectedActivationVersion: input.expectedActivationVersion,
            assuredAt: context.assuredAt,
          });
        },
      );
    },
  };
}

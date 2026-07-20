import "server-only";

import { randomUUID } from "node:crypto";

import {
  ADMIN_MODEL_PROVIDERS,
  parseAdminModelConfigRevisionInput,
  parseAdminModelConfigSaveInput,
  type AdminModelConfigRevisionInput,
  type AdminModelConfigSaveInput,
  type AdminModelProvider,
} from "@/features/assistant/admin-model-config-contract";
import type { PermissionKey, WorkforceActor } from "../auth/access";
import type { AuditWriteInput } from "../auth/audit";
import type { AssistantRateLimiter } from "./assistant-rate-limit";
import {
  AssistantRateLimitExceededError,
  AssistantRateLimitUnavailableError,
} from "./assistant-rate-limit";
import {
  AgentModelControlClientError,
  type AgentModelControlClient,
  type AgentModelControlClientErrorCode,
} from "./agent-model-control-client";

const AUTHORIZED_MODEL_COMMAND = Symbol("AuthorizedModelCommand");
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const AUTHORIZATION_TTL_MS = 30_000;

export type ModelCommandAction = "save" | "test_and_activate" | "reveal";

export type AuthorizedModelCommand = Readonly<{
  [AUTHORIZED_MODEL_COMMAND]: true;
  actor: WorkforceActor;
  requestId: string;
  action: ModelCommandAction;
}>;

export type AdminModelConfigCommandErrorCode =
  | AgentModelControlClientErrorCode
  | "authorization_failed"
  | "storage_unavailable"
  | "assistant_unavailable";

export class AdminModelConfigCommandError extends Error {
  constructor(readonly code: AdminModelConfigCommandErrorCode) {
    super("Admin model configuration command failed");
    this.name = "AdminModelConfigCommandError";
  }
}

type RequireSensitiveAction = (
  permission: PermissionKey,
  options?: { recentWithinSeconds?: number; mfaRequired?: boolean },
) => Promise<WorkforceActor>;

type CommandDependencies = {
  requireTrustedMutation(request: Request): void;
  requireSensitiveAction: RequireSensitiveAction;
  audit: { write(input: AuditWriteInput): Promise<void> };
  limiter: AssistantRateLimiter;
  client: AgentModelControlClient;
  requestIdFactory?: () => string;
  now?: () => number;
};

const ACTION_PERMISSION: Readonly<Record<ModelCommandAction, PermissionKey>> = {
  save: "admin:assistant:configure",
  test_and_activate: "admin:assistant:configure",
  reveal: "admin:assistant:secret:reveal",
};

function isProvider(value: unknown): value is AdminModelProvider {
  return (
    typeof value === "string" &&
    (ADMIN_MODEL_PROVIDERS as readonly string[]).includes(value)
  );
}

function safeActor(value: WorkforceActor): WorkforceActor {
  const permissions = Object.freeze([...value.permissions]) as PermissionKey[];
  return Object.freeze({ ...value, permissions });
}

function commandFailure(error: unknown): AdminModelConfigCommandErrorCode {
  return error instanceof AgentModelControlClientError
    ? error.code
    : "assistant_unavailable";
}

export function createAdminModelConfigCommands(
  dependencies: CommandDependencies,
) {
  const authorized = new WeakMap<
    object,
    { action: ModelCommandAction; expiresAt: number }
  >();
  const requestIdFactory = dependencies.requestIdFactory ?? randomUUID;
  const now = dependencies.now ?? Date.now;

  function readNow(): number {
    let value: number;
    try {
      value = now();
    } catch {
      throw new AdminModelConfigCommandError("assistant_unavailable");
    }
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new AdminModelConfigCommandError("assistant_unavailable");
    }
    return value;
  }

  function consumeAuthorization(
    context: AuthorizedModelCommand,
    action: ModelCommandAction,
  ): void {
    if (typeof context !== "object" || context === null) {
      throw new AdminModelConfigCommandError("authorization_failed");
    }
    const grant = authorized.get(context);
    authorized.delete(context);
    if (grant === undefined) {
      throw new AdminModelConfigCommandError("authorization_failed");
    }
    const currentTime = readNow();
    if (grant.action !== action || currentTime > grant.expiresAt) {
      throw new AdminModelConfigCommandError("authorization_failed");
    }
  }

  async function writeAudit(input: AuditWriteInput): Promise<void> {
    try {
      await dependencies.audit.write(input);
    } catch {
      throw new AdminModelConfigCommandError("storage_unavailable");
    }
  }

  async function preflight(
    context: AuthorizedModelCommand,
    provider: AdminModelProvider,
    revision: number,
  ): Promise<{
    provider: AdminModelProvider;
    modelId: string;
    endpointId: string;
    revision: number;
  }> {
    let listed: Awaited<
      ReturnType<AgentModelControlClient["listModelConfigs"]>
    >;
    try {
      listed = await dependencies.client.listModelConfigs({
        requestId: context.requestId,
      });
    } catch {
      throw new AdminModelConfigCommandError("assistant_unavailable");
    }
    const current = listed.configs.find(
      (candidate) => candidate.provider === provider,
    );
    if (current === undefined || current.revision !== revision) {
      throw new AdminModelConfigCommandError("configuration_conflict");
    }
    return {
      provider: current.provider,
      modelId: current.modelId,
      endpointId: current.endpointId,
      revision: current.revision,
    };
  }

  return {
    async authorize(
      request: Request,
      action: ModelCommandAction,
    ): Promise<AuthorizedModelCommand> {
      dependencies.requireTrustedMutation(request);
      if (!Object.hasOwn(ACTION_PERMISSION, action)) {
        throw new AdminModelConfigCommandError("validation_error");
      }
      const actor = await dependencies.requireSensitiveAction(
        ACTION_PERMISSION[action],
        { recentWithinSeconds: 600, mfaRequired: true },
      );
      const issuedAt = readNow();
      if (issuedAt > Number.MAX_SAFE_INTEGER - AUTHORIZATION_TTL_MS) {
        throw new AdminModelConfigCommandError("assistant_unavailable");
      }
      const requestId = requestIdFactory();
      if (!CANONICAL_UUID.test(requestId)) {
        throw new AdminModelConfigCommandError("assistant_unavailable");
      }
      const context = Object.freeze({
        [AUTHORIZED_MODEL_COMMAND]: true as const,
        actor: safeActor(actor),
        requestId,
        action,
      });
      authorized.set(context, {
        action,
        expiresAt: issuedAt + AUTHORIZATION_TTL_MS,
      });
      return context;
    },

    async save(
      context: AuthorizedModelCommand,
      provider: AdminModelProvider,
      rawInput: AdminModelConfigSaveInput,
    ) {
      consumeAuthorization(context, "save");
      if (!isProvider(provider)) {
        throw new AdminModelConfigCommandError("validation_error");
      }
      let input: AdminModelConfigSaveInput | null =
        parseAdminModelConfigSaveInput(rawInput);
      if (input === null || input.expectedRevision >= Number.MAX_SAFE_INTEGER) {
        throw new AdminModelConfigCommandError("validation_error");
      }
      const revision = input.expectedRevision + 1;
      const requestedMetadata = {
        provider,
        modelId: input.modelId,
        endpointId: input.endpointId,
        revision,
        requestId: context.requestId,
        result: "requested" as const,
      };

      try {
        await writeAudit({
          event: "assistant.model_config_save_requested",
          actor: { realm: "workforce", userId: context.actor.userId },
          target: { type: "assistant_model_config", id: provider },
          metadata: requestedMetadata,
        });

        let response: Awaited<
          ReturnType<AgentModelControlClient["saveModelConfig"]>
        > | null = null;
        let failure: AdminModelConfigCommandErrorCode | null = null;
        try {
          response = await dependencies.client.saveModelConfig({
            actor: context.actor.userId,
            provider,
            requestId: context.requestId,
            input,
          });
        } catch (error) {
          failure = commandFailure(error);
        }

        const resultMetadata = response?.config ?? {
          provider,
          modelId: input.modelId,
          endpointId: input.endpointId,
          revision,
        };
        await writeAudit({
          event: "assistant.model_config_saved",
          actor: { realm: "workforce", userId: context.actor.userId },
          target: { type: "assistant_model_config", id: provider },
          metadata: {
            provider: resultMetadata.provider,
            modelId: resultMetadata.modelId,
            endpointId: resultMetadata.endpointId,
            revision: resultMetadata.revision,
            requestId: context.requestId,
            result: failure === null ? "success" : "failure",
          },
        });
        if (failure !== null) {
          throw new AdminModelConfigCommandError(failure);
        }
        if (response === null) {
          throw new AdminModelConfigCommandError("assistant_unavailable");
        }
        return { requestId: context.requestId, config: response.config };
      } finally {
        input = null;
        rawInput = undefined as never;
      }
    },

    async testAndActivate(
      context: AuthorizedModelCommand,
      provider: AdminModelProvider,
      rawInput: AdminModelConfigRevisionInput,
    ) {
      consumeAuthorization(context, "test_and_activate");
      if (!isProvider(provider)) {
        throw new AdminModelConfigCommandError("validation_error");
      }
      let input: AdminModelConfigRevisionInput | null =
        parseAdminModelConfigRevisionInput(rawInput);
      if (input === null) {
        throw new AdminModelConfigCommandError("validation_error");
      }

      try {
        const metadata = await preflight(context, provider, input.revision);
        const auditEnvelope = {
          actor: { realm: "workforce" as const, userId: context.actor.userId },
          target: {
            type: "assistant_model_config" as const,
            id: provider,
          },
        };
        const requestedMetadata = {
          ...metadata,
          requestId: context.requestId,
          result: "requested" as const,
        };
        await writeAudit({
          event: "assistant.model_config_test_requested",
          ...auditEnvelope,
          metadata: requestedMetadata,
        });
        await writeAudit({
          event: "assistant.model_config_activation_requested",
          ...auditEnvelope,
          metadata: requestedMetadata,
        });

        let activation: Awaited<
          ReturnType<AgentModelControlClient["testAndActivate"]>
        > | null = null;
        let failure: AdminModelConfigCommandErrorCode | null = null;
        let testSucceeded = false;
        try {
          activation = await dependencies.client.testAndActivate({
            actor: context.actor.userId,
            provider,
            requestId: context.requestId,
            input,
          });
          testSucceeded = true;
        } catch (error) {
          failure = commandFailure(error);
          testSucceeded =
            error instanceof AgentModelControlClientError &&
            error.testResult === "success";
        }

        const completedTestMetadata = {
          ...metadata,
          requestId: context.requestId,
          result: testSucceeded ? ("success" as const) : ("failure" as const),
        };
        const completedActivationMetadata = {
          ...metadata,
          requestId: context.requestId,
          result:
            failure === null ? ("success" as const) : ("failure" as const),
        };
        await writeAudit({
          event: "assistant.model_config_tested",
          ...auditEnvelope,
          metadata: completedTestMetadata,
        });
        await writeAudit({
          event: "assistant.model_config_activated",
          ...auditEnvelope,
          metadata: completedActivationMetadata,
        });
        if (failure !== null) {
          throw new AdminModelConfigCommandError(failure);
        }
        if (activation === null) {
          throw new AdminModelConfigCommandError("assistant_unavailable");
        }
        return { requestId: context.requestId, activation };
      } finally {
        input = null;
        rawInput = undefined as never;
      }
    },

    async reveal(
      context: AuthorizedModelCommand,
      provider: AdminModelProvider,
      rawInput: AdminModelConfigRevisionInput,
    ): Promise<Response> {
      consumeAuthorization(context, "reveal");
      if (!isProvider(provider)) {
        throw new AdminModelConfigCommandError("validation_error");
      }
      let input: AdminModelConfigRevisionInput | null =
        parseAdminModelConfigRevisionInput(rawInput);
      if (input === null) {
        throw new AdminModelConfigCommandError("validation_error");
      }
      let key: string | null = null;

      try {
        try {
          await dependencies.limiter.consume({
            scope: "admin-key-reveal",
            actorId: context.actor.userId,
          });
        } catch (error) {
          if (
            error instanceof AssistantRateLimitExceededError ||
            error instanceof AssistantRateLimitUnavailableError
          ) {
            throw error;
          }
          throw new AdminModelConfigCommandError("assistant_unavailable");
        }

        const metadata = await preflight(context, provider, input.revision);
        const auditEnvelope = {
          actor: { realm: "workforce" as const, userId: context.actor.userId },
          target: {
            type: "assistant_model_config" as const,
            id: provider,
          },
        };
        await writeAudit({
          event: "assistant.model_key_reveal_requested",
          ...auditEnvelope,
          metadata: {
            ...metadata,
            requestId: context.requestId,
            result: "requested",
          },
        });

        let failure: AdminModelConfigCommandErrorCode | null = null;
        try {
          key = (
            await dependencies.client.revealKey({
              actor: context.actor.userId,
              provider,
              requestId: context.requestId,
              input,
            })
          ).key;
        } catch (error) {
          failure = commandFailure(error);
        }

        await writeAudit({
          event: "assistant.model_key_revealed",
          ...auditEnvelope,
          metadata: {
            ...metadata,
            requestId: context.requestId,
            result: failure === null ? "success" : "failure",
          },
        });
        if (failure !== null || key === null) {
          throw new AdminModelConfigCommandError(
            failure ?? "assistant_unavailable",
          );
        }
        try {
          return Response.json(
            { version: "1", requestId: context.requestId, key },
            {
              headers: {
                "Cache-Control": "no-store, private",
                Pragma: "no-cache",
              },
            },
          );
        } catch {
          throw new AdminModelConfigCommandError("assistant_unavailable");
        }
      } finally {
        key = null;
        input = null;
        rawInput = undefined as never;
      }
    },
  };
}

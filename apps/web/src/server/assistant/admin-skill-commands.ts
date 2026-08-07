import "server-only";

import { randomUUID } from "node:crypto";

import type { AdminSkillRevisionResponse } from "@/features/assistant/admin-skill-contract";
import type { PermissionKey, WorkforceActor } from "../auth/access";
import type {
  AssistantSkillAuditMetadata,
  AuditWriteInput,
} from "../auth/audit";
import type { SkillRegistryClient } from "./skill-registry-client";

declare const AUTHORIZED_SKILL_COMMAND: unique symbol;

const AUTHORIZATION_TTL_MS = 30_000;
const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type AdminSkillCommandAction = "upload";

export type AuthorizedSkillCommand = Readonly<{
  [AUTHORIZED_SKILL_COMMAND]: true;
  actor: WorkforceActor;
  requestId: string;
  action: AdminSkillCommandAction;
}>;

export type AdminSkillUploadInput = {
  archive: Uint8Array;
  targetSkillId?: string;
};

export type AdminSkillCommandErrorCode =
  | "authorization_failed"
  | "validation_error"
  | "storage_unavailable"
  | "registry_unavailable";

export class AdminSkillCommandError extends Error {
  constructor(readonly code: AdminSkillCommandErrorCode) {
    super("Admin skill command failed");
    this.name = "AdminSkillCommandError";
  }
}

type CommandDependencies = {
  requireTrustedUploadMutation(request: Request): void;
  requirePermission(permission: PermissionKey): Promise<WorkforceActor>;
  audit: { write(input: AuditWriteInput): Promise<void> };
  client: SkillRegistryClient;
  requestIdFactory?: () => string;
  now?: () => number;
};

type Grant = {
  action: AdminSkillCommandAction;
  expiresAt: number;
};

function exactRecord(
  value: unknown,
  keySets: readonly (readonly string[])[],
): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return null;
    const expected = keySets.find(
      (candidate) =>
        candidate.length === keys.length &&
        candidate.every((key) => (keys as string[]).includes(key)),
    );
    if (expected === undefined) return null;
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of expected) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function safeActor(value: WorkforceActor): WorkforceActor {
  const permissions = Object.freeze([...value.permissions]) as PermissionKey[];
  return Object.freeze({ ...value, permissions });
}

function readUploadInput(value: unknown): AdminSkillUploadInput | null {
  const input = exactRecord(value, [["archive"], ["archive", "targetSkillId"]]);
  if (
    input === null ||
    !(input.archive instanceof Uint8Array) ||
    Reflect.getPrototypeOf(input.archive) !== Uint8Array.prototype ||
    input.archive.byteLength < 1 ||
    input.archive.byteLength > MAX_ARCHIVE_BYTES ||
    (input.targetSkillId !== undefined &&
      (typeof input.targetSkillId !== "string" ||
        !UUID.test(input.targetSkillId)))
  ) {
    return null;
  }
  return {
    archive: input.archive,
    ...(input.targetSkillId === undefined
      ? {}
      : { targetSkillId: input.targetSkillId as string }),
  };
}

function auditMetadata<Result extends "requested" | "success" | "failure">(
  requestId: string,
  result: Result,
  revision: AdminSkillRevisionResponse["revision"] | null,
  fallbackSkillId: string | null,
  fallbackRevisionId: string | null = null,
): AssistantSkillAuditMetadata<Result> {
  return {
    skillId: revision?.skillId ?? fallbackSkillId,
    revisionId: revision?.id ?? fallbackRevisionId,
    revisionNo: revision?.number ?? null,
    digest: revision?.artifactSha256.slice(0, 12) ?? null,
    requestId,
    result,
  };
}

export function createAdminSkillCommands(dependencies: CommandDependencies) {
  const authorized = new WeakMap<object, Grant>();
  const requestIdFactory = dependencies.requestIdFactory ?? randomUUID;
  const now = dependencies.now ?? Date.now;

  function readNow(): number {
    let value: number;
    try {
      value = now();
    } catch {
      throw new AdminSkillCommandError("registry_unavailable");
    }
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new AdminSkillCommandError("registry_unavailable");
    }
    return value;
  }

  function consume(
    context: AuthorizedSkillCommand,
    action: AdminSkillCommandAction,
  ): Grant {
    if (typeof context !== "object" || context === null) {
      throw new AdminSkillCommandError("authorization_failed");
    }
    const grant = authorized.get(context);
    authorized.delete(context);
    if (
      grant === undefined ||
      grant.action !== action ||
      readNow() >= grant.expiresAt
    ) {
      throw new AdminSkillCommandError("authorization_failed");
    }
    return grant;
  }

  async function initialAudit(input: AuditWriteInput): Promise<void> {
    try {
      await dependencies.audit.write(input);
    } catch {
      throw new AdminSkillCommandError("storage_unavailable");
    }
  }

  return {
    async authorize(
      request: Request,
      action: AdminSkillCommandAction,
    ): Promise<AuthorizedSkillCommand> {
      dependencies.requireTrustedUploadMutation(request);
      const actor = await dependencies.requirePermission(
        "admin:assistant:skills:upload",
      );
      const issuedAt = readNow();
      if (issuedAt > Number.MAX_SAFE_INTEGER - AUTHORIZATION_TTL_MS) {
        throw new AdminSkillCommandError("registry_unavailable");
      }
      const requestId = requestIdFactory();
      if (!UUID.test(requestId)) {
        throw new AdminSkillCommandError("registry_unavailable");
      }
      const context = Object.freeze({
        actor: safeActor(actor),
        requestId,
        action,
      }) as AuthorizedSkillCommand;
      authorized.set(context, {
        action,
        expiresAt: issuedAt + AUTHORIZATION_TTL_MS,
      });
      return context;
    },

    async upload(
      context: AuthorizedSkillCommand,
      rawInput: AdminSkillUploadInput,
    ): Promise<AdminSkillRevisionResponse> {
      consume(context, "upload");
      let input = readUploadInput(rawInput);
      if (input === null) {
        throw new AdminSkillCommandError("validation_error");
      }
      const fallbackSkillId = input.targetSkillId ?? null;
      const envelope = {
        actor: { realm: "workforce" as const, userId: context.actor.userId },
        target: { type: "assistant_skill_revision" as const },
      };
      try {
        await initialAudit({
          event: "assistant.skill_upload_requested",
          ...envelope,
          metadata: auditMetadata(
            context.requestId,
            "requested",
            null,
            fallbackSkillId,
          ),
        });
        let response: AdminSkillRevisionResponse | null = null;
        let failed = false;
        let primary: unknown;
        try {
          response = await dependencies.client.uploadSkill({
            actor: context.actor.userId,
            requestId: context.requestId,
            archive: input.archive,
            ...(input.targetSkillId === undefined
              ? {}
              : { targetSkillId: input.targetSkillId }),
          });
        } catch (error) {
          failed = true;
          primary = error;
        }
        try {
          await dependencies.audit.write({
            event: "assistant.skill_upload_completed",
            ...envelope,
            target: {
              ...envelope.target,
              ...(response === null ? {} : { id: response.revision.id }),
            },
            metadata: auditMetadata(
              context.requestId,
              failed ? "failure" : "success",
              response?.revision ?? null,
              fallbackSkillId,
            ),
          });
        } catch {
          if (!failed) {
            throw new AdminSkillCommandError("storage_unavailable");
          }
        }
        if (failed) throw primary;
        if (response === null) {
          throw new AdminSkillCommandError("registry_unavailable");
        }
        return response;
      } finally {
        input = null;
        rawInput = undefined as never;
      }
    },
  };
}

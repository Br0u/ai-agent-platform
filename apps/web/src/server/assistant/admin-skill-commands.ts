import "server-only";

import { randomUUID } from "node:crypto";

import type { AdminSkillRevisionResponse } from "@/features/assistant/admin-skill-contract";
import type { PermissionKey, WorkforceActor } from "../auth/access";
import type {
  AssistantSkillAuditMetadata,
  AuditWriteInput,
} from "../auth/audit";
import type { WorkforceAssuranceEvidence } from "../auth/sensitive-action";
import type {
  SkillRegistryClient,
  SkillRegistryReviewInput,
} from "./skill-registry-client";

declare const AUTHORIZED_SKILL_COMMAND: unique symbol;

const AUTHORIZATION_TTL_MS = 30_000;
const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;

export type AdminSkillCommandAction = "upload" | "review";

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

export type AdminSkillReviewInput = SkillRegistryReviewInput & {
  skillId: string;
  revisionId: string;
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

type RequireSensitiveAction = (
  permission: PermissionKey,
  options: { recentWithinSeconds: number; mfaRequired: true },
) => Promise<WorkforceAssuranceEvidence>;

type CommandDependencies = {
  requireTrustedUploadMutation(request: Request): void;
  requireTrustedJsonMutation(request: Request): void;
  requirePermission(permission: PermissionKey): Promise<WorkforceActor>;
  requireSensitiveAction: RequireSensitiveAction;
  audit: { write(input: AuditWriteInput): Promise<void> };
  client: SkillRegistryClient;
  requestIdFactory?: () => string;
  now?: () => number;
};

type Grant = {
  action: AdminSkillCommandAction;
  expiresAt: number;
  assuredAt: number | null;
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

function readReviewInput(value: unknown): AdminSkillReviewInput | null {
  const input = exactRecord(value, [
    [
      "skillId",
      "revisionId",
      "decision",
      "reason",
      "expectedState",
      "attestations",
    ],
  ]);
  const attestations = exactRecord(input?.attestations, [
    [
      "contentReviewed",
      "usageRightsConfirmed",
      "executionRiskAccepted",
      "independentReviewerConfirmed",
    ],
  ]);
  if (
    input === null ||
    attestations === null ||
    typeof input.skillId !== "string" ||
    !UUID.test(input.skillId) ||
    typeof input.revisionId !== "string" ||
    !UUID.test(input.revisionId) ||
    (input.decision !== "approve" && input.decision !== "reject") ||
    input.expectedState !== "pending_review" ||
    attestations.contentReviewed !== true ||
    attestations.usageRightsConfirmed !== true ||
    attestations.executionRiskAccepted !== true ||
    attestations.independentReviewerConfirmed !== true
  ) {
    return null;
  }
  if (
    (input.decision === "approve" && input.reason !== null) ||
    (input.decision === "reject" &&
      (typeof input.reason !== "string" ||
        input.reason.length === 0 ||
        input.reason !== input.reason.trim() ||
        Array.from(input.reason).length > 500 ||
        Buffer.byteLength(input.reason, "utf8") > 2_048 ||
        !hasOnlyPairedSurrogates(input.reason) ||
        CONTROL_CHARACTER.test(input.reason)))
  ) {
    return null;
  }
  return {
    skillId: input.skillId,
    revisionId: input.revisionId,
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
      if (action === "upload") {
        dependencies.requireTrustedUploadMutation(request);
      } else if (action === "review") {
        dependencies.requireTrustedJsonMutation(request);
      } else {
        throw new AdminSkillCommandError("validation_error");
      }
      let actor: WorkforceActor;
      let assuredAt: number | null = null;
      if (action === "upload") {
        actor = await dependencies.requirePermission(
          "admin:assistant:skills:upload",
        );
      } else {
        const evidence = await dependencies.requireSensitiveAction(
          "admin:assistant:skills:review",
          { recentWithinSeconds: 600, mfaRequired: true },
        );
        actor = evidence.actor;
        assuredAt = evidence.assuredAt;
      }
      const issuedAt = readNow();
      const issuedAtSeconds = Math.floor(issuedAt / 1000);
      if (
        issuedAt > Number.MAX_SAFE_INTEGER - AUTHORIZATION_TTL_MS ||
        (action === "review" &&
          (assuredAt === null ||
            !Number.isSafeInteger(assuredAt) ||
            assuredAt < 0 ||
            assuredAt > issuedAtSeconds ||
            assuredAt < issuedAtSeconds - 600))
      ) {
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
        assuredAt,
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

    async review(
      context: AuthorizedSkillCommand,
      rawInput: AdminSkillReviewInput,
    ): Promise<AdminSkillRevisionResponse> {
      const grant = consume(context, "review");
      let input = readReviewInput(rawInput);
      if (input === null || grant.assuredAt === null) {
        throw new AdminSkillCommandError("validation_error");
      }
      const envelope = {
        actor: { realm: "workforce" as const, userId: context.actor.userId },
        target: {
          type: "assistant_skill_revision" as const,
          id: input.revisionId,
        },
      };
      try {
        await initialAudit({
          event: "assistant.skill_review_requested",
          ...envelope,
          metadata: auditMetadata(
            context.requestId,
            "requested",
            null,
            input.skillId,
            input.revisionId,
          ),
        });
        let response: AdminSkillRevisionResponse | null = null;
        let failed = false;
        let primary: unknown;
        try {
          response = await dependencies.client.reviewRevision({
            actor: context.actor.userId,
            requestId: context.requestId,
            skillId: input.skillId,
            revisionId: input.revisionId,
            assuredAt: grant.assuredAt,
            input: {
              decision: input.decision,
              reason: input.reason,
              expectedState: input.expectedState,
              attestations: input.attestations,
            },
          });
        } catch (error) {
          failed = true;
          primary = error;
        }
        try {
          await dependencies.audit.write({
            event: "assistant.skill_review_completed",
            ...envelope,
            metadata: auditMetadata(
              context.requestId,
              failed ? "failure" : "success",
              response?.revision ?? null,
              input.skillId,
              input.revisionId,
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

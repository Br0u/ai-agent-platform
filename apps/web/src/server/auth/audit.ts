import "server-only";

import { auditLogs, getDatabase } from "@ai-agent-platform/database";

import type { IdentityRealm } from "./access";

const AUDIT_METADATA_ALLOWLIST = {
  "auth.login_success": ["method"],
  "auth.login_failure": ["reason"],
  "auth.logout": [],
  "registration.submitted": ["source"],
  "registration.approved": ["role"],
  "registration.rejected": ["reason"],
  "auth.password_changed": ["sessionsRevoked"],
  "auth.totp_enabled": [],
  "auth.totp_disabled": [],
  "auth.recovery_code_used": [],
  "workforce.user_created": ["initialRole"],
  "workforce.user_updated": ["change"],
  "bootstrap.super_admin_created": [],
} as const;

export type AuditEvent = keyof typeof AUDIT_METADATA_ALLOWLIST;
type AuditPrimitive = string | number | boolean | null;

export type AuditRecord = {
  action: AuditEvent;
  actorRealm: IdentityRealm | null;
  actorUserId: string | null;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, AuditPrimitive>;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuditRepository = {
  insert(record: AuditRecord): Promise<void>;
};

export type AuditWriteInput = {
  event: AuditEvent;
  actor?: { realm: IdentityRealm; userId: string };
  target: { type: string; id?: string };
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

function isAuditPrimitive(value: unknown): value is AuditPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function allowedMetadata(
  event: AuditEvent,
  metadata: Record<string, unknown> | undefined,
): Record<string, AuditPrimitive> {
  if (!metadata) return {};

  const allowedKeys: readonly string[] = AUDIT_METADATA_ALLOWLIST[event];
  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const value = metadata[key];
      return isAuditPrimitive(value) ? [[key, value] as const] : [];
    }),
  );
}

export function createDatabaseAuditRepository(): AuditRepository {
  const database = getDatabase();
  return {
    async insert(record) {
      await database.insert(auditLogs).values(record);
    },
  };
}

export function createAuditWriter(
  repository: AuditRepository = createDatabaseAuditRepository(),
) {
  return {
    async write(input: AuditWriteInput): Promise<void> {
      await repository.insert({
        action: input.event,
        actorRealm: input.actor?.realm ?? null,
        actorUserId: input.actor?.userId ?? null,
        targetType: input.target.type,
        targetId: input.target.id ?? null,
        metadata: allowedMetadata(input.event, input.metadata),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
    },
  };
}

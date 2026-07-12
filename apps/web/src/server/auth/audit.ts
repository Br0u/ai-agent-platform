import "server-only";

import { auditLogs, getDatabase } from "@ai-agent-platform/database";

import type { IdentityRealm } from "./access";

const LOGIN_METHODS = ["email", "username", "recovery_code"] as const;
const LOGIN_FAILURE_REASONS = [
  "invalid_credentials",
  "account_disabled",
  "account_not_active",
  "realm_mismatch",
  "rate_limited",
  "unknown",
] as const;
const REGISTRATION_SOURCES = ["self_service"] as const;
const REGISTRATION_REJECTION_CATEGORIES = [
  "duplicate",
  "ineligible",
  "invalid_organization",
  "other",
] as const;
const CUSTOMER_ROLE_NAMES = ["customer_member", "customer_admin"] as const;
const WORKFORCE_ROLE_NAMES = [
  "employee",
  "content_operator",
  "support_operator",
  "admin",
  "super_admin",
] as const;
const USER_CHANGES = [
  "disabled",
  "reactivated",
  "password_replaced",
  "role_added",
  "role_removed",
  "role_changed",
  "permissions_changed",
] as const;
const TARGET_TYPES = [
  "user",
  "session",
  "registration",
  "organization",
  "role",
  "permission",
  "system",
] as const;

type LoginMethod = (typeof LOGIN_METHODS)[number];
type LoginFailureReason = (typeof LOGIN_FAILURE_REASONS)[number];
type RegistrationSource = (typeof REGISTRATION_SOURCES)[number];
type RegistrationRejectionCategory =
  (typeof REGISTRATION_REJECTION_CATEGORIES)[number];
type CustomerRoleName = (typeof CUSTOMER_ROLE_NAMES)[number];
type WorkforceRoleName = (typeof WORKFORCE_ROLE_NAMES)[number];
type UserChange = (typeof USER_CHANGES)[number];
type SimpleUserChange = Exclude<
  UserChange,
  "role_added" | "role_removed" | "role_changed"
>;
export type AuditTargetType = (typeof TARGET_TYPES)[number];

export type AuditMetadataByEvent = {
  "auth.login_success": { method: LoginMethod };
  "auth.login_failure": { reason: LoginFailureReason };
  "auth.logout": Record<never, never>;
  "registration.submitted": { source: RegistrationSource };
  "registration.approved": { role: CustomerRoleName };
  "registration.rejected": { category: RegistrationRejectionCategory };
  "auth.password_changed": { sessionsRevoked: number };
  "auth.totp_enabled": Record<never, never>;
  "auth.totp_disabled": Record<never, never>;
  "auth.recovery_code_used": Record<never, never>;
  "session.revoked": { revokedCount: number };
  "role.permissions_changed": { permissionCount: number };
  "site.config_changed": { field: "supportMessage" };
  "workforce.user_created": { initialRole: WorkforceRoleName };
  "workforce.user_updated":
    | { change: SimpleUserChange }
    | {
        change: "role_added" | "role_removed";
        role: WorkforceRoleName;
      }
    | {
        change: "role_changed";
        fromRole: WorkforceRoleName;
        toRole: WorkforceRoleName;
      };
  "bootstrap.super_admin_created": Record<never, never>;
};

export type AuditEvent = keyof AuditMetadataByEvent;
type AuditPrimitive = string | number | boolean | null;
type SanitizedMetadata = Record<string, AuditPrimitive>;

type AuditEnvelope = {
  actor?: { realm: IdentityRealm; userId: string };
  target: { type: AuditTargetType; id?: string };
  ipAddress?: string;
  userAgent?: string;
};

export type AuditWriteInput = {
  [Event in AuditEvent]: AuditEnvelope & {
    event: Event;
  } & (keyof AuditMetadataByEvent[Event] extends never
      ? { metadata?: never }
      : { metadata: AuditMetadataByEvent[Event] });
}[AuditEvent];

export type AuditRecord = {
  action: AuditEvent;
  actorRealm: IdentityRealm | null;
  actorUserId: string | null;
  targetType: AuditTargetType;
  targetId: string | null;
  metadata: SanitizedMetadata;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuditRepository = {
  insert(record: AuditRecord): Promise<void>;
};

export class AuditInputError extends Error {
  readonly code = "AUDIT_INPUT_INVALID";

  constructor(field: string) {
    super(`Invalid audit field: ${field}`);
    this.name = "AuditInputError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new AuditInputError(field);
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new AuditInputError(field);
  }
  return value;
}

function assertOnlyKeys(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new AuditInputError(field);
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new AuditInputError(field);
  }
  return value;
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  field: string,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new AuditInputError(field);
  }
  return value as Values[number];
}

function emptyMetadata(value: unknown): SanitizedMetadata {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new AuditInputError("metadata");
  return {};
}

function enumMetadata<const Values extends readonly string[]>(
  value: unknown,
  key: string,
  values: Values,
): SanitizedMetadata {
  if (!isRecord(value) || !Object.hasOwn(value, key)) {
    throw new AuditInputError(`metadata.${key}`);
  }
  const metadata = value;
  return { [key]: enumValue(metadata[key], values, `metadata.${key}`) };
}

function sessionsRevokedMetadata(value: unknown): SanitizedMetadata {
  if (!isRecord(value) || !Object.hasOwn(value, "sessionsRevoked")) {
    throw new AuditInputError("metadata.sessionsRevoked");
  }
  const metadata = value;
  const count = metadata.sessionsRevoked;
  if (
    typeof count !== "number" ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > 10_000
  ) {
    throw new AuditInputError("metadata.sessionsRevoked");
  }
  return { sessionsRevoked: count };
}

function countMetadata(value: unknown, key: string): SanitizedMetadata {
  if (!isRecord(value) || !Object.hasOwn(value, key))
    throw new AuditInputError(`metadata.${key}`);
  const count = value[key];
  if (
    typeof count !== "number" ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > 10_000
  )
    throw new AuditInputError(`metadata.${key}`);
  return { [key]: count };
}

function workforceUserUpdatedMetadata(value: unknown): SanitizedMetadata {
  if (!isRecord(value) || !Object.hasOwn(value, "change"))
    throw new AuditInputError("metadata.change");
  if (value.change === "role_changed") {
    const metadata = assertExactKeys(
      value,
      ["change", "fromRole", "toRole"],
      "metadata",
    );
    return {
      change: "role_changed",
      fromRole: enumValue(
        metadata.fromRole,
        WORKFORCE_ROLE_NAMES,
        "metadata.fromRole",
      ),
      toRole: enumValue(
        metadata.toRole,
        WORKFORCE_ROLE_NAMES,
        "metadata.toRole",
      ),
    };
  }
  if (value.change === "role_added" || value.change === "role_removed") {
    const metadata = assertExactKeys(value, ["change", "role"], "metadata");
    return {
      change: value.change,
      role: enumValue(metadata.role, WORKFORCE_ROLE_NAMES, "metadata.role"),
    };
  }
  const metadata = assertExactKeys(value, ["change"], "metadata");
  return {
    change: enumValue(metadata.change, USER_CHANGES, "metadata.change"),
  };
}

type AuditMetadataSchema = (value: unknown) => SanitizedMetadata;

export const AUDIT_EVENT_SCHEMAS: Readonly<
  Record<AuditEvent, AuditMetadataSchema>
> = Object.freeze({
  "auth.login_success": (value) => enumMetadata(value, "method", LOGIN_METHODS),
  "auth.login_failure": (value) =>
    enumMetadata(value, "reason", LOGIN_FAILURE_REASONS),
  "auth.logout": emptyMetadata,
  "registration.submitted": (value) =>
    enumMetadata(value, "source", REGISTRATION_SOURCES),
  "registration.approved": (value) =>
    enumMetadata(value, "role", CUSTOMER_ROLE_NAMES),
  "registration.rejected": (value) =>
    enumMetadata(value, "category", REGISTRATION_REJECTION_CATEGORIES),
  "auth.password_changed": sessionsRevokedMetadata,
  "auth.totp_enabled": emptyMetadata,
  "auth.totp_disabled": emptyMetadata,
  "auth.recovery_code_used": emptyMetadata,
  "session.revoked": (value) => countMetadata(value, "revokedCount"),
  "role.permissions_changed": (value) =>
    countMetadata(value, "permissionCount"),
  "site.config_changed": (value) =>
    enumMetadata(value, "field", ["supportMessage"] as const),
  "workforce.user_created": (value) =>
    enumMetadata(value, "initialRole", WORKFORCE_ROLE_NAMES),
  "workforce.user_updated": workforceUserUpdatedMetadata,
  "bootstrap.super_admin_created": emptyMetadata,
});

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function boundedString(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    CONTROL_CHARACTERS.test(value)
  ) {
    throw new AuditInputError(field);
  }
  return value;
}

function validateInput(input: AuditWriteInput): AuditRecord {
  const envelope = assertOnlyKeys(
    input,
    ["event", "actor", "target", "metadata", "ipAddress", "userAgent"],
    "input",
  );
  if (!Object.hasOwn(envelope, "event")) {
    throw new AuditInputError("event");
  }
  const rawEvent = envelope.event;
  if (
    typeof rawEvent !== "string" ||
    !Object.hasOwn(AUDIT_EVENT_SCHEMAS, rawEvent)
  ) {
    throw new AuditInputError("event");
  }
  const event = rawEvent as AuditEvent;
  const schema = AUDIT_EVENT_SCHEMAS[event];
  if (!Object.hasOwn(envelope, "target")) {
    throw new AuditInputError("target");
  }
  const target = assertOnlyKeys(envelope.target, ["type", "id"], "target");
  const actor =
    !Object.hasOwn(envelope, "actor") || envelope.actor === undefined
      ? undefined
      : assertExactKeys(envelope.actor, ["realm", "userId"], "actor");

  return {
    action: event,
    actorRealm: actor
      ? enumValue(
          actor.realm,
          ["customer", "workforce"] as const,
          "actor.realm",
        )
      : null,
    actorUserId: actor
      ? boundedString(actor.userId, "actor.userId", 128)
      : null,
    targetType: enumValue(target.type, TARGET_TYPES, "target.type"),
    targetId:
      target.id === undefined
        ? null
        : boundedString(target.id, "target.id", 128),
    metadata: schema(
      Object.hasOwn(envelope, "metadata") ? envelope.metadata : undefined,
    ),
    ipAddress:
      !Object.hasOwn(envelope, "ipAddress") || envelope.ipAddress === undefined
        ? null
        : boundedString(envelope.ipAddress, "ipAddress", 64),
    userAgent:
      !Object.hasOwn(envelope, "userAgent") || envelope.userAgent === undefined
        ? null
        : boundedString(envelope.userAgent, "userAgent", 512),
  };
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
      await repository.insert(validateInput(input));
    },
  };
}

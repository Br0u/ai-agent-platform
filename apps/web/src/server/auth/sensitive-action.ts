import "server-only";

import { headers as nextHeaders } from "next/headers";

import {
  requirePermission,
  requireWorkforce,
  type PermissionKey,
  type WorkforceActor,
} from "./access";
import { getStaffAuth } from "./staff-auth";

export type SensitiveSession = {
  id: string;
  userId: string;
  realm: "customer" | "workforce";
  createdAt: Date;
  mfaVerifiedAt: Date | null;
};

export type SensitiveActionErrorCode =
  | "AUTH_REAUTH_REQUIRED"
  | "AUTH_MFA_REQUIRED";

export class SensitiveActionError extends Error {
  readonly redirectTo = "/staff/re-auth";
  constructor(readonly code: SensitiveActionErrorCode) {
    super(code);
    this.name = "SensitiveActionError";
  }
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  return null;
}

export function parseSensitiveSession(value: unknown): SensitiveSession | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as Record<string, unknown>;
  if (!envelope.session || typeof envelope.session !== "object") return null;
  const session = envelope.session as Record<string, unknown>;
  const createdAt = asDate(session.createdAt);
  if (
    typeof session.id !== "string" ||
    typeof session.userId !== "string" ||
    (session.realm !== "customer" && session.realm !== "workforce") ||
    !createdAt
  )
    return null;
  return {
    id: session.id,
    userId: session.userId,
    realm: session.realm,
    createdAt,
    mfaVerifiedAt: asDate(session.mfaVerifiedAt),
  };
}

export function createSensitiveActionGuard(dependencies: {
  now?: () => Date;
  requirePermission: (permission: PermissionKey) => Promise<WorkforceActor>;
  getSession: () => Promise<SensitiveSession | null>;
}) {
  return async function requireSensitiveWorkforceAction(
    permission: PermissionKey,
    options: { recentWithinSeconds?: number; mfaRequired?: boolean } = {},
  ): Promise<WorkforceActor> {
    const actor = await dependencies.requirePermission(permission);
    await assertWorkforceAssurance(
      actor.userId,
      await dependencies.getSession(),
      options,
      (dependencies.now ?? (() => new Date()))(),
    );
    return actor;
  };
}

async function assertWorkforceAssurance(
  userId: string,
  session: SensitiveSession | null,
  options: { recentWithinSeconds?: number; mfaRequired?: boolean },
  now: Date,
): Promise<void> {
  const windowMs = (options.recentWithinSeconds ?? 10 * 60) * 1000;
  const currentTime = now.getTime();
  if (
    !session ||
    session.realm !== "workforce" ||
    session.userId !== userId ||
    currentTime - session.createdAt.getTime() > windowMs ||
    session.createdAt.getTime() > currentTime + 5_000
  ) {
    throw new SensitiveActionError("AUTH_REAUTH_REQUIRED");
  }
  if (
    options.mfaRequired !== false &&
    (!session.mfaVerifiedAt ||
      currentTime - session.mfaVerifiedAt.getTime() > windowMs ||
      session.mfaVerifiedAt.getTime() > currentTime + 5_000)
  ) {
    throw new SensitiveActionError("AUTH_MFA_REQUIRED");
  }
}

export function createWorkforceAssuranceGuard<
  Actor extends { userId: string },
>(dependencies: {
  now?: () => Date;
  requireActor: () => Promise<Actor>;
  getSession: () => Promise<SensitiveSession | null>;
}) {
  return async function requireRecentWorkforceAssurance(
    options: { recentWithinSeconds?: number; mfaRequired?: boolean } = {},
  ): Promise<Actor> {
    const actor = await dependencies.requireActor();
    await assertWorkforceAssurance(
      actor.userId,
      await dependencies.getSession(),
      options,
      (dependencies.now ?? (() => new Date()))(),
    );
    return actor;
  };
}

export async function requireRecentWorkforceAssurance(options?: {
  recentWithinSeconds?: number;
  mfaRequired?: boolean;
}): Promise<WorkforceActor> {
  return createWorkforceAssuranceGuard({
    requireActor: () => requireWorkforce(),
    getSession: async () =>
      parseSensitiveSession(
        await getStaffAuth().api.getSession({ headers: await nextHeaders() }),
      ),
  })(options);
}

export async function requireSensitiveWorkforceAction(
  permission: PermissionKey,
  options?: { recentWithinSeconds?: number; mfaRequired?: boolean },
): Promise<WorkforceActor> {
  const getHeaders = nextHeaders;
  return createSensitiveActionGuard({
    requirePermission,
    getSession: async () =>
      parseSensitiveSession(
        await getStaffAuth().api.getSession({ headers: await getHeaders() }),
      ),
  })(permission, options);
}

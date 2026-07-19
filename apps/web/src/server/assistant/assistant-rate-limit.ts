import "server-only";

import { createHmac } from "node:crypto";

import { sql } from "drizzle-orm";

import { getDatabase, rateLimits } from "@ai-agent-platform/database";

type Database = ReturnType<typeof getDatabase>;

export type AssistantRateLimitScope =
  | "anonymous"
  | "customer"
  | "admin-test"
  | "admin-key-reveal";
export type AssistantRateLimitInput =
  | {
      scope: "anonymous";
      sessionId: string;
      ipAddress?: string;
    }
  | {
      scope: "customer" | "admin-test" | "admin-key-reveal";
      actorId: string;
    };

export type AssistantRateLimiter = {
  consume(input: AssistantRateLimitInput): Promise<void>;
};

type AssistantRateLimitQuota = {
  maximumAttempts: number;
  windowMs: number;
};

export const ASSISTANT_RATE_LIMIT_QUOTAS: Readonly<
  Record<AssistantRateLimitScope, AssistantRateLimitQuota>
> = {
  anonymous: { maximumAttempts: 20, windowMs: 60_000 },
  customer: { maximumAttempts: 60, windowMs: 60_000 },
  "admin-test": { maximumAttempts: 20, windowMs: 60_000 },
  "admin-key-reveal": { maximumAttempts: 5, windowMs: 10 * 60_000 },
};

export const ASSISTANT_RATE_LIMIT_CLEANUP_BATCH_SIZE = 100;
export const ASSISTANT_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1_000;

export class AssistantRateLimitExceededError extends Error {
  readonly code = "ASSISTANT_RATE_LIMITED";

  constructor(readonly retryAfterSeconds: number) {
    super("Assistant rate limit exceeded");
  }
}

export class AssistantRateLimitUnavailableError extends Error {
  readonly code = "ASSISTANT_RATE_LIMIT_UNAVAILABLE";

  constructor() {
    super("Assistant rate limit unavailable");
  }
}

export function buildAssistantRateLimitCleanupQuery(cutoff: number) {
  return sql`
    WITH expired_assistant_rate_limits AS (
      SELECT ${rateLimits.id}
      FROM ${rateLimits}
      WHERE ${rateLimits.key} LIKE ${"assistant:%"}
        AND ${rateLimits.lastRequest} < ${cutoff}
      ORDER BY ${rateLimits.lastRequest}
      LIMIT ${ASSISTANT_RATE_LIMIT_CLEANUP_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM ${rateLimits}
    USING expired_assistant_rate_limits
    WHERE ${rateLimits.id} = expired_assistant_rate_limits.id
  `;
}

export function assistantRateLimitKey(
  secret: string,
  scope: AssistantRateLimitScope,
  kind: "session" | "ip" | "actor",
  value: string,
): string {
  const digest = createHmac("sha256", secret)
    .update("ai-agent-platform:assistant-rate-limit-key:v1")
    .update("\0")
    .update(scope)
    .update("\0")
    .update(kind)
    .update("\0")
    .update(value)
    .digest("hex");
  return `assistant:${scope}:${kind}:${digest}`;
}

function assertQuota(quota: AssistantRateLimitQuota): void {
  if (
    !Number.isSafeInteger(quota.maximumAttempts) ||
    quota.maximumAttempts <= 0 ||
    !Number.isSafeInteger(quota.windowMs) ||
    quota.windowMs <= 0
  ) {
    throw new TypeError("Assistant rate limit quota must be positive integers");
  }
}

function readCount(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

function readTimestamp(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : null;
}

function keysForInput(
  secret: string,
  input: AssistantRateLimitInput,
): string[] {
  if (input.scope === "anonymous") {
    return [
      assistantRateLimitKey(secret, input.scope, "session", input.sessionId),
      ...(input.ipAddress
        ? [assistantRateLimitKey(secret, input.scope, "ip", input.ipAddress)]
        : []),
    ];
  }
  return [assistantRateLimitKey(secret, input.scope, "actor", input.actorId)];
}

export function createDatabaseAssistantRateLimiter(
  database: Database = getDatabase(),
  options: {
    secret?: string;
    quotas?: Partial<Record<AssistantRateLimitScope, AssistantRateLimitQuota>>;
    now?: () => number;
  } = {},
): AssistantRateLimiter {
  const secret = options.secret ?? process.env.ASSISTANT_RATE_LIMIT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("ASSISTANT_RATE_LIMIT_SECRET is required");
  }
  const quotas = {
    ...ASSISTANT_RATE_LIMIT_QUOTAS,
    ...options.quotas,
  };
  Object.values(quotas).forEach(assertQuota);
  const currentTime = options.now ?? Date.now;

  return {
    async consume(input) {
      const now = currentTime();
      if (!Number.isSafeInteger(now) || now < 0) {
        throw new TypeError("Assistant rate limit clock must return epoch ms");
      }
      const quota = quotas[input.scope];
      const windowStart = now - quota.windowMs;
      const keys = keysForInput(secret, input);

      try {
        await database.transaction(async (transaction) => {
          const retentionMs = Math.max(
            ASSISTANT_RATE_LIMIT_RETENTION_MS,
            quota.windowMs,
          );
          await transaction.execute(
            buildAssistantRateLimitCleanupQuery(now - retentionMs),
          );
          for (const key of keys) {
            const result = await transaction.execute(sql`
              INSERT INTO ${rateLimits} (key, count, last_request)
              VALUES (${key}, 1, ${now})
              ON CONFLICT (key) DO UPDATE SET
                count = CASE
                  WHEN ${rateLimits.lastRequest} <= ${windowStart} THEN 1
                  ELSE ${rateLimits.count} + 1
                END,
                last_request = CASE
                  WHEN ${rateLimits.lastRequest} <= ${windowStart} THEN ${now}
                  ELSE ${rateLimits.lastRequest}
                END
              RETURNING count, last_request AS "lastRequest"
            `);
            const row = result.rows[0] as
              | { count?: unknown; lastRequest?: unknown }
              | undefined;
            const count = readCount(row?.count);
            const firstRequest = readTimestamp(row?.lastRequest);
            if (count === null || firstRequest === null) {
              throw new Error("Assistant rate limit counter result is invalid");
            }
            if (count > quota.maximumAttempts) {
              throw new AssistantRateLimitExceededError(
                Math.max(
                  1,
                  Math.ceil((firstRequest + quota.windowMs - now) / 1_000),
                ),
              );
            }
          }
        });
      } catch (error) {
        if (error instanceof AssistantRateLimitExceededError) throw error;
        throw new AssistantRateLimitUnavailableError();
      }
    },
  };
}

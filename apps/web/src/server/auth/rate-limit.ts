import "server-only";

import { createHmac } from "node:crypto";

import { sql } from "drizzle-orm";

import { getDatabase, rateLimits } from "@ai-agent-platform/database";

type Database = ReturnType<typeof getDatabase>;

export type AuthRateLimitInput = {
  realm: "customer" | "workforce";
  operation: "login" | "reauth" | "recovery";
  identifier: string;
  ipAddress?: string;
};

export type AuthRateLimiter = {
  consume(input: AuthRateLimitInput): Promise<void>;
};

export class AuthRateLimitError extends Error {
  readonly code = "AUTH_RATE_LIMITED";

  constructor() {
    super("Authentication rate limit exceeded");
  }
}

export const AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE = 100;
export const AUTH_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1_000;

export function buildAuthRateLimitCleanupQuery(cutoff: number) {
  return sql`
    WITH expired_auth_rate_limits AS (
      SELECT ${rateLimits.id}
      FROM ${rateLimits}
      WHERE ${rateLimits.key} LIKE ${"auth:%"}
        AND ${rateLimits.lastRequest} < ${cutoff}
      ORDER BY ${rateLimits.lastRequest}
      LIMIT ${AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM ${rateLimits}
    USING expired_auth_rate_limits
    WHERE ${rateLimits.id} = expired_auth_rate_limits.id
  `;
}

export function authRateLimitKey(
  secret: string,
  input: Pick<AuthRateLimitInput, "realm" | "operation">,
  kind: "identifier" | "ip",
  value: string,
): string {
  const digest = createHmac("sha256", secret).update(value).digest("hex");
  return `auth:${input.realm}:${input.operation}:${kind}:${digest}`;
}

export function createDatabaseAuthRateLimiter(
  database: Database = getDatabase(),
  options: {
    secret?: string;
    maximumAttempts?: number;
    windowMs?: number;
    now?: () => number;
  } = {},
): AuthRateLimiter {
  const secret = options.secret ?? process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET is required");
  const maximumAttempts = options.maximumAttempts ?? 5;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const currentTime = options.now ?? Date.now;

  return {
    async consume(input) {
      const now = currentTime();
      const windowStart = now - windowMs;
      const keys = [
        authRateLimitKey(
          secret,
          input,
          "identifier",
          input.identifier.normalize("NFKC").trim().toLowerCase(),
        ),
      ];
      if (input.ipAddress)
        keys.push(authRateLimitKey(secret, input, "ip", input.ipAddress));

      await database.transaction(async (transaction) => {
        const retentionMs = Math.max(AUTH_RATE_LIMIT_RETENTION_MS, windowMs);
        await transaction.execute(
          buildAuthRateLimitCleanupQuery(now - retentionMs),
        );
        for (const key of keys) {
          const result = await transaction.execute(sql`
            INSERT INTO ${rateLimits} (key, count, last_request)
            VALUES (${key}, 1, ${now})
            ON CONFLICT (key) DO UPDATE SET
              count = CASE
                WHEN ${rateLimits.lastRequest} < ${windowStart} THEN 1
                ELSE ${rateLimits.count} + 1
              END,
              last_request = CASE
                WHEN ${rateLimits.lastRequest} < ${windowStart} THEN ${now}
                ELSE ${rateLimits.lastRequest}
              END
            RETURNING count
          `);
          const count = (result.rows[0] as { count?: number } | undefined)
            ?.count;
          if (count === undefined || count > maximumAttempts)
            throw new AuthRateLimitError();
        }
      });
    },
  };
}

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
  } = {},
): AuthRateLimiter {
  const secret = options.secret ?? process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET is required");
  const maximumAttempts = options.maximumAttempts ?? 5;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;

  return {
    async consume(input) {
      const now = Date.now();
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

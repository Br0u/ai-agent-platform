import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  assertSafeIdentityMigrationTestDatabaseUrl,
  databaseSchema,
} from "@ai-agent-platform/database";

import { createAssistantErrorResponse } from "@/features/assistant/assistant-contract";
import { createAnonymousSessionManager } from "@/server/assistant/anonymous-session";
import { resolveAnonymousSessionSettings } from "@/server/assistant/anonymous-session-config";
import {
  assistantRateLimitKey,
  createDatabaseAssistantRateLimiter,
} from "@/server/assistant/assistant-rate-limit";
import { resolveTrustedClientIp } from "@/server/assistant/trusted-client-ip";
import {
  createAssistantChatHandler,
  createAssistantChatSessionResolver,
} from "./handler";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;
const RATE_SECRET = "handler-postgres-rate-secret-at-least-32-bytes";
const SESSION_SECRET = "handler-session-secret-at-least-32-bytes";
const TRUSTED_IP = "203.0.113.40";

function chatRequest(cookie?: string) {
  return new Request("https://portal.example.com/api/v1/assistant/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": TRUSTED_IP,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      message: "如何开始了解平台？",
      context: { pathname: "/" },
    }),
  });
}

function cookiePair(setCookie: string): string {
  return setCookie.split(";", 1)[0] ?? "";
}

describePostgres("assistant BFF PostgreSQL rate-limit integration", () => {
  const pool = new Pool({ connectionString: safeUrl });
  const database = drizzle(pool, { schema: databaseSchema });

  beforeAll(async () => {
    await pool.query("select 1");
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE rate_limits");
  });

  afterAll(async () => pool.end());

  it("keeps the trusted-IP bucket across Cookie deletion and rejects before Provider work", async () => {
    let randomValue = 0;
    const manager = createAnonymousSessionManager({
      settings: resolveAnonymousSessionSettings({
        ASSISTANT_PUBLIC_ORIGIN: "https://portal.example.com",
        ASSISTANT_SESSION_SECRET: SESSION_SECRET,
      }),
      now: () => 100_000,
      randomBytes: (length) => new Uint8Array(length).fill(++randomValue),
    });
    const provider = {
      reply: vi.fn(async () => ({
        content: "placeholder",
        suggestedActions: [],
      })),
    };
    const handler = createAssistantChatHandler({
      provider,
      logger: { log: vi.fn() },
      clock: () => 100,
      requestIdFactory: () => "integration-request-id",
      messageIdFactory: () => "integration-message-id",
      resolveSession: createAssistantChatSessionResolver(manager, async () => ({
        kind: "anonymous",
      })),
      rateLimiter: createDatabaseAssistantRateLimiter(database, {
        secret: RATE_SECRET,
        quotas: {
          anonymous: { maximumAttempts: 3, windowMs: 60_000 },
        },
        now: () => 100_000,
      }),
      resolveTrustedClientIp: (request) =>
        resolveTrustedClientIp(request.headers, true),
    });

    const first = await handler(chatRequest());
    expect(first.status).toBe(200);
    const firstSetCookie = first.headers.get("set-cookie");
    expect(firstSetCookie).toContain("__Host-aap_assistant_sid=");

    const sameCookie = await handler(chatRequest(cookiePair(firstSetCookie!)));
    expect(sameCookie.status).toBe(200);

    const deletedCookie = await handler(chatRequest());
    expect(deletedCookie.status).toBe(200);
    expect(deletedCookie.headers.get("set-cookie")).toContain(
      "__Host-aap_assistant_sid=",
    );

    const blockedRotatedCookie = await handler(
      chatRequest("__Host-aap_assistant_sid=invalid"),
    );
    expect(blockedRotatedCookie.status).toBe(429);
    expect(blockedRotatedCookie.headers.get("retry-after")).toBe("60");
    expect(blockedRotatedCookie.headers.get("set-cookie")).toContain(
      "__Host-aap_assistant_sid=",
    );
    await expect(blockedRotatedCookie.json()).resolves.toEqual(
      createAssistantErrorResponse("integration-request-id", "rate_limited"),
    );
    expect(provider.reply).toHaveBeenCalledTimes(3);

    const ipKey = assistantRateLimitKey(
      RATE_SECRET,
      "anonymous",
      "ip",
      TRUSTED_IP,
    );
    const ipBucket = await pool.query<{ count: number }>(
      "SELECT count FROM rate_limits WHERE key = $1",
      [ipKey],
    );
    expect(ipBucket.rows).toEqual([{ count: 3 }]);

    const sessionBuckets = await pool.query<{ count: number }>(
      `SELECT count FROM rate_limits
       WHERE key LIKE 'assistant:anonymous:session:%'
       ORDER BY count DESC`,
    );
    expect(sessionBuckets.rows).toEqual([{ count: 2 }, { count: 1 }]);
    const allBuckets = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM rate_limits WHERE key LIKE 'assistant:%'",
    );
    expect(allBuckets.rows).toEqual([{ count: "3" }]);
  });
});

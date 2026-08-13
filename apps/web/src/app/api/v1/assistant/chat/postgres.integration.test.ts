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
import type { AssistantProvider } from "@/server/assistant/assistant-provider";
import { createAssistantInputPolicyRepository } from "@/server/assistant/assistant-input-policy";
import {
  assistantRateLimitKey,
  createDatabaseAssistantRateLimiter,
} from "@/server/assistant/assistant-rate-limit";
import { resolveTrustedClientIp } from "@/server/assistant/trusted-client-ip";
import { createAssistantChatHandler } from "./handler";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;
const RATE_SECRET = "handler-postgres-rate-secret-at-least-32-bytes";
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
      version: "2",
      message: "如何开始了解平台？",
      history: [],
      page: null,
    }),
  });
}

describePostgres("assistant BFF PostgreSQL rate-limit integration", () => {
  const pool = new Pool({ connectionString: safeUrl });
  const database = drizzle(pool, { schema: databaseSchema });

  beforeAll(async () => {
    await pool.query("select 1");
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE rate_limits, assistant_input_policy");
  });

  afterAll(async () => pool.end());

  it("keeps the trusted-IP bucket across stateless requests and rejects before Provider work", async () => {
    const reply = vi.fn<AssistantProvider["reply"]>(async () => ({
      content: "placeholder",
      suggestedActions: [],
    }));
    const provider: AssistantProvider = { reply };
    const handler = createAssistantChatHandler({
      provider,
      logger: { log: vi.fn() },
      clock: () => 100,
      requestIdFactory: () => "integration-request-id",
      messageIdFactory: () => "integration-message-id",
      resolveActor: async () => ({ kind: "anonymous" as const }),
      rateLimiter: createDatabaseAssistantRateLimiter(database, {
        secret: RATE_SECRET,
        quotas: {
          anonymous: { maximumAttempts: 3, windowMs: 60_000 },
        },
        now: () => 100_000,
      }),
      loadInputPolicy: () =>
        createAssistantInputPolicyRepository(database).load(),
      pageResolver: { load: vi.fn(async () => null) },
      resolveTrustedClientIp: (request) =>
        resolveTrustedClientIp(request.headers, true),
    });

    const first = await handler(chatRequest());
    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie")).toBeNull();

    const second = await handler(chatRequest());
    expect(second.status).toBe(200);

    const third = await handler(chatRequest());
    expect(third.status).toBe(200);

    const blocked = await handler(chatRequest());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
    expect(blocked.headers.get("set-cookie")).toBeNull();
    await expect(blocked.json()).resolves.toEqual(
      createAssistantErrorResponse("integration-request-id", "rate_limited"),
    );
    expect(reply).toHaveBeenCalledTimes(3);
    for (const [invocation] of reply.mock.calls) {
      expect(invocation).toMatchObject({
        request: {
          version: "2",
          message: "如何开始了解平台？",
          history: [],
          page: null,
        },
        pageContext: null,
        signal: expect.any(AbortSignal),
      });
      expect(invocation).not.toHaveProperty("session");
    }

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
    expect(sessionBuckets.rows).toEqual([]);
    const allBuckets = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM rate_limits WHERE key LIKE 'assistant:%'",
    );
    expect(allBuckets.rows).toEqual([{ count: "1" }]);
    const storedKeys = await pool.query<{ key: string }>(
      "SELECT key FROM rate_limits WHERE key LIKE 'assistant:%'",
    );
    expect(storedKeys.rows[0]?.key).not.toMatch(
      /203\.0\.113\.40|internal|session/u,
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({
  createAccessService: vi.fn(),
  getCurrentActor: vi.fn(),
}));
const rateLimit = vi.hoisted(() => ({
  consume: vi.fn(async () => undefined),
}));

vi.mock("@/server/auth/access", () => ({
  createAccessService: access.createAccessService,
}));

vi.mock("@/server/assistant/assistant-rate-limit", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/server/assistant/assistant-rate-limit")
    >();
  return {
    ...actual,
    createDatabaseAssistantRateLimiter: () => ({
      consume: rateLimit.consume,
    }),
  };
});

const RUNTIME_SETTINGS_KEY =
  "ai-agent-platform:assistant:anonymous-session-settings:v1";
const VALID_SECRET = "0123456789abcdef0123456789abcdef";

function clearRuntimeSettings(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for(RUNTIME_SETTINGS_KEY)
  ];
}

function request(options?: { cookie?: string; forgedActor?: boolean }) {
  return new Request("https://portal.example.com/api/v1/assistant/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options?.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify({
      message: "如何开始了解平台？",
      context: { pathname: "/" },
      ...(options?.forgedActor
        ? { actorId: "attacker", userId: "attacker", actor: "customer" }
        : {}),
    }),
  });
}

async function loadPOST() {
  vi.resetModules();
  return (await import("./handler")).assistantChatHandler;
}

beforeEach(() => {
  clearRuntimeSettings();
  vi.stubEnv("ASSISTANT_PUBLIC_ORIGIN", "https://portal.example.com");
  vi.stubEnv("ASSISTANT_SESSION_SECRET", VALID_SECRET);
  access.createAccessService.mockReturnValue({
    getCurrentActor: access.getCurrentActor,
  });
  access.getCurrentActor.mockResolvedValue(null);
});

afterEach(() => {
  clearRuntimeSettings();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("anonymous assistant access short-circuit", () => {
  it.each([
    ["no cookie", request()],
    ["forged body actor", request({ forgedActor: true })],
  ])(
    "returns 200 for %s without constructing auth access",
    async (_name, input) => {
      const response = await (await loadPOST())(input);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        version: "1",
        mode: "placeholder",
        session: { temporary: true },
      });
      expect(access.createAccessService).not.toHaveBeenCalled();
      expect(access.getCurrentActor).not.toHaveBeenCalled();
      expect(rateLimit.consume).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ scope: "anonymous" }),
      );
    },
  );

  it("server-validates a request carrying the customer auth cookie", async () => {
    const input = request({ cookie: "aap_customer_session=opaque" });
    const response = await (await loadPOST())(input);

    expect(response.status).toBe(200);
    expect(access.createAccessService).toHaveBeenCalledOnce();
    expect(access.getCurrentActor).toHaveBeenCalledExactlyOnceWith("customer");
    expect(rateLimit.consume).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ scope: "anonymous" }),
    );
  });
});

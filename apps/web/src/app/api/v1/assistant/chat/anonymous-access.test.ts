import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({
  createAccessService: vi.fn(),
  getCurrentActor: vi.fn(),
}));
const rateLimit = vi.hoisted(() => ({
  consume: vi.fn(async () => undefined),
}));
const inputPolicy = vi.hoisted(() => ({
  createRepository: vi.fn(),
  load: vi.fn(async () => ({
    terms: [] as string[],
    revision: 0,
    updatedAt: null,
    updatedBy: null,
  })),
  save: vi.fn(),
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

vi.mock("@/server/assistant/assistant-input-policy", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/server/assistant/assistant-input-policy")
    >();
  return {
    ...actual,
    createAssistantInputPolicyRepository: inputPolicy.createRepository,
  };
});

function request(options?: { cookie?: string; forgedActor?: boolean }) {
  return new Request("https://portal.example.com/api/v1/assistant/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options?.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify({
      version: "2",
      message: "如何开始了解平台？",
      history: [],
      page: null,
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
  vi.stubEnv("ASSISTANT_PUBLIC_ORIGIN", "https://portal.example.com");
  access.createAccessService.mockReturnValue({
    getCurrentActor: access.getCurrentActor,
  });
  access.getCurrentActor.mockResolvedValue(null);
  inputPolicy.createRepository.mockReturnValue({
    load: inputPolicy.load,
    save: inputPolicy.save,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("anonymous assistant access short-circuit", () => {
  it("returns 200 without a cookie or constructing auth access", async () => {
    const input = request();
    const response = await (await loadPOST())(input);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      version: "1",
      mode: "placeholder",
    });
    expect(body).not.toHaveProperty("session");
    expect(access.createAccessService).not.toHaveBeenCalled();
    expect(access.getCurrentActor).not.toHaveBeenCalled();
    expect(rateLimit.consume).toHaveBeenCalledExactlyOnceWith({
      scope: "anonymous",
      global: true,
    });
    expect(inputPolicy.createRepository).toHaveBeenCalledOnce();
    expect(inputPolicy.load).toHaveBeenCalledOnce();
  });

  it("rejects a forged body actor before auth and limiting", async () => {
    const response = await (await loadPOST())(request({ forgedActor: true }));

    expect(response.status).toBe(400);
    expect(access.createAccessService).not.toHaveBeenCalled();
    expect(rateLimit.consume).not.toHaveBeenCalled();
  });

  it("server-validates a request carrying the customer auth cookie", async () => {
    const input = request({ cookie: "aap_customer_session=opaque" });
    const response = await (await loadPOST())(input);

    expect(response.status).toBe(200);
    expect(access.createAccessService).toHaveBeenCalledOnce();
    expect(access.getCurrentActor).toHaveBeenCalledExactlyOnceWith("customer");
    expect(rateLimit.consume).toHaveBeenCalledExactlyOnceWith({
      scope: "anonymous",
      global: true,
    });
    expect(inputPolicy.createRepository).toHaveBeenCalledOnce();
    expect(inputPolicy.load).toHaveBeenCalledOnce();
  });
});

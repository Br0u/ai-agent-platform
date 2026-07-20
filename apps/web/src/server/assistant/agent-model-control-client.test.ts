import { afterEach, describe, expect, it, vi } from "vitest";

import golden from "../../../../../docs/testing/fixtures/model-control-assertion-v1.json";
import {
  AgentModelControlClientError,
  createAgentModelControlAssertionSigner,
  createAgentModelControlClient,
  resolveAgentModelControlSettings,
} from "./agent-model-control-client";

const INTERNAL_URL = "http://agent:7777";
const OS_KEY = "agentos-internal-security-key-32-bytes";
const CONTROL_KEY = "model-control-internal-security-key-32-bytes";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const NONCE = "33333333-3333-4333-8333-333333333333";
const NOW = 2_000_000_000;

function settings() {
  return resolveAgentModelControlSettings({
    AGENTOS_INTERNAL_URL: INTERNAL_URL,
    OS_SECURITY_KEY: OS_KEY,
    AGENT_CONFIG_CONTROL_KEY: CONTROL_KEY,
  });
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function listResponse() {
  return {
    version: "1",
    configs: [
      {
        provider: "openai",
        modelId: "gpt-5-mini",
        endpointId: "openai-official",
        apiKeyLastFour: "cdef",
        revision: 3,
        testStatus: "passed",
        lastTestedAt: "2026-07-18T01:02:03.000Z",
      },
    ],
    endpoints: [
      {
        id: "openai-official",
        label: "OpenAI official",
        provider: "openai",
      },
      {
        id: "anthropic-official",
        label: "Anthropic official",
        provider: "anthropic",
      },
    ],
    bootstrap: null,
    controlEnabled: true,
  };
}

function runtimeResponse() {
  return {
    version: "1",
    capability: "available",
    source: "dynamic",
    provider: "openai",
    modelId: "gpt-5-mini",
    configRevision: 3,
    activationVersion: 8,
  };
}

function saveResponse() {
  return {
    version: "1",
    config: {
      provider: "openai",
      modelId: "gpt-5-mini",
      endpointId: "openai-official",
      apiKeyLastFour: "cdef",
      revision: 3,
      testStatus: "untested",
      lastTestedAt: null,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Agent model control settings", () => {
  it.each([
    "http://agent:7777/",
    "http://agent:7777/path",
    "http://user:pass@agent:7777",
    "ftp://agent:7777",
    "http://agent:7777?private=value",
  ])("uses the exact AgentOS origin boundary: %s", (url) => {
    expect(() =>
      resolveAgentModelControlSettings({
        AGENTOS_INTERNAL_URL: url,
        OS_SECURITY_KEY: OS_KEY,
        AGENT_CONFIG_CONTROL_KEY: CONTROL_KEY,
      }),
    ).toThrow("AGENTOS_INTERNAL_URL must be an exact HTTP(S) origin");
  });

  it.each([
    undefined,
    "short",
    "a".repeat(31),
    " ".repeat(32),
    `${"a".repeat(32)}\r\nX-Injected: true`,
    "密钥".repeat(16),
  ])(
    "rejects an invalid dedicated control Bearer without echoing it",
    (key) => {
      const error = (() => {
        try {
          resolveAgentModelControlSettings({
            AGENTOS_INTERNAL_URL: INTERNAL_URL,
            OS_SECURITY_KEY: OS_KEY,
            AGENT_CONFIG_CONTROL_KEY: key,
          });
        } catch (caught) {
          return caught;
        }
        throw new Error("expected settings failure");
      })();

      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("AGENT_CONFIG_CONTROL_KEY");
      if (key) expect(String(error)).not.toContain(key);
    },
  );

  it.each([undefined, "short", `${"a".repeat(32)}\nprivate`])(
    "rejects missing or unsafe OS_SECURITY_KEY before independence is claimed",
    (osKey) => {
      const error = (() => {
        try {
          resolveAgentModelControlSettings({
            AGENTOS_INTERNAL_URL: INTERNAL_URL,
            OS_SECURITY_KEY: osKey,
            AGENT_CONFIG_CONTROL_KEY: CONTROL_KEY,
          });
        } catch (caught) {
          return caught;
        }
        throw new Error("expected settings failure");
      })();
      expect(error).toBeInstanceOf(Error);
      if (osKey) expect(String(error)).not.toContain(osKey);
    },
  );

  it("requires the control credential to differ from OS_SECURITY_KEY", () => {
    const error = (() => {
      try {
        resolveAgentModelControlSettings({
          AGENTOS_INTERNAL_URL: INTERNAL_URL,
          OS_SECURITY_KEY: OS_KEY,
          AGENT_CONFIG_CONTROL_KEY: OS_KEY,
        });
      } catch (caught) {
        return caught;
      }
      throw new Error("expected settings failure");
    })();

    expect(String(error)).toBe(
      "Error: AGENT_CONFIG_CONTROL_KEY configuration is invalid",
    );
    expect(String(error)).not.toContain(OS_KEY);
  });

  it("returns the shared origin and only the dedicated control credential", () => {
    expect(settings()).toEqual({
      baseUrl: INTERNAL_URL,
      controlKey: CONTROL_KEY,
    });
  });
});

describe("model control assertion signer", () => {
  it("matches the public cross-language golden vector byte-for-byte", () => {
    const signer = createAgentModelControlAssertionSigner({
      controlKey: golden.testControlKey,
      clock: () => 2_000_000_000,
      nonceFactory: () => "33333333-3333-4333-8333-333333333333",
    });

    const assertion = signer.sign({
      actor: "11111111-1111-4111-8111-111111111111",
      permission: "admin:assistant:configure",
      action: "save",
      provider: "openai",
      requestId: "22222222-2222-4222-8222-222222222222",
    });

    expect(assertion).toBe(golden.assertion);
    const [payload, signature] = assertion.split(".");
    expect(payload).toBe(golden.payloadBase64Url);
    expect(signature).toBe(golden.expectedSignatureBase64Url);
    expect(Buffer.from(payload!, "base64url").toString("utf8")).toBe(
      golden.canonicalPayload,
    );
  });

  it.each([
    ["save", "admin:assistant:secret:reveal"],
    ["test_and_activate", "admin:assistant:secret:reveal"],
    ["reveal", "admin:assistant:configure"],
  ] as const)(
    "refuses unsupported %s/%s permission pairs",
    (action, permission) => {
      const signer = createAgentModelControlAssertionSigner({
        controlKey: CONTROL_KEY,
        clock: () => NOW,
        nonceFactory: () => NONCE,
      });

      expect(() =>
        signer.sign({
          actor: ACTOR,
          permission,
          action,
          provider: "openai",
          requestId: REQUEST_ID,
        }),
      ).toThrow(AgentModelControlClientError);
    },
  );

  it("requires an integer clock and canonical UUID nonce", () => {
    for (const [clock, nonceFactory] of [
      [() => NOW + 0.5, () => NONCE],
      [() => NOW, () => "33333333-3333-4333-8333-33333333333A"],
      [() => NOW, () => "not-a-uuid"],
    ] as const) {
      const signer = createAgentModelControlAssertionSigner({
        controlKey: CONTROL_KEY,
        clock,
        nonceFactory,
      });
      expect(() =>
        signer.sign({
          actor: ACTOR,
          permission: "admin:assistant:configure",
          action: "save",
          provider: "openai",
          requestId: REQUEST_ID,
        }),
      ).toThrow(AgentModelControlClientError);
    }
  });

  it.each([
    { actor: "not-an-actor", requestId: REQUEST_ID, provider: "openai" },
    { actor: ACTOR, requestId: "not-a-request", provider: "openai" },
    { actor: ACTOR, requestId: REQUEST_ID, provider: "local" },
  ])("rejects forged route context %#", (forged) => {
    const signer = createAgentModelControlAssertionSigner({
      controlKey: CONTROL_KEY,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    expect(() =>
      signer.sign({
        actor: forged.actor,
        permission: "admin:assistant:configure",
        action: "save",
        provider: forged.provider as "openai",
        requestId: forged.requestId,
      }),
    ).toThrow(AgentModelControlClientError);
  });

  it("rejects unsupported actions and extra assertion fields", () => {
    const signer = createAgentModelControlAssertionSigner({
      controlKey: CONTROL_KEY,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    for (const input of [
      {
        actor: ACTOR,
        permission: "admin:assistant:configure",
        action: "destroy",
        provider: "openai",
        requestId: REQUEST_ID,
      },
      {
        actor: ACTOR,
        permission: "admin:assistant:configure",
        action: "save",
        provider: "openai",
        requestId: REQUEST_ID,
        key: "private",
      },
    ]) {
      expect(() =>
        signer.sign(input as Parameters<typeof signer.sign>[0]),
      ).toThrow(AgentModelControlClientError);
    }
  });

  it("signs exact route context with a five-second lifetime", () => {
    const signer = createAgentModelControlAssertionSigner({
      controlKey: CONTROL_KEY,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    const assertion = signer.sign({
      actor: ACTOR,
      permission: "admin:assistant:secret:reveal",
      action: "reveal",
      provider: "deepseek",
      requestId: REQUEST_ID,
    });
    const payload = JSON.parse(
      Buffer.from(assertion.split(".")[0]!, "base64url").toString("utf8"),
    );

    expect(payload).toEqual({
      action: "reveal",
      actor: ACTOR,
      expiresAt: NOW + 5,
      issuedAt: NOW,
      nonce: NONCE,
      permission: "admin:assistant:secret:reveal",
      provider: "deepseek",
      requestId: REQUEST_ID,
    });
  });

  it("never includes control or malformed assertion values in errors or logs", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const signer = createAgentModelControlAssertionSigner({
      controlKey: CONTROL_KEY,
      clock: () => NOW,
      nonceFactory: () => "private-malformed-nonce",
    });
    const error = (() => {
      try {
        signer.sign({
          actor: ACTOR,
          permission: "admin:assistant:configure",
          action: "save",
          provider: "openai",
          requestId: REQUEST_ID,
        });
      } catch (caught) {
        return caught;
      }
      throw new Error("expected signer failure");
    })();

    expect(JSON.stringify(error)).toBe('{"code":"invalid_request"}');
    expect(JSON.stringify(error)).not.toMatch(/private|control-internal/iu);
    expect(log).not.toHaveBeenCalled();
  });

  it("rejects accessor/hidden/symbol assertion input before consuming a nonce", () => {
    for (const build of [
      () => {
        const input = {
          actor: ACTOR,
          permission: "admin:assistant:configure",
          action: "save",
          provider: "openai",
          requestId: REQUEST_ID,
        };
        Object.defineProperty(input, "provider", {
          get: () => "openai",
          enumerable: true,
        });
        return input;
      },
      () => {
        const input = {
          actor: ACTOR,
          permission: "admin:assistant:configure",
          action: "save",
          provider: "openai",
          requestId: REQUEST_ID,
        };
        Reflect.set(input, Symbol("key"), "private");
        return input;
      },
      () => {
        const input = {
          actor: ACTOR,
          permission: "admin:assistant:configure",
          action: "save",
          provider: "openai",
          requestId: REQUEST_ID,
        };
        Object.defineProperty(input, "key", {
          value: "private",
          enumerable: false,
        });
        return input;
      },
    ]) {
      const nonceFactory = vi.fn(() => NONCE);
      const signer = createAgentModelControlAssertionSigner({
        controlKey: CONTROL_KEY,
        clock: () => NOW,
        nonceFactory,
      });

      expect(() =>
        signer.sign(build() as Parameters<typeof signer.sign>[0]),
      ).toThrow(AgentModelControlClientError);
      expect(nonceFactory).not.toHaveBeenCalled();
    }
  });

  it("uses one data-descriptor snapshot without invoking Proxy getters", () => {
    const target = {
      actor: ACTOR,
      permission: "admin:assistant:configure",
      action: "save",
      provider: "openai",
      requestId: REQUEST_ID,
    };
    let providerDescriptors = 0;
    const input = new Proxy(target, {
      get() {
        throw new Error("direct property read is forbidden");
      },
      getOwnPropertyDescriptor(object, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
        if (key === "provider" && descriptor) {
          providerDescriptors += 1;
          return {
            ...descriptor,
            value: providerDescriptors === 1 ? "openai" : "local",
          };
        }
        return descriptor;
      },
    });
    const nonceFactory = vi.fn(() => NONCE);
    const signer = createAgentModelControlAssertionSigner({
      controlKey: CONTROL_KEY,
      clock: () => NOW,
      nonceFactory,
    });

    const assertion = signer.sign(input as Parameters<typeof signer.sign>[0]);
    const payload = JSON.parse(
      Buffer.from(assertion.split(".")[0]!, "base64url").toString("utf8"),
    );
    expect(payload.provider).toBe("openai");
    expect(providerDescriptors).toBe(1);
    expect(nonceFactory).toHaveBeenCalledOnce();
  });
});

describe("private Agent model control client", () => {
  it("implements the five methods with exact paths, headers, bodies and responses", async () => {
    const nonceFactory = vi.fn(() => NONCE);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(listResponse()))
      .mockResolvedValueOnce(jsonResponse(runtimeResponse()))
      .mockResolvedValueOnce(jsonResponse(saveResponse()))
      .mockResolvedValueOnce(
        jsonResponse({
          version: "1",
          provider: "openai",
          configRevision: 3,
          activationVersion: 8,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ key: "single-use-secret-key" }, 200, {
          "cache-control": "no-store, private",
          pragma: "no-cache",
        }),
      );
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory,
    });

    await expect(
      client.listModelConfigs({ requestId: REQUEST_ID }),
    ).resolves.toEqual(listResponse());
    await expect(
      client.runtimeStatus({ requestId: REQUEST_ID }),
    ).resolves.toEqual(runtimeResponse());
    await expect(
      client.saveModelConfig({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: {
          modelId: "gpt-5-mini",
          endpointId: "openai-official",
          apiKey: "single-use-secret-key-cdef",
          expectedRevision: 2,
        },
      }),
    ).resolves.toEqual(saveResponse());
    await expect(
      client.testAndActivate({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: { revision: 3 },
      }),
    ).resolves.toEqual({
      version: "1",
      provider: "openai",
      configRevision: 3,
      activationVersion: 8,
    });
    await expect(
      client.revealKey({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: { revision: 3 },
      }),
    ).resolves.toEqual({ key: "single-use-secret-key" });

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `${INTERNAL_URL}/internal/control/model-configs`,
      `${INTERNAL_URL}/internal/control/model-configs/runtime-status`,
      `${INTERNAL_URL}/internal/control/model-configs/openai`,
      `${INTERNAL_URL}/internal/control/model-configs/openai/test-and-activate`,
      `${INTERNAL_URL}/internal/control/model-configs/openai/reveal-key`,
    ]);
    for (const index of [0, 1]) {
      expect(fetcher.mock.calls[index]?.[1]?.headers).toEqual({
        Accept: "application/json",
        Authorization: `Bearer ${CONTROL_KEY}`,
        "X-Request-Id": REQUEST_ID,
      });
    }
    for (const index of [2, 3, 4]) {
      const headers = fetcher.mock.calls[index]?.[1]?.headers;
      expect(headers).toMatchObject({
        Accept: "application/json",
        Authorization: `Bearer ${CONTROL_KEY}`,
        "Content-Type": "application/json",
        "X-Agent-Control-Assertion": expect.stringMatching(/^[^.]+\.[^.]+$/u),
        "X-Request-Id": REQUEST_ID,
      });
    }
    expect(nonceFactory).toHaveBeenCalledTimes(3);
    const assertions = [2, 3, 4].map((index) => {
      const headers = fetcher.mock.calls[index]?.[1]?.headers as Record<
        string,
        string
      >;
      return JSON.parse(
        Buffer.from(
          headers["X-Agent-Control-Assertion"]!.split(".")[0]!,
          "base64url",
        ).toString("utf8"),
      );
    });
    expect(
      assertions.map(({ action, permission, provider, requestId }) => ({
        action,
        permission,
        provider,
        requestId,
      })),
    ).toEqual([
      {
        action: "save",
        permission: "admin:assistant:configure",
        provider: "openai",
        requestId: REQUEST_ID,
      },
      {
        action: "test_and_activate",
        permission: "admin:assistant:configure",
        provider: "openai",
        requestId: REQUEST_ID,
      },
      {
        action: "reveal",
        permission: "admin:assistant:secret:reveal",
        provider: "openai",
        requestId: REQUEST_ID,
      },
    ]);
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
      "GET",
      "GET",
      "PUT",
      "POST",
      "POST",
    ]);
    expect(fetcher.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({
        modelId: "gpt-5-mini",
        endpointId: "openai-official",
        apiKey: "single-use-secret-key-cdef",
        expectedRevision: 2,
      }),
    );
    expect(fetcher.mock.calls[3]?.[1]?.body).toBe('{"revision":3}');
    expect(fetcher.mock.calls[4]?.[1]?.body).toBe('{"revision":3}');
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({ redirect: "manual", cache: "no-store" });
    }
  });

  it("does not cache reveal plaintext between callers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ key: "first-secret-key" }, 200, {
          "cache-control": "no-store, private",
          pragma: "no-cache",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ key: "second-secret-key" }, 200, {
          "cache-control": "no-store, private",
          pragma: "no-cache",
        }),
      );
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    const command = {
      actor: ACTOR,
      provider: "openai" as const,
      requestId: REQUEST_ID,
      input: { revision: 3 },
    };

    await expect(client.revealKey(command)).resolves.toEqual({
      key: "first-secret-key",
    });
    await expect(client.revealKey(command)).resolves.toEqual({
      key: "second-secret-key",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses 5 seconds for reads/save/reveal and 55 seconds for activation", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
      throw new Error("unreachable");
    });
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    const read = client
      .listModelConfigs({ requestId: REQUEST_ID })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(read).resolves.toMatchObject({ code: "timeout" });

    const save = client
      .saveModelConfig({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: {
          modelId: "gpt-5-mini",
          endpointId: "openai-official",
          expectedRevision: 2,
        },
      })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(save).resolves.toMatchObject({ code: "timeout" });

    const reveal = client
      .revealKey({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: { revision: 3 },
      })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetcher.mock.calls[2]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(reveal).resolves.toMatchObject({ code: "timeout" });

    const activation = client
      .testAndActivate({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: { revision: 3 },
      })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(54_999);
    expect(fetcher.mock.calls[3]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(activation).resolves.toMatchObject({ code: "timeout" });
  });

  it.each([
    [401, "authentication_failed"],
    [403, "authorization_failed"],
    [400, "validation_error"],
    [400, "endpoint_not_allowed"],
    [409, "configuration_conflict"],
    [422, "credential_rejected"],
    [422, "model_not_found"],
    [502, "provider_unreachable"],
    [504, "provider_timeout"],
    [503, "control_disabled"],
    [503, "storage_unavailable"],
    [503, "encryption_unavailable"],
    [503, "assistant_unavailable"],
  ] as const)(
    "maps fixed HTTP %s error %s without body text",
    async (status, code) => {
      const privateBody = { error: code, detail: undefined };
      delete privateBody.detail;
      const client = createAgentModelControlClient({
        settings: settings(),
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(jsonResponse(privateBody, status)),
      });

      const error = await client
        .listModelConfigs({ requestId: REQUEST_ID })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AgentModelControlClientError);
      expect(error).toMatchObject({ code });
      expect(String(error)).toBe(
        "AgentModelControlClientError: Agent model control request failed",
      );
      expect(JSON.stringify(error)).toBe(`{"code":"${code}"}`);
    },
  );

  it("preserves a safe successful-test result on activation failure", async () => {
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(
            { error: "storage_unavailable", testResult: "success" },
            503,
          ),
        ),
    });

    const error = await client
      .testAndActivate({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: { revision: 3 },
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentModelControlClientError);
    expect(error).toMatchObject({
      code: "storage_unavailable",
      testResult: "success",
    });
    expect(JSON.stringify(error)).toBe(
      '{"code":"storage_unavailable","testResult":"success"}',
    );
  });

  it.each([
    [400, "configuration_conflict"],
    [409, "validation_error"],
    [422, "provider_timeout"],
    [503, "credential_rejected"],
  ])("rejects mismatched HTTP %s/error %s", async (status, code) => {
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ error: code }, status)),
    });

    await expect(
      client.listModelConfigs({ requestId: REQUEST_ID }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    [new Response("private raw body", { status: 418 }), "unexpected_status"],
    [
      jsonResponse({ error: "storage_unavailable", detail: "private" }, 503),
      "invalid_response",
    ],
    [
      new Response("private", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
      "invalid_content_type",
    ],
    [
      new Response("x".repeat(64 * 1_024 + 1), {
        headers: { "content-type": "application/json" },
      }),
      "response_too_large",
    ],
  ])(
    "sanitizes malformed or bounded response as %s",
    async (response, code) => {
      const client = createAgentModelControlClient({
        settings: settings(),
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(response as Response),
      });

      const error = await client
        .listModelConfigs({ requestId: REQUEST_ID })
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code });
      expect(JSON.stringify(error)).not.toMatch(
        /private|raw body|agent:7777/iu,
      );
    },
  );

  it("rejects invalid request context before fetch without retaining input", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher,
    });
    const privateKey = "private key with whitespace";
    const error = await client
      .saveModelConfig({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: {
          modelId: "gpt-5-mini",
          endpointId: "https://evil.test",
          apiKey: privateKey,
          expectedRevision: 0,
        },
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "invalid_request" });
    expect(JSON.stringify(error)).not.toContain(privateKey);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects forged extra mutation fields before fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher,
    });
    const input = {
      modelId: "gpt-5-mini",
      endpointId: "openai-official",
      expectedRevision: 0,
      baseUrl: "https://private.example",
    };

    await expect(
      client.saveModelConfig({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects UTF-8 mutation overflow before fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher,
    });
    const privateKey = "密".repeat(4_096);

    const error = await client
      .saveModelConfig({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: {
          modelId: "gpt-5-mini",
          endpointId: "openai-official",
          apiKey: privateKey,
          expectedRevision: 0,
        },
      })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "invalid_request" });
    expect(JSON.stringify(error)).not.toContain(privateKey);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["list", { ...listResponse(), privateUrl: "https://private.example" }],
    [
      "list",
      {
        ...listResponse(),
        configs: [{ ...listResponse().configs[0], nonce: "private" }],
      },
    ],
    [
      "list",
      {
        ...listResponse(),
        configs: [
          {
            ...listResponse().configs[0],
            lastTestedAt: "2026-07-18T01:02:03+00:00",
          },
        ],
      },
    ],
    [
      "list",
      {
        ...listResponse(),
        configs: [...listResponse().configs, { ...listResponse().configs[0] }],
      },
    ],
    [
      "list",
      {
        ...listResponse(),
        endpoints: [
          ...listResponse().endpoints,
          { ...listResponse().endpoints[0] },
        ],
      },
    ],
    [
      "list",
      {
        ...listResponse(),
        bootstrap: {
          provider: "openai",
          modelId: "gpt-5-mini",
          readOnly: false,
        },
      },
    ],
    ["runtime", { ...runtimeResponse(), activationVersion: null }],
    [
      "save",
      { ...saveResponse(), config: { ...saveResponse().config, revision: 4 } },
    ],
    [
      "save",
      {
        ...saveResponse(),
        config: { ...saveResponse().config, modelId: "wrong-model" },
      },
    ],
    [
      "activate",
      {
        version: "1",
        provider: "openai",
        configRevision: 4,
        activationVersion: 8,
      },
    ],
    ["reveal", { key: "single-use-secret-key", nonce: "private" }],
    ["reveal", { key: "has whitespace" }],
  ])("strictly rejects an unsafe %s response", async (method, body) => {
    const response =
      method === "reveal"
        ? jsonResponse(body, 200, {
            "cache-control": "no-store, private",
            pragma: "no-cache",
          })
        : jsonResponse(body);
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    const result =
      method === "list"
        ? client.listModelConfigs({ requestId: REQUEST_ID })
        : method === "runtime"
          ? client.runtimeStatus({ requestId: REQUEST_ID })
          : method === "save"
            ? client.saveModelConfig({
                actor: ACTOR,
                provider: "openai",
                requestId: REQUEST_ID,
                input: {
                  modelId: "gpt-5-mini",
                  endpointId: "openai-official",
                  expectedRevision: 2,
                },
              })
            : method === "activate"
              ? client.testAndActivate({
                  actor: ACTOR,
                  provider: "openai",
                  requestId: REQUEST_ID,
                  input: { revision: 3 },
                })
              : client.revealKey({
                  actor: ACTOR,
                  provider: "openai",
                  requestId: REQUEST_ID,
                  input: { revision: 3 },
                });

    await expect(result).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("requires private no-store headers on reveal success", async () => {
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ key: "single-use-secret-key" })),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    await expect(
      client.revealKey({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: { revision: 3 },
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("rejects nested mutation accessor TOCTOU before nonce or fetch", async () => {
    let reads = 0;
    const input = {
      endpointId: "openai-official",
      expectedRevision: 0,
    } as Record<string, unknown>;
    Object.defineProperty(input, "modelId", {
      get() {
        reads += 1;
        return reads === 1 ? "gpt-5-mini" : "https://private.example/v1";
      },
      enumerable: true,
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: "validation_error" }, 400));
    const nonceFactory = vi.fn(() => NONCE);
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory,
    });

    const error = await client
      .saveModelConfig({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: input as Parameters<typeof client.saveModelConfig>[0]["input"],
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "invalid_request" });
    expect(nonceFactory).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects root accessor/symbol, nested hidden fields, and throwing Proxy traps pre-fetch", async () => {
    const builders: Array<() => unknown> = [
      () => {
        const command = {
          actor: ACTOR,
          requestId: REQUEST_ID,
          input: {
            modelId: "gpt-5-mini",
            endpointId: "openai-official",
            expectedRevision: 0,
          },
        } as Record<string, unknown>;
        Object.defineProperty(command, "provider", {
          get: () => "openai",
          enumerable: true,
        });
        return command;
      },
      () => {
        const command = {
          actor: ACTOR,
          provider: "openai",
          requestId: REQUEST_ID,
          input: {
            modelId: "gpt-5-mini",
            endpointId: "openai-official",
            expectedRevision: 0,
          },
        };
        Reflect.set(command, Symbol("key"), "private");
        return command;
      },
      () => {
        const input = {
          modelId: "gpt-5-mini",
          endpointId: "openai-official",
          expectedRevision: 0,
        };
        Object.defineProperty(input, "apiKeyCiphertext", {
          value: "private",
          enumerable: false,
        });
        return {
          actor: ACTOR,
          provider: "openai",
          requestId: REQUEST_ID,
          input,
        };
      },
      () =>
        new Proxy(
          {
            actor: ACTOR,
            provider: "openai",
            requestId: REQUEST_ID,
            input: {
              modelId: "gpt-5-mini",
              endpointId: "openai-official",
              expectedRevision: 0,
            },
          },
          {
            ownKeys() {
              throw new Error("private proxy detail");
            },
          },
        ),
    ];

    for (const build of builders) {
      const fetcher = vi.fn<typeof fetch>();
      const nonceFactory = vi.fn(() => NONCE);
      const client = createAgentModelControlClient({
        settings: settings(),
        fetcher,
        clock: () => NOW,
        nonceFactory,
      });
      const error = await client
        .saveModelConfig(
          build() as Parameters<typeof client.saveModelConfig>[0],
        )
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "invalid_request" });
      expect(nonceFactory).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("rejects accessor/hidden/symbol and hostile Proxy read input before fetch", async () => {
    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, "requestId", {
      get: () => REQUEST_ID,
      enumerable: true,
    });
    const hostile = new Proxy(
      { requestId: REQUEST_ID },
      {
        getPrototypeOf() {
          throw new Error("private proxy detail");
        },
      },
    );
    const hidden = { requestId: REQUEST_ID };
    Object.defineProperty(hidden, "key", {
      value: "private",
      enumerable: false,
    });
    const symbol = { requestId: REQUEST_ID };
    Reflect.set(symbol, Symbol("key"), "private");

    for (const input of [accessor, hidden, symbol, hostile]) {
      const fetcher = vi.fn<typeof fetch>();
      const client = createAgentModelControlClient({
        settings: settings(),
        fetcher,
      });
      const error = await client
        .listModelConfigs(
          input as Parameters<typeof client.listModelConfigs>[0],
        )
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "invalid_request" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("snapshots valid Proxy mutation descriptors exactly once", async () => {
    const target = {
      actor: ACTOR,
      provider: "openai",
      requestId: REQUEST_ID,
      input: {
        modelId: "gpt-5-mini",
        endpointId: "openai-official",
        expectedRevision: 2,
      },
    };
    let providerDescriptors = 0;
    const command = new Proxy(target, {
      get() {
        throw new Error("direct property read is forbidden");
      },
      getOwnPropertyDescriptor(object, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
        if (key === "provider" && descriptor) {
          providerDescriptors += 1;
          return {
            ...descriptor,
            value: providerDescriptors === 1 ? "openai" : "local",
          };
        }
        return descriptor;
      },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(saveResponse()));
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    await expect(
      client.saveModelConfig(
        command as Parameters<typeof client.saveModelConfig>[0],
      ),
    ).resolves.toEqual(saveResponse());
    expect(providerDescriptors).toBe(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `${INTERNAL_URL}/internal/control/model-configs/openai`,
    );
  });

  it("rejects unpaired surrogate mutations before nonce/fetch", async () => {
    for (const input of [
      {
        modelId: "gpt-\ud800",
        endpointId: "openai-official",
        expectedRevision: 0,
      },
      {
        modelId: "gpt-5-mini",
        endpointId: "openai-official",
        apiKey: "secret-\udfff",
        expectedRevision: 0,
      },
    ]) {
      const fetcher = vi.fn<typeof fetch>();
      const nonceFactory = vi.fn(() => NONCE);
      const client = createAgentModelControlClient({
        settings: settings(),
        fetcher,
        nonceFactory,
      });
      const error = await client
        .saveModelConfig({
          actor: ACTOR,
          provider: "openai",
          requestId: REQUEST_ID,
          input,
        })
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "invalid_request" });
      expect(nonceFactory).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("rejects unpaired surrogates in list and reveal responses", async () => {
    const unsafeList = listResponse();
    unsafeList.endpoints[0].label = "OpenAI \ud800";
    unsafeList.configs[0].apiKeyLastFour = "abc\udfff";
    const listClient = createAgentModelControlClient({
      settings: settings(),
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(unsafeList)),
    });
    await expect(
      listClient.listModelConfigs({ requestId: REQUEST_ID }),
    ).rejects.toMatchObject({ code: "invalid_response" });

    const revealClient = createAgentModelControlClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({ key: "secret-\ud800" }, 200, {
          "cache-control": "no-store, private",
          pragma: "no-cache",
        }),
      ),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    await expect(
      revealClient.revealKey({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: { revision: 3 },
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("accepts paired astral characters across safe response fields", async () => {
    const safe = listResponse();
    safe.configs[0].modelId = "model-😀";
    safe.configs[0].apiKeyLastFour = "😀😀😀😀";
    safe.endpoints[0].label = "OpenAI 😀";
    const client = createAgentModelControlClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(safe)),
    });

    await expect(
      client.listModelConfigs({ requestId: REQUEST_ID }),
    ).resolves.toEqual(safe);

    const revealClient = createAgentModelControlClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({ key: "😀😀😀😀😀😀😀😀" }, 200, {
          "cache-control": "no-store, private",
          pragma: "no-cache",
        }),
      ),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    await expect(
      revealClient.revealKey({
        actor: ACTOR,
        provider: "openai",
        requestId: REQUEST_ID,
        input: { revision: 3 },
      }),
    ).resolves.toEqual({ key: "😀😀😀😀😀😀😀😀" });
  });
});

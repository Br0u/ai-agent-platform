import { createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import * as skillRegistryClientModule from "./skill-registry-client";

import {
  SkillRegistryClientError,
  createSkillRegistryAssertionSigner,
  createSkillRegistryClient as createRawSkillRegistryClient,
  resolveSkillRegistrySettings,
  sendPinnedSkillRegistryHttpRequest,
  type SkillRegistryTransport,
} from "./skill-registry-client";

const INTERNAL_URL = "http://skill-registry:7780";
const CONTROL_KEY = "skill-registry-control-key-32-bytes-value";
const OS_KEY = "agentos-internal-security-key-32-bytes";
const AGENT_CONTROL_KEY = "agent-control-key-independent-32-bytes";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const NONCE = "33333333-3333-4333-8333-333333333333";
const SKILL_ID = "44444444-4444-4444-8444-444444444444";
const REVISION_ID = "55555555-5555-4555-8555-555555555555";
const NOW = 2_000_000_000;
const SHA256 = "a".repeat(64);
const PRIVATE_ADDRESS = "10.42.0.7";

type AddressResolver = (
  hostname: string,
) => Promise<readonly { address: string; family: 4 | 6 }[]>;
type ClientOptions = Omit<
  Parameters<typeof createRawSkillRegistryClient>[0],
  "transport"
> & {
  resolver?: AddressResolver;
  fetcher?: typeof fetch;
  transport?: SkillRegistryTransport;
};

const privateResolver: AddressResolver = async () => [
  { address: PRIVATE_ADDRESS, family: 4 },
];

function createSkillRegistryClient(options: ClientOptions) {
  const { fetcher, ...clientOptions } = options;
  return createRawSkillRegistryClient({
    ...clientOptions,
    resolver: options.resolver ?? privateResolver,
    transport:
      options.transport ??
      (fetcher === undefined
        ? undefined
        : (input) => {
            const host =
              input.family === 6 ? `[${input.address}]` : input.address;
            const origin = `http://${host}${input.port === 80 ? "" : `:${input.port}`}`;
            return fetcher(`${origin}${input.path}`, {
              method: input.method,
              headers: { ...input.headers, Host: input.hostHeader },
              body: input.body as BodyInit | undefined,
              signal: input.signal,
              redirect: "manual",
              cache: "no-store",
              credentials: "omit",
            });
          }),
  });
}

const GOLDEN_REVIEW_ASSERTION =
  "eyJhY3Rpb24iOiJyZXZpZXciLCJhY3RvciI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSIsImFzc3VyYW5jZSI6InBhc3N3b3JkK21mYSIsImFzc3VyZWRBdCI6MTk5OTk5OTcwMCwiZXhwaXJlc0F0IjoyMDAwMDAwMDA1LCJpc3N1ZWRBdCI6MjAwMDAwMDAwMCwibm9uY2UiOiIzMzMzMzMzMy0zMzMzLTQzMzMtODMzMy0zMzMzMzMzMzMzMzMiLCJwZXJtaXNzaW9uIjoiYWRtaW46YXNzaXN0YW50OnNraWxsczpyZXZpZXciLCJyZXF1ZXN0SWQiOiIyMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMjIiLCJ0YXJnZXQiOiI0NDQ0NDQ0NC00NDQ0LTQ0NDQtODQ0NC00NDQ0NDQ0NDQ0NDQvNTU1NTU1NTUtNTU1NS00NTU1LTg1NTUtNTU1NTU1NTU1NTU1In0.Ky7icHs2m8RHPZCHs1aiWNaG_6Aq-8AcQo7oaHMQGZQ";

function settings() {
  return resolveSkillRegistrySettings({
    SKILL_REGISTRY_INTERNAL_URL: INTERNAL_URL,
    SKILL_REGISTRY_CONTROL_KEY: CONTROL_KEY,
    OS_SECURITY_KEY: OS_KEY,
    AGENT_CONFIG_CONTROL_KEY: AGENT_CONTROL_KEY,
  });
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function revision() {
  return {
    id: REVISION_ID,
    skillId: SKILL_ID,
    name: "safe-skill",
    number: 1,
    state: "pending_review",
    sourceType: "upload",
    artifactSha256: SHA256,
    createdBy: ACTOR,
    createdAt: "2026-07-20T01:02:03.000Z",
    reviewedBy: null,
    reviewedAt: null,
  };
}

function listResponse() {
  return {
    version: "1",
    skills: [
      {
        id: SKILL_ID,
        name: "safe-skill",
        createdAt: "2026-07-20T01:02:03.000Z",
        revision: {
          id: REVISION_ID,
          number: 1,
          state: "pending_review",
          sourceType: "upload",
          artifactSha256Prefix: SHA256.slice(0, 12),
          createdBy: ACTOR,
          createdAt: "2026-07-20T01:02:03.000Z",
          reviewedBy: null,
          reviewedAt: null,
        },
      },
    ],
    page: { limit: 50, offset: 0, returned: 1 },
  };
}

function detailResponse() {
  return {
    version: "1",
    revision: {
      ...revision(),
      description: "A reviewed skill.",
      license: null,
      compatibility: null,
      allowedTools: [],
      compressedSize: 100,
      extractedSize: 200,
      fileCount: 1,
    },
    files: [
      {
        path: "SKILL.md",
        sha256: "b".repeat(64),
        size: 200,
        mediaType: "text/plain",
        kind: "manifest",
      },
    ],
    dependencies: { pythonModules: [], unavailablePythonModules: [] },
    findings: [],
    previousPublishedRevisionId: null,
    diff: null,
    reviewAttestations: {
      contentReviewed: true,
      usageRightsConfirmed: true,
      executionRiskAccepted: true,
      independentReviewerConfirmed: true,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Skill Registry settings", () => {
  it.each([
    "https://skill-registry:7780",
    "http://skill-registry:7780/",
    "http://skill-registry:7780/path",
    "http://user:pass@skill-registry:7780",
    "http://skill-registry:7780?secret=value",
    "http://localhost:7780",
    "http://127.0.0.1:7780",
    "http://0x7f000001:7780",
    "http://8.8.8.8:7780",
    "http://registry.example.com:7780",
  ])("rejects a non-private exact HTTP origin: %s", (url) => {
    expect(() =>
      resolveSkillRegistrySettings({
        SKILL_REGISTRY_INTERNAL_URL: url,
        SKILL_REGISTRY_CONTROL_KEY: CONTROL_KEY,
        OS_SECURITY_KEY: OS_KEY,
        AGENT_CONFIG_CONTROL_KEY: AGENT_CONTROL_KEY,
      }),
    ).toThrow("Skill Registry configuration is invalid");
  });

  it.each([
    undefined,
    "short",
    "a".repeat(31),
    "密钥".repeat(11),
    `${"a".repeat(32)}\nprivate`,
  ])("rejects an invalid control key without echoing it", (key) => {
    let error: unknown;
    try {
      resolveSkillRegistrySettings({
        SKILL_REGISTRY_INTERNAL_URL: INTERNAL_URL,
        SKILL_REGISTRY_CONTROL_KEY: key,
        OS_SECURITY_KEY: OS_KEY,
        AGENT_CONFIG_CONTROL_KEY: AGENT_CONTROL_KEY,
      });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).toBe(
      "Error: Skill Registry configuration is invalid",
    );
    if (key) expect(String(error)).not.toContain(key);
  });

  it("requires an independent control key and returns only its exact settings", () => {
    for (const duplicate of [OS_KEY, AGENT_CONTROL_KEY]) {
      expect(() =>
        resolveSkillRegistrySettings({
          SKILL_REGISTRY_INTERNAL_URL: INTERNAL_URL,
          SKILL_REGISTRY_CONTROL_KEY: duplicate,
          OS_SECURITY_KEY: OS_KEY,
          AGENT_CONFIG_CONTROL_KEY: AGENT_CONTROL_KEY,
        }),
      ).toThrow("Skill Registry configuration is invalid");
    }
    expect(settings()).toEqual({
      baseUrl: INTERNAL_URL,
      controlKey: CONTROL_KEY,
    });
  });
});

describe("Skill Registry assertion signer", () => {
  it("matches a Python-generated review golden vector byte-for-byte", () => {
    const assertion = createSkillRegistryAssertionSigner({
      controlKey: CONTROL_KEY,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    }).sign({
      action: "review",
      actor: ACTOR,
      permission: "admin:assistant:skills:review",
      requestId: REQUEST_ID,
      target: `${SKILL_ID}/${REVISION_ID}`,
      assurance: "password+mfa",
      assuredAt: NOW - 300,
    });

    expect(assertion).toBe(GOLDEN_REVIEW_ASSERTION);
  });

  it.each([
    ["list", "admin:assistant:skills:upload", "skills"],
    ["detail", "admin:assistant:skills", `${SKILL_ID}/${REVISION_ID}`],
    ["file", "admin:assistant:skills:review", `${SKILL_ID}/${REVISION_ID}`],
    ["upload", "admin:assistant:skills:review", "new"],
    ["review", "admin:assistant:skills:upload", `${SKILL_ID}/${REVISION_ID}`],
  ])(
    "rejects an invalid action/permission/target tuple",
    (action, permission, target) => {
      const signer = createSkillRegistryAssertionSigner({
        controlKey: CONTROL_KEY,
        clock: () => NOW,
        nonceFactory: () => NONCE,
      });
      expect(() =>
        signer.sign({
          action,
          actor: ACTOR,
          permission,
          requestId: REQUEST_ID,
          target,
          assurance: action === "review" ? "password+mfa" : "session",
          assuredAt: action === "review" ? NOW : null,
        } as Parameters<typeof signer.sign>[0]),
      ).toThrow(SkillRegistryClientError);
    },
  );

  it("rejects non-canonical UUIDs, unsafe clock/nonces, stale MFA and hidden input before consuming entropy", () => {
    const nonceFactory = vi.fn(() => NONCE);
    const signer = createSkillRegistryAssertionSigner({
      controlKey: CONTROL_KEY,
      clock: () => NOW,
      nonceFactory,
    });
    const hidden = {
      action: "list",
      actor: ACTOR,
      permission: "admin:assistant:skills",
      requestId: REQUEST_ID,
      target: "skills",
      assurance: "session",
      assuredAt: null,
    };
    Object.defineProperty(hidden, "secret", { value: "private" });
    expect(() =>
      signer.sign(hidden as Parameters<typeof signer.sign>[0]),
    ).toThrow(SkillRegistryClientError);
    expect(nonceFactory).not.toHaveBeenCalled();

    expect(() =>
      signer.sign({
        action: "review",
        actor: ACTOR.toUpperCase(),
        permission: "admin:assistant:skills:review",
        requestId: REQUEST_ID,
        target: `${SKILL_ID}/${REVISION_ID}`,
        assurance: "password+mfa",
        assuredAt: NOW - 601,
      }),
    ).toThrow(SkillRegistryClientError);
    expect(nonceFactory).not.toHaveBeenCalled();
  });
});

describe("private Skill Registry client", () => {
  it("accepts only the frozen branded settings object", async () => {
    const resolved = settings();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(listResponse()));
    const client = createSkillRegistryClient({
      settings: resolved,
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Reflect.set(resolved, "baseUrl", "http://8.8.8.8:7780")).toBe(false);
    await expect(
      client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      }),
    ).resolves.toEqual(listResponse());
    expect(fetcher).toHaveBeenCalledWith(
      `http://${PRIVATE_ADDRESS}:7780/internal/skills?limit=50&offset=0`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${CONTROL_KEY}`,
          Host: "skill-registry:7780",
        }),
        redirect: "manual",
      }),
    );
  });

  it("rejects cloned, direct and proxied settings without touching dangerous properties", () => {
    const resolved = settings();
    const getter = vi.fn(() => CONTROL_KEY);
    const direct = { baseUrl: INTERNAL_URL } as Record<string, unknown>;
    Object.defineProperty(direct, "controlKey", {
      get: getter,
      enumerable: true,
    });
    const traps = {
      get: vi.fn(),
      getPrototypeOf: vi.fn(),
      getOwnPropertyDescriptor: vi.fn(),
      ownKeys: vi.fn(),
    };
    const proxied = new Proxy(resolved, {
      get() {
        traps.get();
        throw new Error("private settings trap");
      },
      getPrototypeOf() {
        traps.getPrototypeOf();
        throw new Error("private settings trap");
      },
      getOwnPropertyDescriptor() {
        traps.getOwnPropertyDescriptor();
        throw new Error("private settings trap");
      },
      ownKeys() {
        traps.ownKeys();
        throw new Error("private settings trap");
      },
    });

    for (const invalid of [{ ...resolved }, direct, proxied]) {
      expect(() =>
        createRawSkillRegistryClient({
          settings: invalid as ReturnType<typeof settings>,
        }),
      ).toThrow("Skill Registry configuration is invalid");
    }
    expect(getter).not.toHaveBeenCalled();
    expect(
      Object.fromEntries(
        Object.entries(traps).map(([name, trap]) => [
          name,
          trap.mock.calls.length,
        ]),
      ),
    ).toEqual({
      get: 0,
      getPrototypeOf: 0,
      getOwnPropertyDescriptor: 0,
      ownKeys: 0,
    });
  });

  it.each([
    { baseUrl: "http://8.8.8.8:7780", controlKey: CONTROL_KEY },
    { baseUrl: `${INTERNAL_URL}/path`, controlKey: CONTROL_KEY },
    { baseUrl: INTERNAL_URL, controlKey: "short" },
  ])("rejects direct invalid settings at client construction", (invalid) => {
    expect(() =>
      createRawSkillRegistryClient({
        settings: invalid,
      }),
    ).toThrow("Skill Registry configuration is invalid");
  });

  it.each([
    [[{ address: "8.8.8.8", family: 4 }]],
    [
      [
        { address: PRIVATE_ADDRESS, family: 4 },
        { address: "8.8.4.4", family: 4 },
      ],
    ],
    [[{ address: "::ffff:10.42.0.7", family: 6 }]],
  ] as const)("rejects unsafe resolver result %j", async (addresses) => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher,
      resolver: async () => addresses,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    await expect(
      client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: "transport_error" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves every request and pins the connection to the verified address", async () => {
    const resolver = vi
      .fn<AddressResolver>()
      .mockResolvedValueOnce([{ address: PRIVATE_ADDRESS, family: 4 }])
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(listResponse()));
    const client = createSkillRegistryClient({
      settings: settings(),
      resolver,
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    const command = {
      actor: ACTOR,
      requestId: REQUEST_ID,
      limit: 50,
      offset: 0,
    };

    await expect(client.listSkills(command)).resolves.toEqual(listResponse());
    await expect(client.listSkills(command)).rejects.toMatchObject({
      code: "transport_error",
    });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver).toHaveBeenCalledWith("skill-registry");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("resolves an IPv6 origin without brackets and pins a bracketed IP URL", async () => {
    const resolver = vi
      .fn<AddressResolver>()
      .mockResolvedValue([{ address: "fd00::7", family: 6 }]);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(listResponse()));
    const client = createSkillRegistryClient({
      settings: resolveSkillRegistrySettings({
        SKILL_REGISTRY_INTERNAL_URL: "http://[fd00::1]:7780",
        SKILL_REGISTRY_CONTROL_KEY: CONTROL_KEY,
        OS_SECURITY_KEY: OS_KEY,
        AGENT_CONFIG_CONTROL_KEY: AGENT_CONTROL_KEY,
      }),
      resolver,
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    await expect(
      client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      }),
    ).resolves.toEqual(listResponse());
    expect(resolver).toHaveBeenCalledWith("fd00::1");
    expect(fetcher).toHaveBeenCalledWith(
      "http://[fd00::7]:7780/internal/skills?limit=50&offset=0",
      expect.objectContaining({
        headers: expect.objectContaining({ Host: "[fd00::1]:7780" }),
      }),
    );
  });

  it("uses the default resolver when no test seam is supplied", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(listResponse()));
    const client = createRawSkillRegistryClient({
      settings: resolveSkillRegistrySettings({
        SKILL_REGISTRY_INTERNAL_URL: `http://${PRIVATE_ADDRESS}:7780`,
        SKILL_REGISTRY_CONTROL_KEY: CONTROL_KEY,
        OS_SECURITY_KEY: OS_KEY,
        AGENT_CONFIG_CONTROL_KEY: AGENT_CONTROL_KEY,
      }),
      transport: (input) => {
        const host = input.family === 6 ? `[${input.address}]` : input.address;
        return fetcher(`http://${host}:${input.port}${input.path}`, {
          method: input.method,
          headers: { ...input.headers, Host: input.hostHeader },
          signal: input.signal,
        });
      },
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    await expect(
      client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      }),
    ).resolves.toEqual(listResponse());
    expect(fetcher).toHaveBeenCalledWith(
      `http://${PRIVATE_ADDRESS}:7780/internal/skills?limit=50&offset=0`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Host: `${PRIVATE_ADDRESS}:7780`,
        }),
      }),
    );
  });

  it("sends a real pinned request with the original Host and exact path", async () => {
    const candidate = Reflect.get(
      skillRegistryClientModule,
      "sendPinnedSkillRegistryHttpRequest",
    ) as unknown;
    expect(typeof candidate).toBe("function");
    if (typeof candidate !== "function") return;
    const transport = candidate as (input: {
      address: string;
      family: 4 | 6;
      port: number;
      hostHeader: string;
      method: "GET" | "POST";
      path: string;
      headers: Readonly<Record<string, string>>;
      body?: string | Uint8Array;
      signal: AbortSignal;
    }) => Promise<Response>;
    let received:
      | { host: string | undefined; path: string | undefined; remote: string }
      | undefined;
    const server = createServer((request, response) => {
      received = {
        host: request.headers.host,
        path: request.url,
        remote: request.socket.remoteAddress ?? "",
      };
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end('{"version":"1"}');
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const port = (server.address() as AddressInfo).port;
      const response = await transport({
        address: "127.0.0.1",
        family: 4,
        port,
        hostHeader: "skill-registry:7780",
        method: "GET",
        path: "/internal/skills?limit=1&offset=7",
        headers: { Accept: "application/json" },
        signal: new AbortController().signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe('{"version":"1"}');
      expect(received).toEqual({
        host: "skill-registry:7780",
        path: "/internal/skills?limit=1&offset=7",
        remote: "127.0.0.1",
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it.each([
    "wrong-media",
    "redirect",
    "oversized-declared",
    "continuous-chunked",
  ] as const)(
    "closes the real node:http response for an early %s failure",
    async (scenario) => {
      const sockets = new Set<Socket>();
      let closeResponse: (() => void) | undefined;
      const responseClosed = new Promise<void>((resolve) => {
        closeResponse = resolve;
      });
      const server = createServer((_request, response) => {
        response.once("close", () => closeResponse?.());
        if (scenario === "wrong-media") {
          response.writeHead(200, {
            "content-type": "text/plain",
            "cache-control": "no-store",
          });
          response.flushHeaders();
          return;
        }
        if (scenario === "redirect") {
          response.writeHead(302, {
            location: "/private-redirect",
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          response.flushHeaders();
          return;
        }
        if (scenario === "oversized-declared") {
          response.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
            "content-length": String(3 * 1024 * 1024 + 1),
          });
          response.flushHeaders();
          return;
        }
        response.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        const interval = setInterval(() => {
          response.write(Buffer.alloc(128 * 1024, 0x78));
        }, 1);
        response.once("close", () => clearInterval(interval));
      });
      server.on("connection", (socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      try {
        const port = (server.address() as AddressInfo).port;
        const transport: SkillRegistryTransport = (input) =>
          sendPinnedSkillRegistryHttpRequest({
            ...input,
            address: "127.0.0.1",
            family: 4,
            port,
          });
        const client = createRawSkillRegistryClient({
          settings: settings(),
          resolver: privateResolver,
          transport,
          clock: () => NOW,
          nonceFactory: () => NONCE,
        });

        await expect(
          client.listSkills({
            actor: ACTOR,
            requestId: REQUEST_ID,
            limit: 50,
            offset: 0,
          }),
        ).rejects.toMatchObject({
          code:
            scenario === "continuous-chunked" ||
            scenario === "oversized-declared"
              ? "response_too_large"
              : "invalid_response",
        });
        const observed = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), 500);
          void responseClosed.then(() => {
            clearTimeout(timer);
            resolve(true);
          });
        });
        expect(observed).toBe(true);
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );

  it("fully consumes a normal real node:http response without aborting it", async () => {
    let finished = false;
    let closedAfterFinish = false;
    let requestSignal: AbortSignal | undefined;
    const server = createServer((_request, response) => {
      response.once("finish", () => {
        finished = true;
      });
      response.once("close", () => {
        closedAfterFinish = finished;
      });
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(listResponse()));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const port = (server.address() as AddressInfo).port;
      const transport: SkillRegistryTransport = (input) => {
        requestSignal = input.signal;
        return sendPinnedSkillRegistryHttpRequest({
          ...input,
          address: "127.0.0.1",
          family: 4,
          port,
        });
      };
      const client = createRawSkillRegistryClient({
        settings: settings(),
        resolver: privateResolver,
        transport,
        clock: () => NOW,
        nonceFactory: () => NONCE,
      });

      await expect(
        client.listSkills({
          actor: ACTOR,
          requestId: REQUEST_ID,
          limit: 50,
          offset: 0,
        }),
      ).resolves.toEqual(listResponse());
      await new Promise((resolve) => setImmediate(resolve));
      expect(finished).toBe(true);
      expect(closedAfterFinish).toBe(true);
      expect(requestSignal?.aborted).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("clean-room sanitizes errors from the injected transport seam", async () => {
    const secret = `${INTERNAL_URL} ${CONTROL_KEY} private transport body`;
    const transport = vi.fn().mockRejectedValue(new Error(secret));
    const client = createRawSkillRegistryClient({
      settings: settings(),
      resolver: privateResolver,
      transport,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    let caught: unknown;
    try {
      await client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(transport).toHaveBeenCalledOnce();
    expect(caught).toMatchObject({ code: "transport_error" });
    expect(`${String(caught)} ${JSON.stringify(caught)}`).not.toMatch(
      /private|skill-registry|control-key/iu,
    );
  });

  it("sanitizes resolver failures without leaking URL or keys", async () => {
    const secret = `${INTERNAL_URL} ${CONTROL_KEY} private resolver body`;
    const client = createSkillRegistryClient({
      settings: settings(),
      resolver: async () => {
        throw new Error(secret);
      },
      fetcher: vi.fn<typeof fetch>(),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    let caught: unknown;
    try {
      await client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "transport_error" });
    expect(`${String(caught)} ${JSON.stringify(caught)}`).not.toMatch(
      /private|skill-registry|control-key/iu,
    );
  });

  it("calls list/detail/file/upload/review with exact signed route context", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(listResponse()))
      .mockResolvedValueOnce(jsonResponse(detailResponse()))
      .mockResolvedValueOnce(
        jsonResponse({
          version: "1",
          path: "scripts/run%2Fhidden%5C.py",
          content: "safe text\n",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ version: "1", revision: revision() }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          version: "1",
          revision: {
            ...revision(),
            state: "published",
            reviewedBy: ACTOR,
            reviewedAt: "2026-07-20T01:03:03.000Z",
          },
        }),
      );
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    await expect(
      client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      }),
    ).resolves.toEqual(listResponse());
    await expect(
      client.getRevision({
        actor: ACTOR,
        requestId: REQUEST_ID,
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
      }),
    ).resolves.toEqual(detailResponse());
    await expect(
      client.getFile({
        actor: ACTOR,
        requestId: REQUEST_ID,
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
        path: "scripts/run%2Fhidden%5C.py",
      }),
    ).resolves.toEqual({
      version: "1",
      path: "scripts/run%2Fhidden%5C.py",
      content: "safe text\n",
    });
    await expect(
      client.uploadSkill({
        actor: ACTOR,
        requestId: REQUEST_ID,
        targetSkillId: SKILL_ID,
        archive: new Uint8Array([0x50, 0x4b, 3, 4]),
      }),
    ).resolves.toEqual({ version: "1", revision: revision() });
    await expect(
      client.reviewRevision({
        actor: ACTOR,
        requestId: REQUEST_ID,
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
        assuredAt: NOW - 300,
        input: {
          decision: "approve",
          expectedState: "pending_review",
          reason: null,
          attestations: {
            contentReviewed: true,
            usageRightsConfirmed: true,
            executionRiskAccepted: true,
            independentReviewerConfirmed: true,
          },
        },
      }),
    ).resolves.toEqual({
      version: "1",
      revision: {
        ...revision(),
        state: "published",
        reviewedBy: ACTOR,
        reviewedAt: "2026-07-20T01:03:03.000Z",
      },
    });

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `http://${PRIVATE_ADDRESS}:7780/internal/skills?limit=50&offset=0`,
      `http://${PRIVATE_ADDRESS}:7780/internal/skills/${SKILL_ID}/revisions/${REVISION_ID}`,
      `http://${PRIVATE_ADDRESS}:7780/internal/skills/${SKILL_ID}/revisions/${REVISION_ID}/files/scripts/run%252Fhidden%255C.py`,
      `http://${PRIVATE_ADDRESS}:7780/internal/skills/uploads?targetSkillId=${SKILL_ID}`,
      `http://${PRIVATE_ADDRESS}:7780/internal/skills/${SKILL_ID}/revisions/${REVISION_ID}/review`,
    ]);
    const expected = [
      ["list", "admin:assistant:skills", "skills", "session", null],
      [
        "detail",
        "admin:assistant:skills:review",
        `${SKILL_ID}/${REVISION_ID}`,
        "session",
        null,
      ],
      [
        "file",
        "admin:assistant:skills:review",
        `${SKILL_ID}/${REVISION_ID}/scripts/run%2Fhidden%5C.py`,
        "session",
        null,
      ],
      ["upload", "admin:assistant:skills:upload", SKILL_ID, "session", null],
      [
        "review",
        "admin:assistant:skills:review",
        `${SKILL_ID}/${REVISION_ID}`,
        "password+mfa",
        NOW - 300,
      ],
    ];
    for (const [
      index,
      [action, permission, target, assurance, assuredAt],
    ] of expected.entries()) {
      const init = fetcher.mock.calls[index]![1]!;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${CONTROL_KEY}`);
      expect(headers.Host).toBe("skill-registry:7780");
      expect(headers["X-Request-Id"]).toBe(REQUEST_ID);
      const payload = JSON.parse(
        Buffer.from(
          headers["X-Skill-Registry-Assertion"]!.split(".")[0]!,
          "base64url",
        ).toString("utf8"),
      );
      expect(payload).toMatchObject({
        action,
        permission,
        target,
        assurance,
        assuredAt,
        actor: ACTOR,
        requestId: REQUEST_ID,
        expiresAt: NOW + 5,
      });
    }
    expect(fetcher.mock.calls[3]![1]).toMatchObject({
      method: "POST",
      body: expect.any(Uint8Array),
      headers: expect.objectContaining({ "Content-Type": "application/zip" }),
    });
    expect(fetcher.mock.calls[4]![1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        decision: "approve",
        expectedState: "pending_review",
        reason: null,
        attestations: {
          contentReviewed: true,
          usageRightsConfirmed: true,
          executionRiskAccepted: true,
          independentReviewerConfirmed: true,
        },
      }),
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
    });
  });

  it("binds upload and review responses to the requested state transition", async () => {
    const reviewed = (state: "published" | "rejected") => ({
      ...revision(),
      state,
      reviewedBy: ACTOR,
      reviewedAt: "2026-07-20T01:03:03.000Z",
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ version: "1", revision: reviewed("published") }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ version: "1", revision: reviewed("rejected") }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ version: "1", revision: reviewed("published") }),
      );
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    const attestations = {
      contentReviewed: true as const,
      usageRightsConfirmed: true as const,
      executionRiskAccepted: true as const,
      independentReviewerConfirmed: true as const,
    };

    await expect(
      client.uploadSkill({
        actor: ACTOR,
        requestId: REQUEST_ID,
        archive: new Uint8Array([0x50, 0x4b, 3, 4]),
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
    await expect(
      client.reviewRevision({
        actor: ACTOR,
        requestId: REQUEST_ID,
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
        assuredAt: NOW - 300,
        input: {
          decision: "approve",
          expectedState: "pending_review",
          reason: null,
          attestations,
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
    await expect(
      client.reviewRevision({
        actor: ACTOR,
        requestId: REQUEST_ID,
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
        assuredAt: NOW - 300,
        input: {
          decision: "reject",
          expectedState: "pending_review",
          reason: "Unsafe behavior.",
          attestations,
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("accepts 500 Unicode code points and rejects a 501-point review reason", async () => {
    const reason = "😀".repeat(500);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        version: "1",
        revision: {
          ...revision(),
          state: "rejected",
          reviewedBy: ACTOR,
          reviewedAt: "2026-07-20T01:03:03.000Z",
        },
      }),
    );
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    const command = (value: string) => ({
      actor: ACTOR,
      requestId: REQUEST_ID,
      skillId: SKILL_ID,
      revisionId: REVISION_ID,
      assuredAt: NOW - 300,
      input: {
        decision: "reject" as const,
        expectedState: "pending_review" as const,
        reason: value,
        attestations: {
          contentReviewed: true as const,
          usageRightsConfirmed: true as const,
          executionRiskAccepted: true as const,
          independentReviewerConfirmed: true as const,
        },
      },
    });

    await expect(client.reviewRevision(command(reason))).resolves.toMatchObject(
      {
        revision: { state: "rejected" },
      },
    );
    await expect(
      client.reviewRevision(command("x".repeat(501))),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("accepts a bounded detail response with 1153 findings", async () => {
    const body = detailResponse();
    Reflect.set(
      body,
      "findings",
      Array.from({ length: 1_153 }, (_, index) => ({
        path: "SKILL.md",
        line: index + 1,
        code: "subprocess",
        message: "Review required.",
        blocking: false,
      })),
    );
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body)),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    await expect(
      client.getRevision({
        actor: ACTOR,
        requestId: REQUEST_ID,
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
      }),
    ).resolves.toEqual(body);
  });

  it.each([
    ["missing", {}],
    ["conflicting", { "cache-control": "no-store, private" }],
    ["duplicate", { "cache-control": "no-store, no-store" }],
    ["cacheable", { "cache-control": "max-age=60" }],
    ["media", { "content-type": "application/json; charset=utf-8" }],
  ])("rejects %s response cache/media policy", async (_name, headers) => {
    const responseHeaders = {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    };
    if (_name === "missing")
      Reflect.deleteProperty(responseHeaders, "cache-control");
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(listResponse()), {
          status: 200,
          headers: responseHeaders,
        }),
      ),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    await expect(
      client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    ["redirect", 302, {}, "invalid_response"],
    [
      "wrong media type",
      200,
      { "content-type": "application/json; charset=utf-8" },
      "invalid_response",
    ],
    [
      "cacheable response",
      200,
      { "cache-control": "max-age=60" },
      "invalid_response",
    ],
    [
      "non-canonical content length",
      200,
      { "content-length": "01" },
      "invalid_response",
    ],
    [
      "oversized declared content length",
      200,
      { "content-length": String(3 * 1024 * 1024 + 1) },
      "response_too_large",
    ],
  ] as const)(
    "cancels the body exactly once for an early %s failure",
    async (_name, status, headerOverrides, expectedCode) => {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({ cancel });
      const response = new Response(body, {
        status,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          ...headerOverrides,
        },
      });
      const client = createSkillRegistryClient({
        settings: settings(),
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(response),
        clock: () => NOW,
        nonceFactory: () => NONCE,
      });

      await expect(
        client.listSkills({
          actor: ACTOR,
          requestId: REQUEST_ID,
          limit: 50,
          offset: 0,
        }),
      ).rejects.toMatchObject({ code: expectedCode });
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("preserves the primary stable error when body cancellation throws", async () => {
    const secret = `${CONTROL_KEY} private cancellation failure`;
    const cancel = vi.fn(() => {
      throw new Error(secret);
    });
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new ReadableStream<Uint8Array>({ cancel }), {
          headers: {
            "content-type": "text/plain",
            "cache-control": "no-store",
          },
        }),
      ),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    let caught: unknown;
    try {
      await client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "invalid_response" });
    expect(`${String(caught)} ${JSON.stringify(caught)}`).not.toContain(secret);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a streamed oversized body once and never cancels a fully consumed body", async () => {
    const oversizedCancel = vi.fn();
    const oversizedClient = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new Uint8Array(1024 * 1024));
            },
            cancel: oversizedCancel,
          }),
          {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          },
        ),
      ),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    await expect(
      oversizedClient.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: "response_too_large" });
    expect(oversizedCancel).toHaveBeenCalledOnce();

    const consumedCancel = vi.fn();
    const consumedClient = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(JSON.stringify(listResponse())),
              );
              controller.close();
            },
            cancel: consumedCancel,
          }),
          {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          },
        ),
      ),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    await expect(
      consumedClient.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      }),
    ).resolves.toEqual(listResponse());
    expect(consumedCancel).not.toHaveBeenCalled();
  });

  it("rejects duplicate JSON fields and contract-invalid responses without echoing them", async () => {
    const privateBody = `{"version":"1","version":"private-secret","skills":[],"page":{"limit":50,"offset":0,"returned":0}}`;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(privateBody, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }),
    );
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    let caught: unknown;
    try {
      await client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SkillRegistryClientError);
    expect(caught).toMatchObject({ code: "invalid_response" });
    expect(String(caught)).not.toContain("private-secret");
    expect(JSON.stringify(caught)).not.toContain("private-secret");
  });

  it("maps only exact status/code pairs", async () => {
    for (const [status, code, expected] of [
      [404, "SKILL_NOT_FOUND", "SKILL_NOT_FOUND"],
      [409, "REVIEW_BLOCKED", "REVIEW_BLOCKED"],
      [503, "REGISTRY_STORAGE_ERROR", "REGISTRY_STORAGE_ERROR"],
      [413, "ARCHIVE_TOO_LARGE", "ARCHIVE_TOO_LARGE"],
      [400, "ARCHIVE_FILE_TOO_LARGE", "ARCHIVE_FILE_TOO_LARGE"],
      [400, "ARCHIVE_GIT_LFS_POINTER", "ARCHIVE_GIT_LFS_POINTER"],
      [400, "ARCHIVE_GIT_METADATA", "ARCHIVE_GIT_METADATA"],
      [400, "ARCHIVE_PATH_CONFLICT", "ARCHIVE_PATH_CONFLICT"],
      [400, "ARCHIVE_SKILL_ROOT_REQUIRED", "ARCHIVE_SKILL_ROOT_REQUIRED"],
      [400, "ARCHIVE_UNSUPPORTED_FILE", "ARCHIVE_UNSUPPORTED_FILE"],
      [400, "SKILL_BINARY_FILE", "SKILL_BINARY_FILE"],
      [
        400,
        "SKILL_SCRIPT_SHEBANG_UNSUPPORTED",
        "SKILL_SCRIPT_SHEBANG_UNSUPPORTED",
      ],
      [400, "SKILL_NOT_FOUND", "invalid_response"],
      [404, "PRIVATE_UNKNOWN", "invalid_response"],
    ] as const) {
      const client = createSkillRegistryClient({
        settings: settings(),
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(jsonResponse({ error: code }, status)),
        clock: () => NOW,
        nonceFactory: () => NONCE,
      });
      await expect(
        client.listSkills({
          actor: ACTOR,
          requestId: REQUEST_ID,
          limit: 50,
          offset: 0,
        }),
      ).rejects.toMatchObject({ code: expected });
    }
  });

  it("enforces archive, file content and response byte limits", async () => {
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>(),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    await expect(
      client.uploadSkill({
        actor: ACTOR,
        requestId: REQUEST_ID,
        archive: new Uint8Array(5 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });

    const fileClient = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          version: "1",
          path: "SKILL.md",
          content: "😀".repeat(600_000),
        }),
      ),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    await expect(
      fileClient.getFile({
        actor: ACTOR,
        requestId: REQUEST_ID,
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
        path: "SKILL.md",
      }),
    ).rejects.toMatchObject({ code: "response_too_large" });

    for (const content of [
      '"'.repeat(2 * 1024 * 1024),
      "\x01".repeat(2 * 1024 * 1024),
    ]) {
      const exactFileClient = createSkillRegistryClient({
        settings: settings(),
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(
          jsonResponse({
            version: "1",
            path: "SKILL.md",
            content,
          }),
        ),
        clock: () => NOW,
        nonceFactory: () => NONCE,
      });
      await expect(
        exactFileClient.getFile({
          actor: ACTOR,
          requestId: REQUEST_ID,
          skillId: SKILL_ID,
          revisionId: REVISION_ID,
          path: "SKILL.md",
        }),
      ).resolves.toMatchObject({ content });
    }

    const oversizedFileClient = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          version: "1",
          path: "SKILL.md",
          content: "x".repeat(2 * 1024 * 1024 + 1),
        }),
      ),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    await expect(
      oversizedFileClient.getFile({
        actor: ACTOR,
        requestId: REQUEST_ID,
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
        path: "SKILL.md",
      }),
    ).rejects.toMatchObject({ code: "response_too_large" });

    const declared = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("{}", {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "content-length": String(3 * 1024 * 1024 + 1),
          },
        }),
      ),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    await expect(
      declared.getRevision({
        actor: ACTOR,
        requestId: REQUEST_ID,
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
      }),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("rejects unpaired file paths and hostile archive views as invalid requests", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    await expect(
      client.getFile({
        actor: ACTOR,
        requestId: REQUEST_ID,
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
        path: `references/bad-${String.fromCharCode(0xd800)}.md`,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    for (const path of ["references/cafe\u0301.md", "scripts/\u202eevil.py"]) {
      await expect(
        client.getFile({
          actor: ACTOR,
          requestId: REQUEST_ID,
          skillId: SKILL_ID,
          revisionId: REVISION_ID,
          path,
        }),
      ).rejects.toMatchObject({ code: "invalid_request" });
    }

    const archive = new Proxy(new Uint8Array([0x50, 0x4b, 3, 4]), {
      getPrototypeOf() {
        throw new Error("private archive trap");
      },
    });
    await expect(
      client.uploadSkill({ actor: ACTOR, requestId: REQUEST_ID, archive }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses separate fixed connect and response deadlines", async () => {
    vi.useFakeTimers();
    const connectClient = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>(() => new Promise(() => undefined)),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    const connect = connectClient.listSkills({
      actor: ACTOR,
      requestId: REQUEST_ID,
      limit: 50,
      offset: 0,
    });
    const connectExpectation = expect(connect).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.advanceTimersByTimeAsync(2_001);
    await connectExpectation;

    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start() {}, cancel });
    const responseClient = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(stream, {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        }),
      ),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    const response = responseClient.listSkills({
      actor: ACTOR,
      requestId: REQUEST_ID,
      limit: 50,
      offset: 0,
    });
    const responseExpectation = expect(response).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.advanceTimersByTimeAsync(5_001);
    await responseExpectation;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("removes recursive transport causes, response body, URL and key from errors", async () => {
    const deepest = new Error(
      `${CONTROL_KEY} ${INTERNAL_URL} private-response-body`,
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("outer private", { cause: deepest }));
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher,
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });
    let caught: unknown;
    try {
      await client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "transport_error" });
    expect((caught as Error).cause).toBeUndefined();
    expect(`${String(caught)} ${JSON.stringify(caught)}`).not.toMatch(
      /private|skill-registry|control-key/iu,
    );
  });

  it("returns a fresh clean-room error for a mutated same-class rejection", async () => {
    const hostile = new SkillRegistryClientError("REGISTRY_UNAVAILABLE");
    const secret = `${CONTROL_KEY} ${INTERNAL_URL} private-response-body`;
    Object.defineProperties(hostile, {
      cause: { value: new Error(secret), enumerable: true },
      body: { value: secret, enumerable: true },
      url: { value: INTERNAL_URL, enumerable: true },
      key: { value: CONTROL_KEY, enumerable: true },
      extra: { value: "private-extra", enumerable: true },
      stack: { value: secret, configurable: true, writable: true },
    });
    const client = createSkillRegistryClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(hostile),
      clock: () => NOW,
      nonceFactory: () => NONCE,
    });

    let caught: unknown;
    try {
      await client.listSkills({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 50,
        offset: 0,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SkillRegistryClientError);
    expect(caught).not.toBe(hostile);
    expect(Object.getPrototypeOf(caught)).toBe(
      SkillRegistryClientError.prototype,
    );
    expect(caught).toMatchObject({ code: "REGISTRY_UNAVAILABLE" });
    expect(Object.keys(caught as object)).toEqual(["code"]);
    expect((caught as Error).cause).toBeUndefined();
    expect(
      `${String(caught)} ${JSON.stringify(caught)} ${(caught as Error).stack}`,
    ).not.toMatch(/private|skill-registry-control|http:\/\/skill-registry/iu);
  });

  it("brands trusted errors before reading code and never touches Proxy traps", async () => {
    const codeGetter = vi.fn(() => "REGISTRY_UNAVAILABLE");
    const accessor = new SkillRegistryClientError("transport_error");
    Object.defineProperty(accessor, "code", {
      get: codeGetter,
      enumerable: true,
      configurable: true,
    });
    const invalid = new SkillRegistryClientError(
      "PRIVATE_INVALID_CODE" as "transport_error",
    );
    const traps = {
      get: vi.fn(),
      getPrototypeOf: vi.fn(),
      getOwnPropertyDescriptor: vi.fn(),
      has: vi.fn(),
      ownKeys: vi.fn(),
    };
    const proxyTarget = new SkillRegistryClientError("timeout");
    const proxied = new Proxy(proxyTarget, {
      get(target, key, receiver) {
        traps.get();
        return Reflect.get(target, key, receiver);
      },
      getPrototypeOf(target) {
        traps.getPrototypeOf();
        return Reflect.getPrototypeOf(target);
      },
      getOwnPropertyDescriptor(target, key) {
        traps.getOwnPropertyDescriptor();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      has(target, key) {
        traps.has();
        return Reflect.has(target, key);
      },
      ownKeys(target) {
        traps.ownKeys();
        return Reflect.ownKeys(target);
      },
    });
    const fake = { code: "timeout", cause: `${CONTROL_KEY} private fake` };

    for (const [error, code] of [
      [accessor, "transport_error"],
      [invalid, "transport_error"],
      [proxied, "transport_error"],
      [fake, "transport_error"],
    ] as const) {
      const client = createSkillRegistryClient({
        settings: settings(),
        fetcher: (() => {
          throw error;
        }) as typeof fetch,
        clock: () => NOW,
        nonceFactory: () => NONCE,
      });
      let caught: unknown;
      try {
        await client.listSkills({
          actor: ACTOR,
          requestId: REQUEST_ID,
          limit: 50,
          offset: 0,
        });
      } catch (caughtError) {
        caught = caughtError;
      }
      expect(Object.is(caught, error)).toBe(false);
      expect(caught).toMatchObject({ code });
      expect(Object.keys(caught as object)).toEqual(["code"]);
      expect((caught as Error).cause).toBeUndefined();
    }
    expect(codeGetter).not.toHaveBeenCalled();
    expect(
      Object.fromEntries(
        Object.entries(traps).map(([name, trap]) => [
          name,
          trap.mock.calls.length,
        ]),
      ),
    ).toEqual({
      get: 0,
      getPrototypeOf: 0,
      getOwnPropertyDescriptor: 0,
      has: 0,
      ownKeys: 0,
    });
  });

  it.each(["clock", "nonce"] as const)(
    "clean-room sanitizes a same-class error thrown by the %s seam",
    (seam) => {
      const hostile = new SkillRegistryClientError("timeout");
      Object.assign(hostile, {
        cause: new Error(`${CONTROL_KEY} private cause`),
        body: "private body",
      });
      const signer = createSkillRegistryAssertionSigner({
        controlKey: CONTROL_KEY,
        clock: () => {
          if (seam === "clock") throw hostile;
          return NOW;
        },
        nonceFactory: () => {
          if (seam === "nonce") throw hostile;
          return NONCE;
        },
      });

      let caught: unknown;
      try {
        signer.sign({
          action: "list",
          actor: ACTOR,
          permission: "admin:assistant:skills",
          requestId: REQUEST_ID,
          target: "skills",
          assurance: "session",
          assuredAt: null,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).not.toBe(hostile);
      expect(caught).toMatchObject({ code: "timeout" });
      expect(Object.keys(caught as object)).toEqual(["code"]);
      expect((caught as Error).cause).toBeUndefined();
      expect(
        `${JSON.stringify(caught)} ${(caught as Error).stack}`,
      ).not.toMatch(/private|skill-registry-control/iu);
    },
  );
});

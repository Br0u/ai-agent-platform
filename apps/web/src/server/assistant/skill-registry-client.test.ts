import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SkillRegistryClientError,
  createSkillRegistryAssertionSigner,
  createSkillRegistryClient,
  resolveSkillRegistrySettings,
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
  it("calls list/detail/file/upload/review with exact signed route context", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(listResponse()))
      .mockResolvedValueOnce(jsonResponse(detailResponse()))
      .mockResolvedValueOnce(
        jsonResponse({
          version: "1",
          path: "references/安全 note.md",
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
        path: "references/安全 note.md",
      }),
    ).resolves.toEqual({
      version: "1",
      path: "references/安全 note.md",
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
      `${INTERNAL_URL}/internal/skills?limit=50&offset=0`,
      `${INTERNAL_URL}/internal/skills/${SKILL_ID}/revisions/${REVISION_ID}`,
      `${INTERNAL_URL}/internal/skills/${SKILL_ID}/revisions/${REVISION_ID}/files/references/%E5%AE%89%E5%85%A8%20note.md`,
      `${INTERNAL_URL}/internal/skills/uploads?targetSkillId=${SKILL_ID}`,
      `${INTERNAL_URL}/internal/skills/${SKILL_ID}/revisions/${REVISION_ID}/review`,
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
        `${SKILL_ID}/${REVISION_ID}/references/安全 note.md`,
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

    const stream = new ReadableStream<Uint8Array>({ start() {} });
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

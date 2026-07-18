import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ADMIN_MODEL_PROVIDERS,
  isAdminModelConfigRevisionInput,
  isAdminModelConfigSaveInput,
  isAdminModelConfigSnapshot,
  type AdminModelConfigRevisionInput,
  type AdminModelConfigSaveInput,
  type AdminModelProvider,
} from "./admin-model-config-contract";

const PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "dashscope",
  "deepseek",
  "minimax",
] as const;

function snapshot() {
  const names: Record<(typeof PROVIDERS)[number], string> = {
    openai: "OpenAI",
    anthropic: "Claude",
    google: "Gemini",
    dashscope: "Qwen / DashScope",
    deepseek: "DeepSeek",
    minimax: "MiniMax",
  };
  return {
    version: "1",
    configs: PROVIDERS.map((provider, index) => ({
      provider,
      displayName: names[provider],
      modelId: index === 0 ? "gpt-5-mini" : null,
      endpointId: index === 0 ? "openai-official" : null,
      revision: index === 0 ? 3 : null,
      testStatus: index === 0 ? "passed" : "not_configured",
      lastTestedAt: index === 0 ? "2026-07-18T01:02:03.000Z" : null,
      apiKey: index === 0 ? { configured: true, lastFour: "cdef" } : null,
      activeRevision: index === 0 ? 3 : null,
    })),
    endpoints: {
      openai: [{ id: "openai-official", label: "OpenAI official" }],
      anthropic: [{ id: "anthropic-official", label: "Anthropic official" }],
      google: [{ id: "google-official", label: "Google Gemini official" }],
      dashscope: [{ id: "dashscope-official", label: "DashScope official" }],
      deepseek: [{ id: "deepseek-official", label: "DeepSeek official" }],
      minimax: [{ id: "minimax-official", label: "MiniMax official" }],
    },
    runtime: {
      capability: "available",
      source: "dynamic",
      provider: "openai",
      modelId: "gpt-5-mini",
      configRevision: 3,
      activationVersion: 8,
    },
    canConfigure: true,
    canReveal: true,
    controlEnabled: true,
  };
}

type SnapshotFixture = ReturnType<typeof snapshot>;

function setExtra(target: object, key: string, value: unknown): void {
  Reflect.set(target, key, value);
}

const invalidSnapshotMutations: Array<
  [string, (value: SnapshotFixture) => void]
> = [
  ["top-level extra", (value) => setExtra(value, "apiKeyCiphertext", "sealed")],
  ["config extra", (value) => setExtra(value.configs[0]!, "nonce", "private")],
  ["Key-like field", (value) => setExtra(value.configs[0]!, "key", "private")],
  [
    "endpoint extra",
    (value) => setExtra(value.endpoints.openai[0]!, "url", "x"),
  ],
  [
    "runtime extra",
    (value) => setExtra(value.runtime, "providerError", "private"),
  ],
  [
    "arbitrary Provider",
    (value) => setExtra(value.configs[0]!, "provider", "local"),
  ],
  ["wrong order", (value) => void value.configs.reverse()],
  [
    "wrong display name",
    (value) => {
      value.configs[0]!.displayName = "Compatible API";
    },
  ],
  [
    "URL endpoint ID",
    (value) => {
      value.endpoints.openai[0]!.id = "https://private.example/v1";
    },
  ],
  [
    "embedded URL",
    (value) => {
      value.configs[0]!.modelId = "model https://private.example/v1";
    },
  ],
  [
    "non-Agent endpoint ID grammar",
    (value) => {
      value.endpoints.openai[0]!.id = "OpenAI_Official";
    },
  ],
  [
    "URL endpoint label",
    (value) => {
      value.endpoints.openai[0]!.label = "https://private.example";
    },
  ],
  [
    "non-canonical timestamp",
    (value) => {
      value.configs[0]!.lastTestedAt = "2026-07-18T01:02:03+00:00";
    },
  ],
  [
    "invalid timestamp",
    (value) => {
      value.configs[0]!.lastTestedAt = "not-a-date";
    },
  ],
  [
    "duplicate endpoint",
    (value) => {
      value.endpoints.openai.push({ ...value.endpoints.anthropic[0]! });
    },
  ],
];

describe("admin model configuration metadata contract", () => {
  it("exports exactly the six supported Providers in display order", () => {
    expect(ADMIN_MODEL_PROVIDERS).toEqual(PROVIDERS);
    expectTypeOf<AdminModelProvider>().toEqualTypeOf<
      (typeof PROVIDERS)[number]
    >();
  });

  it("accepts one exact metadata-only snapshot with Provider-scoped endpoints", () => {
    const value = snapshot();

    expect(isAdminModelConfigSnapshot(value)).toBe(true);
    expect(
      (value.configs as Array<{ provider: string }>).map(
        ({ provider }) => provider,
      ),
    ).toEqual(PROVIDERS);
    expect(JSON.stringify(value)).not.toMatch(
      /https?:\/\/|ciphertext|nonce|single-use-secret-key/iu,
    );
  });

  it.each(invalidSnapshotMutations)("rejects %s", (_name, mutate) => {
    const value = snapshot();
    mutate(value);
    expect(isAdminModelConfigSnapshot(value)).toBe(false);
  });

  it("requires nullable fields to agree with not_configured status", () => {
    const value = snapshot();
    value.configs[1].modelId = "claude-sonnet";

    expect(isAdminModelConfigSnapshot(value)).toBe(false);
  });

  it("requires the sole dynamic activeRevision to match runtime truth", () => {
    const stale = snapshot();
    stale.configs[0].activeRevision = 2;
    expect(isAdminModelConfigSnapshot(stale)).toBe(false);

    const duplicate = snapshot();
    duplicate.configs[1].activeRevision = 3;
    expect(isAdminModelConfigSnapshot(duplicate)).toBe(false);

    const missing = snapshot();
    missing.configs[0].activeRevision = null;
    expect(isAdminModelConfigSnapshot(missing)).toBe(false);

    const future = snapshot();
    future.configs[0].revision = 2;
    expect(isAdminModelConfigSnapshot(future)).toBe(false);
  });
});

describe("admin model configuration mutation inputs", () => {
  it("keeps save secret input separate from metadata and Provider routing", () => {
    const input = {
      modelId: "gpt-5-mini",
      endpointId: "openai-official",
      apiKey: "new-secret-key",
      expectedRevision: 3,
    } satisfies AdminModelConfigSaveInput;

    expect(isAdminModelConfigSaveInput(input)).toBe(true);
    expect(Object.keys(input).sort()).toEqual([
      "apiKey",
      "endpointId",
      "expectedRevision",
      "modelId",
    ]);
    expectTypeOf<AdminModelConfigSaveInput>().not.toHaveProperty("provider");
  });

  it("accepts exact revision-only test/reveal input", () => {
    const input = { revision: 3 } satisfies AdminModelConfigRevisionInput;

    expect(isAdminModelConfigRevisionInput(input)).toBe(true);
    expectTypeOf<AdminModelConfigRevisionInput>().not.toHaveProperty(
      "provider",
    );
  });

  it.each([
    {
      modelId: "gpt-5-mini",
      endpointId: "https://evil.test",
      expectedRevision: 0,
    },
    {
      modelId: "https://evil.test/model",
      endpointId: "openai-official",
      expectedRevision: 0,
    },
    {
      modelId: "gpt-5-mini",
      endpointId: "openai-official",
      expectedRevision: 0,
      provider: "openai",
    },
    {
      modelId: "gpt-5-mini",
      endpointId: "openai-official",
      expectedRevision: 0,
      apiKey: "has whitespace",
    },
    {
      modelId: "gpt-5-mini",
      endpointId: "openai-official",
      expectedRevision: -1,
    },
  ])("rejects an unsafe save input %#", (input) => {
    expect(isAdminModelConfigSaveInput(input)).toBe(false);
  });

  it.each([
    { revision: 0 },
    { revision: 1, provider: "openai" },
    { revision: 1, key: "private" },
    { revision: 1.5 },
  ])("rejects an unsafe revision input %#", (input) => {
    expect(isAdminModelConfigRevisionInput(input)).toBe(false);
  });
});

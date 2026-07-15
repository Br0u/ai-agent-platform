import { afterEach, describe, expect, it, vi } from "vitest";

const RUNTIME_SETTINGS_KEY =
  "ai-agent-platform:assistant:anonymous-session-settings:v1";
const VALID_SECRET = "0123456789abcdef0123456789abcdef";

function clearRuntimeSettings(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for(RUNTIME_SETTINGS_KEY)
  ];
}

async function loadConfig() {
  vi.resetModules();
  return import("./anonymous-session-config");
}

afterEach(() => {
  clearRuntimeSettings();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("assistant runtime session settings cache", () => {
  it("reuses the first validated object across separately loaded bundles", async () => {
    vi.stubEnv("ASSISTANT_PUBLIC_ORIGIN", "https://portal.example.com");
    vi.stubEnv("ASSISTANT_SESSION_SECRET", VALID_SECRET);
    const firstModule = await loadConfig();
    const first = firstModule.validateAnonymousSessionRuntimeConfig();

    vi.stubEnv("ASSISTANT_PUBLIC_ORIGIN", "http://unsafe.example.com");
    vi.stubEnv("ASSISTANT_SESSION_SECRET", "short");
    const secondModule = await loadConfig();
    const second = secondModule.validateAnonymousSessionRuntimeConfig();

    expect(second).toBe(first);
    expect(second.publicOrigin).toBe("https://portal.example.com");
  });

  it("can isolate tests by explicitly deleting the global cache symbol", async () => {
    vi.stubEnv("ASSISTANT_PUBLIC_ORIGIN", "https://first.example.com");
    vi.stubEnv("ASSISTANT_SESSION_SECRET", VALID_SECRET);
    const firstModule = await loadConfig();
    const first = firstModule.validateAnonymousSessionRuntimeConfig();

    clearRuntimeSettings();
    vi.stubEnv("ASSISTANT_PUBLIC_ORIGIN", "https://second.example.com");
    const secondModule = await loadConfig();
    const second = secondModule.validateAnonymousSessionRuntimeConfig();

    expect(second).not.toBe(first);
    expect(second.publicOrigin).toBe("https://second.example.com");
  });
});

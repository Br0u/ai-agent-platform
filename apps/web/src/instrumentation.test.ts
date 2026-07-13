import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const VALID_ORIGIN = "https://portal.example.com";
const VALID_SECRET = "0123456789abcdef0123456789abcdef";

function runtimeEnvironment(options?: {
  origin?: string;
  secret?: string;
  runtime?: string;
  phase?: string;
}) {
  vi.stubEnv("NEXT_RUNTIME", options?.runtime ?? "nodejs");
  vi.stubEnv("NEXT_PHASE", options?.phase);
  vi.stubEnv(
    "ASSISTANT_PUBLIC_ORIGIN",
    options && "origin" in options ? options.origin : VALID_ORIGIN,
  );
  vi.stubEnv(
    "ASSISTANT_SESSION_SECRET",
    options && "secret" in options ? options.secret : VALID_SECRET,
  );
}

async function loadRegister() {
  vi.resetModules();
  return (await import("./instrumentation")).register;
}

afterEach(() => {
  vi.doUnmock("@/server/assistant/anonymous-session-config");
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Next server startup instrumentation", () => {
  it.each([
    ["non-loopback HTTP origin", "http://portal.example.com", VALID_SECRET],
    ["missing origin", undefined, VALID_SECRET],
    ["missing secret", VALID_ORIGIN, undefined],
    ["short secret", VALID_ORIGIN, "too-short"],
  ])("fails Node server startup for %s", async (_name, origin, secret) => {
    runtimeEnvironment({ origin, secret });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const register = await loadRegister();

    await expect(register()).rejects.toThrow("process.exit(1)");
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/ASSISTANT_/u),
    );
  });

  it("validates a valid Node runtime once and reuses the cached settings", async () => {
    runtimeEnvironment();
    const register = await loadRegister();
    await expect(register()).resolves.toBeUndefined();

    vi.stubEnv("ASSISTANT_PUBLIC_ORIGIN", "http://portal.example.com");
    vi.stubEnv("ASSISTANT_SESSION_SECRET", "short");
    await expect(register()).resolves.toBeUndefined();

    const { validateAnonymousSessionRuntimeConfig } = await import(
      "@/server/assistant/anonymous-session-config"
    );
    expect(() => validateAnonymousSessionRuntimeConfig()).not.toThrow();
  });

  it.each([
    ["Edge runtime", { runtime: "edge" }],
    [
      "production build",
      { runtime: "nodejs", phase: "phase-production-build" },
    ],
  ])(
    "does not load Node crypto or read runtime secrets during %s",
    async (_name, env) => {
      runtimeEnvironment({ ...env, origin: undefined, secret: undefined });
      vi.doMock("@/server/assistant/anonymous-session-config", () => {
        throw new Error("Node-only assistant session module was loaded");
      });
      const register = await loadRegister();

      await expect(register()).resolves.toBeUndefined();
    },
  );

  it("keeps the universal hook free of a static Node-only import", () => {
    const source = readFileSync("src/instrumentation.ts", "utf8");
    expect(source).not.toMatch(
      /^import .*server\/assistant\/anonymous-session-config/mu,
    );
    expect(source).toMatch(
      /await\s+import\(\s*["']@\/server\/assistant\/anonymous-session-config["']\s*\)/u,
    );

    const leaf = readFileSync(
      "src/server/assistant/anonymous-session-config.ts",
      "utf8",
    );
    expect(leaf).not.toMatch(
      /assistant-actor|server\/auth|@ai-agent-platform\/database|node:(?:fs|crypto)|from\s+["']pg["']/u,
    );
  });
});

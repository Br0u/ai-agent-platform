import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { register } from "./instrumentation";

describe("Next server startup instrumentation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("has no assistant session startup configuration", async () => {
    await expect(register()).resolves.toBeUndefined();
    const source = readFileSync("src/instrumentation.ts", "utf8");
    expect(source).not.toContain(["ASSISTANT", "SESSION", "SECRET"].join("_"));
    expect(source).not.toContain(["anonymous", "session"].join("-"));
  });

  it("fails closed when production Node startup has no public origin", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ASSISTANT_PUBLIC_ORIGIN", "");

    await expect(register()).rejects.toThrow(
      "ASSISTANT_PUBLIC_ORIGIN is required in production",
    );
  });

  it("accepts an exact production HTTPS origin", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ASSISTANT_PUBLIC_ORIGIN", "https://portal.example.com");

    await expect(register()).resolves.toBeUndefined();
  });
});

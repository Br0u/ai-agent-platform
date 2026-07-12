import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Next production build contract", () => {
  it("keeps the native Argon2 binding outside the Webpack bundle", () => {
    const source = readFileSync("next.config.ts", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.dependencies?.["@node-rs/argon2"]).toBe("2.0.2");
    expect(packageJson.scripts?.dev).toBe("next dev --webpack");
    expect(packageJson.scripts?.build).toBe("next build --webpack");
    expect(source).toContain('"@node-rs/argon2"');
    expect(source).toContain('config.externals.push("@node-rs/argon2")');
    expect(source).toContain("outputFileTracingIncludes");
    expect(source).toContain("@node-rs+argon2-*");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Next production build contract", () => {
  it("keeps development output out of File Provider sync", () => {
    const source = readFileSync("next.config.ts", "utf8");
    const rootGitignore = readFileSync("../../.gitignore", "utf8");
    const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8")) as {
      include?: string[];
    };

    expect(source).toContain(
      'process.env.NODE_ENV === "development" ? ".next.nosync" : ".next"',
    );
    expect(source).toContain("distDir,");
    expect(rootGitignore).toContain(".next.nosync/");
    expect(tsconfig.include).toEqual(
      expect.arrayContaining([
        ".next.nosync/types/**/*.ts",
        ".next.nosync/dev/types/**/*.ts",
      ]),
    );
  });

  it("keeps the native Argon2 binding outside the Webpack bundle", () => {
    const source = readFileSync("next.config.ts", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.dependencies?.["@node-rs/argon2"]).toBe("2.0.2");
    expect(packageJson.scripts?.dev).toBe("node scripts/run-dev.mjs");
    expect(packageJson.scripts?.build).toBe("next build --webpack");
    expect(source).toContain('"@node-rs/argon2"');
    expect(source).toContain('config.externals.push("@node-rs/argon2")');
    expect(source).toContain("outputFileTracingIncludes");
    expect(source).toContain("@node-rs+argon2-*");
  });
});

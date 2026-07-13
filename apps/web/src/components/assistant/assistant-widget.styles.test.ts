import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  `${process.cwd()}/src/components/assistant/assistant-widget.css`,
  "utf8",
);

describe("assistant widget CSS", () => {
  it("uses the approved desktop and mobile constraints without horizontal overflow", () => {
    expect(css).toContain("min(360px, calc(100vw - 32px))");
    expect(css).toContain("min(480px, calc(100dvh - 96px))");
    expect(css).toMatch(/@media\s*\([^)]*max-width[^)]*\)/u);
    expect(css).toContain("max-height: 75dvh");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("overflow-x: hidden");
  });

  it("disables launcher animation for reduced motion", () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.assistant-launcher[\s\S]*?animation:\s*none/u,
    );
  });
});

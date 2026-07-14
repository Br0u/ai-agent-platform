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

  it("uses asymmetric, transform-only drawer motion within the approved travel", () => {
    expect(css).toMatch(
      /\.assistant-panel\[data-motion-state="entering"\][\s\S]*?translateY\(8px\)\s+scale\(0\.96\)/u,
    );
    expect(css).toMatch(
      /\.assistant-panel\[data-motion-state="open"\][\s\S]*?transition:[^;]*transform 220ms cubic-bezier\(0\.23, 1, 0\.32, 1\)[^;]*opacity 220ms cubic-bezier\(0\.23, 1, 0\.32, 1\)/u,
    );
    expect(css).toMatch(
      /\.assistant-panel\[data-motion-state="closing"\][\s\S]*?transition:[^;]*transform 150ms cubic-bezier\(0\.23, 1, 0\.32, 1\)[^;]*opacity 150ms cubic-bezier\(0\.23, 1, 0\.32, 1\)/u,
    );
    expect(css).not.toMatch(/transition:\s*all/u);
  });

  it("gives new messages subtle motion and removes all assistant motion when reduced", () => {
    expect(css).toMatch(
      /@keyframes assistant-message-enter[\s\S]*?translateY\(6px\)[\s\S]*?translateY\(0\)/u,
    );
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.assistant-panel\[data-motion-state\][\s\S]*?transform:\s*none[\s\S]*?transition:\s*none[\s\S]*?\.assistant-message[\s\S]*?animation:\s*none/u,
    );
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheetPath = "src/components/auth/login-page.css";

function ruleBlock(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u"),
  );

  expect(match, `missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("enterprise login page CSS contract", () => {
  it("keeps the login layout responsive, accessible, and locally scoped", () => {
    const css = readFileSync(stylesheetPath, "utf8");

    expect(css).toContain(".enterprise-login-page");
    expect(ruleBlock(css, ".enterprise-login-page")).toMatch(
      /grid-template-columns:\s*minmax\(300px, 0\.8fr\)\s+minmax\(420px, 1\.2fr\)/u,
    );
    expect(ruleBlock(css, ".enterprise-login-page .auth-form__submit")).toMatch(
      /min-height:\s*48px/u,
    );
    expect(css).toContain("@media (max-width: 860px)");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(ruleBlock(css, ".enterprise-login-page__brand-link")).toMatch(
      /min-height:\s*44px/u,
    );
    expect(css).not.toContain("::first-letter");
    expect(
      ruleBlock(css, ".enterprise-login-page__brand-link::before"),
    ).toMatch(/content:\s*"AI"/u);
    expect(ruleBlock(css, ".enterprise-login-page__alternate-link")).toMatch(
      /min-height:\s*44px/u,
    );
    expect(css).not.toMatch(/^\.auth-form(?:__|\s|\{)/mu);
  });
});

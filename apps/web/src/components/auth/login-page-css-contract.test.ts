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

function atRuleBlock(css: string, header: string) {
  const headerIndex = css.indexOf(header);

  if (headerIndex === -1) {
    throw new Error(`missing CSS at-rule for ${header}`);
  }

  const openingBrace = css.indexOf("{", headerIndex);
  let depth = 0;

  for (let index = openingBrace; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      return css.slice(openingBrace + 1, index);
    }
  }

  throw new Error(`unterminated CSS at-rule for ${header}`);
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
    const linkFocusRule = css.match(
      /\.enterprise-login-page__brand-link:focus-visible,\s*\.enterprise-login-page__alternate-link:focus-visible,\s*\.enterprise-login-page \.auth-form__secondary a:focus-visible\s*\{([^}]*)\}/u,
    );
    expect(linkFocusRule).not.toBeNull();
    expect(linkFocusRule?.[1]).toMatch(
      /outline:\s*3px solid var\(--color-primary\)/u,
    );
    expect(
      ruleBlock(
        css,
        ".enterprise-login-page .auth-form__field input:focus-visible",
      ),
    ).toMatch(/outline:\s*3px solid var\(--color-primary\)/u);
    expect(
      ruleBlock(css, ".enterprise-login-page .auth-form__submit:focus-visible"),
    ).toMatch(/outline:\s*3px solid var\(--color-primary\)/u);
    const smallLabelRule = css.match(
      /\.enterprise-login-page__qr-placeholder small,\s*\.enterprise-login-page__method small\s*\{([^}]*)\}/u,
    );
    expect(smallLabelRule).not.toBeNull();
    expect(smallLabelRule?.[1]).toMatch(/color:\s*var\(--color-muted\)/u);
    const smallLabelSize = smallLabelRule?.[1].match(/font-size:\s*(\d+)px/u);
    expect(Number(smallLabelSize?.[1])).toBeGreaterThanOrEqual(11);

    const tabletCss = atRuleBlock(css, "@media (max-width: 860px)");
    expect(ruleBlock(tabletCss, ".enterprise-login-page")).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\)/u,
    );
    const tabletHiddenRule = Array.from(
      tabletCss.matchAll(/([^{}]+)\{([^{}]*)\}/gu),
    ).find(([, , declarations]) => /display:\s*none/u.test(declarations));
    expect(tabletHiddenRule).toBeDefined();
    for (const selector of [
      ".enterprise-login-page__qr-placeholder",
      ".enterprise-login-page__providers",
      ".enterprise-login-page__security",
    ]) {
      expect(tabletHiddenRule?.[1]).toContain(selector);
    }

    const mobileCss = atRuleBlock(css, "@media (max-width: 560px)");
    expect(ruleBlock(mobileCss, ".enterprise-login-page__method")).toMatch(
      /white-space:\s*normal/u,
    );
    const mobileSmallLabelRule = ruleBlock(
      mobileCss,
      ".enterprise-login-page__method small",
    );
    const mobileSmallLabelSize =
      mobileSmallLabelRule.match(/font-size:\s*(\d+)px/u);
    expect(Number(mobileSmallLabelSize?.[1])).toBeGreaterThanOrEqual(11);
    expect(ruleBlock(css, ".enterprise-login-page__alternate-link")).toMatch(
      /min-height:\s*44px/u,
    );
    expect(css).not.toMatch(/(?:^|[{},])\s*\.auth-form(?:__|\s|\{)/mu);
  });
});

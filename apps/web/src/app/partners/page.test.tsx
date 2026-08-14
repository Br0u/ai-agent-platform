import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PartnersPage, { metadata } from "./page";

describe("PartnersPage", () => {
  it("keeps partner-specific metadata independent from the shared route registry", () => {
    expect(metadata).toEqual({
      title: "合作伙伴 · 华鲲元启",
      description:
        "面向渠道、交付与技术伙伴，提供多元合作模式、清晰分润政策与全链路赋能支持，共同开拓企业 AI 市场。",
    });

    render(<PartnersPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "共建企业 AI 生态，共享增长机遇",
      }),
    ).toBeVisible();
  });

  it("uses the product shell dimensions, logo and filing-only footer", () => {
    const css = readFileSync("src/app/partners/partners.css", "utf8");
    const appShellCss = readFileSync(
      "../../packages/ui/src/app-shell.css",
      "utf8",
    );

    expect(css).toMatch(
      /\.partner-shell\s*\{[^}]*grid-template-columns:\s*240px minmax\(0, 1fr\)/su,
    );
    expect(css).toMatch(
      /\.partner-directory\s*\{[^}]*top:\s*64px[^}]*width:\s*240px[^}]*height:\s*calc\(100vh - 64px\)/su,
    );
    expect(appShellCss).toContain(".site-wordmark");
    expect(appShellCss).toContain(
      'background: url("/logo.png") center / contain no-repeat',
    );
    expect(css).toContain(".app-shell:has(.partner-page) .portal-footer__main");
    expect(css).toMatch(/@media \(max-width:\s*900px\)/u);
    expect(css).not.toContain(".partner-return-bar");
  });

  it("keeps the premium visual treatment scoped to partners", () => {
    const css = readFileSync("src/app/partners/partners.css", "utf8");

    expect(css).toContain('url("/assets/partners/ecosystem-lattice.png")');
    expect(css).toMatch(
      /\.partner-visual\s*\{[^}]*backdrop-filter:\s*blur\(/su,
    );
    expect(css).toMatch(/\.partner-card\s*\{[^}]*box-shadow:\s*[^;}]+/su);
    expect(css).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*\.partner-card--button:hover/u,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.partner-card[^}]*transition:\s*none/su,
    );
    expect(css).not.toContain(".floating-assistant");
  });
});

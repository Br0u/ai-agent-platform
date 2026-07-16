import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { homeCopy } from "../components/home-content";
import HomePage from "./page";

const headingText = (heading: {
  before: string;
  emphasis: string;
  after: string;
}) => `${heading.before}${heading.emphasis}${heading.after}`;

afterEach(cleanup);

describe("HomePage", () => {
  it("renders the approved six-region homepage hierarchy", () => {
    render(<HomePage />);

    const home = screen.getByRole("main", { name: "华鲲元启门户首页" });
    const atmosphere = home.querySelector(".home-atmosphere");
    const regions = Array.from(
      home.querySelectorAll(":scope > [data-home-region]"),
      (region) => region.getAttribute("data-home-region"),
    );

    expect(atmosphere).toHaveAttribute("aria-hidden", "true");
    expect(atmosphere?.children).toHaveLength(3);
    expect(regions).toStrictEqual([
      "hero",
      "platform",
      "enterprise",
      "solutions",
      "resources",
      "closing",
    ]);
  });

  it("marks only the four post-hero content regions for scroll reveal", () => {
    render(<HomePage />);

    const home = screen.getByRole("main", { name: "华鲲元启门户首页" });
    const revealRegions = Array.from(
      home.querySelectorAll(':scope > [data-home-reveal="true"]'),
    );

    expect(
      revealRegions.map((region) => region.getAttribute("data-home-region")),
    ).toStrictEqual(["platform", "enterprise", "solutions", "resources"]);

    for (const regionName of ["hero", "closing"]) {
      const region = home.querySelector(`[data-home-region="${regionName}"]`);

      expect(region).not.toHaveAttribute("data-home-reveal");
      expect(region?.querySelectorAll("[data-home-reveal-item]")).toHaveLength(
        0,
      );
    }

    const expectedMarkerCounts = {
      platform: { text: 3, block: 10 },
      enterprise: { text: 2, block: 4 },
      solutions: { text: 3, block: 6 },
      resources: { text: 3, block: 5 },
    } as const;

    for (const [regionName, counts] of Object.entries(expectedMarkerCounts)) {
      const region = home.querySelector(`[data-home-region="${regionName}"]`);

      expect(
        region?.querySelectorAll('[data-home-reveal-item="text"]'),
      ).toHaveLength(counts.text);
      expect(
        region?.querySelectorAll('[data-home-reveal-item="block"]'),
      ).toHaveLength(counts.block);
    }
  });

  it("keeps the hero copy open and the product screenshot in a glass evidence panel", () => {
    render(<HomePage />);

    const hero = screen.getByRole("region", {
      name: headingText(homeCopy.hero.heading),
    });
    const heroCopy = hero.querySelector(".home-hero__copy");
    const evidence = hero.querySelector(".home-evidence");

    expect(heroCopy).toBeInTheDocument();
    expect(heroCopy).not.toHaveClass("home-glass-panel");
    expect(evidence).toHaveClass("home-glass-panel");
    expect(heroCopy?.nextElementSibling).toBe(evidence);
    expect(screen.getByText(homeCopy.hero.technicalLine)).toBeVisible();
    expect(screen.getByText(homeCopy.hero.productName)).toBeVisible();
    expect(screen.getByText(homeCopy.hero.summary)).toBeVisible();
    expect(screen.getByText(homeCopy.hero.evidenceLabel)).toBeVisible();
    expect(screen.getAllByText(homeCopy.hero.evidenceProduct)).toHaveLength(2);
    expect(screen.getByText(homeCopy.hero.evidenceCaption)).toBeVisible();
    expect(
      screen.getByRole("img", { name: "华鲲元启应用广场界面" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("img", { name: "华鲲元启" }),
    ).not.toBeInTheDocument();
  });

  it("renders the reference card and row counts with all fixed section copy", () => {
    render(<HomePage />);

    const home = screen.getByRole("main", { name: "华鲲元启门户首页" });

    expect(home.querySelectorAll(".home-capability-card")).toHaveLength(4);
    expect(home.querySelectorAll(".home-platform-row")).toHaveLength(4);
    expect(home.querySelectorAll(".home-enterprise-row")).toHaveLength(4);
    expect(home.querySelectorAll(".home-solution-row")).toHaveLength(5);
    expect(home.querySelectorAll(".home-resource")).toHaveLength(4);
    expect(screen.getByText("安全合规 · 数据可控")).toBeVisible();
    expect(screen.getByText("基于华鲲元启的行业子能力")).toBeVisible();
    expect(screen.getByText(homeCopy.resources.kicker)).toBeVisible();

    for (const name of [
      headingText(homeCopy.hero.heading),
      headingText(homeCopy.platform.heading),
      homeCopy.enterprise.heading,
      headingText(homeCopy.solutions.heading),
      headingText(homeCopy.resources.heading),
    ]) {
      expect(screen.getByRole("heading", { name })).toBeVisible();
    }

    for (const copy of [
      homeCopy.platform.intro,
      homeCopy.solutions.intro,
      homeCopy.resources.intro,
    ]) {
      expect(screen.getByText(copy)).toBeVisible();
    }
  });

  it("keeps only calls to action and resources interactive", () => {
    render(<HomePage />);

    const learnLinks = screen.getAllByRole("link", {
      name: homeCopy.hero.primaryCta.label,
    });
    const docsLinks = screen.getAllByRole("link", {
      name: homeCopy.hero.secondaryCta.label,
    });

    expect(learnLinks).toHaveLength(2);
    expect(docsLinks).toHaveLength(2);
    learnLinks.forEach((link) =>
      expect(link).toHaveAttribute("href", "/product"),
    );
    docsLinks.forEach((link) => expect(link).toHaveAttribute("href", "/docs"));
    expect(screen.getByRole("link", { name: /集成指南/ })).toHaveAttribute(
      "href",
      "/compatibility",
    );

    const platform = screen.getByRole("region", { name: "平台能力与开发流程" });
    expect(within(platform).queryAllByRole("link")).toHaveLength(2);
    const enterprise = document.querySelector(
      '[data-home-region="enterprise"]',
    );
    const solutions = document.querySelector('[data-home-region="solutions"]');
    expect(enterprise?.querySelectorAll("a, button")).toHaveLength(0);
    expect(solutions?.querySelectorAll("a, button")).toHaveLength(0);
  });

  it("marks exactly three generated illustrations as decorative", () => {
    render(<HomePage />);

    const decorations = document.querySelectorAll(
      'img[data-home-decoration="true"]',
    );

    expect(decorations).toHaveLength(3);
    decorations.forEach((image) => {
      expect(image).toHaveAttribute("alt", "");
      expect(image).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("does not expose the legacy placeholder brand", () => {
    render(<HomePage />);

    expect(screen.queryByText("AI Agent Platform")).not.toBeInTheDocument();
  });
});

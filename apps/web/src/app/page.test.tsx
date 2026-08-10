import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { homeContent } from "../components/home-content";
import HomePage from "./page";

afterEach(cleanup);

describe("HomePage", () => {
  it("renders the prototype four-region hierarchy", () => {
    render(<HomePage />);

    const home = screen.getByRole("main", { name: "华鲲元启门户首页" });
    const atmosphere = home.querySelector(".home-atmosphere");
    const regions = Array.from(
      home.querySelectorAll(":scope > [data-home-region]"),
      (region) => region.getAttribute("data-home-region"),
    );

    expect(atmosphere).toHaveAttribute("aria-hidden", "true");
    expect(atmosphere?.children).toHaveLength(3);
    expect(regions).toStrictEqual(["hero", "agents", "solutions", "contact"]);
    expect(home.querySelector('[data-home-region="platform"]')).toBeNull();
    expect(home.querySelector('[data-home-region="enterprise"]')).toBeNull();
    expect(home.querySelector('[data-home-region="resources"]')).toBeNull();
    expect(home.querySelector('[data-home-region="closing"]')).toBeNull();
  });

  it("reveals only the three post-hero regions", () => {
    render(<HomePage />);

    const home = screen.getByRole("main", { name: "华鲲元启门户首页" });
    const revealRegions = Array.from(
      home.querySelectorAll(':scope > [data-home-reveal="true"]'),
      (region) => region.getAttribute("data-home-region"),
    );

    expect(revealRegions).toStrictEqual(["agents", "solutions", "contact"]);
    expect(home.querySelector('[data-home-region="hero"]')).not.toHaveAttribute(
      "data-home-reveal",
    );
  });

  it("renders the hero copy, calls to action, and two featured products", () => {
    render(<HomePage />);

    const hero = screen.getByRole("region", { name: homeContent.hero.title });

    expect(within(hero).getByText(homeContent.hero.eyebrow)).toBeVisible();
    expect(
      within(hero).getByRole("heading", {
        level: 1,
        name: homeContent.hero.title,
      }),
    ).toBeVisible();
    expect(within(hero).getByText(homeContent.hero.lead)).toBeVisible();
    expect(hero.querySelectorAll(".home-value-tag")).toHaveLength(5);
    expect(hero.querySelectorAll(".home-featured-card")).toHaveLength(2);

    for (const action of homeContent.hero.actions) {
      expect(
        within(hero).getByRole("link", { name: action.label }),
      ).toHaveAttribute("href", action.href);
    }

    for (const product of homeContent.featuredProducts) {
      expect(
        within(hero).getByRole("heading", { name: product.title }),
      ).toBeVisible();
      expect(within(hero).getByText(product.description)).toBeVisible();
      expect(
        within(hero).getByRole("link", { name: product.cta }),
      ).toHaveAttribute("href", product.href);
    }
  });

  it("renders all five agent capabilities as direct links", () => {
    render(<HomePage />);

    const region = screen.getByRole("region", {
      name: homeContent.agents.title,
    });

    expect(within(region).getByText(homeContent.agents.eyebrow)).toBeVisible();
    expect(within(region).getByText(homeContent.agents.lead)).toBeVisible();
    expect(region.querySelectorAll(".home-agent-card")).toHaveLength(5);

    for (const item of homeContent.agents.items) {
      expect(
        within(region).getByRole("heading", { name: item.title }),
      ).toBeVisible();
      expect(within(region).getByText(item.description)).toBeVisible();
      expect(
        within(region).getByRole("link", { name: item.cta }),
      ).toHaveAttribute("href", item.href);
    }
  });

  it("renders all six solution cards and the catalog link", () => {
    render(<HomePage />);

    const region = screen.getByRole("region", {
      name: homeContent.solutions.title,
    });

    expect(
      within(region).getByText(homeContent.solutions.eyebrow),
    ).toBeVisible();
    expect(within(region).getByText(homeContent.solutions.lead)).toBeVisible();
    expect(region.querySelectorAll(".home-solution-card")).toHaveLength(6);

    for (const item of homeContent.solutions.items) {
      expect(
        within(region).getByRole("heading", { name: item.title }),
      ).toBeVisible();
      expect(within(region).getByText(item.description)).toBeVisible();
      expect(
        within(region).getByRole("link", { name: `${item.title}：查看方案` }),
      ).toHaveAttribute("href", item.href);
    }

    expect(
      within(region).getByRole("link", {
        name: homeContent.solutions.allLabel,
      }),
    ).toHaveAttribute("href", homeContent.solutions.allHref);
  });

  it("renders the exact contact placeholders and actions", () => {
    render(<HomePage />);

    const region = screen.getByRole("region", {
      name: homeContent.contact.title,
    });

    expect(within(region).getByText(homeContent.contact.address)).toBeVisible();
    expect(
      within(region).getByText(homeContent.contact.businessEmail),
    ).toBeVisible();
    expect(within(region).getByText(homeContent.contact.hotline)).toBeVisible();
    expect(
      within(region).getByText(homeContent.contact.serviceHours),
    ).toBeVisible();
    expect(within(region).getByText(homeContent.contact.note)).toBeVisible();

    for (const action of homeContent.contact.actions) {
      expect(
        within(region).getByRole("link", { name: action.label }),
      ).toHaveAttribute("href", action.href);
    }
  });

  it("does not duplicate the shell-owned assistant or legacy brand", () => {
    render(<HomePage />);

    expect(document.querySelector(".floating-assistant")).toBeNull();
    expect(screen.queryByText("AI Agent Platform")).not.toBeInTheDocument();
  });
});

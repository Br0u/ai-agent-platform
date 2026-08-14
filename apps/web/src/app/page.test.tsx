import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { homeContent } from "../components/home-content";
import HomePage from "./page";

afterEach(cleanup);

describe("HomePage", () => {
  it("renders only the four V2 homepage regions in order", () => {
    render(<HomePage />);

    const home = screen.getByRole("main", { name: "华鲲元启门户首页" });
    expect(
      Array.from(
        home.querySelectorAll(":scope > [data-home-region]"),
        (region) => region.getAttribute("data-home-region"),
      ),
    ).toStrictEqual(["hero", "centers", "solutions", "contact"]);
    expect(home.querySelector(".home-atmosphere")?.children).toHaveLength(3);
    expect(home.querySelector('[data-home-region="agents"]')).toBeNull();
  });

  it("renders the V2 deep-blue hero and ordered four-product cards", () => {
    render(<HomePage />);

    const hero = screen.getByRole("region", { name: homeContent.hero.title });
    expect(hero).toHaveAttribute("data-home-theme", "dual-track-light");
    expect(hero.querySelector(".home-eyebrow")).toBeNull();
    expect(hero.querySelector(".home-hero__title-accent")).toHaveTextContent(
      "AI",
    );
    expect(within(hero).getByText(homeContent.hero.lead)).toBeVisible();
    expect(hero.querySelectorAll(".home-featured-card")).toHaveLength(4);
    expect(
      Array.from(hero.querySelectorAll("[data-home-icon]"), (icon) =>
        icon.getAttribute("data-home-icon"),
      ),
    ).toStrictEqual(["platform", "code", "presentation", "cube"]);

    for (const action of homeContent.hero.actions) {
      expect(
        within(hero).getByRole("link", { name: action.label }),
      ).toHaveAttribute("href", action.href);
    }
    for (const product of homeContent.featuredProducts) {
      expect(
        within(hero).getByRole("heading", { level: 2, name: product.title }),
      ).toBeVisible();
      expect(within(hero).getByText(product.description)).toBeVisible();
      expect(
        within(hero).getByRole("link", { name: product.cta }),
      ).toHaveAttribute("href", product.href);
    }
  });

  it("renders two featured centers beside the ordered four-row list", () => {
    render(<HomePage />);

    const region = screen.getByRole("region", {
      name: homeContent.centers.title,
    });
    expect(region.querySelector(".home-eyebrow")).toBeNull();
    expect(region.querySelectorAll(".center-feature")).toHaveLength(2);
    expect(region.querySelectorAll(".center-row")).toHaveLength(4);
    expect(
      Array.from(
        region.querySelectorAll("h3"),
        (heading) => heading.textContent,
      ),
    ).toStrictEqual(homeContent.centers.items.map((item) => item.title));
    expect(region.querySelectorAll("[data-home-icon]")).toHaveLength(6);
  });

  it("renders the exact six-card V2 solution grid", () => {
    render(<HomePage />);

    const region = screen.getByRole("region", {
      name: homeContent.solutions.title,
    });
    expect(region.querySelector(".home-eyebrow")).toBeNull();
    expect(
      region.querySelector(".home-solutions__title-accent"),
    ).toHaveTextContent("AI");
    expect(region.querySelectorAll(".home-sol-card")).toHaveLength(6);
    expect(region.querySelectorAll(".home-solution-card__index")).toHaveLength(
      6,
    );
    expect(region.querySelectorAll("[data-home-icon]")).toHaveLength(6);

    for (const item of homeContent.solutions.items) {
      expect(
        within(region).getByRole("heading", { name: item.title }),
      ).toBeVisible();
      expect(within(region).getByText(item.description)).toBeVisible();
      expect(
        within(region).getByRole("link", { name: `${item.title}：查看方案` }),
      ).toHaveAttribute("href", item.href);
    }
  });

  it("renders contact information first and the CTA copy second", () => {
    render(<HomePage />);

    const region = screen.getByRole("region", {
      name: homeContent.contact.title,
    });
    const layout = region.querySelector(".home-contact__layout");
    expect(layout?.firstElementChild).toHaveClass("home-contact-card");
    expect(layout?.lastElementChild).toHaveClass("home-contact__copy");
    expect(region.querySelector(".home-eyebrow")).toBeNull();
    expect(
      region.querySelector(".home-contact__title-accent"),
    ).toHaveTextContent("AI");
    expect(region.querySelectorAll("[data-home-icon]")).toHaveLength(4);
    expect(within(region).getByText(homeContent.contact.address)).toBeVisible();
    expect(
      within(region).getByText(homeContent.contact.businessEmail),
    ).toBeVisible();
    expect(within(region).getByText(homeContent.contact.hotline)).toBeVisible();
    expect(
      within(region).getByText(homeContent.contact.serviceHours),
    ).toBeVisible();
    expect(within(region).getByText(homeContent.contact.note)).toBeVisible();
  });

  it("does not duplicate the shell-owned assistant or legacy brand", () => {
    render(<HomePage />);

    expect(document.querySelector(".floating-assistant")).toBeNull();
    expect(screen.queryByText("AI Agent Platform")).not.toBeInTheDocument();
  });
});

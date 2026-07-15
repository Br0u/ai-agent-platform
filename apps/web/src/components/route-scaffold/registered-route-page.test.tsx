import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "./registered-route-page";

describe("RegisteredRoutePage", () => {
  it("renders a registered scaffold route", () => {
    render(<RegisteredRoutePage pathname="/product" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "产品介绍" }),
    ).toBeVisible();
    expect(screen.getByText("页面结构已建立")).toBeVisible();
    expect(screen.queryByText("FEATURE_DISABLED")).not.toBeInTheDocument();
    expect(metadataForRegisteredRoute("/product").title).toBe(
      "产品介绍 · AI Agent Platform",
    );
  });

  it("preserves the disabled contract for external routes", () => {
    render(<RegisteredRoutePage pathname="/downloads" />);

    expect(screen.getByRole("heading", { name: "下载中心" })).toBeVisible();
    expect(screen.getByText("功能尚未开放")).toBeVisible();
    expect(screen.getByText("FEATURE_DISABLED")).toBeVisible();
  });

  it("materializes the exact docs anchors inside the feature shell", () => {
    const { container } = render(<RegisteredRoutePage pathname="/docs" />);
    const renderedPage = within(container);

    expect(
      renderedPage.getByRole("navigation", { name: "页面目录" }),
    ).toBeVisible();
    expect(
      Array.from(container.querySelectorAll("section[id]"), (section) =>
        section.getAttribute("id"),
      ),
    ).toEqual(["features"]);
    expect(container.querySelector("#overview")).not.toBeInTheDocument();
    expect(
      renderedPage
        .getByRole("navigation", { name: "页面目录" })
        .closest(".feature-shell__inner"),
    ).not.toBeNull();
  });

  it("materializes the exact disabled download anchors without leaving the shell", () => {
    const { container } = render(<RegisteredRoutePage pathname="/downloads" />);

    expect(
      Array.from(container.querySelectorAll("section[id]"), (section) =>
        section.getAttribute("id"),
      ),
    ).toEqual([
      "latest",
      "desktop",
      "architecture",
      "containers",
      "offline",
      "sdk",
    ]);

    const anchorIndex = within(container).getByRole("navigation", {
      name: "页面目录",
    });
    expect(anchorIndex.closest(".feature-shell__inner")).not.toBeNull();
    expect(anchorIndex.closest(".feature-shell")).not.toBeNull();
    expect(container.querySelector("main > .scaffold-anchor-index")).toBeNull();
  });

  it("renders optional route content after the anchor index inside the feature shell", () => {
    const { container } = render(
      <RegisteredRoutePage pathname="/docs">
        <section aria-label="route content">联系摘要</section>
      </RegisteredRoutePage>,
    );
    const renderedPage = within(container);
    const anchorIndex = renderedPage.getByRole("navigation", {
      name: "页面目录",
    });
    const routeContent = renderedPage.getByRole("region", {
      name: "route content",
    });

    expect(routeContent.closest(".feature-shell__inner")).not.toBeNull();
    expect(
      anchorIndex.compareDocumentPosition(routeContent) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      container.querySelector("main > [aria-label='route content']"),
    ).toBeNull();
  });
});

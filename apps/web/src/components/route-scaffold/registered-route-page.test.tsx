import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DownloadsPage from "../../app/downloads/page";
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
    render(<RegisteredRoutePage pathname="/console/openlab" />);

    expect(screen.getByRole("heading", { name: "OpenLab进度" })).toBeVisible();
    expect(screen.getByText("功能尚未开放")).toBeVisible();
    expect(screen.getByText("FEATURE_DISABLED")).toBeVisible();
  });

  it("materializes the exact analytics anchors inside the feature shell", () => {
    const { container } = render(
      <RegisteredRoutePage pathname="/admin/analytics" />,
    );
    const renderedPage = within(container);

    expect(
      renderedPage.getByRole("navigation", { name: "页面目录" }),
    ).toBeVisible();
    expect(
      Array.from(container.querySelectorAll("section[id]"), (section) =>
        section.getAttribute("id"),
      ),
    ).toEqual(["portal", "requests", "conversion"]);
    expect(
      renderedPage
        .getByRole("navigation", { name: "页面目录" })
        .closest(".feature-shell__inner"),
    ).not.toBeNull();
  });

  it("renders downloads as the real live page instead of a feature shell", () => {
    const { container } = render(<DownloadsPage />);

    expect(
      Array.from(container.querySelectorAll("section[id]"), (section) =>
        section.getAttribute("id"),
      ),
    ).toEqual([
      "dl-hero",
      "dl-materials",
      "dl-software",
      "dl-deployment",
      "dl-whitepapers",
      "dl-cta",
    ]);

    const directory = within(container).getByRole("navigation", {
      name: "下载中心完整目录",
    });
    expect(directory.closest(".download-page")).not.toBeNull();
    expect(container.querySelector(".feature-shell")).toBeNull();
  });

  it("renders optional route content after the anchor index inside the feature shell", () => {
    const { container } = render(
      <RegisteredRoutePage pathname="/admin/analytics">
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

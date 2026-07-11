import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortalRoute } from "@/config/routes";
import { FeaturePlaceholderPage } from "./feature-placeholder-page";

const scaffoldRoute: PortalRoute = {
  path: "/docs",
  title: "文档中心",
  group: "public",
  status: "scaffold",
};

const disabledRoute: PortalRoute = {
  path: "/downloads",
  title: "下载中心",
  group: "public",
  status: "placeholder",
};

describe("FeaturePlaceholderPage", () => {
  it("identifies scaffold pages without claiming the feature is complete", () => {
    render(<FeaturePlaceholderPage route={scaffoldRoute} />);

    expect(screen.getByRole("heading", { name: "文档中心" })).toBeVisible();
    expect(screen.getByText("页面结构已建立")).toBeVisible();
    expect(screen.queryByText("FEATURE_DISABLED")).not.toBeInTheDocument();
  });

  it("clearly disables external features that are not connected", () => {
    render(<FeaturePlaceholderPage route={disabledRoute} />);

    expect(screen.getByRole("heading", { name: "下载中心" })).toBeVisible();
    expect(screen.getByText("功能尚未开放")).toBeVisible();
    expect(screen.getByText("FEATURE_DISABLED")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders auxiliary content inside the feature inner shell after the dossier", () => {
    const { container } = render(
      <FeaturePlaceholderPage route={scaffoldRoute}>
        <aside data-testid="auxiliary-content">页面辅助内容</aside>
      </FeaturePlaceholderPage>,
    );

    const inner = container.querySelector(".feature-shell__inner");
    const dossier = container.querySelector(".feature-shell__dossier");
    const auxiliary = screen.getByTestId("auxiliary-content");

    expect(inner).toContainElement(auxiliary);
    expect(dossier?.nextElementSibling).toBe(auxiliary);
  });
});

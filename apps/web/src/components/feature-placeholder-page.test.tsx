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
  });

  it("clearly disables external features that are not connected", () => {
    render(<FeaturePlaceholderPage route={disabledRoute} />);

    expect(screen.getByRole("heading", { name: "下载中心" })).toBeVisible();
    expect(screen.getByText("功能尚未开放")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

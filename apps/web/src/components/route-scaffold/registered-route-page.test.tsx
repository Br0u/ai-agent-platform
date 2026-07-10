import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "./registered-route-page";

describe("RegisteredRoutePage", () => {
  it("renders a registered scaffold route", () => {
    render(<RegisteredRoutePage pathname="/product" />);

    expect(screen.getByRole("heading", { name: "产品介绍" })).toBeVisible();
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
});

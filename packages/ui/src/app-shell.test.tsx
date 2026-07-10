import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("provides the public product navigation around page content", () => {
    render(
      <AppShell>
        <p>页面内容</p>
      </AppShell>,
    );

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    const expectedLinks = [
      ["产品", "/product"],
      ["文档", "/docs"],
      ["版本", "/releases"],
      ["兼容矩阵", "/compatibility"],
      ["Marketplace", "/marketplace"],
      ["支持", "/support"],
    ] as const;

    for (const [linkName, href] of expectedLinks) {
      const link = within(navigation).getByRole("link", { name: linkName });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute("href", href);
    }

    const brandLink = screen.getByRole("link", {
      name: "AI Agent Platform 首页",
    });
    expect(brandLink).toBeVisible();
    expect(within(brandLink).getByText("AI Agent Platform")).toBeVisible();
    expect(
      within(brandLink).getByText("Build Enterprise AI Faster"),
    ).toBeVisible();
    expect(screen.getByText("打开导航")).toBeVisible();
    expect(screen.queryByText("华鲲元启")).not.toBeInTheDocument();
    expect(screen.getByText("页面内容")).toBeVisible();
  });
});

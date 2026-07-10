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
      "产品",
      "文档",
      "版本",
      "兼容矩阵",
      "Marketplace",
      "支持",
    ];

    for (const linkName of expectedLinks) {
      expect(
        within(navigation).getByRole("link", { name: linkName }),
      ).toBeVisible();
    }

    expect(
      screen.getByRole("link", { name: "AI Agent Platform 首页" }),
    ).toBeVisible();
    expect(screen.getByText("页面内容")).toBeVisible();
  });
});

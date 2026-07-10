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
      ["平台能力", "/product"],
      ["行业方案", "/cases"],
      ["文档", "/docs"],
      ["版本与兼容", "/compatibility"],
      ["支持", "/support"],
    ] as const;

    for (const [linkName, href] of expectedLinks) {
      const link = within(navigation).getByRole("link", { name: linkName });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute("href", href);
    }

    expect(screen.getByRole("link", { name: "华鲲元启首页" })).toBeVisible();
    expect(screen.getByText("TGDataXAI")).toBeVisible();
    expect(screen.getByText("打开导航")).toBeVisible();
    expect(screen.queryByText("AI Agent Platform")).not.toBeInTheDocument();
    expect(screen.getByText("页面内容")).toBeVisible();
  });
});

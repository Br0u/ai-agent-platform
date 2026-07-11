import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { navigationAnchorsForPath } from "@/config/navigation";
import {
  ScaffoldAnchorIndex,
  ScaffoldEmptyState,
} from "./scaffold-anchor-index";

describe("ScaffoldAnchorIndex", () => {
  it("renders a semantic directory and real targets for scaffold sections", () => {
    const { container } = render(
      <ScaffoldAnchorIndex anchors={navigationAnchorsForPath("/docs")} />,
    );

    const directory = screen.getByRole("navigation", { name: "页面目录" });
    for (const [id, label] of [
      ["quick-start", "快速开始"],
      ["deployment", "部署指南"],
      ["faq", "常见问题 FAQ"],
    ] as const) {
      const link = within(directory).getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", `#${id}`);
      expect(container.querySelector(`section#${id}`)).toHaveAttribute(
        "tabindex",
        "-1",
      );
    }

    expect(screen.getAllByText("结构已建立").length).toBeGreaterThan(0);
    expect(screen.getByText("页面目录")).toBeVisible();
  });

  it("keeps placeholder download targets honest and action-free", () => {
    render(
      <ScaffoldAnchorIndex anchors={navigationAnchorsForPath("/downloads")} />,
    );

    expect(screen.getAllByText("尚未开放")).toHaveLength(6);
    expect(
      screen.getAllByText("仅保留结构，未提供下载、申请或提交操作。"),
    ).toHaveLength(6);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/立即下载|提交申请|开始使用/),
    ).not.toBeInTheDocument();
  });

  it("describes live anchors as published content", () => {
    const { container } = render(
      <ScaffoldAnchorIndex
        anchors={[{ id: "published", label: "正式栏目", status: "live" }]}
      />,
    );

    const target = within(container).getByRole("region", { name: "正式栏目" });
    expect(within(target).getByText("已开放")).toBeVisible();
    expect(
      within(target).getByText("当前栏目已发布，可查看正式内容。"),
    ).toBeVisible();
    expect(within(target).queryByText("结构已建立")).not.toBeInTheDocument();
  });

  it("keeps a visible keyboard focus outline on directory links", () => {
    const stylesheet = readFileSync(
      resolve(
        process.cwd(),
        "src/components/route-scaffold/scaffold-anchor-index.css",
      ),
      "utf8",
    );

    expect(stylesheet).toMatch(
      /\.scaffold-anchor-index__nav a:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-accent\);[^}]*outline-offset:\s*\d+px;/s,
    );
    expect(stylesheet).toMatch(/\.scaffold-anchor-index__nav a:hover\s*\{/);
    expect(stylesheet).not.toMatch(
      /\.scaffold-anchor-index__nav a:hover,\s*\.scaffold-anchor-index__nav a:focus-visible/,
    );
  });

  it("owns a reusable, labelled empty state", () => {
    const { container } = render(
      <ScaffoldEmptyState
        id="analytics-empty"
        title="暂无统计数据"
        description="数据接口尚未接入。"
      />,
    );

    const emptyState = within(container).getByRole("region", {
      name: "暂无统计数据",
    });
    expect(emptyState).toHaveClass("scaffold-anchor-index__empty");
    expect(within(emptyState).getByRole("heading")).toHaveAttribute(
      "id",
      "analytics-empty-title",
    );
    expect(within(emptyState).getByText("数据接口尚未接入。")).toBeVisible();
  });
});

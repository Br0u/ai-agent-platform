import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/access", () => ({
  requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
}));
import AdminAnalyticsPage from "./page";

describe("AdminAnalyticsPage", () => {
  it("shows an honest empty state without fabricated metrics", async () => {
    const { container } = render(await AdminAnalyticsPage());

    expect(screen.getByRole("heading", { name: "数据统计" })).toBeVisible();
    expect(screen.getByText("暂无统计数据")).toBeVisible();
    expect(
      screen.getByText("数据采集接口尚未接入，本页面不会展示示例指标。"),
    ).toBeVisible();

    for (const label of ["访问量", "下载量", "转化率"]) {
      expect(screen.queryByText(new RegExp(label))).not.toBeInTheDocument();
    }

    for (const id of ["portal", "requests", "conversion"]) {
      expect(container.querySelector(`section#${id}`)).toBeInTheDocument();
    }

    const inner = container.querySelector(".feature-shell__inner");
    expect(inner).toContainElement(
      screen.getByText("暂无统计数据").parentElement,
    );
    expect(inner).toContainElement(
      screen.getByRole("navigation", { name: "页面目录" }),
    );
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminAnalyticsPage from "./page";

describe("AdminAnalyticsPage", () => {
  it("shows an honest empty state without fabricated metrics", () => {
    render(<AdminAnalyticsPage />);

    expect(screen.getByRole("heading", { name: "数据统计" })).toBeVisible();
    expect(screen.getByText("暂无统计数据")).toBeVisible();
    expect(
      screen.getByText("数据采集接口尚未接入，本页面不会展示示例指标。"),
    ).toBeVisible();

    for (const label of ["访问量", "下载量", "转化率"]) {
      expect(screen.queryByText(new RegExp(label))).not.toBeInTheDocument();
    }
  });
});

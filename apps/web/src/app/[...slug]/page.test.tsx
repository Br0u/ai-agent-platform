import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DownloadsPage, {
  metadata as downloadsMetadata,
} from "../downloads/page";
import PortalPage from "./page";

describe("PortalPage", () => {
  it("renders a scaffold route from URL segments", async () => {
    const page = await PortalPage({
      params: Promise.resolve({ slug: ["docs"] }),
    });

    render(page);

    expect(screen.getByRole("heading", { name: "文档中心" })).toBeVisible();
    expect(screen.getByText("页面结构已建立")).toBeVisible();
  });

  it("renders downloads through its real live page", () => {
    render(<DownloadsPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "从产品资料到安装体验，一站式获取华鲲资源",
      }),
    ).toBeVisible();
    expect(screen.queryByText("功能尚未开放")).not.toBeInTheDocument();
  });

  it("uses the live download center metadata", () => {
    expect(downloadsMetadata.title).toBe("下载中心 · 华鲲元启");
  });
});

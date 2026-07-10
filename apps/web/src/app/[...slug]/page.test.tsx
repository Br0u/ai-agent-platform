import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PortalPage, { generateMetadata } from "./page";

describe("PortalPage", () => {
  it("renders a scaffold route from URL segments", async () => {
    const page = await PortalPage({
      params: Promise.resolve({ slug: ["docs"] }),
    });

    render(page);

    expect(screen.getByRole("heading", { name: "文档中心" })).toBeVisible();
    expect(screen.getByText("页面结构已建立")).toBeVisible();
  });

  it("renders disabled state for external feature routes", async () => {
    const page = await PortalPage({
      params: Promise.resolve({ slug: ["downloads"] }),
    });

    render(page);

    expect(screen.getByRole("heading", { name: "下载中心" })).toBeVisible();
    expect(screen.getByText("功能尚未开放")).toBeVisible();
  });

  it("uses the PRD product brand in route metadata", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: ["downloads"] }),
    });

    expect(metadata.title).toBe("下载中心 · AI Agent Platform");
  });
});

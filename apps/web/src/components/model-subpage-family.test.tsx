import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getModelSubpage, modelSubpageSlugs } from "./model-subpage-content";
import { PlatformPageDetail } from "./platform-center-detail";

afterEach(cleanup);

describe("model subpage family", () => {
  it.each(modelSubpageSlugs)("renders the complete %s page", (slug) => {
    const page = getModelSubpage(slug)!;
    const { container } = render(<PlatformPageDetail page={page} />);

    expect(
      screen.getByRole("heading", { level: 1, name: page.hero.title }),
    ).toBeVisible();
    expect(screen.getAllByTestId("platform-center-section")).toHaveLength(
      page.sections.length,
    );
    expect(Boolean(screen.queryByTestId("platform-center-business"))).toBe(
      Boolean(page.business),
    );
    expect(Boolean(screen.queryByTestId("platform-center-cta"))).toBe(
      Boolean(page.cta),
    );
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("main")).toHaveClass(
      "platform-center--dense",
    );
    expect(container.querySelector(".floating-assistant")).toBeNull();
  });

  it("renders section demonstrations without creating another chat entry", () => {
    const page = getModelSubpage("model-task-center")!;
    const { container } = render(<PlatformPageDetail page={page} />);

    expect(screen.getAllByTestId("platform-page-demo")).toHaveLength(4);
    expect(screen.getByText("训练任务 · 进度演示")).toBeVisible();
    expect(screen.getByText("模型任务中心")).toBeVisible();
    expect(container.querySelector(".floating-assistant")).toBeNull();
  });

  it("renders deployment anchors, comparison rows and group flows", () => {
    const page = getModelSubpage("model-deploy")!;
    const { container } = render(<PlatformPageDetail page={page} />);

    expect(screen.getAllByTestId("platform-center-table-row")).toHaveLength(3);
    for (const id of ["deploy-custom", "deploy-private", "deploy-cloud"]) {
      expect(container.querySelector(`#${id}`)).toBeTruthy();
    }
    expect(screen.getAllByTestId("platform-page-group-flow")).toHaveLength(3);
    expect(
      within(screen.getAllByTestId("platform-page-group-flow")[0]!)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toStrictEqual([
      "模型花园一键部署 / 任务中心创建推理任务",
      "选择定制部署",
      "选择模型与主机资源",
      "配置并创建",
    ]);
  });

  it("keeps the original visual slots and semantic model links", () => {
    const page = getModelSubpage("model-data")!;
    render(<PlatformPageDetail page={page} />);

    expect(screen.getByText("数据工厂功能总览界面截图素材槽位")).toBeVisible();
    for (const link of screen.getAllByRole("link", {
      name: "查看模型训练 →",
    })) {
      expect(link).toHaveAttribute("href", "/product/model-training");
    }
    for (const link of screen.getAllByRole("link", {
      name: "查看模型评估 →",
    })) {
      expect(link).toHaveAttribute("href", "/product/model-evaluation");
    }
  });
});

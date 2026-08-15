import { render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import DownloadsPage from "../app/downloads/page";
import { downloadProducts, downloadResources } from "./download-center-content";

const materialKeys = [
  "yuanqi-fullstack",
  "yuanqi-appliance",
  "yuanqi-cases",
  "yuanqi-folder",
  "yuanqi-usage",
  "mdd2-intro",
  "mdd2-solution",
  "office-appliance",
  "office-doc",
  "office-contract",
  "office-bid",
  "daoban-appliance",
  "daoban-gov",
  "daoban-assistant",
  "vision-folder",
  "vision-solution",
  "vision-intro",
  "vision-usage",
] as const;

describe("download center V3 content", () => {
  it("matches the five product groups and 18 material resources", () => {
    expect(Object.keys(downloadProducts)).toEqual([
      "yuanqi",
      "mdd2",
      "office",
      "daoban",
      "vision",
    ]);
    expect(
      Object.values(downloadProducts).map(({ name, tag }) => [name, tag]),
    ).toEqual([
      ["元启 AI 开发赋能平台", "元启平台"],
      ["码里奥", "独立产品"],
      ["智能办公应用", "行业应用"],
      ["智能导办", "行业应用"],
      ["视觉检索智能体", "独立产品"],
    ]);
    expect(downloadResources.materials.map(({ key }) => key)).toEqual(
      materialKeys,
    );
    expect(downloadResources.materials).toHaveLength(18);
    expect(downloadResources.deployment.map(({ key }) => key)).toEqual([
      "yuanqi-deploy",
      "yuanqi-faq",
    ]);
    expect(downloadResources.whitepapers.map(({ key }) => key)).toEqual([
      "wp-yuanqi-tech",
    ]);
  });

  it("renders every V3 resource once without the obsolete cover", () => {
    const { container } = render(createElement(DownloadsPage));
    const resources = [
      ...downloadResources.materials,
      ...downloadResources.deployment,
      ...downloadResources.whitepapers,
    ];

    expect(container.querySelectorAll(".download-card__cover")).toHaveLength(0);
    for (const resource of resources) {
      const card = container.querySelector<HTMLElement>(
        `[data-download-key="${resource.key}"]`,
      );
      expect(card, resource.key).not.toBeNull();
      const scope = within(card!);
      expect(
        scope.getByRole("heading", { level: 3, name: resource.title }),
      ).toBeVisible();
      expect(scope.getByText(resource.desc, { exact: true })).toBeVisible();
      const tag =
        "product" in resource
          ? downloadProducts[resource.product].tag
          : resource.file;
      expect(scope.getByText(tag, { exact: true })).toBeVisible();
    }
  });

  it("renders five single-column product groups with two-column card grids", () => {
    const { container } = render(createElement(DownloadsPage));
    const groups = container.querySelectorAll(
      "#dl-materials .download-product-grid > .download-product-group",
    );

    expect(groups).toHaveLength(5);
    expect(
      [...groups].map(
        (group) => group.querySelectorAll(".download-card").length,
      ),
    ).toEqual([5, 2, 4, 3, 4]);
    expect(
      screen.getByText(
        "快速了解元启平台、码里奥与行业应用的产品定位、核心能力与产品价值，先建立产品认知，再进入体验。",
        { exact: true },
      ),
    ).toBeVisible();
  });

  it("keeps the four sections and exact software metadata", () => {
    const { container } = render(createElement(DownloadsPage));

    for (const [anchor, heading] of [
      ["dl-materials", "01｜产品资料"],
      ["dl-software", "02｜软件资源下载"],
      ["dl-deployment", "03｜产品部署文档"],
      ["dl-whitepapers", "04｜白皮书与技术资料"],
    ] as const) {
      expect(
        within(container.querySelector<HTMLElement>(`#${anchor}`)!).getByRole(
          "heading",
          { name: heading, level: 2 },
        ),
      ).toBeVisible();
    }
    expect(screen.getByText("版本：v2.0.0", { exact: true })).toBeVisible();
    expect(
      screen.getByText("Windows 10/11 · macOS 12+", { exact: true }),
    ).toBeVisible();
  });

  it("uses the V3 hero copy without an extra eyebrow", () => {
    render(createElement(DownloadsPage));

    expect(
      screen.getByText(
        "下载中心集中提供元启平台、码里奥与行业应用的产品资料、软件安装包、部署文档与技术白皮书，帮助您了解产品能力、获取资源并进入产品体验。",
        { exact: true },
      ),
    ).toBeVisible();
    expect(screen.queryByText("下载中心｜资源入口")).toBeNull();
  });
});

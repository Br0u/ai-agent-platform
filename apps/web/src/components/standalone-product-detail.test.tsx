import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StandaloneProductDetail } from "./standalone-product-detail";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/navigation", () => ({ notFound }));

afterEach(() => {
  cleanup();
  notFound.mockClear();
});

describe("StandaloneProductDetail", () => {
  it.each([
    {
      slug: "code-agent",
      title: "企业级的智能编码产品，代码不出域、说需求就落地",
      flow: ["说需求", "分析项目上下文", "生成代码", "运行验证"],
      scene: "高密级代码资产企业",
      securityCount: 4,
      cta: "立即体验码多多 2.0",
    },
    {
      slug: "aippt",
      title: "一站式智能演示文稿创作平台，需求直达、分钟级成稿",
      flow: ["输入需求 / 上传资料", "生成大纲与页面", "预览调整 · 导出交付"],
      scene: "工作汇报",
      securityCount: 0,
      cta: "立即体验 AIPPT",
    },
    {
      slug: "aishrek",
      title: "AI 机械设计工作台，导入即解读、对话改参数",
      flow: ["导入设计文件", "对话修改参数", "验证与交付"],
      scene: "零件设计与改型",
      securityCount: 0,
      cta: "立即体验 AISHREK",
    },
  ])(
    "renders the full $slug prototype structure",
    ({ cta, flow, scene, securityCount, slug, title }) => {
      const { container } = render(<StandaloneProductDetail slug={slug} />);

      expect(
        screen.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      expect(screen.getAllByTestId("detail-hero-tag")).toHaveLength(4);
      expect(screen.getAllByTestId("detail-hero-action")).toHaveLength(2);
      expect(screen.getAllByTestId("detail-introduction-card")).toHaveLength(3);
      expect(screen.getAllByTestId("detail-capability")).toHaveLength(4);
      expect(screen.queryAllByTestId("detail-security-item")).toHaveLength(
        securityCount,
      );
      expect(
        within(screen.getByTestId("detail-experience-flow"))
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(flow);
      expect(screen.getAllByTestId("detail-scene")).toHaveLength(3);
      expect(screen.getByText(scene)).toBeVisible();
      expect(screen.getByRole("link", { name: cta })).toHaveAttribute(
        "href",
        "/trial",
      );
      expect(container.querySelector(".floating-assistant")).toBeNull();
    },
  );

  it("uses notFound for unknown standalone product slugs", () => {
    expect(() => render(<StandaloneProductDetail slug="unknown" />)).toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });
});

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PlatformCenterDetail,
  PlatformPageDetail,
} from "./platform-center-detail";
import type { PlatformPage } from "./platform-page-types";

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

describe("PlatformCenterDetail", () => {
  it.each([
    {
      slug: "model",
      title: "企业模型工程，从资产管理到上线服务",
      sectionCount: 5,
      tagCount: 4,
      hasBusiness: true,
      hasCta: false,
    },
    {
      slug: "knowledge",
      title: "企业知识库：让企业文档变成 AI 能用的知识",
      sectionCount: 4,
      tagCount: 4,
      hasBusiness: false,
      hasCta: true,
    },
    {
      slug: "agents",
      title: "让企业拥有懂知识、懂业务、懂流程的 AI 助手",
      sectionCount: 3,
      tagCount: 4,
      hasBusiness: true,
      hasCta: true,
    },
    {
      slug: "applications",
      title: "成熟业务 AI 应用，拿来即用",
      sectionCount: 3,
      tagCount: 4,
      hasBusiness: true,
      hasCta: true,
    },
    {
      slug: "skills",
      title: "可复用的业务技能，拿来即用",
      sectionCount: 3,
      tagCount: 3,
      hasBusiness: true,
      hasCta: true,
    },
    {
      slug: "coding",
      title: "码多多：让智能编程走进企业日常开发",
      sectionCount: 3,
      tagCount: 4,
      hasBusiness: true,
      hasCta: true,
    },
    {
      slug: "governance",
      title: "平台用得安全，权限管得清楚",
      sectionCount: 3,
      tagCount: 4,
      hasBusiness: true,
      hasCta: true,
    },
  ])(
    "renders the complete $slug center structure",
    ({ hasBusiness, hasCta, sectionCount, slug, tagCount, title }) => {
      const { container } = render(<PlatformCenterDetail slug={slug} />);

      expect(
        screen.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      expect(screen.getAllByTestId("platform-center-hero-tag")).toHaveLength(
        tagCount,
      );
      expect(screen.getAllByTestId("platform-center-hero-action")).toHaveLength(
        2,
      );
      expect(screen.getAllByTestId("platform-center-section")).toHaveLength(
        sectionCount,
      );
      expect(Boolean(screen.queryByTestId("platform-center-business"))).toBe(
        hasBusiness,
      );
      expect(Boolean(screen.queryByTestId("platform-center-cta"))).toBe(hasCta);
      expect(container.querySelector("main")).not.toHaveClass(
        "platform-center--dense",
      );
      expect(container.querySelector(".floating-assistant")).toBeNull();
    },
  );

  it("renders source links, flows, visual slots and optional sections", () => {
    const { rerender } = render(<PlatformCenterDetail slug="model" />);

    expect(
      screen.getByRole("link", { name: "查看模型花园 →" }),
    ).toHaveAttribute("href", "/product/model-assets#assets-garden");
    expect(screen.getAllByTestId("platform-center-table-row")).toHaveLength(3);
    expect(screen.getByText("模型花园模型卡片列表截图素材槽位")).toBeVisible();
    expect(
      within(screen.getByTestId("platform-center-workflow"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["模型接入", "数据训练", "效果评估", "部署使用"]);

    rerender(<PlatformCenterDetail slug="applications" />);

    expect(screen.queryByTestId("platform-center-workflow")).toBeNull();
    for (const link of screen.getAllByRole("link", {
      name: "查看通用文本写作 →",
    })) {
      expect(link).toHaveAttribute("href", "/product/app-writing");
    }
    expect(screen.getAllByTestId("platform-center-scene")).toHaveLength(3);
  });

  it("renders governance anchors and the source scope note", () => {
    const { container } = render(<PlatformCenterDetail slug="governance" />);

    for (const id of ["gov-users", "gov-roles", "gov-menu", "gov-permission"]) {
      expect(container.querySelector(`#${id}`)).toBeTruthy();
    }
    expect(
      screen.getByText(
        "安全中心是元启平台内部的用户、权限与授权治理能力，不等同于独立网络安全产品或等保产品。",
      ),
    ).toBeVisible();
  });

  it("omits empty group copy when tag and lead are absent", () => {
    const page: PlatformPage = {
      slug: "group-copy-test",
      name: "能力组测试",
      hero: {
        eyebrow: "测试",
        title: "能力组测试",
        lead: "验证可选文案不会生成空节点。",
        tags: [],
        actions: [],
        visual: { title: "测试视觉" },
      },
      sections: [
        {
          eyebrow: "能力分组",
          title: "能力分组",
          groups: [
            {
              id: "group-without-copy",
              title: "质量保障",
              cards: [
                {
                  title: "生成记录",
                  description: "生成记录全程留存。",
                },
              ],
            },
          ],
        },
      ],
    };

    const { container } = render(<PlatformPageDetail page={page} />);
    const group = container.querySelector("#group-without-copy");

    expect(group).toBeTruthy();
    expect(group?.querySelector(":scope > .product-portal-tag")).toBeNull();
    expect(group?.querySelector(":scope > p")).toBeNull();
    expect(
      within(group as HTMLElement).getByRole("heading", {
        level: 3,
        name: "质量保障",
      }),
    ).toBeVisible();
    expect(
      within(group as HTMLElement).getByRole("heading", {
        level: 4,
        name: "生成记录",
      }),
    ).toBeVisible();
  });

  it("uses notFound for unknown platform center slugs", () => {
    expect(() => render(<PlatformCenterDetail slug="unknown" />)).toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });
});

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { codingSubpageSlugs, getCodingSubpage } from "./coding-subpage-content";
import { PlatformPageDetail } from "./platform-center-detail";

afterEach(cleanup);

const expected = {
  "coding-project": {
    h1: "让 AI 持续理解你的开发项目",
    heroDemo: "项目工作台：项目代码、历史会话、当前任务、开发环境统一关联",
    sectionDemo: "项目级配置示意：不同项目使用不同规范、工具与模型",
    businessDemo: "项目工作台 · 会话示例",
    mockup: "项目工作台真实产品截图：项目上下文、历史会话与开发任务统一关联",
    semanticLink: ["了解团队权限管理 →", "/product/governance"],
    anchors: [
      ["了解项目上下文管理 →", "/product/coding-project#cp-org", "cp-org"],
      ["了解多项目隔离 →", "/product/coding-project#cp-isolate", "cp-isolate"],
      ["了解项目级配置 →", "/product/coding-project#cp-config", "cp-config"],
    ],
  },
  "coding-session": {
    h1: "让开发上下文不断线",
    heroDemo: "多轮会话演示：AI 记得住前文，跨轮次引用已生成代码",
    sectionDemo: "快照时间线：保存节点，可随时回滚",
    businessDemo: "码多多 · 会话示例",
    mockup: "会话管理真实产品截图：多轮对话、快照与续接界面",
    semanticLink: ["了解项目上下文管理 →", "/product/coding-project"],
    anchors: [
      ["了解多轮对话延续 →", "/product/coding-session#cs-flow", "cs-flow"],
      [
        "了解快照与回滚 →",
        "/product/coding-session#cs-snapshot",
        "cs-snapshot",
      ],
      ["了解会话隔离 →", "/product/coding-session#cs-isolate", "cs-isolate"],
    ],
  },
  "coding-mobile": {
    h1: "让智能编程，接入你的每一种开发环境",
    heroDemo: "终端 UI 演示：交互菜单、实时日志、生成进度、错误高亮",
    sectionDemo: "接入方式：按场景选择",
    businessDemo: "远程终端 · 会话示例",
    mockup: "码多多 · 数据不出域",
    semanticLink: ["了解模型部署方式 →", "/product/model-deploy"],
    anchors: [
      ["了解多端接入 →", "/product/coding-mobile#cm-multi", "cm-multi"],
      ["了解远程访问 →", "/product/coding-mobile#cm-remote", "cm-remote"],
      ["了解终端 UI →", "/product/coding-mobile#cm-tui", "cm-tui"],
    ],
  },
  "coding-standard": {
    h1: "让代码质量，有标准可依",
    heroDemo: "代码质量校验演示：多维度校验，问题分级标注",
    sectionDemo: "规范适配示意：不同团队按各自规范生成与校验",
    businessDemo: "码多多 · 质量校验",
    mockup: "编程规范真实产品截图：规范配置、校验报告与问题标注界面",
    semanticLink: ["了解平台安全管控 →", "/product/governance"],
    anchors: [
      [
        "了解代码质量校验 →",
        "/product/coding-standard#cstd-check",
        "cstd-check",
      ],
      [
        "了解企业规范适配 →",
        "/product/coding-standard#cstd-adapt",
        "cstd-adapt",
      ],
      ["了解规则与插件 →", "/product/coding-standard#cstd-ext", "cstd-ext"],
    ],
  },
} as const;

describe("coding subpage family", () => {
  it.each(codingSubpageSlugs)("renders the complete dense %s page", (slug) => {
    const page = getCodingSubpage(slug)!;
    const { container } = render(<PlatformPageDetail page={page} />);

    expect(
      screen.getByRole("heading", { level: 1, name: expected[slug].h1 }),
    ).toBeVisible();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getAllByTestId("platform-center-section")).toHaveLength(6);
    expect(screen.getByTestId("platform-center-business")).toBeVisible();
    expect(screen.getByTestId("platform-center-cta")).toBeVisible();
    expect(container.querySelector("main")).toHaveClass(
      "platform-center--dense",
    );
    expect(container.querySelector("main .floating-assistant")).toBeNull();
  });

  it.each(codingSubpageSlugs)(
    "renders the %s visual demonstrations",
    (slug) => {
      const page = getCodingSubpage(slug)!;
      render(<PlatformPageDetail page={page} />);

      for (const text of [
        expected[slug].heroDemo,
        expected[slug].sectionDemo,
      ]) {
        expect(screen.getByText(text)).toBeVisible();
      }
      expect(
        within(screen.getByTestId("platform-center-business")).getByText(
          expected[slug].businessDemo,
        ),
      ).toBeVisible();
      expect(screen.getByText(expected[slug].mockup)).toBeVisible();
    },
  );

  it.each(codingSubpageSlugs)(
    "keeps the %s internal links and DOM anchors",
    (slug) => {
      const page = getCodingSubpage(slug)!;
      const { container } = render(<PlatformPageDetail page={page} />);
      const [semanticName, semanticHref] = expected[slug].semanticLink;

      expect(screen.getByRole("link", { name: semanticName })).toHaveAttribute(
        "href",
        semanticHref,
      );

      for (const [name, href, targetId] of expected[slug].anchors) {
        expect(screen.getByRole("link", { name })).toHaveAttribute(
          "href",
          href,
        );
        expect(container.querySelector(`#${targetId}`)).toBeTruthy();
      }
    },
  );
});

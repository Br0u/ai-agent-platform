import { render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import DownloadsPage from "../app/downloads/page";

const resources = [
  {
    key: "yuanqi-intro",
    tag: "元启平台",
    title: "元启 AI 开发赋能平台产品介绍",
    file: "PDF · 12 页",
    desc: "面向企业 AI 建设者的平台产品手册，介绍平台定位、六大中心能力与典型应用路径。",
  },
  {
    key: "yuanqi-features",
    tag: "元启平台",
    title: "元启平台功能清单",
    file: "PDF · 8 页",
    desc: "模型、知识、智能体、应用与治理六大中心核心能力与关键功能速览。",
  },
  {
    key: "yuanqi-arch",
    tag: "元启平台",
    title: "元启平台架构说明",
    file: "PDF · 10 页",
    desc: "平台分层架构、部署形态与运行机制说明，辅助企业评估平台适配性。",
  },
  {
    key: "mdd2-intro",
    tag: "独立产品",
    title: "码多多 2.0 产品介绍",
    file: "PDF · 10 页",
    desc: "面向企业研发与高密级代码资产场景的产品手册，介绍双形态、安全与部署方式。",
  },
  {
    key: "mdd2-features",
    tag: "独立产品",
    title: "码多多 2.0 功能清单",
    file: "PDF · 6 页",
    desc: "自然语言开发、工程落地、技能与多智能体等核心能力清单。",
  },
  {
    key: "mdd2-env",
    tag: "独立产品",
    title: "码多多 2.0 支持环境说明",
    file: "PDF · 4 页",
    desc: "支持的操作系统、运行环境与部署要求说明。",
  },
  {
    key: "mdd2-deploy",
    title: "码多多 2.0 安装部署指南",
    file: "PDF · 16 页",
    desc: "从环境准备、安装部署到初始化验证的完整说明，帮助快速完成私有化部署。",
  },
  {
    key: "mdd2-usage",
    title: "码多多 2.0 使用说明",
    file: "PDF · 20 页",
    desc: "项目管理、会话管理、移动接入与编程规范的使用方法说明。",
  },
  {
    key: "yuanqi-deploy",
    title: "元启平台部署文档",
    file: "PDF · 24 页",
    desc: "元启 AI 开发赋能平台的部署环境要求与安装流程说明。",
  },
  {
    key: "wp-ai",
    title: "企业 AI 落地白皮书",
    file: "PDF · 32 页",
    desc: "从模型、知识、智能体到应用，梳理企业 AI 建设的路径、关键能力与落地方法。",
  },
  {
    key: "wp-llm",
    title: "大模型应用实践白皮书",
    file: "PDF · 28 页",
    desc: "面向业务场景的大模型选型、微调、部署与效果验证实践参考。",
  },
  {
    key: "wp-agent",
    title: "智能体与业务自动化技术资料",
    file: "PDF · 20 页",
    desc: "智能体构建、流程编排与业务协同的技术说明，助力企业设计智能应用。",
  },
] as const;

describe("download center content", () => {
  it("renders every prototype resource with exact product labels, titles, file metadata and descriptions", () => {
    const { container } = render(createElement(DownloadsPage));

    expect(
      [...container.querySelectorAll<HTMLElement>("[data-download-key]")].map(
        (item) => item.dataset.downloadKey,
      ),
    ).toEqual([
      "yuanqi-intro",
      "yuanqi-features",
      "yuanqi-arch",
      "mdd2-intro",
      "mdd2-features",
      "mdd2-env",
      "mdd2-client",
      "mdd2-deploy",
      "mdd2-usage",
      "yuanqi-deploy",
      "wp-ai",
      "wp-llm",
      "wp-agent",
    ]);

    for (const resource of resources) {
      const card = container.querySelector<HTMLElement>(
        `[data-download-key="${resource.key}"]`,
      );
      expect(card, resource.key).not.toBeNull();
      const scope = within(card!);
      const titles = scope.getAllByText(resource.title, { exact: true });
      expect(titles).toHaveLength("tag" in resource ? 1 : 2);
      for (const title of titles) expect(title).toBeVisible();
      expect(scope.getByText(resource.file, { exact: true })).toBeVisible();
      expect(scope.getByText(resource.desc, { exact: true })).toBeVisible();
      if ("tag" in resource) {
        expect(scope.getByText(resource.tag, { exact: true })).toBeVisible();
      }
    }
  });

  it("renders the four anchored sections and exact software metadata and prototype warning", () => {
    const { container } = render(createElement(DownloadsPage));

    for (const [anchor, heading] of [
      ["dl-materials", "01｜产品资料"],
      ["dl-software", "02｜软件资源下载"],
      ["dl-deployment", "03｜产品部署文档"],
      ["dl-whitepapers", "04｜白皮书与技术资料"],
    ] as const) {
      const section = container.querySelector<HTMLElement>(`#${anchor}`);
      expect(section, anchor).not.toBeNull();
      expect(
        within(section!).getByRole("heading", { name: heading, level: 2 }),
      ).toBeVisible();
    }

    const software = container.querySelector<HTMLElement>(
      '[data-download-key="mdd2-client"]',
    );
    expect(software).not.toBeNull();
    for (const text of [
      "码多多 2.0 桌面客户端",
      "版本：v2.0.0",
      "Windows 10/11 · macOS 12+",
      "安装包约 240 MB",
    ]) {
      expect(within(software!).getByText(text, { exact: true })).toBeVisible();
    }
    expect(
      screen.getByText(
        "软件版本与支持系统以正式发布为准；原型阶段下载按钮唤起确认流程，不实际下载。",
        { exact: true },
      ),
    ).toBeVisible();
  });
});

import { describe, expect, it } from "vitest";
import * as content from "./download-center-content";

describe("download center presentation vocabulary", () => {
  it("keeps only the four fixed sections and five canonical products", () => {
    expect(content.downloadSections).toEqual([
      {
        no: "01",
        label: "产品资料",
        anchor: "dl-materials",
        category: "materials",
      },
      {
        no: "02",
        label: "软件资源下载",
        anchor: "dl-software",
        category: "software",
      },
      {
        no: "03",
        label: "产品部署文档",
        anchor: "dl-deployment",
        category: "deployment",
      },
      {
        no: "04",
        label: "白皮书与技术资料",
        anchor: "dl-whitepapers",
        category: "whitepapers",
      },
    ]);
    expect(content.downloadProducts).toEqual([
      "元启",
      "码里奥",
      "智能办公",
      "智能导办",
      "视觉检索智能体",
    ]);
  });

  it("contains no obsolete hard-coded resource catalog", () => {
    expect(content).not.toHaveProperty("downloadResources");
    expect(content).not.toHaveProperty("downloadSoftware");
    expect(content).not.toHaveProperty("downloadNotices");
  });

  it("keeps the resource journey ending with download consultation", () => {
    expect(content.downloadOverview).toEqual({
      title: "从产品资料到安装体验，一站式获取华鲲资源",
      lead: "下载中心集中提供元启平台、码里奥与行业应用的产品资料、软件安装包、部署文档与技术白皮书，帮助您了解产品能力、获取资源并进入产品体验。",
      tags: ["产品资料", "软件下载", "部署文档", "白皮书"],
    });
    expect(content.downloadJourney).toEqual([
      {
        title: "了解产品",
        description: "查看元启平台、码里奥与行业应用能力",
        href: "/product",
      },
      {
        title: "获取资料",
        description: "浏览产品资料、白皮书与部署文档",
        href: "/downloads#dl-materials",
      },
      {
        title: "安装体验",
        description: "下载码里奥客户端并部署",
        href: "/downloads#dl-software",
      },
      {
        title: "联系我们",
        description: "联系华鲲团队获取方案与产品支持",
        href: "/contact?topic=下载与资料咨询",
      },
    ]);
  });

  it("describes the three supported policy pairs", () => {
    expect(content.permissionHint("public", "public")).toBe(
      "可在线预览 · 可直接下载",
    );
    expect(content.permissionHint("public", "contact")).toBe(
      "可在线预览 · 联系获取下载",
    );
    expect(content.permissionHint("contact", "contact")).toBe(
      "仅展示封面 · 联系获取",
    );
  });

  it("formats public PDF metadata for readers", () => {
    expect(content.formatFileSize(1_572_864)).toBe("1.5 MB");
    expect(content.formatPublishedAt("2026-08-16T01:02:03.000Z")).toBe(
      "2026年8月16日",
    );
  });
});

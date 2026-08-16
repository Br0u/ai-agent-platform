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

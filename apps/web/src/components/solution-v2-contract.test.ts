import { describe, expect, it } from "vitest";
import { solutionDirectory } from "./solution-overview-content";
import {
  getSolutionDetail,
  solutionDetailSlugs,
} from "./solution-detail-content";

const expectedIndustries = [
  "金融行业解决方案",
  "铁路行业解决方案",
  "电力行业解决方案",
  "半导体行业解决方案",
  "公安行业解决方案",
  "应急行业解决方案",
  "企业通用解决方案",
  "政务行业解决方案",
] as const;

const expectedSolutions = [
  ["finance-compliance", "贷款合规智能审查"],
  ["finance-aml", "交易监测模型智能开发"],
  ["finance-operations", "合规运营"],
  ["finance-knowledge", "内部制度问答"],
  ["finance-assistant", "智能客服与合规话术"],
  ["finance-qa", "金融知识问答"],
  ["railway-parse", "规章制度精准解析"],
  ["railway-rag", "知识图谱与可信溯源"],
  ["railway-video", "施工安全视觉检索"],
  ["railway-exam", "党建知识库智能问答"],
  ["electric-ticket", "两票作业智能监管"],
  ["electric-data", "经营数据智能问数"],
  ["electric-fault", "设备故障监测与诊断"],
  ["electric-video", "厂区视觉智能巡检"],
  ["semi-ai-scientist", "光刻胶研发模型微调"],
  ["ps-ghost-rider", "鬼火少年检测"],
  ["ps-minor", "未成年人聚集检测"],
  ["ps-mental", "精神病人检测"],
  ["ps-nitrous", "吸笑气检测"],
  ["ps-violence", "暴力扒窃持刀识别"],
  ["ps-trace", "人员特征追踪与检索"],
  ["em-forest-fire", "森林火灾预警"],
  ["em-collapse", "路面塌陷桥梁坍塌监测"],
  ["em-image-hazard", "图片隐患识别"],
  ["em-dike", "河道溃堤决口识别"],
  ["em-public-risk", "公共区域风险监测"],
  ["em-dust-fire", "粉尘烟火精准判断"],
  ["enterprise-data", "销售经营数据智能问数"],
  ["government-process", "工商注册智能导办"],
] as const;

describe("V2 solutions contract", () => {
  it("uses only the eight V2 industry directory groups", () => {
    expect(solutionDirectory.map((node) => node.label)).toEqual(
      expectedIndustries,
    );
  });

  it("exposes the exact 29 V2 solution pages in order", () => {
    expect(solutionDetailSlugs).toEqual(
      expectedSolutions.map(([slug]) => slug),
    );
    expect(
      solutionDetailSlugs.map((slug) => [slug, getSolutionDetail(slug)?.title]),
    ).toEqual(expectedSolutions);
  });

  it("keeps V2 capability and local-image content on every solution", () => {
    for (const slug of solutionDetailSlugs) {
      const detail = getSolutionDetail(slug);
      expect(detail?.kind).toBe("industry");
      if (detail?.kind !== "industry") continue;
      expect(detail.capabilities).toHaveLength(
        slug.startsWith("ps-") || slug.startsWith("em-") ? 3 : 4,
      );
      expect(detail.images.main).toMatch(/^\/assets\/solutions\//u);
      expect(detail.images.scene).toMatch(/^\/assets\/solutions\//u);
    }
  });
});

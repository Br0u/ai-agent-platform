import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING_SELECTION } from "./pricing-config";
import { buildPricingSummary } from "./pricing-summary";

describe("pricing summary", () => {
  it("uses the exact safe default selection", () => {
    expect(DEFAULT_PRICING_SELECTION).toEqual({
      deployment: "local-private",
      scale: "pilot",
      modules: [],
      term: "tbd",
    });
  });

  it("builds human-readable rows in a stable order", () => {
    expect(
      buildPricingSummary({
        deployment: "dedicated-cloud",
        scale: "enterprise",
        modules: ["workflow", "agent-studio"],
        term: "3y",
      }),
    ).toEqual([
      "部署方式：专有云",
      "使用规模：企业级",
      "功能模块：AI Agent Studio、Workflow",
      "服务周期：三年",
    ]);
  });

  it("shows an explicit empty module summary", () => {
    expect(buildPricingSummary(DEFAULT_PRICING_SELECTION)).toEqual([
      "部署方式：本地私有化",
      "使用规模：体验验证",
      "功能模块：暂未选择",
      "服务周期：待商务确认",
    ]);
  });
});

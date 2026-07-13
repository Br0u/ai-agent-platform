import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING_SELECTION,
  type PricingModuleId,
} from "./pricing-config";
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

  it("keeps the shared default selection immutable at runtime", () => {
    expect(Object.isFrozen(DEFAULT_PRICING_SELECTION)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PRICING_SELECTION.modules)).toBe(true);
    expect(() =>
      (DEFAULT_PRICING_SELECTION.modules as PricingModuleId[]).push("workflow"),
    ).toThrow();
    expect(DEFAULT_PRICING_SELECTION.modules).toEqual([]);
  });

  it("builds the exact planned pricing selection summary", () => {
    expect(
      buildPricingSummary({
        deployment: "local-private",
        scale: "pilot",
        modules: ["workflow", "agent-studio"],
        term: "1y",
      }),
    ).toEqual([
      "部署方式：本地私有化",
      "使用规模：体验验证",
      "功能模块：AI Agent Studio、Workflow",
      "服务周期：一年",
    ]);
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

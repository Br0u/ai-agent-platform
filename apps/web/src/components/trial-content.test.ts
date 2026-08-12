import { describe, expect, it } from "vitest";
import { trialContent } from "./trial-content";

describe("trialContent", () => {
  it("锁定体验页原型原文", () => {
    expect(trialContent.hero).toEqual({
      eyebrow: "申请体验｜企业 AI 落地",
      title: "开启企业 AI 落地体验",
      lead: "填写以下信息，我们的产品顾问将在 24 小时内与您联系，安排元启平台或独立产品的体验。",
      tags: ["元启平台", "码多多 2.0", "AIPPT", "AISHREK"],
      visual: "产品体验示意界面素材槽位",
    });
  });

  it("锁定三步体验流程和收口文案", () => {
    expect(trialContent.flow).toEqual({
      eyebrow: "01｜体验流程",
      title: "从申请到体验，三步开始",
      steps: [
        {
          step: "STEP 01",
          title: "填写申请",
          description: "填写姓名、联系方式与所属公司。",
        },
        {
          step: "STEP 02",
          title: "顾问联系",
          description: "产品顾问在 24 小时内与您确认需求。",
        },
        {
          step: "STEP 03",
          title: "开始体验",
          description: "准备环境后，安排元启平台或独立产品体验。",
        },
      ],
    });
    expect(trialContent.cta).toEqual({
      title: "准备好了吗？",
      description: "立即提交申请，开启企业 AI 体验。",
      action: "填写申请信息",
    });
  });

  it("锁定弹层字段和成功文案", () => {
    expect(trialContent.form.fields).toEqual([
      { label: "姓名", name: "name", placeholder: "请输入姓名" },
      { label: "所属公司", name: "company", placeholder: "请输入所属公司" },
      {
        label: "联系方式（手机号或邮箱）",
        name: "contact",
        placeholder: "请输入手机号或邮箱",
      },
      { label: "验证码", name: "code", placeholder: "请输入 6 位验证码" },
    ]);
    expect(trialContent.success).toEqual({
      title: "提交成功",
      description: "感谢您的申请，我们的产品顾问将在 24 小时内与您联系。",
      action: "完成",
    });
  });
});

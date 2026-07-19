import { describe, expect, it } from "vitest";

import { PlaceholderAssistantProvider } from "./placeholder-assistant-provider";

const provider = new PlaceholderAssistantProvider();

describe("PlaceholderAssistantProvider", () => {
  it.each([
    [
      "如何开始了解平台？",
      "你可以从快速开始文档了解平台结构和使用入口。",
      [{ label: "查看快速开始", href: "/docs#quick-start" }],
    ],
    [
      "如何获取部署支持？",
      "当前可通过商务咨询提交部署需求，由相关人员进一步确认。",
      [{ label: "联系商务", href: "/contact" }],
    ],
    [
      "如何提交产品问题？",
      "你可以前往客户支持页面查看问题提交入口。",
      [{ label: "前往客户支持", href: "/support" }],
    ],
  ])(
    "returns the exact mapped response for %s",
    async (message, reply, actions) => {
      await expect(
        provider.reply({
          request: { message, context: { pathname: "/pricing" } },
          session: { kind: "persistent", internalSessionId: "ignored-session" },
          signal: AbortSignal.abort(),
        }),
      ).resolves.toEqual({
        content: reply,
        suggestedActions: actions,
      });
    },
  );

  it("returns the generic placeholder response for other questions", async () => {
    await expect(
      provider.reply({
        request: {
          message: "这个功能什么时候上线？",
          context: { pathname: "/product" },
        },
        session: { kind: "ephemeral" },
      }),
    ).resolves.toEqual({
      content: "AI 服务尚未接入。你可以先查看帮助中心或联系商务顾问。",
      suggestedActions: [
        { label: "帮助中心", href: "/help" },
        { label: "商务咨询", href: "/contact" },
      ],
    });
  });
});

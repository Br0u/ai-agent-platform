import { describe, expect, it } from "vitest";
import { POST } from "./route";

function assistantRequest(body: unknown) {
  return new Request("http://localhost/api/v1/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/assistant/chat", () => {
  it.each([
    ["如何开始了解平台？", "查看快速开始文档", "/docs#quick-start"],
    ["如何获取部署支持？", "联系商务顾问", "/contact"],
    ["如何提交产品问题？", "前往客户支持", "/support"],
  ] as const)(
    "returns a stable guide for preset question %s",
    async (message, replyFragment, actionHref) => {
      const response = await POST(
        assistantRequest({ message, context: { pathname: "/" } }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        mode: "placeholder",
        message: expect.stringContaining(replyFragment),
        suggestedActions: expect.arrayContaining([
          expect.objectContaining({ href: actionHref }),
        ]),
      });
    },
  );

  it("trims free text and returns the generic placeholder response", async () => {
    const response = await POST(
      assistantRequest({
        message: "  请介绍知识库能力  ",
        context: { pathname: "/product" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      mode: "placeholder",
      message: "AI 服务尚未接入。你可以先查看帮助中心或联系商务顾问。",
      suggestedActions: [
        { label: "帮助中心", href: "/help" },
        { label: "商务咨询", href: "/contact" },
      ],
    });
  });

  it.each([
    ["empty text", "   "],
    ["more than 500 Unicode characters", "你".repeat(501)],
    ["more than 500 Unicode code points", "😀".repeat(501)],
  ])(
    "rejects %s without echoing the submitted content",
    async (_label, message) => {
      const response = await POST(assistantRequest({ message }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({
        mode: "placeholder",
        error: {
          code: "invalid_message",
          message: "请输入 1 至 500 个字符的问题。",
        },
      });
      expect(JSON.stringify(body)).not.toContain(message);
    },
  );

  it("rejects a malformed payload", async () => {
    const response = await POST(assistantRequest({ message: 42 }));

    expect(response.status).toBe(400);
  });
});

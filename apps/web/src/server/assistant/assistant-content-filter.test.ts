import { describe, expect, it } from "vitest";

import { ASSISTANT_CONTENT_MAX_CODE_POINTS } from "@/features/assistant/assistant-contract";
import { AssistantContentFilter } from "./assistant-content-filter";

function filtered(chunks: readonly string[]): string {
  const filter = new AssistantContentFilter();
  return chunks.map((chunk) => filter.push(chunk)).join("") + filter.finish();
}

describe("AssistantContentFilter", () => {
  it("returns only the validated public answer field", () => {
    expect(filtered(['{"answer":"您好，请告诉我您的具体问题。"}'])).toBe(
      "您好，请告诉我您的具体问题。",
    );
  });

  it("accepts structured output split at every UTF-16 boundary", () => {
    const input = '{"answer":"当前已启用的 Skill 是：AI 系统知识解答。"}';
    for (let boundary = 0; boundary <= input.length; boundary += 1) {
      expect(
        filtered([input.slice(0, boundary), input.slice(boundary)]),
        `boundary ${boundary}`,
      ).toBe("当前已启用的 Skill 是：AI 系统知识解答。");
    }
  });

  it("enforces the public answer limit after removing the JSON envelope", () => {
    const exact = "x".repeat(ASSISTANT_CONTENT_MAX_CODE_POINTS);
    expect(filtered([JSON.stringify({ answer: exact })])).toBe(exact);
    expect(filtered([JSON.stringify({ answer: `${exact}x` })])).toBe("");
  });

  it.each([
    ["plain analysis", "用户的问题是‘1’，我应该直接回答。"],
    [
      "analysis before JSON",
      '用户的问题是‘1’，我应该直接回答。\n{"answer":"公开答案"}',
    ],
    ["analysis field", '{"analysis":"私密","answer":"公开答案"}'],
    ["unknown field", '{"answer":"公开答案","extra":true}'],
    ["blank answer", '{"answer":"   "}'],
    ["non-string answer", '{"answer":7}'],
    ["missing answer", "{}"],
    ["array", '[{"answer":"公开答案"}]'],
    ["malformed JSON", '{"answer":"公开答案"'],
  ])("fails closed for %s", (_name, input) => {
    expect(filtered([input])).toBe("");
  });

  it("resets after each completed response", () => {
    const filter = new AssistantContentFilter();
    filter.push('{"answer":"第一条"}');
    expect(filter.finish()).toBe("第一条");
    filter.push('{"answer":"第二条"}');
    expect(filter.finish()).toBe("第二条");
  });
});

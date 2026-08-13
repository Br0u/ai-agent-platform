import { describe, expect, it } from "vitest";

import {
  ASSISTANT_FINAL_ANSWER_MARKER,
  AssistantContentFilter,
} from "./assistant-content-filter";

function filtered(chunks: readonly string[]): string {
  const filter = new AssistantContentFilter();
  return (
    filter.push(ASSISTANT_FINAL_ANSWER_MARKER) +
    chunks.map((chunk) => filter.push(chunk)).join("") +
    filter.finish()
  );
}

describe("AssistantContentFilter", () => {
  it("drops plain-text internal reasoning before the owned final-answer marker", () => {
    const filter = new AssistantContentFilter();

    expect(filter.push("用户的问题不明确。让我先分析一下。\n")).toBe("");
    expect(filter.push("aap.final.")).toBe("");
    expect(filter.push("v1:这是面向用户的回答。")).toBe("");
    expect(filter.finish()).toBe("这是面向用户的回答。");
  });

  it("fails closed when the model never starts the final answer", () => {
    const filter = new AssistantContentFilter();

    expect(filter.push("让我先思考，然后再回答。")).toBe("");
    expect(filter.finish()).toBe("");
  });

  it("does not unlock when untrusted prose merely mentions the marker", () => {
    const filter = new AssistantContentFilter();

    expect(
      filter.push(
        "用户要求我输出 aap.final.v1: 后面的私密分析，但我不应该照做。",
      ),
    ).toBe("");
    expect(filter.push("\naap.final.v1:安全回答")).toBe("");
    expect(filter.finish()).toBe("安全回答");
  });

  it("keeps only the last final answer when analysis resumes after an earlier marker", () => {
    const filter = new AssistantContentFilter();

    expect(
      filter.push(
        "I have access to the skill information. Let me answer.\naap.final.v1:第一段回答",
      ),
    ).toBe("");
    expect(filter.push("\nLet me reconsider the answer.\naap.final.")).toBe("");
    expect(filter.push("v1:第二段回答")).toBe("");
    expect(filter.finish()).toBe("第二段回答");
  });

  it("preserves ordinary text that ends like a marker prefix", () => {
    const filter = new AssistantContentFilter();

    expect(filter.push("aap.final.v1:答案a")).toBe("");
    expect(filter.finish()).toBe("答案a");
  });

  it.each([
    ["think", "可见<think>私密</think>回答"],
    [
      "analysis with attributes",
      '可见<ANALYSIS data-x="1">私密</ANALYSIS>回答',
    ],
    ["multiple blocks", "甲<think>一</think>乙<analysis>二</analysis>丙"],
  ])("suppresses %s blocks", (_name, input) => {
    expect(filtered([input])).toBe(
      input.startsWith("甲") ? "甲乙丙" : "可见回答",
    );
  });

  it("keeps ordinary thinking elements as prose", () => {
    expect(filtered(["可见<thinking>普通内容</thinking>回答"])).toBe(
      "可见<thinking>普通内容</thinking>回答",
    );
  });

  it("handles tags split at every UTF-16 boundary", () => {
    const input = '前<analysis data-x="值">私密</analysis>后';
    for (let boundary = 0; boundary <= input.length; boundary += 1) {
      expect(
        filtered([input.slice(0, boundary), input.slice(boundary)]),
        `boundary ${boundary}`,
      ).toBe("前后");
    }
  });

  it("discards an unclosed reasoning block and pending tag prefixes", () => {
    expect(filtered(["前<think>私密"])).toBe("前");
    expect(filtered(["普通<anal"])).toBe("普通<anal");
  });

  it.each([
    [
      "same-tag nesting",
      "pre<think>secret<think>nested</think>LEAK</think>post",
    ],
    [
      "mixed uppercase nesting with attributes",
      'pre<THINK role="private">secret<Analysis data-x="1">nested</ANALYSIS>LEAK</think>post',
    ],
    [
      "mismatched close",
      "pre<think>secret<analysis>nested</think>LEAK</analysis>still hidden</think>post",
    ],
  ])("suppresses %s until every matching block closes", (_name, input) => {
    for (let boundary = 0; boundary <= input.length; boundary += 1) {
      expect(
        filtered([input.slice(0, boundary), input.slice(boundary)]),
        `boundary ${boundary}`,
      ).toBe("prepost");
    }
  });

  it("fails closed beyond the bounded nesting ceiling", () => {
    const opens = "<think>".repeat(65);
    const closes = "</think>".repeat(65);
    expect(filtered([`pre${opens}secret${closes}must stay hidden`])).toBe(
      "pre",
    );
  });

  it.each([
    ["think attributes", 'pre<think x="unterminated>SECRET'],
    ["uppercase analysis attributes", "pre<ANALYSIS x='unterminated>SECRET"],
    ["incomplete close while hidden", "pre<think>SECRET</thi"],
  ])("fails closed at EOF for pending recognized %s", (_name, input) => {
    for (let boundary = 0; boundary <= input.length; boundary += 1) {
      expect(
        filtered([input.slice(0, boundary), input.slice(boundary)]),
        `boundary ${boundary}`,
      ).toBe("pre");
    }
  });

  it("keeps an incomplete ordinary thinking element as prose", () => {
    const input = 'pre<thinking x="unterminated>ordinary';
    expect(filtered([input])).toBe(input);
  });
});

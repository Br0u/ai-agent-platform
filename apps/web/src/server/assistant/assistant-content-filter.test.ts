import { describe, expect, it } from "vitest";

import { AssistantContentFilter } from "./assistant-content-filter";

function filtered(chunks: readonly string[]): string {
  const filter = new AssistantContentFilter();
  return chunks.map((chunk) => filter.push(chunk)).join("") + filter.finish();
}

describe("AssistantContentFilter", () => {
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

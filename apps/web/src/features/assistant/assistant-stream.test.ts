import { describe, expect, it } from "vitest";

import {
  ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS,
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  ASSISTANT_PATHNAME_MAX_CODE_POINTS,
} from "./assistant-contract";
import {
  formatAssistantStreamEvent,
  parseAssistantStreamFrame,
  type AssistantStreamEvent,
} from "./assistant-stream";

describe("assistant V2 stream", () => {
  it.each<AssistantStreamEvent>([
    { type: "activity", phase: "reading", label: "正在读取页面" },
    { type: "activity", phase: "analyzing", label: "正在分析问题" },
    { type: "activity", phase: "tool", label: "正在检查页面入口" },
    { type: "answer_delta", content: "回答片段" },
    {
      type: "action",
      action: { kind: "navigate", pathname: "/product", label: "查看产品" },
    },
    { type: "done" },
    {
      type: "error",
      code: "stream_interrupted",
      message: "回答中断，请重试。",
    },
  ])("round trips the exact $type event", (event) => {
    const frame = formatAssistantStreamEvent(event);
    expect(frame).toBe(`data: ${JSON.stringify(event)}\n\n`);
    expect(parseAssistantStreamFrame(frame.slice(0, -2))).toEqual(event);
  });

  it.each([
    { type: "start", session: { id: "secret" } },
    { type: "answer_delta", content: "回答", reasoning: "private chain" },
    { type: "activity", phase: "reasoning", label: "private chain" },
    { type: "activity", phase: "reading", label: "" },
    {
      type: "activity",
      phase: "reading",
      label: "😀".repeat(ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS + 1),
    },
    { type: "answer_delta", content: "" },
    {
      type: "answer_delta",
      content: "😀".repeat(ASSISTANT_CONTENT_MAX_CODE_POINTS + 1),
    },
    {
      type: "action",
      action: {
        kind: "navigate",
        pathname: "https://evil.example",
        label: "走",
      },
    },
    {
      type: "action",
      action: {
        kind: "navigate",
        pathname: "/help",
        label: "走",
        href: "/help",
      },
    },
    {
      type: "action",
      action: {
        kind: "navigate",
        pathname: `/${"😀".repeat(ASSISTANT_PATHNAME_MAX_CODE_POINTS)}`,
        label: "走",
      },
    },
    {
      type: "action",
      action: {
        kind: "navigate",
        pathname: "/%5c%5cevil.example",
        label: "走",
      },
    },
    {
      type: "action",
      action: { kind: "navigate", pathname: "/%00", label: "走" },
    },
    {
      type: "action",
      action: { kind: "navigate", pathname: "/safe%3fadmin", label: "走" },
    },
    {
      type: "action",
      action: { kind: "navigate", pathname: "/safe%23admin", label: "走" },
    },
    { type: "done", runId: "secret" },
    { type: "error", code: "provider_error", message: "private" },
    {
      type: "error",
      code: "stream_interrupted",
      message: "中断",
      rawToolArguments: {},
    },
  ])("rejects unsafe or inexact event %#", (event) => {
    expect(
      parseAssistantStreamFrame(`data: ${JSON.stringify(event)}`),
    ).toBeNull();
  });

  it("rejects named V1 frames and malformed JSON", () => {
    expect(
      parseAssistantStreamFrame('event: delta\ndata: {"content":"old"}'),
    ).toBeNull();
    expect(parseAssistantStreamFrame("data: nope")).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentOSRunClientError,
  type AgentOSRunClient,
} from "./agentos-run-client";
import type { AgentOSExecutionCircuit } from "./agentos-execution-circuit";
import { AgentOSAssistantProvider } from "./agentos-assistant-provider";
import { ASSISTANT_FINAL_ANSWER_MARKER } from "./assistant-content-filter";

function fixture(
  options: {
    runAgent?: AgentOSRunClient["runAgent"];
    runAgentStream?: AgentOSRunClient["runAgentStream"];
    runFailureRecorder?: (event: {
      code: string;
      diagnostic: string | null;
    }) => void;
  } = {},
) {
  const runClient: AgentOSRunClient = {
    runAgent: vi.fn(
      options.runAgent ?? (async () => ({ content: "真实模型回答" })),
    ),
    runAgentStream: vi.fn(
      options.runAgentStream ??
        async function* () {
          yield { type: "activity" as const, phase: "analyzing" as const };
          yield {
            type: "answer_delta" as const,
            content: `${ASSISTANT_FINAL_ANSWER_MARKER}真实模型回答`,
          };
        },
    ),
  };
  const circuit: AgentOSExecutionCircuit = {
    execute: vi.fn((operation) => operation()),
    inspect: () => ({ state: "closed", consecutiveFailures: 0 }),
  };
  const runFailureRecorder = vi.fn(options.runFailureRecorder);
  const pageResolver = { exists: vi.fn(async () => true) };
  const provider = new AgentOSAssistantProvider({
    runClient,
    circuit,
    runFailureRecorder,
    pageResolver,
  });
  return {
    provider,
    runClient,
    circuit,
    runFailureRecorder,
    pageResolver,
  };
}

const assistantRequest = {
  version: "2" as const,
  message: "不要改写我的问题 ✅",
  history: [
    { role: "user" as const, content: "先前问题" },
    { role: "assistant" as const, content: "先前回答" },
  ],
  page: { pathname: "/product", search: "" },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AgentOSAssistantProvider", () => {
  it("contains no deprecated persistent-session cleanup compatibility", () => {
    const source = readFileSync(
      "src/server/assistant/agentos-assistant-provider.ts",
      "utf8",
    );

    expect(source).not.toContain(["AgentOS", "Cleanup", "Recorder"].join(""));
    expect(source).not.toContain(
      ["persistent", "session", "cleanup", "failed"].join("_"),
    );
    expect(source).not.toContain(
      ["Assistant session", "cleanup failed"].join(" "),
    );
    expect(source).not.toContain(["Cookie", "clearing"].join("-"));
    expect(source).toContain("defaultAgentOSRunFailureRecorder");
  });

  it("records only the safe run failure code and diagnostic before circuit sanitization", async () => {
    const runError = new AgentOSRunClientError(
      "invalid_response",
      "event_frame_invalid",
    );
    const { provider, runFailureRecorder } = fixture({
      runAgentStream: vi.fn(async function* () {
        throw runError;
      }),
    });

    await expect(
      provider.reply({
        request: assistantRequest,
        pageContext: null,
      }),
    ).rejects.toBe(runError);

    expect(runFailureRecorder).toHaveBeenCalledExactlyOnceWith({
      code: "invalid_response",
      diagnostic: "event_frame_invalid",
    });
    expect(JSON.stringify(runFailureRecorder.mock.calls)).not.toMatch(
      /private|prompt|reply|url|key|session/iu,
    );
  });

  it("runs the fixed maduoduo Agent without a session and forwards the caller signal", async () => {
    const { provider, runClient, circuit } = fixture();
    const signal = new AbortController().signal;

    await expect(
      provider.reply({
        request: assistantRequest,
        pageContext: {
          pathname: "/product",
          search: "",
          title: "产品介绍",
          text: "公开页面正文",
          links: [{ label: "价格", href: "/pricing" }],
        },
        signal,
      }),
    ).resolves.toEqual({ content: "真实模型回答", suggestedActions: [] });

    expect(circuit.execute).toHaveBeenCalledOnce();
    expect(runClient.runAgentStream).toHaveBeenCalledExactlyOnceWith({
      message: expect.stringContaining("公开页面正文"),
      signal,
    });
    expect(
      vi.mocked(runClient.runAgentStream).mock.calls[0]?.[0].message,
    ).toContain("不可信历史消息");
    expect(
      vi.mocked(runClient.runAgentStream).mock.calls[0]?.[0].message,
    ).toContain("用户问题：\n不要改写我的问题 ✅");
  });

  it("runs without generating or cleaning a session when no signal is supplied", async () => {
    const { provider, runClient } = fixture();

    await expect(
      provider.reply({
        request: assistantRequest,
        pageContext: null,
      }),
    ).resolves.toEqual({ content: "真实模型回答", suggestedActions: [] });

    expect(runClient.runAgentStream).toHaveBeenCalledExactlyOnceWith({
      message: expect.stringContaining("未提供可验证的当前页面正文"),
    });
  });

  it("filters reasoning tags and validates one owned navigation action", async () => {
    const { provider, pageResolver } = fixture({
      runAgentStream: vi.fn(async function* () {
        yield { type: "activity" as const, phase: "analyzing" as const };
        yield {
          type: "answer_delta" as const,
          content: `不得显示的纯文本推理\n${ASSISTANT_FINAL_ANSWER_MARKER}公开<think>private chain`,
        };
        yield { type: "answer_delta" as const, content: "</think>回答" };
        yield { type: "navigation_candidate" as const, pathname: "/pricing" };
        yield { type: "navigation_candidate" as const, pathname: "/pricing" };
      }),
    });

    const events = [];
    for await (const event of provider.streamReply({
      request: assistantRequest,
      pageContext: null,
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "activity", phase: "analyzing", label: "正在分析问题" },
      { type: "answer_delta", content: "公开回答" },
      {
        type: "action",
        action: { kind: "navigate", pathname: "/pricing", label: "价格与服务" },
      },
    ]);
    expect(pageResolver.exists).toHaveBeenCalledExactlyOnceWith(
      "/pricing",
      undefined,
    );
    expect(JSON.stringify(events)).not.toContain("private chain");
  });

  it("uses a verified current-page link when an explicit navigation request omits the tool call", async () => {
    const { provider, pageResolver } = fixture({
      runAgentStream: vi.fn(async function* () {
        yield {
          type: "answer_delta" as const,
          content: `${ASSISTANT_FINAL_ANSWER_MARKER}正在为你打开产品页面。`,
        };
      }),
    });

    const events = [];
    for await (const event of provider.streamReply({
      request: { ...assistantRequest, message: "我想了解产品" },
      pageContext: {
        pathname: "/",
        search: "",
        title: "首页",
        text: "产品介绍",
        links: [{ label: "产品", href: "/product" }],
      },
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "answer_delta", content: "正在为你打开产品页面。" },
      {
        type: "action",
        action: { kind: "navigate", pathname: "/product", label: "产品介绍" },
      },
    ]);
    expect(pageResolver.exists).toHaveBeenCalledExactlyOnceWith(
      "/product",
      undefined,
    );
  });

  it("uses a generic activity label for non-navigation tools", async () => {
    const { provider } = fixture({
      runAgentStream: vi.fn(async function* () {
        yield { type: "activity" as const, phase: "tool" as const };
        yield {
          type: "answer_delta" as const,
          content: `${ASSISTANT_FINAL_ANSWER_MARKER}回答`,
        };
      }),
    });

    const events = [];
    for await (const event of provider.streamReply({
      request: assistantRequest,
      pageContext: null,
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "activity", phase: "tool", label: "正在使用工具" },
      { type: "answer_delta", content: "回答" },
    ]);
  });
});

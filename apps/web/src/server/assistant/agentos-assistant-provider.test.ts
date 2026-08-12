import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentOSRunClientError,
  type AgentOSRunClient,
} from "./agentos-run-client";
import type { AgentOSExecutionCircuit } from "./agentos-execution-circuit";
import { AgentOSAssistantProvider } from "./agentos-assistant-provider";

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
          yield "真实模型回答";
        },
    ),
    deleteSession: vi.fn(async () => undefined),
  };
  const circuit: AgentOSExecutionCircuit = {
    execute: vi.fn((operation) => operation()),
    inspect: () => ({ state: "closed", consecutiveFailures: 0 }),
  };
  const runFailureRecorder = vi.fn(options.runFailureRecorder);
  const provider = new AgentOSAssistantProvider({
    runClient,
    circuit,
    runFailureRecorder,
  });
  return {
    provider,
    runClient,
    circuit,
    runFailureRecorder,
  };
}

const assistantRequest = {
  message: "不要改写我的问题 ✅",
  context: { pathname: "/产品/码多多" },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AgentOSAssistantProvider", () => {
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
        signal,
      }),
    ).resolves.toEqual({ content: "真实模型回答", suggestedActions: [] });

    expect(circuit.execute).toHaveBeenCalledOnce();
    expect(runClient.runAgentStream).toHaveBeenCalledExactlyOnceWith({
      message:
        "当前页面路径（仅作位置上下文，不代表已读取页面内容）：/产品/码多多\n\n用户问题：不要改写我的问题 ✅",
      signal,
    });
    expect(runClient.deleteSession).not.toHaveBeenCalled();
  });

  it("runs without generating or cleaning a session when no signal is supplied", async () => {
    const { provider, runClient } = fixture();

    await expect(
      provider.reply({
        request: assistantRequest,
      }),
    ).resolves.toEqual({ content: "真实模型回答", suggestedActions: [] });

    expect(runClient.runAgentStream).toHaveBeenCalledExactlyOnceWith({
      message:
        "当前页面路径（仅作位置上下文，不代表已读取页面内容）：/产品/码多多\n\n用户问题：不要改写我的问题 ✅",
    });
    expect(runClient.deleteSession).not.toHaveBeenCalled();
  });
});

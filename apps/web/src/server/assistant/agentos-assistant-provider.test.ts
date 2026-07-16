import { describe, expect, it, vi } from "vitest";

import type { AgentOSRunClient } from "./agentos-run-client";
import type { AgentOSExecutionCircuit } from "./agentos-execution-circuit";
import { AgentOSAssistantProvider } from "./agentos-assistant-provider";

function fixture(
  options: {
    runAgent?: AgentOSRunClient["runAgent"];
    deleteSession?: AgentOSRunClient["deleteSession"];
    randomUUID?: () => string;
    cleanupRecorder?: (event: {
      category: "ephemeral_session_cleanup_failed";
      count: number;
    }) => void;
  } = {},
) {
  const runClient: AgentOSRunClient = {
    runAgent: vi.fn(
      options.runAgent ?? (async () => ({ content: "真实模型回答" })),
    ),
    deleteSession: vi.fn(options.deleteSession ?? (async () => undefined)),
  };
  const circuit: AgentOSExecutionCircuit = {
    execute: vi.fn((operation) => operation()),
    inspect: () => ({ state: "closed", consecutiveFailures: 0 }),
  };
  const cleanupRecorder = vi.fn(options.cleanupRecorder);
  const provider = new AgentOSAssistantProvider({
    runClient,
    circuit,
    randomUUID: options.randomUUID ?? (() => "ephemeral-internal-id"),
    cleanupRecorder,
  });
  return { provider, runClient, circuit, cleanupRecorder };
}

const assistantRequest = {
  message: "不要改写我的问题 ✅",
  context: { pathname: "/产品/码多多" },
};

describe("AgentOSAssistantProvider", () => {
  it("runs the fixed maduoduo Agent with the exact persistent session, prompt, and caller signal", async () => {
    const { provider, runClient, circuit } = fixture();
    const signal = new AbortController().signal;

    await expect(
      provider.reply({
        request: assistantRequest,
        session: {
          kind: "persistent",
          internalSessionId: "server-derived-session",
        },
        signal,
      }),
    ).resolves.toEqual({ content: "真实模型回答", suggestedActions: [] });

    expect(circuit.execute).toHaveBeenCalledOnce();
    expect(runClient.runAgent).toHaveBeenCalledExactlyOnceWith({
      message:
        "当前页面路径（仅作位置上下文，不代表已读取页面内容）：/产品/码多多\n\n用户问题：不要改写我的问题 ✅",
      sessionId: "server-derived-session",
      signal,
    });
    expect(runClient.deleteSession).not.toHaveBeenCalled();
  });

  it("creates and always cleans an ephemeral internal session without forwarding a browser signal", async () => {
    const { provider, runClient } = fixture();

    await expect(
      provider.reply({
        request: assistantRequest,
        session: { kind: "ephemeral" },
        signal: AbortSignal.abort("browser-owned-abort"),
      }),
    ).resolves.toEqual({ content: "真实模型回答", suggestedActions: [] });

    expect(runClient.runAgent).toHaveBeenCalledExactlyOnceWith({
      message:
        "当前页面路径（仅作位置上下文，不代表已读取页面内容）：/产品/码多多\n\n用户问题：不要改写我的问题 ✅",
      sessionId: "ephemeral-internal-id",
    });
    expect(runClient.deleteSession).toHaveBeenCalledExactlyOnceWith(
      "ephemeral-internal-id",
    );
  });

  it.each(["timeout", "transport_error"] as const)(
    "cleans the ephemeral session after a %s run failure and preserves the sanitized run error",
    async (code) => {
      const runError = Object.assign(new Error("safe run failure"), { code });
      const { provider, runClient } = fixture({
        runAgent: vi.fn().mockRejectedValue(runError),
      });

      await expect(
        provider.reply({
          request: assistantRequest,
          session: { kind: "ephemeral" },
        }),
      ).rejects.toBe(runError);
      expect(runClient.deleteSession).toHaveBeenCalledExactlyOnceWith(
        "ephemeral-internal-id",
      );
    },
  );

  it("does not replace a valid reply when cleanup fails and records only a stable category/count", async () => {
    const { provider, cleanupRecorder } = fixture({
      deleteSession: vi
        .fn()
        .mockRejectedValue(
          new Error("raw session-id prompt reply url and secret"),
        ),
    });

    await expect(
      provider.reply({
        request: assistantRequest,
        session: { kind: "ephemeral" },
      }),
    ).resolves.toEqual({ content: "真实模型回答", suggestedActions: [] });
    expect(cleanupRecorder).toHaveBeenCalledExactlyOnceWith({
      category: "ephemeral_session_cleanup_failed",
      count: 1,
    });
    expect(JSON.stringify(cleanupRecorder.mock.calls)).not.toMatch(
      /ephemeral-internal-id|不要改写|真实模型回答|raw|url|secret/iu,
    );
  });

  it("does not replace the original run failure when cleanup also fails", async () => {
    const runError = Object.assign(new Error("safe run failure"), {
      code: "timeout",
    });
    const { provider, cleanupRecorder } = fixture({
      runAgent: vi.fn().mockRejectedValue(runError),
      deleteSession: vi.fn().mockRejectedValue(new Error("raw cleanup cause")),
    });

    await expect(
      provider.reply({
        request: assistantRequest,
        session: { kind: "ephemeral" },
      }),
    ).rejects.toBe(runError);
    expect(cleanupRecorder).toHaveBeenCalledExactlyOnceWith({
      category: "ephemeral_session_cleanup_failed",
      count: 1,
    });
  });
});

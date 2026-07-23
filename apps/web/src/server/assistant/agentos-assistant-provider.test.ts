import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentOSRunClientError,
  type AgentOSRunClient,
} from "./agentos-run-client";
import type { AgentOSExecutionCircuit } from "./agentos-execution-circuit";
import {
  AgentOSAssistantProvider,
  defaultAgentOSCleanupRecorder,
  type AgentOSCleanupFailureEvent,
  type AgentOSCleanupRecorder,
} from "./agentos-assistant-provider";

function fixture(
  options: {
    runAgent?: AgentOSRunClient["runAgent"];
    runAgentStream?: AgentOSRunClient["runAgentStream"];
    deleteSession?: AgentOSRunClient["deleteSession"];
    randomUUID?: () => string;
    cleanupRecorder?: AgentOSCleanupRecorder;
    runFailureRecorder?: (event: {
      code: string;
      diagnostic: string | null;
    }) => void;
    useDefaultCleanupRecorder?: boolean;
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
    deleteSession: vi.fn(options.deleteSession ?? (async () => undefined)),
  };
  const circuit: AgentOSExecutionCircuit = {
    execute: vi.fn((operation) => operation()),
    inspect: () => ({ state: "closed", consecutiveFailures: 0 }),
  };
  const cleanupRecorder = vi.fn(options.cleanupRecorder);
  const runFailureRecorder = vi.fn(options.runFailureRecorder);
  const provider = new AgentOSAssistantProvider({
    runClient,
    circuit,
    randomUUID: options.randomUUID ?? (() => "ephemeral-internal-id"),
    ...(options.useDefaultCleanupRecorder ? {} : { cleanupRecorder }),
    runFailureRecorder,
  });
  return {
    provider,
    runClient,
    circuit,
    cleanupRecorder,
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
        session: {
          kind: "persistent",
          internalSessionId: "private-session",
        },
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

  it("projects default cleanup logs onto the fixed safe event shape", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const augmentedEvent = {
      category: "persistent_session_cleanup_failed",
      count: 7,
      raw: "private Cookie session prompt reply URL and key",
    } as AgentOSCleanupFailureEvent & { raw: string };

    defaultAgentOSCleanupRecorder(augmentedEvent);

    expect(warning).toHaveBeenCalledExactlyOnceWith(
      "Assistant session cleanup failed",
      { category: "persistent_session_cleanup_failed", count: 7 },
    );
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(
      /private|cookie|session prompt|reply|url|key/iu,
    );
  });

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
    expect(runClient.runAgentStream).toHaveBeenCalledExactlyOnceWith({
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

    expect(runClient.runAgentStream).toHaveBeenCalledExactlyOnceWith({
      message:
        "当前页面路径（仅作位置上下文，不代表已读取页面内容）：/产品/码多多\n\n用户问题：不要改写我的问题 ✅",
      sessionId: "ephemeral-internal-id",
    });
    expect(runClient.deleteSession).toHaveBeenCalledExactlyOnceWith(
      "ephemeral-internal-id",
    );
  });

  it("uses the platform UUID generator without losing its receiver", async () => {
    const runClient: AgentOSRunClient = {
      runAgent: vi.fn(async () => ({ content: "真实模型回答" })),
      runAgentStream: vi.fn(async function* () {
        yield "真实模型回答";
      }),
      deleteSession: vi.fn(async () => undefined),
    };
    const circuit: AgentOSExecutionCircuit = {
      execute: vi.fn((operation) => operation()),
      inspect: () => ({ state: "closed", consecutiveFailures: 0 }),
    };
    const provider = new AgentOSAssistantProvider({ runClient, circuit });

    await expect(
      provider.reply({
        request: assistantRequest,
        session: { kind: "ephemeral" },
      }),
    ).resolves.toMatchObject({ content: "真实模型回答" });

    const sessionId = vi.mocked(runClient.runAgentStream).mock.calls[0]?.[0]
      .sessionId;
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(runClient.deleteSession).toHaveBeenCalledExactlyOnceWith(sessionId);
  });

  it.each(["timeout", "transport_error"] as const)(
    "cleans the ephemeral session after a %s run failure and preserves the sanitized run error",
    async (code) => {
      const runError = Object.assign(new Error("safe run failure"), { code });
      const { provider, runClient } = fixture({
        runAgentStream: vi.fn(async function* () {
          throw runError;
        }),
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
      runAgentStream: vi.fn(async function* () {
        throw runError;
      }),
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

  it("uses the production cleanup recorder by default without exposing cleanup inputs", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("raw logger failure");
    });
    const { provider } = fixture({
      useDefaultCleanupRecorder: true,
      deleteSession: vi
        .fn()
        .mockRejectedValue(
          new Error("raw session-id prompt reply URL and secret"),
        ),
    });

    await expect(
      provider.reply({
        request: assistantRequest,
        session: { kind: "ephemeral" },
      }),
    ).resolves.toEqual({ content: "真实模型回答", suggestedActions: [] });
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      "Assistant session cleanup failed",
      { category: "ephemeral_session_cleanup_failed", count: 1 },
    );
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(
      /ephemeral-internal-id|不要改写|真实模型回答|raw|url|secret/iu,
    );
  });

  it("keeps the original run failure when the default cleanup logger throws", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("raw logger failure");
    });
    const runError = Object.assign(new Error("safe run failure"), {
      code: "timeout",
    });
    const { provider } = fixture({
      useDefaultCleanupRecorder: true,
      runAgentStream: vi.fn(async function* () {
        throw runError;
      }),
      deleteSession: vi.fn().mockRejectedValue(new Error("raw cleanup cause")),
    });

    await expect(
      provider.reply({
        request: assistantRequest,
        session: { kind: "ephemeral" },
      }),
    ).rejects.toBe(runError);
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      "Assistant session cleanup failed",
      { category: "ephemeral_session_cleanup_failed", count: 1 },
    );
  });
});

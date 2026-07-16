import "server-only";

import type {
  AssistantProvider,
  AssistantProviderInvocation,
  AssistantProviderReply,
} from "./assistant-provider";
import type { AgentOSExecutionCircuit } from "./agentos-execution-circuit";
import type { AgentOSRunClient } from "./agentos-run-client";

export type AgentOSCleanupFailureCategory =
  | "ephemeral_session_cleanup_failed"
  | "persistent_session_cleanup_failed";

export type AgentOSCleanupFailureEvent = {
  category: AgentOSCleanupFailureCategory;
  count: number;
};

export type AgentOSCleanupRecorder = (
  event: AgentOSCleanupFailureEvent,
) => void;

export const defaultAgentOSCleanupRecorder: AgentOSCleanupRecorder = (
  event,
) => {
  try {
    console.warn("Assistant session cleanup failed", {
      category: event.category,
      count: event.count,
    });
  } catch {
    // Observability must never replace the user-visible result.
  }
};

export class AgentOSAssistantProvider implements AssistantProvider {
  private cleanupFailureCount = 0;

  constructor(
    private readonly options: {
      runClient: AgentOSRunClient;
      circuit: AgentOSExecutionCircuit;
      randomUUID?: () => string;
      cleanupRecorder?: AgentOSCleanupRecorder;
    },
  ) {}

  private async run(
    invocation: AssistantProviderInvocation,
    sessionId: string,
    includeSignal: boolean,
  ): Promise<AssistantProviderReply> {
    const message = `当前页面路径（仅作位置上下文，不代表已读取页面内容）：${invocation.request.context.pathname}\n\n用户问题：${invocation.request.message}`;
    const reply = await this.options.circuit.execute(() =>
      this.options.runClient.runAgent({
        message,
        sessionId,
        ...(includeSignal ? { signal: invocation.signal } : {}),
      }),
    );
    return { content: reply.content, suggestedActions: [] };
  }

  private recordCleanupFailure(): void {
    this.cleanupFailureCount += 1;
    try {
      (this.options.cleanupRecorder ?? defaultAgentOSCleanupRecorder)({
        category: "ephemeral_session_cleanup_failed",
        count: this.cleanupFailureCount,
      });
    } catch {
      // Cleanup recording cannot replace a reply or the original run error.
    }
  }

  async reply(
    invocation: AssistantProviderInvocation,
  ): Promise<AssistantProviderReply> {
    if (invocation.session.kind === "persistent") {
      return this.run(invocation, invocation.session.internalSessionId, true);
    }

    const sessionId = (this.options.randomUUID ?? crypto.randomUUID)();
    try {
      return await this.run(invocation, sessionId, false);
    } finally {
      try {
        await this.options.runClient.deleteSession(sessionId);
      } catch {
        this.recordCleanupFailure();
      }
    }
  }
}

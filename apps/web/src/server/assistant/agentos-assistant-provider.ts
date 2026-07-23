import "server-only";

import type {
  AssistantProvider,
  AssistantProviderInvocation,
  AssistantProviderReply,
} from "./assistant-provider";
import type { AgentOSExecutionCircuit } from "./agentos-execution-circuit";
import {
  AgentOSRunClientError,
  type AgentOSRunClient,
  type AgentOSRunClientErrorCode,
  type AgentOSRunDiagnostic,
} from "./agentos-run-client";

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

export type AgentOSRunFailureEvent = {
  code: AgentOSRunClientErrorCode | "unexpected";
  diagnostic: AgentOSRunDiagnostic | null;
};

export type AgentOSRunFailureRecorder = (event: AgentOSRunFailureEvent) => void;

export const defaultAgentOSRunFailureRecorder: AgentOSRunFailureRecorder = (
  event,
) => {
  try {
    console.warn("Assistant AgentOS run failed", {
      code: event.code,
      diagnostic: event.diagnostic,
    });
  } catch {
    // Observability must never replace the original run failure.
  }
};

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
      runFailureRecorder?: AgentOSRunFailureRecorder;
    },
  ) {}

  private async *runStream(
    invocation: AssistantProviderInvocation,
    sessionId: string,
    includeSignal: boolean,
  ): AsyncIterable<string> {
    const message = `当前页面路径（仅作位置上下文，不代表已读取页面内容）：${invocation.request.context.pathname}\n\n用户问题：${invocation.request.message}`;
    const iterator = this.options.runClient
      .runAgentStream({
        message,
        sessionId,
        ...(includeSignal ? { signal: invocation.signal } : {}),
      })
      [Symbol.asyncIterator]();
    type QueueItem =
      | { kind: "chunk"; value: string }
      | { kind: "done" }
      | { kind: "error"; error: unknown };
    const queue: QueueItem[] = [];
    let wake: (() => void) | null = null;
    const push = (item: QueueItem) => {
      queue.push(item);
      wake?.();
      wake = null;
    };
    const take = async (): Promise<QueueItem> => {
      while (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      return queue.shift()!;
    };
    const execution = this.options.circuit.execute(async () => {
      try {
        while (true) {
          const next = await iterator.next();
          if (next.done) return;
          push({ kind: "chunk", value: next.value });
        }
      } catch (error) {
        this.recordRunFailure(error);
        throw error;
      }
    });
    void execution.then(
      () => push({ kind: "done" }),
      (error: unknown) => push({ kind: "error", error }),
    );
    try {
      while (true) {
        const item = await take();
        if (item.kind === "done") return;
        if (item.kind === "error") throw item.error;
        yield item.value;
      }
    } finally {
      await iterator.return?.();
      await execution.catch(() => undefined);
    }
  }

  private recordRunFailure(error: unknown): void {
    const event: AgentOSRunFailureEvent =
      error instanceof AgentOSRunClientError
        ? {
            code: error.code,
            diagnostic: error.diagnostic ?? null,
          }
        : { code: "unexpected", diagnostic: null };
    try {
      (this.options.runFailureRecorder ?? defaultAgentOSRunFailureRecorder)(
        event,
      );
    } catch {
      // Failure recording cannot replace the original run error.
    }
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

  async *streamReply(
    invocation: AssistantProviderInvocation,
  ): AsyncIterable<string> {
    if (invocation.session.kind === "persistent") {
      yield* this.runStream(
        invocation,
        invocation.session.internalSessionId,
        true,
      );
      return;
    }

    const sessionId = (
      this.options.randomUUID ?? (() => crypto.randomUUID())
    )();
    try {
      yield* this.runStream(invocation, sessionId, false);
    } finally {
      try {
        await this.options.runClient.deleteSession(sessionId);
      } catch {
        this.recordCleanupFailure();
      }
    }
  }

  async reply(
    invocation: AssistantProviderInvocation,
  ): Promise<AssistantProviderReply> {
    let content = "";
    for await (const chunk of this.streamReply(invocation)) content += chunk;
    return { content, suggestedActions: [] };
  }
}

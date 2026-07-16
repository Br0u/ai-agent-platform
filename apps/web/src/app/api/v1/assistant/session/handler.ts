import "server-only";

import {
  getAnonymousSessionManager,
  type AnonymousSessionManager,
} from "@/server/assistant/anonymous-session";
import {
  resolveAssistantActor,
  type AssistantActor,
} from "@/server/assistant/assistant-actor";
import {
  getAssistantRuntime,
  type AssistantRuntime,
} from "@/server/assistant/assistant-runtime";
import {
  defaultAgentOSCleanupRecorder,
  type AgentOSCleanupRecorder,
} from "@/server/assistant/agentos-assistant-provider";

export type DeleteInternalAssistantSession = (
  internalSessionId: string,
) => Promise<void>;

export const placeholderAssistantSessionDeletion: DeleteInternalAssistantSession =
  async () => {
    // Placeholder replies are not persisted, so there is no remote session.
  };

type AssistantSessionDeleteDependencies = {
  manager?: AnonymousSessionManager;
  resolveActor?: (request: Request) => Promise<AssistantActor>;
  deleteInternalSession?: DeleteInternalAssistantSession;
  getRuntime?: () => Pick<AssistantRuntime, "deleteSession">;
  recordCleanupFailure?: AgentOSCleanupRecorder;
};

export function createAssistantSessionDeleteHandler(
  dependencies: AssistantSessionDeleteDependencies = {},
) {
  let cleanupFailureCount = 0;

  function recordCleanupFailure(): void {
    cleanupFailureCount += 1;
    try {
      (dependencies.recordCleanupFailure ?? defaultAgentOSCleanupRecorder)({
        category: "persistent_session_cleanup_failed",
        count: cleanupFailureCount,
      });
    } catch {
      // Observability must never replace the safe Cookie-clearing response.
    }
  }

  return async function DELETE(request: Request): Promise<Response> {
    const manager = dependencies.manager ?? getAnonymousSessionManager();
    const clearCookie = manager.clearCookie();
    let actor: AssistantActor;
    try {
      actor = await (dependencies.resolveActor ?? resolveAssistantActor)(
        request,
      );
    } catch {
      return new Response(null, {
        status: 204,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": clearCookie,
        },
      });
    }

    const inspected = manager.inspect(request.headers, actor);
    if (inspected.kind === "valid") {
      try {
        await (
          dependencies.deleteInternalSession ??
          ((internalSessionId) =>
            (
              dependencies.getRuntime?.() ?? getAssistantRuntime()
            ).deleteSession(internalSessionId))
        )(inspected.internalSessionId);
      } catch {
        recordCleanupFailure();
      }
    }

    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearCookie,
      },
    });
  };
}

export const assistantSessionDeleteHandler =
  createAssistantSessionDeleteHandler();

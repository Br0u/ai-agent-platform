import "server-only";

import {
  getAnonymousSessionManager,
  type AnonymousSessionManager,
} from "@/server/assistant/anonymous-session";
import {
  resolveAssistantActor,
  type AssistantActor,
} from "@/server/assistant/assistant-actor";

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
};

export function createAssistantSessionDeleteHandler(
  dependencies: AssistantSessionDeleteDependencies = {},
) {
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
          placeholderAssistantSessionDeletion
        )(inspected.internalSessionId);
      } catch {
        // Clearing the browser credential remains safe even if a future
        // internal persistence adapter is temporarily unavailable.
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

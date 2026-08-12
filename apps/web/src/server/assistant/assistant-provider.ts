import "server-only";

import type {
  AssistantStreamActionEvent,
  AssistantStreamActivityEvent,
  AssistantStreamAnswerDeltaEvent,
  AssistantProviderReply,
  AssistantRequest,
} from "@/features/assistant/assistant-contract";
import type { PublicPageContext } from "./public-page-context";

export type { AssistantProviderReply } from "@/features/assistant/assistant-contract";

export type AssistantProviderInvocation = {
  request: AssistantRequest;
  pageContext: PublicPageContext | null;
  signal?: AbortSignal;
};

export type AssistantProviderEvent =
  | AssistantStreamActivityEvent
  | AssistantStreamAnswerDeltaEvent
  | AssistantStreamActionEvent;

export interface AssistantProvider {
  reply(
    invocation: AssistantProviderInvocation,
  ): Promise<AssistantProviderReply>;
  streamReply?(
    invocation: AssistantProviderInvocation,
  ): AsyncIterable<AssistantProviderEvent>;
}

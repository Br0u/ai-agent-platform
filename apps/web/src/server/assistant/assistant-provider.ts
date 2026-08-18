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

const ASSISTANT_NAVIGATION_INTENT = /(?:了解|查看|打开|前往|进入|跳转到|去)/u;

export function isAssistantNavigationIntent(message: string): boolean {
  return ASSISTANT_NAVIGATION_INTENT.test(message);
}

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

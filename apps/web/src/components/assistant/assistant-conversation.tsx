"use client";

import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useRef } from "react";
import type { AssistantSession } from "./use-assistant-session";
import { AssistantActivity } from "./assistant-activity";
import { AssistantMarkdown } from "./assistant-markdown";
import { AssistantOrb } from "./assistant-orb";
import {
  AssistantPromptInput,
  type AssistantPromptSubmit,
} from "./assistant-prompt-input";
import "./assistant-conversation.css";

const FAILURE_MESSAGE = "发送失败，请重试或使用帮助中心或商务咨询。";
const FOLLOW_LATEST_THRESHOLD = 48;

type AssistantConversationProps = {
  ariaLabel: string;
  registerComposer: (element: HTMLElement) => () => void;
  session: AssistantSession;
  variant: "workspace";
};

export function AssistantConversation({
  ariaLabel,
  registerComposer,
  session,
  variant,
}: AssistantConversationProps) {
  const router = useRouter();
  const sending = session.requestStatus === "sending";
  const currentAssistantMessage = session.messages.findLast(
    (message) => message.role === "assistant",
  );
  const currentAssistantMessageId = currentAssistantMessage?.id;
  const messageHistoryRef = useRef<HTMLDivElement>(null);
  const lastScrolledAssistantMessageId = useRef<number | undefined>(undefined);
  const followingLatest = useRef(true);
  const hasError = session.validationError !== null;
  const requestFailed = session.requestStatus === "failed";
  const liveAnnouncement =
    session.validationError?.message ?? session.latestAnnouncement;
  const registerTextarea = useCallback(
    (element: HTMLTextAreaElement) => registerComposer(element),
    [registerComposer],
  );

  useLayoutEffect(() => {
    if (!sending || currentAssistantMessageId === undefined) return;
    if (lastScrolledAssistantMessageId.current !== currentAssistantMessageId) {
      lastScrolledAssistantMessageId.current = currentAssistantMessageId;
      followingLatest.current = true;
    }
    const messageHistory = messageHistoryRef.current;
    if (messageHistory !== null && followingLatest.current) {
      messageHistory.scrollTop = messageHistory.scrollHeight;
    }
  }, [currentAssistantMessage, currentAssistantMessageId, sending]);

  const handleMessageHistoryScroll = useCallback(() => {
    const messageHistory = messageHistoryRef.current;
    if (messageHistory === null) return;
    followingLatest.current =
      messageHistory.scrollHeight -
        messageHistory.clientHeight -
        messageHistory.scrollTop <=
      FOLLOW_LATEST_THRESHOLD;
  }, []);

  const handlePromptSubmit = ({
    value,
    attachments,
  }: AssistantPromptSubmit) => {
    if (attachments.length > 0) return;
    void session.submit(value);
  };

  return (
    <section
      className="assistant-conversation"
      data-testid="assistant-conversation"
      data-variant={variant}
    >
      <div
        aria-label={ariaLabel}
        aria-live="off"
        aria-relevant="additions"
        className="assistant-conversation__messages"
        data-testid="assistant-message-history"
        onScroll={handleMessageHistoryScroll}
        ref={messageHistoryRef}
        role="log"
      >
        {session.messages.map((message) => (
          <article
            aria-label={
              message.role === "assistant" ? "码多多的消息" : "你的消息"
            }
            className={`assistant-conversation__message assistant-conversation__message--${message.role}`}
            key={message.id}
          >
            {message.role === "assistant" ? (
              <AssistantOrb
                size={20}
                state={
                  sending && message.id === currentAssistantMessageId
                    ? (message.activities.at(-1)?.phase ?? "analyzing")
                    : "completed"
                }
              />
            ) : (
              <span
                aria-hidden="true"
                className="assistant-conversation__user-mark"
              />
            )}
            {message.role === "assistant" ? (
              <AssistantActivity
                activities={message.activities}
                inProgress={sending && message.id === currentAssistantMessageId}
              />
            ) : null}
            <div className="assistant-conversation__message-body">
              {message.role === "assistant" ? (
                <>
                  {message.content ? (
                    <AssistantMarkdown content={message.content} />
                  ) : null}
                </>
              ) : (
                <p>{message.content}</p>
              )}
              {message.role === "assistant" && message.incomplete ? (
                <small className="assistant-conversation__incomplete">
                  回答未完成
                </small>
              ) : null}
              {message.role === "assistant" &&
              (message.actions.length > 0 ||
                message.suggestedActions.length > 0) ? (
                <nav aria-label="建议操作">
                  {[
                    ...message.actions.map((action) => ({
                      label: action.label,
                      pathname: action.pathname,
                    })),
                    ...message.suggestedActions.map((action) => ({
                      label: action.label,
                      pathname: action.href,
                    })),
                  ].map((action, actionIndex) => (
                    <button
                      key={`${action.label}:${action.pathname}:${actionIndex}`}
                      onClick={() => router.push(action.pathname)}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))}
                </nav>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <div
        aria-atomic="true"
        className="assistant-conversation__announcement"
        role={hasError || requestFailed ? "alert" : "status"}
      >
        {liveAnnouncement}
      </div>

      <div className="assistant-conversation__composer-wrap">
        <AssistantPromptInput
          ariaLabel={ariaLabel}
          disabled={sending}
          inputLabel="输入问题"
          onChange={session.setDraft}
          onSubmit={handlePromptSubmit}
          registerComposer={registerTextarea}
          validationMessage={
            session.validationError?.message ??
            (requestFailed
              ? session.latestAnnouncement || FAILURE_MESSAGE
              : undefined)
          }
          value={session.draft}
          variant={variant}
        />
        {session.requestStatus === "failed" &&
        session.lastFailedMessage !== null ? (
          <button
            className="assistant-conversation__retry"
            onClick={() => void session.retry()}
            type="button"
          >
            重试
          </button>
        ) : null}
      </div>
    </section>
  );
}

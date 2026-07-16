"use client";

import Link from "next/link";
import { useCallback } from "react";
import type { AssistantSession } from "./use-assistant-session";
import {
  AssistantPromptInput,
  type AssistantPromptSubmit,
} from "./assistant-prompt-input";
import "./assistant-conversation.css";

const FAILURE_MESSAGE = "发送失败，请重试或使用帮助中心或商务咨询。";

type AssistantConversationProps = {
  ariaLabel: string;
  registerComposer: (element: HTMLElement) => () => void;
  session: AssistantSession;
  variant: "dock" | "workspace";
};

export function AssistantConversation({
  ariaLabel,
  registerComposer,
  session,
  variant,
}: AssistantConversationProps) {
  const sending = session.requestStatus === "sending";
  const hasError = session.validationError !== null;
  const requestFailed = session.requestStatus === "failed";
  const liveAnnouncement =
    session.validationError?.message ?? session.latestAnnouncement;
  const registerTextarea = useCallback(
    (element: HTMLTextAreaElement) => registerComposer(element),
    [registerComposer],
  );

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
              <span
                aria-hidden="true"
                className="assistant-conversation__assistant-mark"
              />
            ) : (
              <span
                aria-hidden="true"
                className="assistant-conversation__user-mark"
              />
            )}
            <div>
              <p>{message.content}</p>
              {message.role === "assistant" &&
              message.suggestedActions.length > 0 ? (
                <nav aria-label="建议操作">
                  {message.suggestedActions.map((action, actionIndex) => (
                    <Link
                      href={action.href}
                      key={`${action.label}:${action.href}:${actionIndex}`}
                    >
                      {action.label}
                    </Link>
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
        {session.requestStatus === "failed" ? (
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

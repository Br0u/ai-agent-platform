"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useId, type FormEvent, type KeyboardEvent } from "react";
import type { AssistantSession } from "./use-assistant-session";
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
  const composerHelpId = useId();
  const composerId = useId();
  const sending = session.requestStatus === "sending";
  const hasError = session.validationError !== null;
  const registerTextarea = useCallback(
    (element: HTMLTextAreaElement | null) =>
      element === null ? undefined : registerComposer(element),
    [registerComposer],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void session.submit();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    void session.submit();
  };

  return (
    <section
      className="assistant-conversation"
      data-testid="assistant-conversation"
      data-variant={variant}
    >
      <div
        aria-label={ariaLabel}
        aria-live="polite"
        aria-relevant="additions"
        className="assistant-conversation__messages"
        data-testid="assistant-message-history"
        role="log"
      >
        {session.messages.map((message) => (
          <article
            aria-label={
              message.role === "assistant" ? "M 企业助理的消息" : "你的消息"
            }
            className={`assistant-conversation__message assistant-conversation__message--${message.role}`}
            key={message.id}
          >
            {message.role === "assistant" ? (
              <Image
                alt=""
                height={36}
                src="/assets/assistant/m-assistant.webp"
                width={36}
              />
            ) : (
              <span
                aria-hidden="true"
                className="assistant-conversation__user-mark"
              >
                YOU
              </span>
            )}
            <div>
              <p>{message.content}</p>
              {message.role === "assistant" &&
              message.suggestedActions.length > 0 ? (
                <nav aria-label="建议操作">
                  {message.suggestedActions.map((action) => (
                    <Link
                      href={action.href}
                      key={`${action.label}:${action.href}`}
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
        aria-live="polite"
        className="assistant-conversation__announcement"
        role="status"
      >
        {session.latestAnnouncement}
      </div>

      <div className="assistant-conversation__composer-wrap">
        <form className="assistant-conversation__composer" onSubmit={submit}>
          <label htmlFor={composerId}>输入问题</label>
          <textarea
            aria-describedby={composerHelpId}
            aria-invalid={hasError ? "true" : undefined}
            disabled={sending}
            id={composerId}
            onChange={(event) => session.setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="输入你的问题，Shift + Enter 换行"
            ref={registerTextarea}
            rows={2}
            value={session.draft}
          />
          <button disabled={sending || hasError} type="submit">
            {sending ? "发送中" : "发送"}
          </button>
          <p
            aria-live="polite"
            id={composerHelpId}
            role={
              hasError || session.requestStatus === "failed"
                ? "alert"
                : undefined
            }
          >
            {session.validationError?.message ??
              (session.requestStatus === "failed"
                ? session.latestAnnouncement || FAILURE_MESSAGE
                : "最多输入 500 个字符。当前对话不会保存为历史记录。")}
          </p>
          {session.requestStatus === "failed" ? (
            <button
              className="assistant-conversation__retry"
              onClick={() => void session.retry()}
              type="button"
            >
              重试
            </button>
          ) : null}
        </form>
      </div>
    </section>
  );
}

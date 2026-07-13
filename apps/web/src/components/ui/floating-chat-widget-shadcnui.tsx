"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BriefcaseBusiness,
  LifeBuoy,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import "./floating-chat-widget-shadcnui.css";

type SuggestedAction = {
  label: string;
  href: string;
};

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
  actions?: SuggestedAction[];
};

type AssistantResponse = {
  mode: "placeholder";
  message: string;
  suggestedActions: SuggestedAction[];
};

const PRESET_QUESTIONS = [
  "如何开始了解平台？",
  "如何获取部署支持？",
  "如何提交产品问题？",
] as const;

const INITIAL_MESSAGE: ChatMessage = {
  id: 0,
  role: "assistant",
  text: "你好，我是 M 助手。可以帮你查找平台文档、部署支持和产品问题入口。",
};

function isAssistantResponse(value: unknown): value is AssistantResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return (
    response.mode === "placeholder" &&
    typeof response.message === "string" &&
    Array.isArray(response.suggestedActions) &&
    response.suggestedActions.every(
      (action) =>
        typeof action === "object" &&
        action !== null &&
        typeof (action as Record<string, unknown>).label === "string" &&
        typeof (action as Record<string, unknown>).href === "string",
    )
  );
}

export function FloatingChatWidget({ pathname }: { pathname: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const nextMessageId = useRef(1);
  const titleId = useId();
  const prefersReducedMotion = useReducedMotion();
  const trimmedDraft = draft.trim();
  const characterCount = Array.from(trimmedDraft).length;
  const canSend =
    !isSending && trimmedDraft.length > 0 && characterCount <= 500;

  const closePanel = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closePanel, isOpen]);

  const sendMessage = useCallback(
    async (rawMessage: string, appendUserMessage: boolean) => {
      const message = rawMessage.trim();
      if (
        isSending ||
        message.length === 0 ||
        Array.from(message).length > 500
      ) {
        return;
      }

      if (appendUserMessage) {
        setMessages((current) => [
          ...current,
          { id: nextMessageId.current++, role: "user", text: message },
        ]);
      }
      setIsSending(true);
      setFailedMessage(null);

      try {
        const response = await fetch("/api/v1/assistant/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, context: { pathname } }),
        });
        const body: unknown = await response.json();
        if (!response.ok || !isAssistantResponse(body)) {
          throw new Error("Assistant response unavailable");
        }

        setMessages((current) => [
          ...current,
          {
            id: nextMessageId.current++,
            role: "assistant",
            text: body.message,
            actions: body.suggestedActions,
          },
        ]);
        setDraft((current) => (current.trim() === message ? "" : current));
      } catch {
        setDraft(message);
        setFailedMessage(message);
      } finally {
        setIsSending(false);
      }
    },
    [isSending, pathname],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) void sendMessage(trimmedDraft, true);
  };

  return (
    <div className="floating-assistant">
      <AnimatePresence>
        {isOpen ? (
          <motion.section
            key="assistant-panel"
            aria-labelledby={titleId}
            aria-modal="true"
            className="floating-assistant__panel"
            initial={
              prefersReducedMotion ? false : { opacity: 0, y: 18, scale: 0.96 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 18, scale: 0.96 }
            }
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            role="dialog"
          >
            <header className="floating-assistant__header">
              <div className="floating-assistant__identity">
                <span className="floating-assistant__avatar" aria-hidden="true">
                  <Sparkles size={20} strokeWidth={2} />
                </span>
                <div>
                  <h2 id={titleId}>M 助手</h2>
                  <p>
                    <span aria-hidden="true" />
                    AI 服务尚未接入
                  </p>
                </div>
              </div>
              <button
                aria-label="关闭 M 助手"
                className="floating-assistant__icon-button"
                onClick={closePanel}
                ref={closeRef}
                type="button"
              >
                <X size={18} />
              </button>
            </header>

            <div
              aria-live="polite"
              className="floating-assistant__messages"
              role="log"
            >
              {messages.map((message) => (
                <article
                  className={`floating-assistant__message floating-assistant__message--${message.role}`}
                  key={message.id}
                >
                  {message.role === "assistant" ? (
                    <span
                      className="floating-assistant__message-avatar"
                      aria-hidden="true"
                    >
                      M
                    </span>
                  ) : null}
                  <div className="floating-assistant__message-content">
                    <p>{message.text}</p>
                    {message.actions?.length ? (
                      <div className="floating-assistant__actions">
                        {message.actions.map((action) => (
                          <Link href={action.href} key={action.href}>
                            {action.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}

              {isSending ? (
                <div
                  className="floating-assistant__typing"
                  aria-label="M 助手正在回复"
                >
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}

              {failedMessage ? (
                <div className="floating-assistant__error" role="alert">
                  <span>消息发送失败，请重试。</span>
                  <button
                    disabled={isSending}
                    onClick={() => void sendMessage(failedMessage, false)}
                    type="button"
                  >
                    <RotateCcw size={14} />
                    重试
                  </button>
                </div>
              ) : null}
            </div>

            <div className="floating-assistant__presets" aria-label="常用问题">
              {PRESET_QUESTIONS.map((question) => (
                <button
                  disabled={isSending}
                  key={question}
                  onClick={() => void sendMessage(question, true)}
                  type="button"
                >
                  {question}
                </button>
              ))}
            </div>

            <footer className="floating-assistant__footer">
              <form onSubmit={handleSubmit}>
                <label className="sr-only" htmlFor={`${titleId}-input`}>
                  向 M 助手提问
                </label>
                <input
                  disabled={isSending}
                  id={`${titleId}-input`}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="输入你的问题"
                  type="text"
                  value={draft}
                />
                <button
                  aria-label="发送消息"
                  className="floating-assistant__send"
                  disabled={!canSend}
                  type="submit"
                >
                  <Send size={17} />
                </button>
              </form>
              <div className="floating-assistant__meta">
                <span className={characterCount > 500 ? "is-over-limit" : ""}>
                  {characterCount} / 500
                </span>
                <nav aria-label="M 助手兜底链接">
                  <Link href="/help">
                    <LifeBuoy size={14} />
                    帮助中心
                  </Link>
                  <Link href="/contact">
                    <BriefcaseBusiness size={14} />
                    商务咨询
                  </Link>
                </nav>
              </div>
            </footer>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <motion.button
        aria-expanded={isOpen}
        aria-label={isOpen ? "关闭 M 助手入口" : "打开 M 助手"}
        className={`floating-assistant__launcher${isOpen ? " is-open" : ""}`}
        onClick={() => (isOpen ? closePanel() : setIsOpen(true))}
        ref={launcherRef}
        type="button"
        whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
      >
        <span
          aria-hidden="true"
          className="floating-assistant__launcher-glow"
        />
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </motion.button>
    </div>
  );
}

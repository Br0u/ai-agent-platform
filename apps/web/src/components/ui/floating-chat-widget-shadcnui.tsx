"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
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
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type FormEvent,
} from "react";
import { ASSISTANT_PRESET_QUESTIONS } from "@/features/assistant/assistant-contract";
import { useAssistantExperience } from "../assistant/assistant-experience-provider";
import "./floating-chat-widget-shadcnui.css";

export function FloatingChatWidget({
  showLauncher = true,
}: {
  showLauncher?: boolean;
}) {
  const experience = useAssistantExperience();
  const { close, openQuickFrom, registerComposer, session, surface } =
    experience;
  const quickOpen = surface === "quick";
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const prefersReducedMotion = useReducedMotion();
  const sending = session.requestStatus === "sending";
  const characterCount = Array.from(session.draft.trim()).length;
  const overLimit = characterCount > 500;
  const canSend = !sending && characterCount > 0 && !overLimit;
  const closeFromEffect = useEffectEvent(close);
  const registerComposerFromEffect = useEffectEvent(registerComposer);

  useEffect(() => {
    if (!quickOpen) return;

    closeRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeFromEffect();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [quickOpen]);

  useEffect(() => {
    if (!quickOpen) return;
    registerComposerFromEffect(inputRef.current);
    return () => registerComposerFromEffect(null);
  }, [quickOpen]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) void session.submit();
  };

  return (
    <div className="floating-assistant">
      <AnimatePresence>
        {quickOpen ? (
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
                <span aria-hidden="true" className="floating-assistant__avatar">
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
                onClick={close}
                ref={closeRef}
                type="button"
              >
                <X size={18} />
              </button>
            </header>

            <div
              aria-live="polite"
              className="floating-assistant__messages"
              data-testid="assistant-history"
              role="log"
            >
              <article className="floating-assistant__message floating-assistant__message--assistant">
                <span
                  aria-hidden="true"
                  className="floating-assistant__message-avatar"
                >
                  M
                </span>
                <div className="floating-assistant__message-content">
                  <p>
                    你好，我是 M
                    助手。可以帮你查找平台文档、部署支持和产品问题入口。
                  </p>
                </div>
              </article>

              {session.messages.map((message) => (
                <article
                  className={`floating-assistant__message floating-assistant__message--${message.role}`}
                  key={`${message.role}-${message.id}`}
                >
                  {message.role === "assistant" ? (
                    <span
                      aria-hidden="true"
                      className="floating-assistant__message-avatar"
                    >
                      M
                    </span>
                  ) : null}
                  <div className="floating-assistant__message-content">
                    <p>{message.content}</p>
                    {message.role === "assistant" &&
                    message.suggestedActions.length > 0 ? (
                      <div className="floating-assistant__actions">
                        {message.suggestedActions.map((action) => (
                          <Link
                            href={action.href}
                            key={`${action.label}:${action.href}`}
                          >
                            {action.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}

              {sending ? (
                <div
                  aria-label="M 助手正在回复"
                  className="floating-assistant__typing"
                >
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}

              {session.requestStatus === "failed" ? (
                <div className="floating-assistant__error" role="alert">
                  <span>{session.latestAnnouncement}</span>
                  <button
                    disabled={sending}
                    onClick={() => void session.retry()}
                    type="button"
                  >
                    <RotateCcw size={14} />
                    重试
                  </button>
                </div>
              ) : null}
            </div>

            <div aria-label="常用问题" className="floating-assistant__presets">
              {ASSISTANT_PRESET_QUESTIONS.map((question) => (
                <button
                  disabled={sending}
                  key={question}
                  onClick={() => void session.submit(question)}
                  type="button"
                >
                  {question}
                </button>
              ))}
            </div>

            <footer className="floating-assistant__footer">
              <form onSubmit={submit}>
                <label className="sr-only" htmlFor={`${titleId}-input`}>
                  向 M 助手提问
                </label>
                <input
                  aria-invalid={overLimit ? "true" : undefined}
                  disabled={sending}
                  id={`${titleId}-input`}
                  onChange={(event) => session.setDraft(event.target.value)}
                  placeholder="输入你的问题"
                  ref={inputRef}
                  type="text"
                  value={session.draft}
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
              <Link className="floating-assistant__full-link" href="/assistant">
                <MessageSquare size={14} />
                打开完整 AI 助理
                <ArrowUpRight size={13} />
              </Link>
              <div className="floating-assistant__meta">
                <span className={overLimit ? "is-over-limit" : ""}>
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

      {showLauncher ? (
        <motion.button
          aria-expanded={quickOpen}
          aria-label={quickOpen ? "关闭 M 助手入口" : "打开 M 助手"}
          className={`floating-assistant__launcher${quickOpen ? " is-open" : ""}`}
          onClick={() => {
            if (quickOpen) {
              close();
            } else if (launcherRef.current) {
              openQuickFrom(launcherRef.current);
            }
          }}
          ref={launcherRef}
          type="button"
          whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
        >
          <span
            aria-hidden="true"
            className="floating-assistant__launcher-glow"
          />
          {quickOpen ? <X size={24} /> : <MessageSquare size={24} />}
        </motion.button>
      ) : null}
    </div>
  );
}

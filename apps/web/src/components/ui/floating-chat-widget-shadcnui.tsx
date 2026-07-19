"use client";

import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "framer-motion";
import {
  BriefcaseBusiness,
  LifeBuoy,
  MessageSquare,
  PanelRightOpen,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { ASSISTANT_PRESET_QUESTIONS } from "@/features/assistant/assistant-contract";
import { useAssistantExperience } from "../assistant/assistant-experience-provider";
import {
  AssistantPromptInput,
  type AssistantPromptSubmit,
} from "../assistant/assistant-prompt-input";
import { getAssistantServicePresentation } from "../assistant/assistant-service-presentation";
import "./floating-chat-widget-shadcnui.css";

function QuickSurfaceLifecycle({
  closeRef,
  instanceVersion,
  panelRef,
}: {
  closeRef: RefObject<HTMLButtonElement | null>;
  instanceVersion: number;
  panelRef: RefObject<HTMLElement | null>;
}) {
  const isPresent = useIsPresent();
  const {
    close,
    completeSurfaceExit,
    registerQuickFocusTarget,
    surface,
    surfaceInstanceVersion,
  } = useAssistantExperience();
  const requestCloseFromEffect = useEffectEvent(() => {
    if (surface === "quick" && surfaceInstanceVersion === instanceVersion) {
      close();
    }
  });
  const completeExitFromEffect = useEffectEvent(() =>
    completeSurfaceExit("quick", instanceVersion),
  );

  useLayoutEffect(() => {
    if (isPresent) return;
    const panel = panelRef.current;
    if (panel === null) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && panel.contains(activeElement)) {
      activeElement.blur();
    }
    panel.setAttribute("inert", "");
    panel.setAttribute("aria-hidden", "true");
    panel.removeAttribute("aria-labelledby");
    panel.removeAttribute("aria-modal");
    panel.removeAttribute("role");
    panel.classList.add("is-exiting");
  }, [isPresent, panelRef]);

  useEffect(() => {
    const closeTarget = closeRef.current;
    const unregisterQuickFocusTarget =
      closeTarget === null
        ? undefined
        : registerQuickFocusTarget(closeTarget, instanceVersion);
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") requestCloseFromEffect();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unregisterQuickFocusTarget?.();
      completeExitFromEffect();
    };
  }, [closeRef, instanceVersion, registerQuickFocusTarget]);

  return null;
}

function QuickSurfacePanel({ instanceVersion }: { instanceVersion: number }) {
  const {
    close,
    hasResolvedServiceState,
    quickInteractionReady,
    refreshingServiceState,
    registerComposer,
    serviceState,
    session,
  } = useAssistantExperience();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const titleId = useId();
  const prefersReducedMotion = useReducedMotion();
  const sending = session.requestStatus === "sending";
  const servicePresentation = getAssistantServicePresentation({
    serviceState,
    hasResolvedServiceState,
    refreshingServiceState,
  });
  const handlePromptSubmit = ({
    attachments,
    value,
  }: AssistantPromptSubmit) => {
    if (attachments.length > 0) return;
    void session.submit(value);
  };

  return (
    <motion.section
      aria-hidden={quickInteractionReady ? undefined : "true"}
      aria-labelledby={quickInteractionReady ? titleId : undefined}
      aria-modal={quickInteractionReady ? "true" : undefined}
      className={`floating-assistant__panel${quickInteractionReady ? "" : " is-blocked"}`}
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
      inert={!quickInteractionReady}
      ref={panelRef}
      role={quickInteractionReady ? "dialog" : undefined}
    >
      <QuickSurfaceLifecycle
        closeRef={closeRef}
        instanceVersion={instanceVersion}
        panelRef={panelRef}
      />
      <header className="floating-assistant__header">
        <div className="floating-assistant__identity">
          <span aria-hidden="true" className="floating-assistant__avatar">
            <Sparkles size={20} strokeWidth={2} />
          </span>
          <div>
            <h2 id={titleId}>码多多</h2>
            <p
              aria-atomic="true"
              aria-busy={refreshingServiceState}
              aria-live="polite"
              data-capability={serviceState.capability}
              data-testid="assistant-quick-service-state"
              role="status"
            >
              <span aria-hidden="true" />
              {servicePresentation.compactLabel}
            </p>
          </div>
        </div>
        <div className="floating-assistant__header-actions">
          <button
            aria-label="展开码多多工作区"
            className="floating-assistant__icon-button"
            onClick={() => router.push("/assistant")}
            type="button"
          >
            <PanelRightOpen aria-hidden="true" size={18} />
          </button>
          <button
            aria-label="关闭码多多"
            className="floating-assistant__icon-button"
            onClick={close}
            ref={closeRef}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div
        aria-label="码多多对话"
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
            <p>你好，我是码多多。当前尚未接入 Skill、知识库或网页正文读取。</p>
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
            aria-label="码多多正在回复"
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
        <AssistantPromptInput
          ariaLabel="码多多对话"
          disabled={sending}
          inputLabel="向码多多提问"
          onChange={session.setDraft}
          onSubmit={handlePromptSubmit}
          registerComposer={registerComposer}
          submitLabel="发送消息"
          value={session.draft}
          variant="quick"
        />
        <div className="floating-assistant__meta">
          <nav aria-label="码多多兜底链接">
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
  );
}

export function FloatingChatWidget({
  showLauncher = true,
}: {
  showLauncher?: boolean;
}) {
  const { close, openQuickFrom, surface, surfaceInstanceVersion } =
    useAssistantExperience();
  const quickOpen = surface === "quick";
  const launcherRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="floating-assistant">
      <AnimatePresence>
        {quickOpen ? (
          <QuickSurfacePanel
            instanceVersion={surfaceInstanceVersion}
            key={`assistant-panel-${surfaceInstanceVersion}`}
          />
        ) : null}
      </AnimatePresence>

      {showLauncher ? (
        <motion.button
          aria-expanded={quickOpen}
          aria-label={quickOpen ? "关闭码多多入口" : "打开码多多"}
          className={`floating-assistant__launcher${quickOpen ? " is-open" : ""}`}
          onClick={() => {
            if (quickOpen) {
              close();
            } else if (launcherRef.current) {
              openQuickFrom(launcherRef.current);
            }
          }}
          ref={launcherRef}
          tabIndex={0}
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

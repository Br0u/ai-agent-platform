"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  ChevronRight,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { ASSISTANT_PRESET_QUESTIONS } from "@/features/assistant/assistant-contract";
import { AssistantConversation } from "./assistant-conversation";
import { useAssistantExperience } from "./assistant-experience-provider";
import { useAssistantDockSize } from "./use-assistant-dock-size";
import "./assistant-dock.css";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function serviceLabel({
  capability,
  live,
  ready,
}: {
  capability: "placeholder" | "available" | "degraded";
  live: boolean;
  ready: boolean;
}) {
  if (capability === "degraded" || !live) return "基础服务暂不可用";
  if (capability === "placeholder" && ready) return "模型尚未配置";
  if (capability === "available" && ready) return "服务已就绪";
  return "服务未就绪";
}

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      !element.closest("[hidden]") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

function restoreAttribute(
  element: HTMLElement,
  name: string,
  previousValue: string | null,
) {
  if (previousValue === null) element.removeAttribute(name);
  else element.setAttribute(name, previousValue);
}

function AssistantDockPanel() {
  const {
    close,
    collapseToQuick,
    focusComposer,
    refreshServiceState,
    refreshingServiceState,
    registerComposer,
    serviceState,
    session,
  } = useAssistantExperience();
  const { isMobile, isResizing, resizeHandleProps, width } =
    useAssistantDockSize();
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLElement>(null);
  const backdropPointerRef = useRef<number | null>(null);
  const releaseModalEffectsRef = useRef<(() => void) | null>(null);
  const descriptionId = useId();
  const currentServiceLabel = serviceLabel(serviceState);
  const sending = session.requestStatus === "sending";
  const closeFromEffect = useEffectEvent(close);
  const focusComposerFromEffect = useEffectEvent(focusComposer);

  useEffect(() => {
    const dialog = dialogRef.current;
    const background = document.querySelector<HTMLElement>(
      "[data-assistant-background-root]",
    );
    const previousOverflow = document.body.style.overflow;
    const previousAriaHidden = background?.getAttribute("aria-hidden") ?? null;
    const previousInert = background?.getAttribute("inert") ?? null;

    background?.setAttribute("aria-hidden", "true");
    background?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    queueMicrotask(focusComposerFromEffect);

    let released = false;
    const releaseModalEffects = () => {
      if (released) return;
      released = true;
      document.body.style.overflow = previousOverflow;
      if (background !== null) {
        restoreAttribute(background, "aria-hidden", previousAriaHidden);
        restoreAttribute(background, "inert", previousInert);
      }
    };
    releaseModalEffectsRef.current = releaseModalEffects;

    const requestClose = () => {
      releaseModalEffects();
      closeFromEffect();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || dialog === null) return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialog.contains(active))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      releaseModalEffects();
      if (releaseModalEffectsRef.current === releaseModalEffects) {
        releaseModalEffectsRef.current = null;
      }
    };
  }, []);

  const requestClose = () => {
    releaseModalEffectsRef.current?.();
    close();
  };

  const requestCollapse = () => {
    releaseModalEffectsRef.current?.();
    collapseToQuick();
  };

  const isBackdropTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    target.hasAttribute("data-assistant-dock-backdrop");

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    backdropPointerRef.current = isBackdropTarget(event.target)
      ? event.pointerId
      : null;
  };

  const handleLayerPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shouldClose =
      backdropPointerRef.current === event.pointerId &&
      isBackdropTarget(event.target);
    backdropPointerRef.current = null;
    if (shouldClose) requestClose();
  };

  const panelStyle = {
    "--assistant-dock-width":
      isMobile || width === null ? "100%" : `${width}px`,
  } as CSSProperties;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="assistant-dock-layer"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onPointerCancel={() => {
        backdropPointerRef.current = null;
      }}
      onPointerDown={handleLayerPointerDown}
      onPointerUp={handleLayerPointerUp}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.16 }}
    >
      <div
        aria-hidden="true"
        className="assistant-dock__backdrop"
        data-assistant-dock-backdrop
        data-testid="assistant-dock-backdrop"
      />
      <motion.section
        animate={{ opacity: 1, x: 0 }}
        aria-describedby={descriptionId}
        aria-label="AI 助理工作区"
        aria-modal="true"
        className="assistant-dock"
        data-mobile={isMobile ? "true" : undefined}
        data-resizing={isResizing ? "true" : undefined}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 18 }}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 18 }}
        ref={dialogRef}
        role="dialog"
        style={panelStyle}
        tabIndex={-1}
        transition={{
          duration: prefersReducedMotion ? 0.01 : 0.22,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {resizeHandleProps && width !== null ? (
          <div
            {...resizeHandleProps}
            aria-valuetext={`${width} 像素`}
            className="assistant-dock__resize-handle"
          >
            <span aria-hidden="true" />
          </div>
        ) : null}

        <header className="assistant-dock__header">
          <div className="assistant-dock__title-block">
            <p>AI ASSISTANT</p>
            <h2>M 企业助理</h2>
          </div>
          <div className="assistant-dock__actions">
            <button
              aria-label="收起为快速助手"
              onClick={requestCollapse}
              type="button"
            >
              <Minimize2 aria-hidden="true" size={17} />
            </button>
            <Link aria-label="进入完整工作区" href="/assistant">
              <ArrowUpRight aria-hidden="true" size={17} />
            </Link>
            <button
              aria-label="关闭 AI 助理工作区"
              onClick={requestClose}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </header>

        <div className="assistant-dock__service-row">
          <div
            aria-atomic="true"
            aria-busy={refreshingServiceState}
            aria-live="polite"
            className="assistant-dock__service-state"
            data-capability={serviceState.capability}
            data-testid="assistant-dock-service-state"
            role="status"
          >
            <span aria-hidden="true" />
            <strong>{currentServiceLabel}</strong>
            <small>{serviceState.message}</small>
          </div>
          <button
            aria-label={
              refreshingServiceState ? "刷新服务状态中" : "刷新服务状态"
            }
            disabled={refreshingServiceState}
            onClick={() => void refreshServiceState()}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} />
            <span>{refreshingServiceState ? "刷新中" : "刷新"}</span>
          </button>
        </div>

        <p className="assistant-dock__description" id={descriptionId}>
          {isMobile
            ? "全屏工作区。可收起、关闭或进入完整工作区。"
            : "拖动左侧边缘或使用方向键调整工作区宽度。"}
        </p>

        <div
          className="assistant-dock__body"
          data-empty={session.messages.length === 0 ? "true" : undefined}
        >
          {session.messages.length === 0 ? (
            <section className="assistant-dock__welcome">
              <p>在当前页面继续探索</p>
              <h3>有什么可以帮你？</h3>
              <div aria-label="常见问题">
                {ASSISTANT_PRESET_QUESTIONS.slice(0, 2).map((question) => (
                  <button
                    disabled={sending}
                    key={question}
                    onClick={() => void session.submit(question)}
                    type="button"
                  >
                    <span>{question}</span>
                    <ChevronRight aria-hidden="true" size={16} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <AssistantConversation
            ariaLabel="AI 助理对话"
            registerComposer={registerComposer}
            session={session}
            variant="dock"
          />
        </div>
      </motion.section>
    </motion.div>
  );
}

export function AssistantDock() {
  const { surface } = useAssistantExperience();
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPortalRoot(document.body);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (portalRoot === null) return null;

  return createPortal(
    <AnimatePresence>
      {surface === "dock" ? <AssistantDockPanel key="assistant-dock" /> : null}
    </AnimatePresence>,
    portalRoot,
  );
}

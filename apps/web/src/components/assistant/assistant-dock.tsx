"use client";

import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "framer-motion";
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
  useLayoutEffect,
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

export const ASSISTANT_DOCK_MOTION = {
  backdrop: {
    durationSeconds: 0.16,
    variants: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    },
  },
  panel: {
    enterDurationSeconds: 0.22,
    exitDurationSeconds: 0.17,
    offsetPixels: 18,
    variants: {
      hidden: { opacity: 0, x: 18 },
      visible: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 18 },
    },
  },
  reducedDurationSeconds: 0.01,
} as const;

const ASSISTANT_DOCK_EASE = [0.22, 1, 0.36, 1] as const;
const ASSISTANT_DOCK_NEAR_BOTTOM_THRESHOLD = 48;

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

type ModalIsolation = {
  background: HTMLElement | null;
  leases: number;
  previousAriaHidden: string | null;
  previousInert: string | null;
  previousOverflow: string;
};

let modalIsolation: ModalIsolation | null = null;

function acquireModalIsolation() {
  if (modalIsolation === null) {
    const background = document.querySelector<HTMLElement>(
      "[data-assistant-background-root]",
    );
    modalIsolation = {
      background,
      leases: 0,
      previousAriaHidden: background?.getAttribute("aria-hidden") ?? null,
      previousInert: background?.getAttribute("inert") ?? null,
      previousOverflow: document.body.style.overflow,
    };
    background?.setAttribute("aria-hidden", "true");
    background?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
  }

  modalIsolation.leases += 1;
  let released = false;
  return () => {
    if (released || modalIsolation === null) return;
    released = true;
    modalIsolation.leases -= 1;
    if (modalIsolation.leases > 0) return;

    const isolation = modalIsolation;
    modalIsolation = null;
    document.body.style.overflow = isolation.previousOverflow;
    if (isolation.background !== null) {
      restoreAttribute(
        isolation.background,
        "aria-hidden",
        isolation.previousAriaHidden,
      );
      restoreAttribute(isolation.background, "inert", isolation.previousInert);
    }
  };
}

type MobileVisualViewport = {
  height: number;
  offsetTop: number;
};

function AssistantDockPanel({ instanceVersion }: { instanceVersion: number }) {
  const {
    close,
    collapseToQuick,
    completeSurfaceExit,
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
  const isPresent = useIsPresent();
  const dialogRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const backdropPointerRef = useRef<number | null>(null);
  const exitingRef = useRef(false);
  const [mobileVisualViewport, setMobileVisualViewport] =
    useState<MobileVisualViewport | null>(null);
  const descriptionId = useId();
  const currentServiceLabel = serviceLabel(serviceState);
  const sending = session.requestStatus === "sending";
  const closeFromEffect = useEffectEvent(close);
  const completeExitFromEffect = useEffectEvent(() =>
    completeSurfaceExit("dock", instanceVersion),
  );
  const focusComposerFromEffect = useEffectEvent(focusComposer);
  const isPresentFromEffect = useEffectEvent(() => isPresent);

  useLayoutEffect(() => {
    if (isPresent) {
      exitingRef.current = false;
      return;
    }
    exitingRef.current = true;
    const dialog = dialogRef.current;
    const activeElement = document.activeElement;
    if (
      dialog !== null &&
      activeElement instanceof HTMLElement &&
      dialog.contains(activeElement)
    ) {
      activeElement.blur();
    }
    dialog?.setAttribute("inert", "");
    dialog?.setAttribute("aria-hidden", "true");
    dialog?.removeAttribute("aria-describedby");
    dialog?.removeAttribute("aria-modal");
    dialog?.removeAttribute("role");
    dialog?.setAttribute("data-exiting", "true");
    dialog?.classList.add("is-exiting");
    layerRef.current?.setAttribute("data-exiting", "true");
    layerRef.current?.classList.add("is-exiting");
  }, [isPresent]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const releaseModalIsolation = acquireModalIsolation();
    queueMicrotask(() => {
      if (dialog === null || !isPresentFromEffect()) return;
      focusComposerFromEffect();
      if (dialog.contains(document.activeElement)) return;
      getFocusableElements(dialog)[0]?.focus();
      if (!dialog.contains(document.activeElement)) dialog.focus();
    });

    const requestClose = () => {
      exitingRef.current = true;
      closeFromEffect();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (exitingRef.current || !isPresentFromEffect()) return;
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
      releaseModalIsolation();
      completeExitFromEffect();
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;
    const dialog = dialogRef.current;
    let cancelled = false;

    const captureMessageScroll = () => {
      const messageHistory = dialog?.querySelector<HTMLElement>(
        "[data-testid='assistant-message-history']",
      );
      if (messageHistory === null || messageHistory === undefined) return null;
      const scrollTop = messageHistory.scrollTop;
      return {
        messageHistory,
        nearBottom:
          messageHistory.scrollHeight -
            messageHistory.clientHeight -
            scrollTop <=
          ASSISTANT_DOCK_NEAR_BOTTOM_THRESHOLD,
        scrollTop,
      };
    };
    const restoreMessageScroll = (
      snapshot: ReturnType<typeof captureMessageScroll>,
    ) => {
      if (snapshot === null) return;
      snapshot.messageHistory.scrollTop = snapshot.nearBottom
        ? Math.max(
            0,
            snapshot.messageHistory.scrollHeight -
              snapshot.messageHistory.clientHeight,
          )
        : snapshot.scrollTop;
    };
    const ensureComposerVisible = (
      target: HTMLElement,
      snapshot = captureMessageScroll(),
    ) => {
      const composerWrap = target.closest<HTMLElement>(
        ".assistant-conversation__composer-wrap",
      );
      composerWrap?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      restoreMessageScroll(snapshot);
    };
    const updateVisualViewport = () => {
      if (cancelled) return;
      const messageScroll = captureMessageScroll();
      setMobileVisualViewport({
        height: Math.max(1, visualViewport.height),
        offsetTop: Math.max(0, visualViewport.offsetTop),
      });
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        dialog?.contains(activeElement) &&
        activeElement.matches("textarea")
      ) {
        queueMicrotask(() =>
          ensureComposerVisible(activeElement, messageScroll),
        );
      } else {
        queueMicrotask(() => restoreMessageScroll(messageScroll));
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("textarea")) {
        ensureComposerVisible(target);
      }
    };

    queueMicrotask(updateVisualViewport);
    visualViewport.addEventListener("resize", updateVisualViewport);
    visualViewport.addEventListener("scroll", updateVisualViewport);
    dialog?.addEventListener("focusin", onFocusIn);
    return () => {
      cancelled = true;
      visualViewport.removeEventListener("resize", updateVisualViewport);
      visualViewport.removeEventListener("scroll", updateVisualViewport);
      dialog?.removeEventListener("focusin", onFocusIn);
    };
  }, [isMobile]);

  const requestClose = () => {
    exitingRef.current = true;
    close();
  };

  const requestCollapse = () => {
    exitingRef.current = true;
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
    ...(isMobile && mobileVisualViewport !== null
      ? {
          "--assistant-dock-viewport-height": `${mobileVisualViewport.height}px`,
          "--assistant-dock-viewport-offset-top": `${mobileVisualViewport.offsetTop}px`,
        }
      : {}),
  } as CSSProperties;

  const backdropVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            duration: ASSISTANT_DOCK_MOTION.reducedDurationSeconds,
          },
        },
        exit: {
          opacity: 0,
          transition: {
            duration: ASSISTANT_DOCK_MOTION.reducedDurationSeconds,
          },
        },
      }
    : {
        hidden: ASSISTANT_DOCK_MOTION.backdrop.variants.hidden,
        visible: {
          ...ASSISTANT_DOCK_MOTION.backdrop.variants.visible,
          transition: {
            duration: ASSISTANT_DOCK_MOTION.backdrop.durationSeconds,
          },
        },
        exit: {
          ...ASSISTANT_DOCK_MOTION.backdrop.variants.exit,
          transition: {
            duration: ASSISTANT_DOCK_MOTION.backdrop.durationSeconds,
          },
        },
      };
  const panelVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            duration: ASSISTANT_DOCK_MOTION.reducedDurationSeconds,
          },
        },
        exit: {
          opacity: 0,
          transition: {
            duration: ASSISTANT_DOCK_MOTION.reducedDurationSeconds,
          },
        },
      }
    : {
        hidden: ASSISTANT_DOCK_MOTION.panel.variants.hidden,
        visible: {
          ...ASSISTANT_DOCK_MOTION.panel.variants.visible,
          transition: {
            duration: ASSISTANT_DOCK_MOTION.panel.enterDurationSeconds,
            ease: ASSISTANT_DOCK_EASE,
          },
        },
        exit: {
          ...ASSISTANT_DOCK_MOTION.panel.variants.exit,
          transition: {
            duration: ASSISTANT_DOCK_MOTION.panel.exitDurationSeconds,
            ease: ASSISTANT_DOCK_EASE,
          },
        },
      };

  return (
    <div
      className="assistant-dock-layer"
      data-testid="assistant-dock-layer"
      onPointerCancel={() => {
        backdropPointerRef.current = null;
      }}
      onPointerDown={handleLayerPointerDown}
      onPointerUp={handleLayerPointerUp}
      ref={layerRef}
    >
      <motion.div
        animate="visible"
        aria-hidden="true"
        className="assistant-dock__backdrop"
        data-assistant-dock-backdrop
        data-motion-part="backdrop"
        data-testid="assistant-dock-backdrop"
        exit="exit"
        initial="hidden"
        variants={backdropVariants}
      />
      <motion.section
        animate="visible"
        aria-describedby={descriptionId}
        aria-label="AI 助理工作区"
        aria-modal="true"
        className="assistant-dock"
        data-mobile={isMobile ? "true" : undefined}
        data-motion-part="panel"
        data-resizing={isResizing ? "true" : undefined}
        exit="exit"
        initial="hidden"
        ref={dialogRef}
        role="dialog"
        style={panelStyle}
        tabIndex={-1}
        variants={panelVariants}
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
    </div>
  );
}

export function AssistantDock() {
  const { surface, surfaceInstanceVersion } = useAssistantExperience();
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
      {surface === "dock" ? (
        <AssistantDockPanel
          instanceVersion={surfaceInstanceVersion}
          key={`assistant-dock-${surfaceInstanceVersion}`}
        />
      ) : null}
    </AnimatePresence>,
    portalRoot,
  );
}

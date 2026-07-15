"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type PointerEventHandler,
} from "react";

export const ASSISTANT_DOCK_DEFAULT_WIDTH = 480;
export const ASSISTANT_DOCK_MIN_WIDTH = 380;
export const ASSISTANT_DOCK_MAX_WIDTH = 760;
export const ASSISTANT_DOCK_MOBILE_QUERY = "(max-width: 720px)";
export const ASSISTANT_DOCK_WIDTH_STORAGE_KEY =
  "ai-agent-platform:assistant-dock-width:v1";

const ASSISTANT_DOCK_VIEWPORT_GUTTER = 48;
const ASSISTANT_DOCK_KEYBOARD_STEP = 16;
const ASSISTANT_DOCK_KEYBOARD_LARGE_STEP = 48;

export type AssistantDockResizeHandleProps = {
  "aria-label": string;
  "aria-orientation": "vertical";
  "aria-valuemax": number;
  "aria-valuemin": number;
  "aria-valuenow": number;
  onKeyDown: KeyboardEventHandler<HTMLElement>;
  onPointerDown: PointerEventHandler<HTMLElement>;
  role: "separator";
  tabIndex: 0;
};

type ResizeOperation = {
  element: HTMLElement;
  latestWidth: number;
  onLostPointerCapture: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onWindowBlur: () => void;
  originalCursor: string;
  originalUserSelect: string;
  pointerId: number;
  startWidth: number;
  startX: number;
};

function desktopMaximumWidth(viewportWidth: number) {
  return Math.min(
    ASSISTANT_DOCK_MAX_WIDTH,
    viewportWidth - ASSISTANT_DOCK_VIEWPORT_GUTTER,
  );
}

function clampDesktopWidth(preferred: number, viewportWidth: number) {
  if (viewportWidth <= 720) {
    throw new Error("desktop width is required");
  }
  return Math.min(
    ASSISTANT_DOCK_MAX_WIDTH,
    Math.max(ASSISTANT_DOCK_MIN_WIDTH, preferred),
    viewportWidth - ASSISTANT_DOCK_VIEWPORT_GUTTER,
  );
}

function readPreferredWidth() {
  try {
    const stored = window.localStorage.getItem(
      ASSISTANT_DOCK_WIDTH_STORAGE_KEY,
    );
    if (stored === null || stored.trim() === "") {
      return ASSISTANT_DOCK_DEFAULT_WIDTH;
    }
    const parsed = Number(stored);
    if (
      !Number.isFinite(parsed) ||
      parsed < ASSISTANT_DOCK_MIN_WIDTH ||
      parsed > ASSISTANT_DOCK_MAX_WIDTH
    ) {
      return ASSISTANT_DOCK_DEFAULT_WIDTH;
    }
    return parsed;
  } catch {
    return ASSISTANT_DOCK_DEFAULT_WIDTH;
  }
}

function persistPreferredWidth(width: number) {
  try {
    window.localStorage.setItem(
      ASSISTANT_DOCK_WIDTH_STORAGE_KEY,
      String(width),
    );
  } catch {
    // Storage can be unavailable in privacy mode or when its quota is full.
  }
}

export function useAssistantDockSize() {
  const [width, setWidth] = useState<number | null>(
    ASSISTANT_DOCK_DEFAULT_WIDTH,
  );
  const [isMobile, setIsMobile] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [maximumWidth, setMaximumWidth] = useState(ASSISTANT_DOCK_MAX_WIDTH);
  const preferredWidthRef = useRef(ASSISTANT_DOCK_DEFAULT_WIDTH);
  const renderedWidthRef = useRef<number | null>(ASSISTANT_DOCK_DEFAULT_WIDTH);
  const isMobileRef = useRef(false);
  const resizeOperationRef = useRef<ResizeOperation | null>(null);

  const renderPreferredWidth = useCallback(() => {
    if (isMobileRef.current) {
      renderedWidthRef.current = null;
      setWidth(null);
      return;
    }
    const nextWidth = clampDesktopWidth(
      preferredWidthRef.current,
      window.innerWidth,
    );
    renderedWidthRef.current = nextWidth;
    setWidth(nextWidth);
  }, []);

  const finishResize = useCallback(
    ({
      persist,
      updateState = true,
    }: {
      persist: boolean;
      updateState?: boolean;
    }) => {
      const operation = resizeOperationRef.current;
      if (!operation) return;
      resizeOperationRef.current = null;

      operation.element.removeEventListener(
        "pointermove",
        operation.onPointerMove,
      );
      operation.element.removeEventListener("pointerup", operation.onPointerUp);
      operation.element.removeEventListener(
        "pointercancel",
        operation.onPointerCancel,
      );
      operation.element.removeEventListener(
        "lostpointercapture",
        operation.onLostPointerCapture,
      );
      window.removeEventListener("blur", operation.onWindowBlur);
      document.body.style.userSelect = operation.originalUserSelect;
      document.body.style.cursor = operation.originalCursor;
      try {
        operation.element.releasePointerCapture(operation.pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }

      if (persist && operation.latestWidth !== operation.startWidth) {
        preferredWidthRef.current = operation.latestWidth;
        persistPreferredWidth(operation.latestWidth);
      }
      if (updateState) {
        setIsResizing(false);
        renderPreferredWidth();
      }
    },
    [renderPreferredWidth],
  );

  const onPointerDown = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      if (
        isMobileRef.current ||
        event.button !== 0 ||
        resizeOperationRef.current
      ) {
        return;
      }
      const startWidth = renderedWidthRef.current;
      if (startWidth === null) return;

      event.preventDefault();
      const element = event.currentTarget;
      const operation: ResizeOperation = {
        element,
        latestWidth: startWidth,
        onLostPointerCapture: (pointerEvent: PointerEvent) => {
          if (pointerEvent.pointerId !== operation.pointerId) return;
          finishResize({ persist: false });
        },
        onPointerCancel: (pointerEvent: PointerEvent) => {
          if (pointerEvent.pointerId !== operation.pointerId) return;
          finishResize({ persist: false });
        },
        onPointerMove: (pointerEvent: PointerEvent) => {
          if (
            resizeOperationRef.current !== operation ||
            pointerEvent.pointerId !== operation.pointerId
          ) {
            return;
          }
          const nextWidth = clampDesktopWidth(
            operation.startWidth + operation.startX - pointerEvent.clientX,
            window.innerWidth,
          );
          operation.latestWidth = nextWidth;
          renderedWidthRef.current = nextWidth;
          setWidth(nextWidth);
        },
        onPointerUp: (pointerEvent: PointerEvent) => {
          if (pointerEvent.pointerId !== operation.pointerId) return;
          operation.onPointerMove(pointerEvent);
          finishResize({ persist: true });
        },
        onWindowBlur: () => finishResize({ persist: false }),
        originalCursor: document.body.style.cursor,
        originalUserSelect: document.body.style.userSelect,
        pointerId: event.pointerId,
        startWidth,
        startX: event.clientX,
      };

      resizeOperationRef.current = operation;
      element.addEventListener("pointermove", operation.onPointerMove);
      element.addEventListener("pointerup", operation.onPointerUp);
      element.addEventListener("pointercancel", operation.onPointerCancel);
      element.addEventListener(
        "lostpointercapture",
        operation.onLostPointerCapture,
      );
      window.addEventListener("blur", operation.onWindowBlur);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Native listeners still provide cleanup when capture is unavailable.
      }
      setIsResizing(true);
    },
    [finishResize],
  );

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLElement>>((event) => {
    if (isMobileRef.current) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const currentWidth = renderedWidthRef.current;
    if (currentWidth === null) return;
    const step = event.shiftKey
      ? ASSISTANT_DOCK_KEYBOARD_LARGE_STEP
      : ASSISTANT_DOCK_KEYBOARD_STEP;
    const nextWidth = clampDesktopWidth(
      currentWidth + (event.key === "ArrowLeft" ? step : -step),
      window.innerWidth,
    );
    if (nextWidth === currentWidth) return;
    preferredWidthRef.current = nextWidth;
    renderedWidthRef.current = nextWidth;
    setWidth(nextWidth);
    persistPreferredWidth(nextWidth);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    preferredWidthRef.current = readPreferredWidth();
    const mobileQuery = window.matchMedia(ASSISTANT_DOCK_MOBILE_QUERY);
    const updateViewport = () => {
      const nextIsMobile = mobileQuery.matches;
      isMobileRef.current = nextIsMobile;
      if (resizeOperationRef.current) {
        finishResize({ persist: false });
      }
      setIsMobile(nextIsMobile);
      setMaximumWidth(
        nextIsMobile
          ? ASSISTANT_DOCK_MAX_WIDTH
          : desktopMaximumWidth(window.innerWidth),
      );
      renderPreferredWidth();
    };

    updateViewport();
    mobileQuery.addEventListener("change", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      mobileQuery.removeEventListener("change", updateViewport);
      window.removeEventListener("resize", updateViewport);
      finishResize({ persist: false, updateState: false });
    };
  }, [finishResize, renderPreferredWidth]);

  const resizeHandleProps: AssistantDockResizeHandleProps | null =
    isMobile || width === null
      ? null
      : {
          "aria-label": "调整 AI 助理工作区宽度",
          "aria-orientation": "vertical",
          "aria-valuemax": maximumWidth,
          "aria-valuemin": ASSISTANT_DOCK_MIN_WIDTH,
          "aria-valuenow": width,
          onKeyDown,
          onPointerDown,
          role: "separator",
          tabIndex: 0,
        };

  return {
    width,
    isMobile,
    isResizing,
    resizeHandleProps,
  };
}

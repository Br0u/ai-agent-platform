"use client";

import { type ReactNode, type RefObject, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  children: ReactNode;
  closeDisabled?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  labelledBy: string;
  onClose(): void;
};

type HiddenSibling = {
  element: HTMLElement;
  inert: string | null;
  ariaHidden: string | null;
};

const FOCUSABLE = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "[tabindex]",
  '[contenteditable="true"]',
].join(",");

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      !element.matches(":disabled") &&
      element.getAttribute("tabindex") !== "-1" &&
      element.closest("[hidden]") === null,
  );
}

function restoreAttribute(
  element: HTMLElement,
  name: "aria-hidden" | "inert",
  value: string | null,
) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export function AssistantSkillModal({
  children,
  closeDisabled = false,
  initialFocusRef,
  labelledBy,
  onClose,
}: Props) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const modal = root.current;
    if (modal === null) return;
    const hiddenSiblings: HiddenSibling[] = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== modal,
      )
      .map((element) => ({
        element,
        inert: element.getAttribute("inert"),
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    for (const sibling of hiddenSiblings) {
      sibling.element.setAttribute("inert", "");
      sibling.element.setAttribute("aria-hidden", "true");
    }

    const focusInside = () => {
      const preferred = initialFocusRef?.current;
      if (
        preferred !== undefined &&
        preferred !== null &&
        !preferred.matches(":disabled")
      ) {
        preferred.focus();
        return;
      }
      (focusableElements(modal)[0] ?? modal).focus();
    };
    const blockBackgroundClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !modal.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !modal.contains(event.target)) {
        focusInside();
      }
    };
    document.addEventListener("click", blockBackgroundClick, true);
    document.addEventListener("focusin", containFocus, true);
    focusInside();

    return () => {
      document.removeEventListener("click", blockBackgroundClick, true);
      document.removeEventListener("focusin", containFocus, true);
      for (const sibling of hiddenSiblings) {
        restoreAttribute(sibling.element, "inert", sibling.inert);
        restoreAttribute(sibling.element, "aria-hidden", sibling.ariaHidden);
      }
    };
  }, [initialFocusRef]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-labelledby={labelledBy}
      aria-modal="true"
      className="assistant-skill-dialog"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (!closeDisabled) onClose();
          return;
        }
        if (event.key !== "Tab" || root.current === null) return;
        const focusable = focusableElements(root.current);
        if (focusable.length === 0) {
          event.preventDefault();
          root.current.focus();
          return;
        }
        const first = focusable[0]!;
        const last = focusable.at(-1)!;
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !root.current.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !root.current.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      ref={root}
      role="dialog"
      tabIndex={-1}
    >
      {children}
    </div>,
    document.body,
  );
}

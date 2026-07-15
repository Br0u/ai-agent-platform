"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  useAssistantSession,
  type AssistantSession,
} from "./use-assistant-session";

export type AssistantExperience = {
  session: AssistantSession;
  openFrom: (trigger: HTMLElement) => void;
  close: () => void;
  registerComposer: (element: HTMLElement | null) => void;
  focusComposer: () => void;
};

const AssistantExperienceContext = createContext<AssistantExperience | null>(
  null,
);

export function AssistantExperienceProvider({
  children,
  pathname,
}: {
  children: ReactNode;
  pathname: string;
}) {
  const session = useAssistantSession(pathname);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const composer = useRef<HTMLElement | null>(null);

  const openFrom = useCallback(
    (trigger: HTMLElement) => {
      lastTrigger.current = trigger;
      session.openAssistant();
    },
    [session],
  );

  const close = useCallback(() => {
    session.closeAssistant();
    const trigger = lastTrigger.current;
    lastTrigger.current = null;
    if (trigger?.isConnected) trigger.focus();
  }, [session]);

  const registerComposer = useCallback((element: HTMLElement | null) => {
    composer.current = element;
  }, []);

  const focusComposer = useCallback(() => {
    if (composer.current?.isConnected) composer.current.focus();
  }, []);

  useEffect(
    () => () => {
      lastTrigger.current = null;
      composer.current = null;
    },
    [],
  );

  const value = useMemo(
    () => ({ session, openFrom, close, registerComposer, focusComposer }),
    [close, focusComposer, openFrom, registerComposer, session],
  );

  return (
    <AssistantExperienceContext.Provider value={value}>
      {children}
    </AssistantExperienceContext.Provider>
  );
}

export function useAssistantExperience(): AssistantExperience {
  const experience = useContext(AssistantExperienceContext);
  if (experience === null) {
    throw new Error("Assistant experience is unavailable");
  }
  return experience;
}

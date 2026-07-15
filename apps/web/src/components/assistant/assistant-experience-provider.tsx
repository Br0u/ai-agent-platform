"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useAssistantSession,
  type AssistantSession,
} from "./use-assistant-session";

export type AssistantSurface = "closed" | "quick" | "dock";

export type AssistantExperience = {
  surface: AssistantSurface;
  session: AssistantSession;
  openQuickFrom: (trigger: HTMLElement) => void;
  openDockFrom: (trigger: HTMLElement) => void;
  collapseToQuick: () => void;
  close: () => void;
  registerComposer: (element: HTMLElement | null) => void;
  focusComposer: () => void;
};

const AssistantExperienceContext = createContext<AssistantExperience | null>(
  null,
);

function normalizePathname(pathname: string): string {
  const path = pathname.split(/[?#]/u, 1)[0] ?? "/";
  return path.replace(/\/+$/u, "") || "/";
}

export function AssistantExperienceProvider({
  children,
  pathname,
}: {
  children: ReactNode;
  pathname: string;
}) {
  const session = useAssistantSession(pathname);
  const [presentation, setPresentation] = useState<{
    pathname: string | null;
    surface: AssistantSurface;
  }>({ pathname: null, surface: "closed" });
  const lastTrigger = useRef<HTMLElement | null>(null);
  const composer = useRef<HTMLElement | null>(null);
  const surfaceVersion = useRef(0);
  const normalizedPathname = normalizePathname(pathname);
  const assistantWorkspace = normalizedPathname === "/assistant";
  const presentationMatchesPath = presentation.pathname === normalizedPathname;
  const surface =
    assistantWorkspace || !presentationMatchesPath
      ? "closed"
      : presentation.surface;

  const openSurfaceFrom = useCallback(
    (
      nextSurface: Extract<AssistantSurface, "quick" | "dock">,
      trigger: HTMLElement,
    ) => {
      if (assistantWorkspace) return;
      surfaceVersion.current += 1;
      if (surface === "closed") lastTrigger.current = trigger;
      setPresentation({
        pathname: normalizedPathname,
        surface: nextSurface,
      });
    },
    [assistantWorkspace, normalizedPathname, surface],
  );

  const openQuickFrom = useCallback(
    (trigger: HTMLElement) => openSurfaceFrom("quick", trigger),
    [openSurfaceFrom],
  );

  const openDockFrom = useCallback(
    (trigger: HTMLElement) => openSurfaceFrom("dock", trigger),
    [openSurfaceFrom],
  );

  const collapseToQuick = useCallback(() => {
    if (surface !== "dock") return;
    surfaceVersion.current += 1;
    setPresentation({ pathname: normalizedPathname, surface: "quick" });
  }, [normalizedPathname, surface]);

  const close = useCallback(() => {
    const shouldRestoreFocus = surface !== "closed";
    surfaceVersion.current += 1;
    setPresentation({ pathname: normalizedPathname, surface: "closed" });
    const trigger = lastTrigger.current;
    lastTrigger.current = null;
    if (shouldRestoreFocus && trigger?.isConnected) trigger.focus();
  }, [normalizedPathname, surface]);

  const registerComposer = useCallback((element: HTMLElement | null) => {
    composer.current = element;
  }, []);

  const focusComposer = useCallback(() => {
    if (composer.current?.isConnected) composer.current.focus();
  }, []);

  useEffect(() => {
    if (
      presentation.surface === "closed" ||
      (!assistantWorkspace && presentationMatchesPath)
    ) {
      return;
    }
    const version = ++surfaceVersion.current;
    queueMicrotask(() => {
      if (surfaceVersion.current !== version) return;
      setPresentation({ pathname: normalizedPathname, surface: "closed" });
      lastTrigger.current = null;
    });
  }, [
    assistantWorkspace,
    normalizedPathname,
    presentation.surface,
    presentationMatchesPath,
  ]);

  useEffect(
    () => () => {
      surfaceVersion.current += 1;
      lastTrigger.current = null;
      composer.current = null;
    },
    [],
  );

  const value = useMemo(
    () => ({
      surface,
      session,
      openQuickFrom,
      openDockFrom,
      collapseToQuick,
      close,
      registerComposer,
      focusComposer,
    }),
    [
      close,
      collapseToQuick,
      focusComposer,
      openDockFrom,
      openQuickFrom,
      registerComposer,
      session,
      surface,
    ],
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

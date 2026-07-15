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
import type { AssistantStatusResponse } from "@/features/assistant/assistant-contract";
import { useAssistantServiceState } from "./use-assistant-service-state";

export type AssistantSurface = "closed" | "quick" | "dock";

export type AssistantExperience = {
  surface: AssistantSurface;
  session: AssistantSession;
  serviceState: AssistantStatusResponse;
  refreshingServiceState: boolean;
  hasResolvedServiceState: boolean;
  adoptServiceState: (state: AssistantStatusResponse) => void;
  refreshServiceState: () => Promise<void>;
  openQuickFrom: (trigger: HTMLElement) => void;
  openDockFrom: (trigger: HTMLElement) => void;
  collapseToQuick: () => void;
  close: () => void;
  restoreTriggerFocus: () => void;
  registerComposer: (element: HTMLElement) => () => void;
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
  const {
    serviceState,
    refreshingServiceState,
    hasResolvedServiceState,
    adoptServiceState: adoptServiceStateInController,
    refreshServiceState: refreshServiceStateInController,
  } = useAssistantServiceState();
  const [presentation, setPresentation] = useState<{
    pathname: string | null;
    surface: AssistantSurface;
  }>({ pathname: null, surface: "closed" });
  const lastTrigger = useRef<HTMLElement | null>(null);
  const pendingTriggerRestore = useRef(false);
  const composer = useRef<HTMLElement | null>(null);
  const surfaceVersion = useRef(0);
  const normalizedPathname = normalizePathname(pathname);
  const assistantWorkspace = normalizedPathname === "/assistant";
  const presentationMatchesPath = presentation.pathname === normalizedPathname;
  const surface =
    assistantWorkspace || !presentationMatchesPath
      ? "closed"
      : presentation.surface;
  const hasResolvedServiceStateRef = useRef(hasResolvedServiceState);

  const adoptServiceState = useCallback(
    (state: AssistantStatusResponse) => {
      hasResolvedServiceStateRef.current = true;
      adoptServiceStateInController(state);
    },
    [adoptServiceStateInController],
  );

  const refreshServiceState = useCallback(() => {
    hasResolvedServiceStateRef.current = true;
    return refreshServiceStateInController();
  }, [refreshServiceStateInController]);

  const openSurfaceFrom = useCallback(
    (
      nextSurface: Extract<AssistantSurface, "quick" | "dock">,
      trigger: HTMLElement,
    ) => {
      if (assistantWorkspace) return;
      surfaceVersion.current += 1;
      pendingTriggerRestore.current = false;
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
    pendingTriggerRestore.current = false;
    setPresentation({ pathname: normalizedPathname, surface: "quick" });
  }, [normalizedPathname, surface]);

  const close = useCallback(() => {
    if (surface === "closed") return;
    surfaceVersion.current += 1;
    pendingTriggerRestore.current = true;
    setPresentation({ pathname: normalizedPathname, surface: "closed" });
  }, [normalizedPathname, surface]);

  const restoreTriggerFocus = useCallback(() => {
    if (!pendingTriggerRestore.current) return;
    pendingTriggerRestore.current = false;
    const trigger = lastTrigger.current;
    lastTrigger.current = null;
    if (!trigger?.isConnected) return;
    const disabled =
      ("disabled" in trigger && trigger.disabled === true) ||
      trigger.getAttribute("aria-disabled") === "true";
    if (!disabled) trigger.focus();
  }, []);

  const registerComposer = useCallback((element: HTMLElement) => {
    composer.current = element;
    return () => {
      if (composer.current === element) composer.current = null;
    };
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
      pendingTriggerRestore.current = false;
      lastTrigger.current = null;
    });
  }, [
    assistantWorkspace,
    normalizedPathname,
    presentation.surface,
    presentationMatchesPath,
  ]);

  useEffect(() => {
    if (
      surface === "closed" ||
      hasResolvedServiceState ||
      refreshingServiceState
    ) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || hasResolvedServiceStateRef.current) return;
      void refreshServiceState();
    });
    return () => {
      cancelled = true;
    };
  }, [
    refreshServiceState,
    hasResolvedServiceState,
    refreshingServiceState,
    surface,
  ]);

  useEffect(
    () => () => {
      surfaceVersion.current += 1;
      pendingTriggerRestore.current = false;
      lastTrigger.current = null;
      composer.current = null;
    },
    [],
  );

  const value = useMemo(
    () => ({
      surface,
      session,
      serviceState,
      refreshingServiceState,
      hasResolvedServiceState,
      adoptServiceState,
      refreshServiceState,
      openQuickFrom,
      openDockFrom,
      collapseToQuick,
      close,
      restoreTriggerFocus,
      registerComposer,
      focusComposer,
    }),
    [
      close,
      collapseToQuick,
      adoptServiceState,
      focusComposer,
      openDockFrom,
      openQuickFrom,
      registerComposer,
      refreshServiceState,
      restoreTriggerFocus,
      hasResolvedServiceState,
      refreshingServiceState,
      serviceState,
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

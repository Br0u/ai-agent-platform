"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
type ActiveAssistantSurface = Exclude<AssistantSurface, "closed">;

type AssistantPresentation = {
  pathname: string | null;
  surface: AssistantSurface;
  version: number;
};

type AssistantExitToken = {
  source: ActiveAssistantSurface;
  sourceVersion: number;
  destination: Extract<AssistantSurface, "closed" | "quick">;
  destinationVersion: number;
};

export type AssistantExperience = {
  surface: AssistantSurface;
  surfaceInstanceVersion: number;
  session: AssistantSession;
  serviceState: AssistantStatusResponse;
  refreshingServiceState: boolean;
  hasResolvedServiceState: boolean;
  quickInteractionReady: boolean;
  adoptServiceState: (state: AssistantStatusResponse) => void;
  refreshServiceState: () => Promise<void>;
  openQuickFrom: (trigger: HTMLElement) => void;
  openDockFrom: (trigger: HTMLElement) => void;
  collapseToQuick: () => void;
  close: () => void;
  completeSurfaceExit: (
    source: ActiveAssistantSurface,
    sourceVersion: number,
  ) => void;
  registerQuickFocusTarget: (
    element: HTMLElement,
    instanceVersion: number,
  ) => () => void;
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

function canReceiveFocus(element: HTMLElement | null): element is HTMLElement {
  return (
    element?.isConnected === true &&
    !element.matches(":disabled") &&
    element.getAttribute("aria-disabled") !== "true"
  );
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
  const [presentation, setPresentation] = useState<AssistantPresentation>({
    pathname: null,
    surface: "closed",
    version: 0,
  });
  const [blockedQuickVersion, setBlockedQuickVersion] = useState<number | null>(
    null,
  );
  const presentationRef = useRef(presentation);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const pendingExit = useRef<AssistantExitToken | null>(null);
  const quickFocusTarget = useRef<{
    element: HTMLElement;
    version: number;
  } | null>(null);
  const pendingQuickFocusVersion = useRef<number | null>(null);
  const composer = useRef<HTMLElement | null>(null);
  const nextSurfaceVersion = useRef(0);
  const normalizedPathname = normalizePathname(pathname);
  const assistantWorkspace = normalizedPathname === "/assistant";
  const presentationMatchesPath = presentation.pathname === normalizedPathname;
  const surface =
    assistantWorkspace || !presentationMatchesPath
      ? "closed"
      : presentation.surface;
  const surfaceInstanceVersion = presentation.version;
  const currentRoute = useRef({ assistantWorkspace, normalizedPathname });
  const hasResolvedServiceStateRef = useRef(hasResolvedServiceState);

  useLayoutEffect(() => {
    currentRoute.current = { assistantWorkspace, normalizedPathname };
  }, [assistantWorkspace, normalizedPathname]);

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

  const commitPresentation = useCallback((next: AssistantPresentation) => {
    presentationRef.current = next;
    setPresentation(next);
  }, []);

  const issueSurfaceVersion = useCallback(
    () => ++nextSurfaceVersion.current,
    [],
  );

  const focusQuickTarget = useCallback((version: number) => {
    queueMicrotask(() => {
      const current = presentationRef.current;
      const route = currentRoute.current;
      const target = quickFocusTarget.current;
      if (
        route.assistantWorkspace ||
        current.pathname !== route.normalizedPathname ||
        current.surface !== "quick" ||
        current.version !== version ||
        target?.version !== version ||
        !canReceiveFocus(target.element)
      ) {
        return;
      }
      pendingQuickFocusVersion.current = null;
      target.element.focus();
    });
  }, []);

  const openSurfaceFrom = useCallback(
    (
      nextSurface: Extract<AssistantSurface, "quick" | "dock">,
      trigger: HTMLElement,
    ) => {
      const current = presentationRef.current;
      const route = currentRoute.current;
      if (route.assistantWorkspace) return;
      const currentSurface =
        current.pathname === route.normalizedPathname
          ? current.surface
          : "closed";
      const version = issueSurfaceVersion();
      pendingExit.current = null;
      pendingQuickFocusVersion.current = null;
      setBlockedQuickVersion(null);
      if (currentSurface === "closed") lastTrigger.current = trigger;
      commitPresentation({
        pathname: route.normalizedPathname,
        surface: nextSurface,
        version,
      });
    },
    [commitPresentation, issueSurfaceVersion],
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
    const current = presentationRef.current;
    const route = currentRoute.current;
    if (
      route.assistantWorkspace ||
      current.pathname !== route.normalizedPathname ||
      current.surface !== "dock"
    ) {
      return;
    }
    const destinationVersion = issueSurfaceVersion();
    pendingExit.current = {
      source: "dock",
      sourceVersion: current.version,
      destination: "quick",
      destinationVersion,
    };
    pendingQuickFocusVersion.current = null;
    setBlockedQuickVersion(destinationVersion);
    commitPresentation({
      pathname: route.normalizedPathname,
      surface: "quick",
      version: destinationVersion,
    });
  }, [commitPresentation, issueSurfaceVersion]);

  const close = useCallback(() => {
    const current = presentationRef.current;
    const route = currentRoute.current;
    if (
      route.assistantWorkspace ||
      current.pathname !== route.normalizedPathname ||
      current.surface === "closed"
    ) {
      return;
    }
    const destinationVersion = issueSurfaceVersion();
    pendingExit.current = {
      source: current.surface,
      sourceVersion: current.version,
      destination: "closed",
      destinationVersion,
    };
    pendingQuickFocusVersion.current = null;
    setBlockedQuickVersion(null);
    commitPresentation({
      pathname: route.normalizedPathname,
      surface: "closed",
      version: destinationVersion,
    });
  }, [commitPresentation, issueSurfaceVersion]);

  const completeSurfaceExit = useCallback(
    (source: ActiveAssistantSurface, sourceVersion: number) => {
      const token = pendingExit.current;
      if (token?.source !== source || token.sourceVersion !== sourceVersion) {
        return;
      }
      pendingExit.current = null;
      const current = presentationRef.current;
      const route = currentRoute.current;
      if (
        route.assistantWorkspace ||
        current.pathname !== route.normalizedPathname ||
        current.surface !== token.destination ||
        current.version !== token.destinationVersion
      ) {
        return;
      }
      if (token.destination === "quick") {
        setBlockedQuickVersion(null);
        pendingQuickFocusVersion.current = token.destinationVersion;
        focusQuickTarget(token.destinationVersion);
        return;
      }

      pendingQuickFocusVersion.current = null;
      setBlockedQuickVersion(null);
      const trigger = lastTrigger.current;
      lastTrigger.current = null;
      if (canReceiveFocus(trigger)) trigger.focus();
    },
    [focusQuickTarget],
  );

  const registerQuickFocusTarget = useCallback(
    (element: HTMLElement, instanceVersion: number) => {
      const registration = { element, version: instanceVersion };
      quickFocusTarget.current = registration;
      const token = pendingExit.current;
      const waitingForDockExit =
        token?.source === "dock" &&
        token.destination === "quick" &&
        token.destinationVersion === instanceVersion;
      if (
        pendingQuickFocusVersion.current === instanceVersion ||
        !waitingForDockExit
      ) {
        focusQuickTarget(instanceVersion);
      }
      return () => {
        if (quickFocusTarget.current === registration) {
          quickFocusTarget.current = null;
        }
      };
    },
    [focusQuickTarget],
  );

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
    const version = issueSurfaceVersion();
    pendingExit.current = null;
    pendingQuickFocusVersion.current = null;
    lastTrigger.current = null;
    queueMicrotask(() => {
      if (nextSurfaceVersion.current !== version) return;
      setBlockedQuickVersion(null);
      commitPresentation({
        pathname: normalizedPathname,
        surface: "closed",
        version,
      });
    });
  }, [
    assistantWorkspace,
    commitPresentation,
    issueSurfaceVersion,
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
      nextSurfaceVersion.current += 1;
      pendingExit.current = null;
      pendingQuickFocusVersion.current = null;
      lastTrigger.current = null;
      quickFocusTarget.current = null;
      composer.current = null;
    },
    [],
  );

  const value = useMemo(
    () => ({
      surface,
      surfaceInstanceVersion,
      session,
      serviceState,
      refreshingServiceState,
      hasResolvedServiceState,
      quickInteractionReady:
        surface !== "quick" || blockedQuickVersion !== surfaceInstanceVersion,
      adoptServiceState,
      refreshServiceState,
      openQuickFrom,
      openDockFrom,
      collapseToQuick,
      close,
      completeSurfaceExit,
      registerQuickFocusTarget,
      registerComposer,
      focusComposer,
    }),
    [
      close,
      collapseToQuick,
      completeSurfaceExit,
      adoptServiceState,
      focusComposer,
      openDockFrom,
      openQuickFrom,
      registerComposer,
      registerQuickFocusTarget,
      refreshServiceState,
      hasResolvedServiceState,
      blockedQuickVersion,
      refreshingServiceState,
      serviceState,
      session,
      surface,
      surfaceInstanceVersion,
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

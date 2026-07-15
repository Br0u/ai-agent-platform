"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAssistantStatusResponse,
  type AssistantStatusResponse,
} from "@/features/assistant/assistant-contract";

const STATUS_REFRESH_TIMEOUT_MS = 5_000;

const DEGRADED_STATUS: AssistantStatusResponse = {
  version: "1",
  requestId: "client-status-fallback",
  live: false,
  ready: false,
  capability: "degraded",
  message: "助手基础服务暂不可用。",
};

type StatusRefreshOperation = {
  cancel: () => void;
  promise: Promise<void>;
  timer: ReturnType<typeof setTimeout>;
};

export function useAssistantServiceState() {
  const [serviceState, setServiceState] =
    useState<AssistantStatusResponse>(DEGRADED_STATUS);
  const [refreshingServiceState, setRefreshingServiceState] = useState(false);
  const [hasResolvedServiceState, setHasResolvedServiceState] = useState(false);
  const mountedRef = useRef(true);
  const refreshGenerationRef = useRef(0);
  const refreshOperationRef = useRef<StatusRefreshOperation | null>(null);

  const adoptServiceState = useCallback((state: AssistantStatusResponse) => {
    if (refreshOperationRef.current) return;
    setServiceState(state);
    setHasResolvedServiceState(true);
  }, []);

  const refreshServiceState = useCallback((): Promise<void> => {
    if (refreshOperationRef.current) {
      return refreshOperationRef.current.promise;
    }
    const id = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = id;
    const controller = new AbortController();
    let rejectInterruption: (reason?: unknown) => void = () => undefined;
    let interrupted = false;
    const interruption = new Promise<never>((_resolve, reject) => {
      rejectInterruption = reject;
    });
    const cancel = () => {
      if (interrupted) return;
      interrupted = true;
      controller.abort();
      rejectInterruption(new Error("Assistant status refresh interrupted"));
    };
    const operation: StatusRefreshOperation = {
      cancel,
      promise: Promise.resolve(),
      timer: setTimeout(cancel, STATUS_REFRESH_TIMEOUT_MS),
    };
    refreshOperationRef.current = operation;
    setRefreshingServiceState(true);

    operation.promise = (async () => {
      try {
        const nextState = await Promise.race([
          (async (): Promise<AssistantStatusResponse> => {
            const response = await fetch("/api/v1/assistant/status", {
              method: "GET",
              cache: "no-store",
              signal: controller.signal,
            });
            const candidate: unknown = await response.json();
            if (!response.ok || !isAssistantStatusResponse(candidate)) {
              throw new Error("Invalid assistant status response");
            }
            return candidate;
          })(),
          interruption,
        ]);
        if (mountedRef.current && refreshGenerationRef.current === id) {
          setServiceState(nextState);
          setHasResolvedServiceState(true);
        }
      } catch {
        if (mountedRef.current && refreshGenerationRef.current === id) {
          setServiceState(DEGRADED_STATUS);
          setHasResolvedServiceState(true);
        }
      } finally {
        clearTimeout(operation.timer);
        if (refreshOperationRef.current === operation) {
          refreshOperationRef.current = null;
          if (mountedRef.current && refreshGenerationRef.current === id) {
            setRefreshingServiceState(false);
          }
        }
      }
    })();

    return operation.promise;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshGenerationRef.current += 1;
      refreshOperationRef.current?.cancel();
      refreshOperationRef.current = null;
    };
  }, []);

  return {
    serviceState,
    refreshingServiceState,
    hasResolvedServiceState,
    adoptServiceState,
    refreshServiceState,
  };
}

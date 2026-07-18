"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AdminModelProvider } from "@/features/assistant/admin-model-config-contract";

const REVEAL_DURATION_MS = 30_000;
const REVEAL_ENDPOINT = "/api/v1/admin/assistant/model-configs";

export type ModelKeyRevealError = {
  code:
    | "reauth_required"
    | "permission_denied"
    | "rate_limited"
    | "storage_unavailable"
    | "unavailable";
  redirectTo: "/staff/re-auth" | null;
};

type ModelKeyRevealState = {
  reveal: (provider: AdminModelProvider, revision: number) => Promise<void>;
  hide: () => void;
  plaintext: string | null;
  secondsRemaining: number;
  status: "idle" | "loading" | "revealed" | "error";
  error: ModelKeyRevealError | null;
};

function hasExactKeys(value: unknown, expected: readonly string[]) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function parseRevealKey(value: unknown): string | null {
  if (!hasExactKeys(value, ["version", "requestId", "key"])) return null;
  const envelope = value as Record<string, unknown>;
  if (
    envelope.version !== "1" ||
    typeof envelope.requestId !== "string" ||
    envelope.requestId.trim().length === 0 ||
    typeof envelope.key !== "string" ||
    envelope.key.length === 0 ||
    Array.from(envelope.key).length > 4_096
  ) {
    return null;
  }
  return envelope.key;
}

function parseSafeError(value: unknown): ModelKeyRevealError {
  const hasRedirect = hasExactKeys(value, [
    "version",
    "requestId",
    "error",
    "redirectTo",
  ]);
  if (!hasRedirect && !hasExactKeys(value, ["version", "requestId", "error"])) {
    return { code: "unavailable", redirectTo: null };
  }
  const envelope = value as Record<string, unknown>;
  if (
    envelope.version !== "1" ||
    typeof envelope.requestId !== "string" ||
    envelope.requestId.trim().length === 0 ||
    !hasExactKeys(envelope.error, ["code", "message", "retryable"])
  ) {
    return { code: "unavailable", redirectTo: null };
  }
  const error = envelope.error as Record<string, unknown>;
  if (
    typeof error.code !== "string" ||
    typeof error.message !== "string" ||
    typeof error.retryable !== "boolean"
  ) {
    return { code: "unavailable", redirectTo: null };
  }
  if (
    hasRedirect &&
    error.code === "reauth_required" &&
    envelope.redirectTo === "/staff/re-auth"
  ) {
    return { code: "reauth_required", redirectTo: "/staff/re-auth" };
  }
  switch (error.code) {
    case "permission_denied":
    case "authentication_required":
      return { code: "permission_denied", redirectTo: null };
    case "rate_limited":
      return { code: "rate_limited", redirectTo: null };
    case "storage_unavailable":
      return { code: "storage_unavailable", redirectTo: null };
    default:
      return { code: "unavailable", redirectTo: null };
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useModelKeyReveal(
  currentProvider: AdminModelProvider,
): ModelKeyRevealState {
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [status, setStatus] = useState<ModelKeyRevealState["status"]>("idle");
  const [error, setError] = useState<ModelKeyRevealError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const providerRef = useRef(currentProvider);

  const clearSensitiveState = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    deadlineRef.current = null;
    setPlaintext(null);
    setSecondsRemaining(0);
    setStatus("idle");
    setError(null);
  }, []);

  const updateCountdown = useCallback(() => {
    const deadline = deadlineRef.current;
    if (deadline === null) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      clearSensitiveState();
      return;
    }
    setSecondsRemaining(Math.ceil(remaining / 1_000));
  }, [clearSensitiveState]);

  const reveal = useCallback(
    async (provider: AdminModelProvider, revision: number) => {
      clearSensitiveState();
      const controller = new AbortController();
      controllerRef.current = controller;
      const generation = ++generationRef.current;
      setStatus("loading");
      try {
        const response = await fetch(
          `${REVEAL_ENDPOINT}/${provider}/reveal-key`,
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revision }),
            signal: controller.signal,
          },
        );
        const body = await readJson(response);
        if (
          generationRef.current !== generation ||
          controller.signal.aborted ||
          providerRef.current !== provider
        ) {
          return;
        }
        controllerRef.current = null;
        if (!response.ok) {
          setStatus("error");
          setError(parseSafeError(body));
          return;
        }
        const key = parseRevealKey(body);
        if (key === null) {
          setStatus("error");
          setError({ code: "unavailable", redirectTo: null });
          return;
        }
        setPlaintext(key);
        setStatus("revealed");
        deadlineRef.current = Date.now() + REVEAL_DURATION_MS;
        setSecondsRemaining(REVEAL_DURATION_MS / 1_000);
        timerRef.current = window.setInterval(updateCountdown, 1_000);
      } catch {
        if (
          generationRef.current === generation &&
          !controller.signal.aborted
        ) {
          controllerRef.current = null;
          setStatus("error");
          setError({ code: "unavailable", redirectTo: null });
        }
      }
    },
    [clearSensitiveState, updateCountdown],
  );

  const hide = useCallback(() => clearSensitiveState(), [clearSensitiveState]);

  useEffect(() => {
    if (providerRef.current !== currentProvider) {
      clearSensitiveState();
      providerRef.current = currentProvider;
    }
  }, [clearSensitiveState, currentProvider]);

  useEffect(() => {
    const clearForLifecycle = () => clearSensitiveState();
    const clearWhenHidden = () => {
      if (document.visibilityState === "hidden") clearSensitiveState();
    };
    window.addEventListener("pagehide", clearForLifecycle);
    document.addEventListener("visibilitychange", clearWhenHidden);
    return () => {
      window.removeEventListener("pagehide", clearForLifecycle);
      document.removeEventListener("visibilitychange", clearWhenHidden);
      clearSensitiveState();
    };
  }, [clearSensitiveState]);

  return { reveal, hide, plaintext, secondsRemaining, status, error };
}

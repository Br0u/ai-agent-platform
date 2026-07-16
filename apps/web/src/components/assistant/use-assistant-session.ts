"use client";

import {
  isAssistantSuccessResponse,
  safeAssistantSuggestedActions,
  type AssistantSuccessResponse,
  type AssistantSuggestedAction,
} from "@/features/assistant/assistant-contract";
import { useCallback, useEffect, useRef, useState } from "react";

type UserAssistantMessage = {
  id: number;
  role: "user";
  content: string;
};

type ResponseAssistantMessage = {
  id: number;
  role: "assistant";
  content: string;
  suggestedActions: AssistantSuggestedAction[];
};

export type AssistantMessage = UserAssistantMessage | ResponseAssistantMessage;

export type AssistantRequestStatus = "idle" | "sending" | "failed";

export type AssistantValidationError = {
  code: "empty" | "too_long";
  message: string;
};

type AssistantRequestPayload = {
  message: string;
  context: { pathname: string };
};

type AssistantSuccessfulBody = Pick<
  AssistantSuccessResponse,
  "message" | "suggestedActions"
> &
  Partial<Pick<AssistantSuccessResponse, "session">>;

const FAILURE_ANNOUNCEMENT = "发送失败，请重试或使用帮助中心或商务咨询。";
const UNAVAILABLE_ANNOUNCEMENT = "助手服务暂不可用，请使用帮助中心或商务咨询。";
const PUBLIC_ASSISTANT_ENDPOINT = "/api/v1/assistant/chat";
const REQUEST_CANCELLED = Symbol("assistant-request-cancelled");
const REQUEST_TIMEOUT = Symbol("assistant-request-timeout");

class SafeAssistantRequestFailure extends Error {}

export const ASSISTANT_REQUEST_TIMEOUT_MS = 15_000;

export type AssistantSessionOptions = {
  endpoint?: string;
  failureAnnouncement?: string;
  unavailableAnnouncement?: string;
  timeoutMs?: number;
  successResponseGuard?: (input: unknown) => input is AssistantSuccessfulBody;
};

type ActiveAssistantRequest = {
  controller: AbortController;
  rejectControl: (reason: symbol) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  token: number;
};

export type AssistantSession = {
  draft: string;
  messages: AssistantMessage[];
  latestAnnouncement: string;
  requestStatus: AssistantRequestStatus;
  lastFailedMessage: string | null;
  validationError: AssistantValidationError | null;
  sessionExpiresAt: string | null;
  setDraft: (draft: string) => void;
  submit: (message?: string) => Promise<void>;
  retry: () => Promise<void>;
};

function validateMessage(
  value: string,
):
  | { message: string; error: null }
  | { message: null; error: AssistantValidationError } {
  const message = value.trim();
  const length = Array.from(message).length;
  if (length === 0) {
    return {
      message: null,
      error: { code: "empty", message: "请输入问题。" },
    };
  }
  if (length > 500) {
    return {
      message: null,
      error: { code: "too_long", message: "问题不能超过 500 个字符。" },
    };
  }
  return { message, error: null };
}

function safeFailureAnnouncement(
  status: number,
  input: unknown,
  fallback: string,
  unavailable: string,
): string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return fallback;
  }
  const envelope = input as Record<string, unknown>;
  if (Object.keys(envelope).sort().join(",") !== "error,requestId,version") {
    return fallback;
  }
  const error = envelope.error;
  if (
    envelope.version !== "1" ||
    typeof envelope.requestId !== "string" ||
    envelope.requestId.trim().length === 0 ||
    typeof error !== "object" ||
    error === null ||
    Array.isArray(error)
  ) {
    return fallback;
  }
  const details = error as Record<string, unknown>;
  if (
    Object.keys(details).sort().join(",") !== "code,message,retryable" ||
    typeof details.retryable !== "boolean"
  ) {
    return fallback;
  }
  if (status === 429 && details.code === "rate_limited" && details.retryable) {
    return "请求过于频繁，请稍后再试。";
  }
  if (
    status === 503 &&
    details.code === "assistant_unavailable" &&
    details.retryable
  ) {
    return unavailable;
  }
  return fallback;
}

export function useAssistantSession(
  pathname: string,
  options: AssistantSessionOptions = {},
): AssistantSession {
  const endpoint = options.endpoint ?? PUBLIC_ASSISTANT_ENDPOINT;
  const failureAnnouncement =
    options.failureAnnouncement ?? FAILURE_ANNOUNCEMENT;
  const unavailableAnnouncement =
    options.unavailableAnnouncement ?? UNAVAILABLE_ANNOUNCEMENT;
  const timeoutMs = options.timeoutMs ?? ASSISTANT_REQUEST_TIMEOUT_MS;
  const successResponseGuard =
    options.successResponseGuard ?? isAssistantSuccessResponse;
  const [draft, setDraftState] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [latestAnnouncement, setLatestAnnouncement] = useState("");
  const [requestStatus, setRequestStatus] =
    useState<AssistantRequestStatus>("idle");
  const [lastFailedRequest, setLastFailedRequest] =
    useState<AssistantRequestPayload | null>(null);
  const [validationError, setValidationError] =
    useState<AssistantValidationError | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const requestStatusRef = useRef<AssistantRequestStatus>("idle");
  const requestToken = useRef(0);
  const activeRequest = useRef<ActiveAssistantRequest | null>(null);
  const nextMessageId = useRef(1);

  const updateRequestStatus = useCallback((status: AssistantRequestStatus) => {
    requestStatusRef.current = status;
    setRequestStatus(status);
  }, []);

  const cancelActiveRequest = useCallback((reason: symbol) => {
    const active = activeRequest.current;
    if (active === null) return;
    activeRequest.current = null;
    clearTimeout(active.timeoutId);
    active.controller.abort();
    active.rejectControl(reason);
  }, []);

  useEffect(() => {
    requestToken.current += 1;
    cancelActiveRequest(REQUEST_CANCELLED);
    if (requestStatusRef.current === "sending") updateRequestStatus("idle");
  }, [cancelActiveRequest, endpoint, timeoutMs, updateRequestStatus]);

  useEffect(
    () => () => {
      requestToken.current += 1;
      cancelActiveRequest(REQUEST_CANCELLED);
    },
    [cancelActiveRequest],
  );

  const send = useCallback(
    async (rawMessage: string, requestPathname: string) => {
      if (requestStatusRef.current === "sending") return;
      const validation = validateMessage(rawMessage);
      setValidationError(validation.error);
      if (validation.message === null) return;
      const message = validation.message;
      const payload: AssistantRequestPayload = {
        message,
        context: { pathname: requestPathname },
      };

      const token = ++requestToken.current;
      const controller = new AbortController();
      let rejectControl!: (reason: symbol) => void;
      let timedOut = false;
      const control = new Promise<never>((_resolve, reject) => {
        rejectControl = reject;
      });
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        rejectControl(REQUEST_TIMEOUT);
      }, timeoutMs);
      activeRequest.current = {
        controller,
        rejectControl,
        timeoutId,
        token,
      };
      updateRequestStatus("sending");
      setLatestAnnouncement("");
      try {
        const { response, body } = await Promise.race([
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          }).then(async (response) => ({
            response,
            body: await response.json().catch(() => null),
          })),
          control,
        ]);
        if (token !== requestToken.current) return;
        if (timedOut) throw REQUEST_TIMEOUT;
        if (controller.signal.aborted) return;
        if (!response.ok || !successResponseGuard(body)) {
          throw new SafeAssistantRequestFailure(
            safeFailureAnnouncement(
              response.status,
              body,
              failureAnnouncement,
              unavailableAnnouncement,
            ),
          );
        }

        setMessages((current) => [
          ...current,
          { id: nextMessageId.current++, role: "user", content: message },
          {
            id: nextMessageId.current++,
            role: "assistant",
            content: body.message.content,
            suggestedActions: safeAssistantSuggestedActions(
              body.suggestedActions,
            ),
          },
        ]);
        setDraftState((current) => (current.trim() === message ? "" : current));
        setLatestAnnouncement(body.message.content);
        setLastFailedRequest(null);
        if (body.session) setSessionExpiresAt(body.session.expiresAt);
        updateRequestStatus("idle");
      } catch (error) {
        if (token !== requestToken.current || error === REQUEST_CANCELLED) {
          return;
        }
        if (!timedOut && error !== REQUEST_TIMEOUT && controller.signal.aborted)
          return;
        if (
          !timedOut &&
          error !== REQUEST_TIMEOUT &&
          error instanceof DOMException &&
          error.name === "AbortError"
        )
          return;
        setLastFailedRequest(payload);
        setLatestAnnouncement(
          error instanceof SafeAssistantRequestFailure
            ? error.message
            : failureAnnouncement,
        );
        updateRequestStatus("failed");
      } finally {
        const active = activeRequest.current;
        if (active?.token === token) {
          clearTimeout(active.timeoutId);
          activeRequest.current = null;
        }
      }
    },
    [
      endpoint,
      failureAnnouncement,
      unavailableAnnouncement,
      successResponseGuard,
      timeoutMs,
      updateRequestStatus,
    ],
  );

  const submit = useCallback(
    (message = draft) => send(message, pathname),
    [draft, pathname, send],
  );
  const retry = useCallback(async () => {
    if (lastFailedRequest !== null) {
      await send(lastFailedRequest.message, lastFailedRequest.context.pathname);
    }
  }, [lastFailedRequest, send]);

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    const trimmedLength = Array.from(value.trim()).length;
    setValidationError(
      trimmedLength > 500
        ? { code: "too_long", message: "问题不能超过 500 个字符。" }
        : null,
    );
  }, []);

  return {
    draft,
    messages,
    latestAnnouncement,
    requestStatus,
    lastFailedMessage: lastFailedRequest?.message ?? null,
    validationError,
    sessionExpiresAt,
    setDraft,
    submit,
    retry,
  };
}

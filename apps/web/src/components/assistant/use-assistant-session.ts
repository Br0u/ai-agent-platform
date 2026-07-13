"use client";

import {
  isAssistantSuccessResponse,
  safeAssistantSuggestedActions,
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

const FAILURE_ANNOUNCEMENT = "发送失败，请重试或使用帮助中心或商务咨询。";
const PUBLIC_ASSISTANT_ENDPOINT = "/api/v1/assistant/chat";
const NAVIGATION_ABORT = Symbol("assistant-navigation-abort");
const REQUEST_TIMEOUT = Symbol("assistant-request-timeout");

export const ASSISTANT_REQUEST_TIMEOUT_MS = 15_000;

export type AssistantSessionOptions = {
  endpoint?: string;
  timeoutMs?: number;
};

type ActiveAssistantRequest = {
  controller: AbortController;
  rejectControl: (reason: symbol) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  token: number;
};

export type AssistantSession = {
  open: boolean;
  draft: string;
  messages: AssistantMessage[];
  latestAnnouncement: string;
  requestStatus: AssistantRequestStatus;
  lastFailedMessage: string | null;
  validationError: AssistantValidationError | null;
  setDraft: (draft: string) => void;
  openAssistant: () => void;
  closeAssistant: () => void;
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

export function useAssistantSession(
  pathname: string,
  options: AssistantSessionOptions = {},
): AssistantSession {
  const endpoint = options.endpoint ?? PUBLIC_ASSISTANT_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? ASSISTANT_REQUEST_TIMEOUT_MS;
  const [open, setOpen] = useState(false);
  const [draft, setDraftState] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [latestAnnouncement, setLatestAnnouncement] = useState("");
  const [requestStatus, setRequestStatus] =
    useState<AssistantRequestStatus>("idle");
  const [lastFailedRequest, setLastFailedRequest] =
    useState<AssistantRequestPayload | null>(null);
  const [validationError, setValidationError] =
    useState<AssistantValidationError | null>(null);
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
    cancelActiveRequest(NAVIGATION_ABORT);
    if (requestStatusRef.current === "sending") updateRequestStatus("idle");
  }, [cancelActiveRequest, endpoint, pathname, timeoutMs, updateRequestStatus]);

  useEffect(
    () => () => {
      requestToken.current += 1;
      cancelActiveRequest(NAVIGATION_ABORT);
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
            body: response.ok ? await response.json() : null,
          })),
          control,
        ]);
        if (token !== requestToken.current) return;
        if (timedOut) throw REQUEST_TIMEOUT;
        if (controller.signal.aborted) return;
        if (!response.ok || !isAssistantSuccessResponse(body)) {
          throw new Error("Assistant request failed");
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
        updateRequestStatus("idle");
      } catch (error) {
        if (token !== requestToken.current || error === NAVIGATION_ABORT) {
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
        setLatestAnnouncement(FAILURE_ANNOUNCEMENT);
        updateRequestStatus("failed");
      } finally {
        const active = activeRequest.current;
        if (active?.token === token) {
          clearTimeout(active.timeoutId);
          activeRequest.current = null;
        }
      }
    },
    [endpoint, timeoutMs, updateRequestStatus],
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
    open,
    draft,
    messages,
    latestAnnouncement,
    requestStatus,
    lastFailedMessage: lastFailedRequest?.message ?? null,
    validationError,
    setDraft,
    openAssistant: () => setOpen(true),
    closeAssistant: () => setOpen(false),
    submit,
    retry,
  };
}

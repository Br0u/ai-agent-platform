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

export function useAssistantSession(pathname: string): AssistantSession {
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
  const activeController = useRef<AbortController | null>(null);
  const nextMessageId = useRef(1);

  const updateRequestStatus = useCallback((status: AssistantRequestStatus) => {
    requestStatusRef.current = status;
    setRequestStatus(status);
  }, []);

  useEffect(() => {
    requestToken.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    if (requestStatusRef.current === "sending") updateRequestStatus("idle");
  }, [pathname, updateRequestStatus]);

  useEffect(
    () => () => {
      requestToken.current += 1;
      activeController.current?.abort();
    },
    [],
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
      activeController.current = controller;
      updateRequestStatus("sending");
      setLatestAnnouncement("");
      try {
        const response = await fetch("/api/v1/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const body: unknown = response.ok ? await response.json() : null;
        if (token !== requestToken.current || controller.signal.aborted) return;
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
        if (
          token !== requestToken.current ||
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setLastFailedRequest(payload);
        setLatestAnnouncement(FAILURE_ANNOUNCEMENT);
        updateRequestStatus("failed");
      } finally {
        if (token === requestToken.current) activeController.current = null;
      }
    },
    [updateRequestStatus],
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

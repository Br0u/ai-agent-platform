"use client";

import { matchRoute } from "@/config/routes";
import {
  ASSISTANT_CHAT_REQUEST_MAX_BYTES,
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  ASSISTANT_HISTORY_CONTENT_MAX_CODE_POINTS,
  ASSISTANT_HISTORY_MAX_CODE_POINTS,
  ASSISTANT_HISTORY_MAX_MESSAGES,
  ASSISTANT_INPUT_BLOCKED_MESSAGE,
  ASSISTANT_PATHNAME_MAX_CODE_POINTS,
  ASSISTANT_SEARCH_MAX_CODE_POINTS,
  isAssistantSuccessResponse,
  safeAssistantSuggestedActions,
  type AssistantHistoryMessage,
  type AssistantRequest,
  type AssistantStreamActionEvent,
  type AssistantStreamActivityEvent,
  type AssistantSuccessResponse,
  type AssistantSuggestedAction,
} from "@/features/assistant/assistant-contract";
import {
  ASSISTANT_STREAM_MEDIA_TYPE,
  parseAssistantStreamFrame,
} from "@/features/assistant/assistant-stream";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

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
  activities: AssistantStreamActivityEvent[];
  actions: AssistantStreamActionEvent["action"][];
  incomplete?: boolean;
};

export type AssistantMessage = UserAssistantMessage | ResponseAssistantMessage;
export type AssistantRequestStatus = "idle" | "sending" | "failed";
export type AssistantValidationError = {
  code: "empty" | "too_long";
  message: string;
};

type AssistantSuccessfulBody = Pick<
  AssistantSuccessResponse,
  "message" | "suggestedActions"
>;

const FAILURE_ANNOUNCEMENT = "发送失败，请重试或使用帮助中心或商务咨询。";
const UNAVAILABLE_ANNOUNCEMENT = "助手服务暂不可用，请使用帮助中心或商务咨询。";
const PUBLIC_ASSISTANT_ENDPOINT = "/api/v1/assistant/chat";
const REQUEST_CANCELLED = Symbol("assistant-request-cancelled");
const REQUEST_TIMEOUT = Symbol("assistant-request-timeout");
const EXCLUDED_PAGE_ROUTES = new Set([
  "/assistant",
  "/login",
  "/register",
  "/staff/login",
  "/staff/change-password",
]);

class SafeAssistantRequestFailure extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}

export const ASSISTANT_REQUEST_TIMEOUT_MS = 60_000;

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
  preserveOnNextPathnameChange: (pathname: string) => void;
  setDraft: (draft: string) => void;
  submit: (message?: string) => Promise<void>;
  retry: () => Promise<void>;
};

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function truncateCodePoints(value: string, maximum: number): string {
  return Array.from(value.trim()).slice(0, maximum).join("");
}

function validateMessage(
  value: string,
):
  | { message: string; error: null }
  | { message: null; error: AssistantValidationError } {
  const message = value.trim();
  const length = codePointLength(message);
  if (length === 0) {
    return { message: null, error: { code: "empty", message: "请输入问题。" } };
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
): { message: string; retryable: boolean } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { message: fallback, retryable: true };
  }
  const envelope = input as Record<string, unknown>;
  if (Object.keys(envelope).sort().join(",") !== "error,requestId,version") {
    return { message: fallback, retryable: true };
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
    return { message: fallback, retryable: true };
  }
  const details = error as Record<string, unknown>;
  if (
    Object.keys(details).sort().join(",") !== "code,message,retryable" ||
    typeof details.retryable !== "boolean"
  ) {
    return { message: fallback, retryable: true };
  }
  if (status === 429 && details.code === "rate_limited" && details.retryable) {
    return { message: "请求过于频繁，请稍后再试。", retryable: true };
  }
  if (
    status === 503 &&
    details.code === "assistant_unavailable" &&
    details.retryable
  ) {
    return { message: unavailable, retryable: true };
  }
  if (
    status === 422 &&
    details.code === "input_blocked" &&
    details.message === ASSISTANT_INPUT_BLOCKED_MESSAGE &&
    details.retryable === false
  ) {
    return { message: ASSISTANT_INPUT_BLOCKED_MESSAGE, retryable: false };
  }
  return { message: fallback, retryable: true };
}

function responseMediaType(response: Response): string | null {
  return (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() ?? null
  );
}

function normalizedPathname(pathname: string): string | null {
  if (
    codePointLength(pathname) > ASSISTANT_PATHNAME_MAX_CODE_POINTS ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    /[\\?#\u0000-\u001f\u007f]/u.test(pathname)
  ) {
    return null;
  }
  try {
    const parsed = new URL(pathname, "http://assistant.local");
    if (
      parsed.origin !== "http://assistant.local" ||
      (parsed.pathname !== pathname && parsed.pathname !== encodeURI(pathname))
    ) {
      return null;
    }
    return pathname.replace(/\/+$/u, "") || "/";
  } catch {
    return null;
  }
}

function normalizedSearch(search: string): string | null {
  if (
    codePointLength(search) > ASSISTANT_SEARCH_MAX_CODE_POINTS ||
    (search !== "" && !search.startsWith("?")) ||
    search.includes("#") ||
    /[\u0000-\u001f\u007f]/u.test(search)
  ) {
    return null;
  }
  try {
    return new URL(`/safe${search}`, "http://assistant.local").search === search
      ? search
      : null;
  } catch {
    return null;
  }
}

function currentPage(pathname: string): AssistantRequest["page"] {
  const normalizedPath = normalizedPathname(pathname);
  const search = normalizedSearch(window.location.search);
  if (normalizedPath === null || search === null) return null;
  const route = matchRoute(normalizedPath);
  if (
    route?.group !== "public" ||
    route.status !== "live" ||
    EXCLUDED_PAGE_ROUTES.has(normalizedPath)
  ) {
    return null;
  }
  return { pathname: normalizedPath, search };
}

function completeTurns(messages: readonly AssistantMessage[]) {
  const turns: [AssistantHistoryMessage, AssistantHistoryMessage][] = [];
  for (let index = 0; index + 1 < messages.length; index += 2) {
    const user = messages[index];
    const assistant = messages[index + 1];
    if (user?.role !== "user" || assistant?.role !== "assistant") break;
    if (assistant.incomplete) continue;
    const userContent = truncateCodePoints(
      user.content,
      ASSISTANT_HISTORY_CONTENT_MAX_CODE_POINTS,
    );
    const assistantContent = truncateCodePoints(
      assistant.content,
      ASSISTANT_HISTORY_CONTENT_MAX_CODE_POINTS,
    );
    if (userContent && assistantContent) {
      turns.push([
        { role: "user", content: userContent },
        { role: "assistant", content: assistantContent },
      ]);
    }
  }
  return turns;
}

function requestPayload(
  message: string,
  pathname: string,
  messages: readonly AssistantMessage[],
): AssistantRequest {
  const page = currentPage(pathname);
  let history: AssistantHistoryMessage[] = [];
  let historyCodePoints = 0;
  const turns = completeTurns(messages).slice(
    -(ASSISTANT_HISTORY_MAX_MESSAGES / 2),
  );
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]!;
    const turnCodePoints = turn.reduce(
      (total, item) => total + codePointLength(item.content),
      0,
    );
    const candidateHistory = [...turn, ...history];
    const candidate: AssistantRequest = {
      version: "2",
      message,
      history: candidateHistory,
      page,
    };
    if (
      historyCodePoints + turnCodePoints > ASSISTANT_HISTORY_MAX_CODE_POINTS ||
      new TextEncoder().encode(JSON.stringify(candidate)).byteLength >
        ASSISTANT_CHAT_REQUEST_MAX_BYTES
    ) {
      break;
    }
    history = candidateHistory;
    historyCodePoints += turnCodePoints;
  }
  return { version: "2", message, history, page };
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
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(
    null,
  );
  const [validationError, setValidationError] =
    useState<AssistantValidationError | null>(null);
  const messagesRef = useRef<AssistantMessage[]>([]);
  const requestStatusRef = useRef<AssistantRequestStatus>("idle");
  const requestToken = useRef(0);
  const activeRequest = useRef<ActiveAssistantRequest | null>(null);
  const nextMessageId = useRef(1);
  const previousPathname = useRef(pathname);
  const preservedPathname = useRef<string | null>(null);

  const replaceMessages = useCallback(
    (update: (current: AssistantMessage[]) => AssistantMessage[]) => {
      setMessages((current) => {
        const next = update(current);
        messagesRef.current = next;
        return next;
      });
    },
    [],
  );

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

  useLayoutEffect(() => {
    if (previousPathname.current === pathname) return;
    const preserveSession = preservedPathname.current === pathname;
    preservedPathname.current = null;
    previousPathname.current = pathname;
    if (preserveSession) return;
    requestToken.current += 1;
    cancelActiveRequest(REQUEST_CANCELLED);
    messagesRef.current = [];
    setMessages([]);
    setDraftState("");
    setLatestAnnouncement("");
    setLastFailedMessage(null);
    setValidationError(null);
    nextMessageId.current = 1;
    updateRequestStatus("idle");
  }, [cancelActiveRequest, pathname, updateRequestStatus]);

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
      const payload = requestPayload(
        message,
        requestPathname,
        messagesRef.current,
      );
      const token = ++requestToken.current;
      const controller = new AbortController();
      let rejectControl!: (reason: symbol) => void;
      let timedOut = false;
      const control = new Promise<never>((_resolve, reject) => {
        rejectControl = reject;
      });
      const expireRequest = () => {
        timedOut = true;
        controller.abort();
        rejectControl(REQUEST_TIMEOUT);
      };
      const timeoutId = setTimeout(expireRequest, timeoutMs);
      activeRequest.current = { controller, rejectControl, timeoutId, token };
      updateRequestStatus("sending");
      setLatestAnnouncement("");
      let streamedMessageIds: { user: number; assistant: number } | null = null;
      try {
        const response = await Promise.race([
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          }),
          control,
        ]);
        if (token !== requestToken.current) return;
        if (timedOut) throw REQUEST_TIMEOUT;
        if (controller.signal.aborted) return;

        if (!response.ok) {
          const body = await Promise.race([
            response.json().catch(() => null),
            control,
          ]);
          const failure = safeFailureAnnouncement(
            response.status,
            body,
            failureAnnouncement,
            unavailableAnnouncement,
          );
          throw new SafeAssistantRequestFailure(
            failure.message,
            failure.retryable,
          );
        }

        if (responseMediaType(response) === ASSISTANT_STREAM_MEDIA_TYPE) {
          const reader = response.body?.getReader();
          if (reader === undefined) {
            throw new SafeAssistantRequestFailure(failureAnnouncement);
          }
          const decoder = new TextDecoder("utf-8", { fatal: true });
          let buffer = "";
          let assistantInserted = false;
          let done = false;
          let content = "";
          let contentCodePoints = 0;
          const activities: AssistantStreamActivityEvent[] = [];
          const actions: AssistantStreamActionEvent["action"][] = [];

          const ensureStreamedAssistant = () => {
            if (assistantInserted) return;
            assistantInserted = true;
            streamedMessageIds = {
              user: nextMessageId.current++,
              assistant: nextMessageId.current++,
            };
            replaceMessages((current) => [
              ...current,
              {
                id: streamedMessageIds!.user,
                role: "user",
                content: message,
              },
              {
                id: streamedMessageIds!.assistant,
                role: "assistant",
                content,
                suggestedActions: [],
                activities: [...activities],
                actions: [...actions],
              },
            ]);
          };

          const updateStreamedAssistant = () => {
            if (!assistantInserted || streamedMessageIds === null) return;
            const assistantId = streamedMessageIds.assistant;
            replaceMessages((current) =>
              current.map((item) =>
                item.id === assistantId && item.role === "assistant"
                  ? {
                      ...item,
                      content,
                      activities: [...activities],
                      actions: [...actions],
                    }
                  : item,
              ),
            );
          };

          const consumeFrame = (rawFrame: string) => {
            const event = parseAssistantStreamFrame(rawFrame);
            if (event === null || done) {
              throw new SafeAssistantRequestFailure(failureAnnouncement);
            }
            if (event.type === "error") {
              throw new SafeAssistantRequestFailure(failureAnnouncement);
            }
            if (event.type === "activity") {
              activities.push(event);
              ensureStreamedAssistant();
              updateStreamedAssistant();
              return;
            }
            if (event.type === "action") {
              actions.push(event.action);
              ensureStreamedAssistant();
              updateStreamedAssistant();
              return;
            }
            if (event.type === "answer_delta") {
              contentCodePoints += codePointLength(event.content);
              if (contentCodePoints > ASSISTANT_CONTENT_MAX_CODE_POINTS) {
                throw new SafeAssistantRequestFailure(failureAnnouncement);
              }
              content += event.content;
              ensureStreamedAssistant();
              updateStreamedAssistant();
              return;
            }
            if (!assistantInserted || content.trim().length === 0) {
              throw new SafeAssistantRequestFailure(failureAnnouncement);
            }
            done = true;
          };

          let streamCompleted = false;
          try {
            while (true) {
              const chunk = await Promise.race([reader.read(), control]);
              if (token !== requestToken.current) throw REQUEST_CANCELLED;
              if (timedOut) throw REQUEST_TIMEOUT;
              if (chunk.done) {
                streamCompleted = true;
                break;
              }
              buffer += decoder.decode(chunk.value, { stream: true });
              buffer = buffer.replaceAll("\r\n", "\n");
              let boundary = buffer.indexOf("\n\n");
              while (boundary !== -1) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                if (frame.length > 0) consumeFrame(frame);
                boundary = buffer.indexOf("\n\n");
              }
            }
            buffer += decoder.decode();
            buffer = buffer.replaceAll("\r\n", "\n");
            if (buffer.trim().length > 0 || !done) {
              throw new SafeAssistantRequestFailure(failureAnnouncement);
            }
          } finally {
            if (!streamCompleted) await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }

          setDraftState((current) =>
            current.trim() === message ? "" : current,
          );
          setLatestAnnouncement(content);
          setLastFailedMessage(null);
          updateRequestStatus("idle");
        } else {
          const body = await Promise.race([
            response.json().catch(() => null),
            control,
          ]);
          if (!successResponseGuard(body)) {
            throw new SafeAssistantRequestFailure(failureAnnouncement);
          }
          replaceMessages((current) => [
            ...current,
            { id: nextMessageId.current++, role: "user", content: message },
            {
              id: nextMessageId.current++,
              role: "assistant",
              content: body.message.content,
              suggestedActions: safeAssistantSuggestedActions(
                body.suggestedActions,
              ),
              activities: [],
              actions: [],
            },
          ]);
          setDraftState((current) =>
            current.trim() === message ? "" : current,
          );
          setLatestAnnouncement(body.message.content);
          setLastFailedMessage(null);
          updateRequestStatus("idle");
        }
      } catch (error) {
        const discardStreamedMessages = () => {
          if (streamedMessageIds === null) return;
          const ids = streamedMessageIds;
          replaceMessages((current) =>
            current.filter(
              (item) => item.id !== ids.user && item.id !== ids.assistant,
            ),
          );
        };
        const retainIncompleteStream = () => {
          if (streamedMessageIds === null) return;
          const assistantId = streamedMessageIds.assistant;
          replaceMessages((current) =>
            current.map((item) =>
              item.role === "assistant" && item.id === assistantId
                ? {
                    ...item,
                    suggestedActions: [],
                    actions: [],
                    incomplete: true,
                  }
                : item,
            ),
          );
        };
        if (token !== requestToken.current || error === REQUEST_CANCELLED) {
          discardStreamedMessages();
          return;
        }
        if (
          !timedOut &&
          error !== REQUEST_TIMEOUT &&
          controller.signal.aborted
        ) {
          discardStreamedMessages();
          return;
        }
        if (
          !timedOut &&
          error !== REQUEST_TIMEOUT &&
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          discardStreamedMessages();
          return;
        }
        retainIncompleteStream();
        setLastFailedMessage(
          error instanceof SafeAssistantRequestFailure && !error.retryable
            ? null
            : message,
        );
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
      replaceMessages,
      successResponseGuard,
      timeoutMs,
      unavailableAnnouncement,
      updateRequestStatus,
    ],
  );

  const submit = useCallback(
    (message = draft) => send(message, pathname),
    [draft, pathname, send],
  );
  const retry = useCallback(async () => {
    if (lastFailedMessage !== null) {
      await send(lastFailedMessage, pathname);
    }
  }, [lastFailedMessage, pathname, send]);

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    setValidationError(
      codePointLength(value.trim()) > 500
        ? { code: "too_long", message: "问题不能超过 500 个字符。" }
        : null,
    );
  }, []);

  const preserveOnNextPathnameChange = useCallback((nextPathname: string) => {
    preservedPathname.current = nextPathname;
  }, []);

  return {
    draft,
    messages,
    latestAnnouncement,
    requestStatus,
    lastFailedMessage,
    validationError,
    preserveOnNextPathnameChange,
    setDraft,
    submit,
    retry,
  };
}

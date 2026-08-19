export interface AssistantRequest {
  version: "2";
  message: string;
  history: AssistantHistoryMessage[];
  page: {
    pathname: string;
    search: string;
  } | null;
}

export interface AssistantHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantSuggestedAction {
  label: string;
  href: string;
}

export const ASSISTANT_REQUEST_MESSAGE_MAX_CODE_POINTS = 500;
export const ASSISTANT_HISTORY_CONTENT_MAX_CODE_POINTS = 8_000;
export const ASSISTANT_HISTORY_MAX_CODE_POINTS = 32_000;
export const ASSISTANT_HISTORY_MAX_MESSAGES = 12;
export const ASSISTANT_PATHNAME_MAX_CODE_POINTS = 256;
export const ASSISTANT_SEARCH_MAX_CODE_POINTS = 1_024;
export const ASSISTANT_CHAT_REQUEST_MAX_BYTES = 64 * 1024;
export const ASSISTANT_REQUEST_ID_MAX_CODE_POINTS = 128;
export const ASSISTANT_MESSAGE_ID_MAX_CODE_POINTS = 128;
export const ASSISTANT_CONTENT_MAX_CODE_POINTS = 32_768;
export const ASSISTANT_MAX_SUGGESTED_ACTIONS = 8;
export const ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS = 120;
export const ASSISTANT_ACTION_HREF_MAX_CODE_POINTS = 2_048;
export const ASSISTANT_INPUT_BLOCKED_MESSAGE = "该问题无法提交，请调整表述";

export const ASSISTANT_PRESET_QUESTIONS = [
  "如何开始了解平台？",
  "如何获取部署支持？",
  "如何提交产品问题？",
] as const;

export type AssistantPresetQuestion =
  (typeof ASSISTANT_PRESET_QUESTIONS)[number];

export interface AssistantResponseMessage {
  id: string;
  role: "assistant";
  content: string;
}

export type AssistantMode = "placeholder" | "agentos";

export interface AssistantSuccessResponse {
  version: "1";
  requestId: string;
  mode: AssistantMode;
  message: AssistantResponseMessage;
  suggestedActions: AssistantSuggestedAction[];
}

export interface AssistantStreamActivityEvent {
  type: "activity";
  phase: "reading" | "analyzing" | "tool";
  label: string;
}

export interface AssistantStreamAnswerDeltaEvent {
  type: "answer_delta";
  content: string;
}

export interface AssistantStreamActionEvent {
  type: "action";
  action: {
    kind: "navigate";
    pathname: string;
    label: string;
  };
}

export interface AssistantStreamDoneEvent {
  type: "done";
}

export interface AssistantStreamErrorEvent {
  type: "error";
  code: "stream_interrupted";
  message: string;
}

export type AssistantStreamEventData =
  | AssistantStreamActivityEvent
  | AssistantStreamAnswerDeltaEvent
  | AssistantStreamActionEvent
  | AssistantStreamDoneEvent
  | AssistantStreamErrorEvent;

export type AssistantErrorCode =
  | "validation_error"
  | "input_blocked"
  | "rate_limited"
  | "assistant_unavailable";

export interface AssistantErrorResponse {
  version: "1";
  requestId: string;
  error: {
    code: AssistantErrorCode;
    message: string;
    retryable: boolean;
  };
}

export type AssistantCapability = "placeholder" | "available" | "degraded";

export interface AssistantStatusResponse {
  version: "1";
  requestId: string;
  live: boolean;
  ready: boolean;
  capability: AssistantCapability;
  message: string;
}

export interface AssistantProviderReply {
  content: string;
  suggestedActions: AssistantSuggestedAction[];
}

export function createAssistantErrorResponse(
  requestId: string,
  code: AssistantErrorCode,
): AssistantErrorResponse {
  const messages: Record<AssistantErrorCode, string> = {
    validation_error: "请输入 1 至 500 个字符的问题。",
    input_blocked: ASSISTANT_INPUT_BLOCKED_MESSAGE,
    rate_limited: "请求过于频繁，请稍后再试。",
    assistant_unavailable: "助手服务暂不可用，请使用帮助中心或商务咨询。",
  };

  return {
    version: "1",
    requestId,
    error: {
      code,
      message: messages[code],
      retryable: code !== "validation_error" && code !== "input_blocked",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, i) => key === expected[i])
  );
}

export function hasAtMostCodePoints(value: string, maximum: number): boolean {
  let count = 0;
  const codePoints = value[Symbol.iterator]();
  while (!codePoints.next().done) {
    count += 1;
    if (count > maximum) return false;
  }
  return true;
}

function isNonBlankBoundedString(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    hasAtMostCodePoints(value, maximum)
  );
}

export function isAssistantRequestId(value: unknown): value is string {
  return isNonBlankBoundedString(value, ASSISTANT_REQUEST_ID_MAX_CODE_POINTS);
}

export function isAssistantMessageId(value: unknown): value is string {
  return isNonBlankBoundedString(value, ASSISTANT_MESSAGE_ID_MAX_CODE_POINTS);
}

function isNormalizedPathname(pathname: string): boolean {
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    pathname.includes("?") ||
    pathname.includes("#") ||
    /[\u0000-\u001f\u007f]/u.test(pathname)
  ) {
    return false;
  }

  try {
    const base = new URL("http://assistant.local");
    const parsed = new URL(pathname, base);
    return (
      parsed.origin === base.origin &&
      parsed.search === "" &&
      parsed.hash === "" &&
      (parsed.pathname === pathname || parsed.pathname === encodeURI(pathname))
    );
  } catch {
    return false;
  }
}

export function isAssistantPresetQuestion(
  value: string,
): value is AssistantPresetQuestion {
  return (ASSISTANT_PRESET_QUESTIONS as readonly string[]).includes(value);
}

export function isSafeAssistantActionHref(href: string): boolean {
  const suffixIndex = href.search(/[?#]/u);
  const pathname = suffixIndex === -1 ? href : href.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : href.slice(suffixIndex);

  if (!isNormalizedPathname(pathname)) return false;

  try {
    const decodedPathname = decodeURIComponent(pathname);
    const decodedSuffix = decodeURIComponent(suffix);
    return (
      !decodedPathname.startsWith("//") &&
      !/[\\?#\u0000-\u001f\u007f]/u.test(decodedPathname) &&
      !/[\\\u0000-\u001f\u007f]/u.test(decodedSuffix) &&
      !decodedSuffix.includes("://") &&
      !decodedSuffix.includes("//")
    );
  } catch {
    return false;
  }
}

export function safeAssistantSuggestedActions(
  actions: readonly AssistantSuggestedAction[],
): AssistantSuggestedAction[] {
  return actions.filter((action) => isSafeAssistantActionHref(action.href));
}

function isAssistantSuggestedAction(
  value: unknown,
): value is AssistantSuggestedAction {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["href", "label"]) &&
    isNonBlankBoundedString(
      value.label,
      ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS,
    ) &&
    isNonBlankBoundedString(value.href, ASSISTANT_ACTION_HREF_MAX_CODE_POINTS)
  );
}

export function isAssistantProviderReply(
  value: unknown,
): value is AssistantProviderReply {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["content", "suggestedActions"]) &&
    isNonBlankBoundedString(value.content, ASSISTANT_CONTENT_MAX_CODE_POINTS) &&
    Array.isArray(value.suggestedActions) &&
    value.suggestedActions.length <= ASSISTANT_MAX_SUGGESTED_ACTIONS &&
    value.suggestedActions.every(isAssistantSuggestedAction)
  );
}

export function isAssistantStatusResponse(
  input: unknown,
): input is AssistantStatusResponse {
  if (
    !(
      isRecord(input) &&
      hasExactKeys(input, [
        "version",
        "requestId",
        "live",
        "ready",
        "capability",
        "message",
      ]) &&
      input.version === "1" &&
      isAssistantRequestId(input.requestId) &&
      typeof input.live === "boolean" &&
      typeof input.ready === "boolean" &&
      (input.capability === "placeholder" ||
        input.capability === "available" ||
        input.capability === "degraded") &&
      isNonBlankBoundedString(input.message, ASSISTANT_CONTENT_MAX_CODE_POINTS)
    )
  ) {
    return false;
  }

  return input.ready
    ? input.live && input.capability !== "degraded"
    : input.capability === "degraded";
}

export function isAssistantSuccessResponse(
  input: unknown,
): input is AssistantSuccessResponse {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "version",
      "requestId",
      "mode",
      "message",
      "suggestedActions",
    ]) ||
    input.version !== "1" ||
    !isAssistantRequestId(input.requestId) ||
    (input.mode !== "placeholder" && input.mode !== "agentos") ||
    !isRecord(input.message) ||
    !hasExactKeys(input.message, ["id", "role", "content"]) ||
    !isAssistantMessageId(input.message.id) ||
    input.message.role !== "assistant" ||
    !isNonBlankBoundedString(
      input.message.content,
      ASSISTANT_CONTENT_MAX_CODE_POINTS,
    ) ||
    !Array.isArray(input.suggestedActions) ||
    input.suggestedActions.length > ASSISTANT_MAX_SUGGESTED_ACTIONS
  ) {
    return false;
  }

  return input.suggestedActions.every(isAssistantSuggestedAction);
}

export function isAssistantStreamEventData(
  input: unknown,
): input is AssistantStreamEventData {
  if (!isRecord(input) || typeof input.type !== "string") return false;

  if (input.type === "activity") {
    return (
      hasExactKeys(input, ["type", "phase", "label"]) &&
      (input.phase === "reading" ||
        input.phase === "analyzing" ||
        input.phase === "tool") &&
      isNonBlankBoundedString(
        input.label,
        ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS,
      )
    );
  }
  if (input.type === "answer_delta") {
    return (
      hasExactKeys(input, ["type", "content"]) &&
      typeof input.content === "string" &&
      input.content.length > 0 &&
      hasAtMostCodePoints(input.content, ASSISTANT_CONTENT_MAX_CODE_POINTS)
    );
  }
  if (input.type === "action") {
    return (
      hasExactKeys(input, ["type", "action"]) &&
      isRecord(input.action) &&
      hasExactKeys(input.action, ["kind", "pathname", "label"]) &&
      input.action.kind === "navigate" &&
      typeof input.action.pathname === "string" &&
      hasAtMostCodePoints(
        input.action.pathname,
        ASSISTANT_ACTION_HREF_MAX_CODE_POINTS,
      ) &&
      hasAtMostCodePoints(
        input.action.pathname.split(/[?#]/u, 1)[0] ?? "",
        ASSISTANT_PATHNAME_MAX_CODE_POINTS,
      ) &&
      isSafeAssistantActionHref(input.action.pathname) &&
      isNonBlankBoundedString(
        input.action.label,
        ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS,
      )
    );
  }
  if (input.type === "done") {
    return hasExactKeys(input, ["type"]);
  }
  return (
    input.type === "error" &&
    hasExactKeys(input, ["type", "code", "message"]) &&
    input.code === "stream_interrupted" &&
    isNonBlankBoundedString(input.message, ASSISTANT_CONTENT_MAX_CODE_POINTS)
  );
}

export function parseAssistantRequest(input: unknown): AssistantRequest | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ["version", "message", "history", "page"]) ||
    input.version !== "2" ||
    typeof input.message !== "string"
  ) {
    return null;
  }

  const message = input.message.trim();
  if (
    message.length < 1 ||
    !hasAtMostCodePoints(message, ASSISTANT_REQUEST_MESSAGE_MAX_CODE_POINTS)
  ) {
    return null;
  }

  if (
    !Array.isArray(input.history) ||
    input.history.length > ASSISTANT_HISTORY_MAX_MESSAGES ||
    input.history.length % 2 !== 0
  ) {
    return null;
  }

  let historyCodePoints = 0;
  const history: AssistantHistoryMessage[] = [];
  for (const [index, item] of input.history.entries()) {
    const role = index % 2 === 0 ? "user" : "assistant";
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ["role", "content"]) ||
      item.role !== role ||
      !isNonBlankBoundedString(
        item.content,
        ASSISTANT_HISTORY_CONTENT_MAX_CODE_POINTS,
      )
    ) {
      return null;
    }
    const content = item.content.trim();
    historyCodePoints += Array.from(item.content).length;
    if (historyCodePoints > ASSISTANT_HISTORY_MAX_CODE_POINTS) return null;
    history.push({ role, content });
  }

  if (input.page === null) {
    return { version: "2", message, history, page: null };
  }
  if (
    !isRecord(input.page) ||
    !hasExactKeys(input.page, ["pathname", "search"]) ||
    typeof input.page.pathname !== "string" ||
    !hasAtMostCodePoints(
      input.page.pathname,
      ASSISTANT_PATHNAME_MAX_CODE_POINTS,
    ) ||
    !isNormalizedPathname(input.page.pathname) ||
    typeof input.page.search !== "string" ||
    !hasAtMostCodePoints(input.page.search, ASSISTANT_SEARCH_MAX_CODE_POINTS) ||
    !isNormalizedSearch(input.page.search)
  ) {
    return null;
  }

  return {
    version: "2",
    message,
    history,
    page: { pathname: input.page.pathname, search: input.page.search },
  };
}

function isNormalizedSearch(search: string): boolean {
  if (
    (search !== "" && !search.startsWith("?")) ||
    search.includes("#") ||
    /[\u0000-\u001f\u007f]/u.test(search)
  ) {
    return false;
  }

  try {
    return (
      new URL(`/safe${search}`, "http://assistant.local").search === search
    );
  } catch {
    return false;
  }
}

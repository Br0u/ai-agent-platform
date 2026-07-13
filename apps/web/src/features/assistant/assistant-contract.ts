export interface AssistantRequest {
  message: string;
  context: {
    pathname: string;
  };
}

export interface AssistantSuggestedAction {
  label: string;
  href: string;
}

export const ASSISTANT_REQUEST_MESSAGE_MAX_CODE_POINTS = 500;
export const ASSISTANT_PATHNAME_MAX_CODE_POINTS = 256;
export const ASSISTANT_REQUEST_ID_MAX_CODE_POINTS = 128;
export const ASSISTANT_MESSAGE_ID_MAX_CODE_POINTS = 128;
export const ASSISTANT_CONTENT_MAX_CODE_POINTS = 32_768;
export const ASSISTANT_MAX_SUGGESTED_ACTIONS = 8;
export const ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS = 120;
export const ASSISTANT_ACTION_HREF_MAX_CODE_POINTS = 2_048;

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
  session: { temporary: true; expiresAt: string };
  message: AssistantResponseMessage;
  suggestedActions: AssistantSuggestedAction[];
}

export type AssistantErrorCode =
  | "validation_error"
  | "rate_limited"
  | "assistant_unavailable";

export interface AssistantErrorResponse {
  version: "1";
  requestId: string;
  error: {
    code: AssistantErrorCode;
    message: string;
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
    rate_limited: "请求过于频繁，请稍后再试。",
    assistant_unavailable: "助手服务暂不可用，请使用帮助中心或商务咨询。",
  };

  return { version: "1", requestId, error: { code, message: messages[code] } };
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

function hasAtMostCodePoints(value: string, maximum: number): boolean {
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
  const hashIndex = href.indexOf("#");
  const pathname = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : href.slice(hashIndex + 1);

  if (!isNormalizedPathname(pathname) || href.includes("?")) return false;

  try {
    const decodedPathname = decodeURIComponent(pathname);
    const decodedFragment = decodeURIComponent(fragment);
    return (
      !decodedPathname.startsWith("//") &&
      !/[\\?#\u0000-\u001f\u007f]/u.test(decodedPathname) &&
      !/[\\\u0000-\u001f\u007f]/u.test(decodedFragment)
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
  return (
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
  );
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
      "session",
      "message",
      "suggestedActions",
    ]) ||
    input.version !== "1" ||
    !isAssistantRequestId(input.requestId) ||
    (input.mode !== "placeholder" && input.mode !== "agentos") ||
    !isRecord(input.session) ||
    !hasExactKeys(input.session, ["expiresAt", "temporary"]) ||
    input.session.temporary !== true ||
    typeof input.session.expiresAt !== "string" ||
    !isCanonicalIsoDate(input.session.expiresAt) ||
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

function isCanonicalIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

export function parseAssistantRequest(input: unknown): AssistantRequest | null {
  if (!isRecord(input) || typeof input.message !== "string") return null;

  const message = input.message.trim();
  if (
    message.length < 1 ||
    !hasAtMostCodePoints(message, ASSISTANT_REQUEST_MESSAGE_MAX_CODE_POINTS)
  ) {
    return null;
  }

  if (!isRecord(input.context)) return null;
  const { pathname } = input.context;
  if (
    typeof pathname !== "string" ||
    !hasAtMostCodePoints(pathname, ASSISTANT_PATHNAME_MAX_CODE_POINTS) ||
    !isNormalizedPathname(pathname)
  ) {
    return null;
  }

  return { message, context: { pathname } };
}

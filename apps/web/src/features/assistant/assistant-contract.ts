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

export interface AssistantSuccessResponse {
  mode: "placeholder";
  message: string;
  suggestedActions: AssistantSuggestedAction[];
}

export interface AssistantErrorResponse {
  mode: "placeholder";
  error: {
    code: "invalid_message" | "assistant_unavailable";
    message: string;
  };
}

export const INVALID_ASSISTANT_REQUEST_RESPONSE: AssistantErrorResponse = {
  mode: "placeholder",
  error: {
    code: "invalid_message",
    message: "请输入 1 至 500 个字符的问题。",
  },
};

export const ASSISTANT_UNAVAILABLE_RESPONSE: AssistantErrorResponse = {
  mode: "placeholder",
  error: {
    code: "assistant_unavailable",
    message: "助手服务暂不可用，请使用帮助中心或商务咨询。",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length && actual.every((key, i) => key === keys[i])
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

export function isAssistantSuccessResponse(
  input: unknown,
): input is AssistantSuccessResponse {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ["message", "mode", "suggestedActions"]) ||
    input.mode !== "placeholder" ||
    typeof input.message !== "string" ||
    !Array.isArray(input.suggestedActions)
  ) {
    return false;
  }

  return input.suggestedActions.every(
    (action) =>
      isRecord(action) &&
      hasExactKeys(action, ["href", "label"]) &&
      typeof action.label === "string" &&
      typeof action.href === "string",
  );
}

export function parseAssistantRequest(input: unknown): AssistantRequest | null {
  if (!isRecord(input) || typeof input.message !== "string") return null;

  const message = input.message.trim();
  if (message.length < 1 || !hasAtMostCodePoints(message, 500)) {
    return null;
  }

  if (!isRecord(input.context)) return null;
  const { pathname } = input.context;
  if (
    typeof pathname !== "string" ||
    !hasAtMostCodePoints(pathname, 256) ||
    !isNormalizedPathname(pathname)
  ) {
    return null;
  }

  return { message, context: { pathname } };
}

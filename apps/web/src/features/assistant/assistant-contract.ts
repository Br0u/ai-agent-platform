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

export function parseAssistantRequest(input: unknown): AssistantRequest | null {
  if (!isRecord(input) || typeof input.message !== "string") return null;

  const message = input.message.trim();
  if (Array.from(message).length < 1 || Array.from(message).length > 500) {
    return null;
  }

  if (!isRecord(input.context)) return null;
  const { pathname } = input.context;
  if (
    typeof pathname !== "string" ||
    !pathname.startsWith("/") ||
    pathname.includes("?") ||
    pathname.includes("#") ||
    Array.from(pathname).length > 256
  ) {
    return null;
  }

  return { message, context: { pathname } };
}

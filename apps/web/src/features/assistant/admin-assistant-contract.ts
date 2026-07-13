import {
  ASSISTANT_ACTION_HREF_MAX_CODE_POINTS,
  ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS,
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  ASSISTANT_MAX_SUGGESTED_ACTIONS,
  isAssistantMessageId,
  isAssistantRequestId,
  type AssistantMode,
  type AssistantResponseMessage,
  type AssistantSuggestedAction,
} from "./assistant-contract";

export type AdminAssistantServiceState = {
  id: "agentos" | "database" | "model" | "public_entry";
  label: string;
  state: "not_connected" | "not_configured" | "placeholder";
  detail: string;
};

export type AdminAssistantStatusSnapshot = {
  mode: "placeholder";
  services: AdminAssistantServiceState[];
  configuration: {
    defaultAgent: string;
    model: string;
    skills: string;
    sessionStorage: string;
  };
  message: string;
};

export type AdminAssistantSessionSummary = {
  maskedId: string;
  mode: "placeholder" | "agentos";
  status: "active" | "closed";
  createdAt: string;
  lastActiveAt: string;
  messageCount: number;
};

export type AdminAssistantSessionsSnapshot = {
  persisted: false;
  items: AdminAssistantSessionSummary[];
  message: string;
};

export type AdminAssistantStatusResponse = {
  version: "1";
  requestId: string;
  status: AdminAssistantStatusSnapshot;
};

export type AdminAssistantSessionsResponse = {
  version: "1";
  requestId: string;
  sessions: AdminAssistantSessionsSnapshot;
};

export type AdminAssistantChatResponse = {
  version: "1";
  requestId: string;
  mode: AssistantMode;
  message: AssistantResponseMessage;
  suggestedActions: AssistantSuggestedAction[];
};

export type AdminAssistantErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "validation_error"
  | "assistant_unavailable";

export type AdminAssistantErrorResponse = {
  version: "1";
  requestId: string;
  error: {
    code: AdminAssistantErrorCode;
    message: string;
  };
};

const ERROR_MESSAGES: Record<AdminAssistantErrorCode, string> = {
  authentication_required: "Authentication required",
  permission_denied: "Permission denied",
  validation_error: "Invalid assistant request",
  assistant_unavailable: "AI assistant service is unavailable",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Array.from(value).length <= maximum
  );
}

function isSuggestedAction(value: unknown): value is AssistantSuggestedAction {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["href", "label"]) &&
    isBoundedString(value.label, ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS) &&
    isBoundedString(value.href, ASSISTANT_ACTION_HREF_MAX_CODE_POINTS)
  );
}

export function isAdminAssistantChatResponse(
  input: unknown,
): input is AdminAssistantChatResponse {
  return (
    isRecord(input) &&
    hasExactKeys(input, [
      "version",
      "requestId",
      "mode",
      "message",
      "suggestedActions",
    ]) &&
    input.version === "1" &&
    isAssistantRequestId(input.requestId) &&
    (input.mode === "placeholder" || input.mode === "agentos") &&
    isRecord(input.message) &&
    hasExactKeys(input.message, ["content", "id", "role"]) &&
    isAssistantMessageId(input.message.id) &&
    input.message.role === "assistant" &&
    isBoundedString(input.message.content, ASSISTANT_CONTENT_MAX_CODE_POINTS) &&
    Array.isArray(input.suggestedActions) &&
    input.suggestedActions.length <= ASSISTANT_MAX_SUGGESTED_ACTIONS &&
    input.suggestedActions.every(isSuggestedAction)
  );
}

export function createAdminAssistantErrorResponse(
  requestId: string,
  code: AdminAssistantErrorCode,
): AdminAssistantErrorResponse {
  return {
    version: "1",
    requestId,
    error: { code, message: ERROR_MESSAGES[code] },
  };
}

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

export type AdminAssistantErrorCode =
  | "authentication_required"
  | "permission_denied"
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
  assistant_unavailable: "AI assistant service is unavailable",
};

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

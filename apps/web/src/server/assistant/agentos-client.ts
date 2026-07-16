import "server-only";

import {
  AgentOSTransportError,
  createAgentOSTransport,
  resolveAgentOSTransportSettings,
} from "./agentos-transport";

export type AgentOSCapability = "placeholder" | "available" | "degraded";

export type AgentOSLiveResponse = {
  live: boolean;
  ready: boolean;
  capability: AgentOSCapability;
  message: string;
};

export type AgentOSReadyResponse = {
  ready: boolean;
  capability: AgentOSCapability;
};

export type AgentOSClient = {
  live(): Promise<AgentOSLiveResponse>;
  ready(): Promise<AgentOSReadyResponse>;
  capability(): Promise<AgentOSCapability>;
};

export type AgentOSClientEnvironment = {
  AGENTOS_INTERNAL_URL?: string;
  OS_SECURITY_KEY?: string;
};

export type AgentOSClientSettings = {
  baseUrl: string;
  securityKey: string;
};

export type AgentOSClientErrorCode =
  | "timeout"
  | "transport_error"
  | "redirect_rejected"
  | "unexpected_status"
  | "invalid_content_type"
  | "response_too_large"
  | "invalid_response";

const MAX_RESPONSE_BYTES = 16 * 1_024;
const MAX_STATUS_MESSAGE_CODE_POINTS = 1_024;

export class AgentOSClientError extends Error {
  constructor(readonly code: AgentOSClientErrorCode) {
    super("AgentOS request failed");
    this.name = "AgentOSClientError";
  }
}

export function resolveAgentOSClientSettings(
  environment: AgentOSClientEnvironment,
): AgentOSClientSettings {
  return resolveAgentOSTransportSettings(environment);
}

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

function isCapability(value: unknown): value is AgentOSCapability {
  return (
    value === "placeholder" || value === "available" || value === "degraded"
  );
}

function isSafeMessage(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  let codePoints = 0;
  const iterator = value[Symbol.iterator]();
  while (!iterator.next().done) {
    codePoints += 1;
    if (codePoints > MAX_STATUS_MESSAGE_CODE_POINTS) return false;
  }
  return true;
}

function isLiveResponse(value: unknown): value is AgentOSLiveResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["live", "ready", "capability", "message"]) &&
    typeof value.live === "boolean" &&
    typeof value.ready === "boolean" &&
    isCapability(value.capability) &&
    isSafeMessage(value.message)
  );
}

function isReadyResponse(value: unknown): value is AgentOSReadyResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["ready", "capability"]) &&
    typeof value.ready === "boolean" &&
    isCapability(value.capability)
  );
}

function parseJson(contentType: string | null, bytes: Uint8Array): unknown {
  if (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
  ) {
    throw new AgentOSClientError("invalid_content_type");
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AgentOSClientError("invalid_response");
  }
}

export function createAgentOSClient(options: {
  settings: AgentOSClientSettings;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): AgentOSClient {
  const timeoutMs = options.timeoutMs ?? 1_500;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 30_000
  ) {
    throw new TypeError(
      "AgentOS timeout must be an integer from 1 to 30000 ms",
    );
  }
  const transport = createAgentOSTransport({
    settings: options.settings,
    fetcher: options.fetcher,
  });

  async function request<T>(
    path: string,
    acceptedStatuses: readonly number[],
    validate: (status: number, body: unknown) => T,
  ): Promise<T> {
    try {
      const response = await transport.request({
        method: "GET",
        path,
        acceptedStatuses,
        timeoutMs,
        maxResponseBytes: MAX_RESPONSE_BYTES,
      });
      return validate(
        response.status,
        parseJson(response.contentType, response.body),
      );
    } catch (error) {
      if (error instanceof AgentOSClientError) throw error;
      if (error instanceof AgentOSTransportError) {
        throw new AgentOSClientError(
          error.code === "external_abort" ? "transport_error" : error.code,
        );
      }
      throw new AgentOSClientError("transport_error");
    }
  }

  async function ready(): Promise<AgentOSReadyResponse> {
    return request("/internal/health/ready", [200, 503], (status, body) => {
      if (
        !isReadyResponse(body) ||
        body.ready !== (status === 200) ||
        (body.ready && body.capability === "degraded")
      ) {
        throw new AgentOSClientError("invalid_response");
      }
      return body;
    });
  }

  return {
    async live() {
      return request("/internal/health/live", [200], (_status, body) => {
        if (!isLiveResponse(body) || body.live !== true) {
          throw new AgentOSClientError("invalid_response");
        }
        return body;
      });
    },
    ready,
    async capability() {
      return (await ready()).capability;
    },
  };
}

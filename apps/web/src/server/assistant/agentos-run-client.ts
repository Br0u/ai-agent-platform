import "server-only";

import {
  AgentOSTransportError,
  createAgentOSTransport,
  resolveAgentOSTransportSettings,
  type AgentOSTransportEnvironment,
  type AgentOSTransportErrorCode,
  type AgentOSTransportSettings,
  type AgentOSUnexpectedStatusCategory,
} from "./agentos-transport";
import { ASSISTANT_CONTENT_MAX_CODE_POINTS } from "@/features/assistant/assistant-contract";

export const AGENTOS_RUN_MAX_RESPONSE_BYTES = 256 * 1_024;
export const AGENTOS_SESSION_DELETE_TIMEOUT_MS = 3_000;

const DEFAULT_RUN_TIMEOUT_MS = 55_000;
const MIN_RUN_TIMEOUT_MS = 51_000;
const MAX_RUN_TIMEOUT_MS = 55_000;
const SESSION_DELETE_MAX_RESPONSE_BYTES = 16 * 1_024;

export type AgentOSRunEnvironment = AgentOSTransportEnvironment & {
  ASSISTANT_AGENTOS_RUN_TIMEOUT_MS?: string;
};

export type AgentOSRunSettings = AgentOSTransportSettings & {
  runTimeoutMs: number;
};

export type AgentOSRunInput = {
  message: string;
  sessionId?: string;
  signal?: AbortSignal;
};

export type AgentOSRunClient = {
  runAgent(input: AgentOSRunInput): Promise<{ content: string }>;
  deleteSession(sessionId: string): Promise<void>;
};

export type AgentOSRunClientErrorCode =
  | Exclude<AgentOSTransportErrorCode, "unexpected_status">
  | AgentOSUnexpectedStatusCategory
  | "unexpected_status";

export class AgentOSRunClientError extends Error {
  constructor(readonly code: AgentOSRunClientErrorCode) {
    super("AgentOS run request failed");
    Object.defineProperty(this, "name", {
      value: "AgentOSRunClientError",
      configurable: true,
    });
  }
}

export function resolveAgentOSRunSettings(
  environment: AgentOSRunEnvironment,
): AgentOSRunSettings {
  const transportSettings = resolveAgentOSTransportSettings(environment);
  const raw = environment.ASSISTANT_AGENTOS_RUN_TIMEOUT_MS;
  const runTimeoutMs = raw === undefined ? DEFAULT_RUN_TIMEOUT_MS : Number(raw);
  if (
    (raw !== undefined && !/^[1-9]\d*$/u.test(raw)) ||
    !Number.isSafeInteger(runTimeoutMs) ||
    runTimeoutMs < MIN_RUN_TIMEOUT_MS ||
    runTimeoutMs > MAX_RUN_TIMEOUT_MS
  ) {
    throw new Error(
      "ASSISTANT_AGENTOS_RUN_TIMEOUT_MS must be an integer from 51000 to 55000",
    );
  }
  return { ...transportSettings, runTimeoutMs };
}

function isJson(contentType: string | null): boolean {
  return (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json"
  );
}

function parseJson(contentType: string | null, bytes: Uint8Array): unknown {
  if (!isJson(contentType)) {
    throw new AgentOSRunClientError("invalid_content_type");
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    throw new AgentOSRunClientError("invalid_response");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedContent(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  let codePoints = 0;
  const iterator = value[Symbol.iterator]();
  while (!iterator.next().done) {
    codePoints += 1;
    if (codePoints > ASSISTANT_CONTENT_MAX_CODE_POINTS) return false;
  }
  return true;
}

function sanitized(error: unknown): AgentOSRunClientError {
  if (error instanceof AgentOSRunClientError) return error;
  if (error instanceof AgentOSTransportError) {
    if (error.code === "unexpected_status") {
      return new AgentOSRunClientError(
        error.statusCategory ?? "unexpected_status",
      );
    }
    return new AgentOSRunClientError(error.code);
  }
  return new AgentOSRunClientError("transport_error");
}

export function createAgentOSRunClient(options: {
  settings: AgentOSRunSettings;
  fetcher?: typeof fetch;
}): AgentOSRunClient {
  const transport = createAgentOSTransport({
    settings: options.settings,
    fetcher: options.fetcher,
  });

  return {
    async runAgent(input) {
      const form = new FormData();
      form.set("message", input.message);
      form.set("stream", "false");
      if (input.sessionId !== undefined) {
        form.set("session_id", input.sessionId);
      }

      try {
        const response = await transport.request({
          method: "POST",
          path: "/agents/maduoduo/runs",
          body: form,
          acceptedStatuses: [200],
          acceptedMediaTypes: ["application/json"],
          timeoutMs: options.settings.runTimeoutMs,
          maxResponseBytes: AGENTOS_RUN_MAX_RESPONSE_BYTES,
          signal: input.signal,
        });
        const body = parseJson(response.contentType, response.body);
        if (!isRecord(body) || !isBoundedContent(body.content)) {
          throw new AgentOSRunClientError("invalid_response");
        }
        return { content: body.content };
      } catch (error) {
        throw sanitized(error);
      }
    },

    async deleteSession(sessionId) {
      if (sessionId === "" || sessionId === "." || sessionId === "..") {
        throw new AgentOSRunClientError("invalid_response");
      }
      try {
        await transport.request({
          method: "DELETE",
          path: `/sessions/${encodeURIComponent(sessionId)}`,
          acceptedStatuses: [200, 204, 404],
          timeoutMs: AGENTOS_SESSION_DELETE_TIMEOUT_MS,
          maxResponseBytes: SESSION_DELETE_MAX_RESPONSE_BYTES,
        });
      } catch (error) {
        throw sanitized(error);
      }
    },
  };
}

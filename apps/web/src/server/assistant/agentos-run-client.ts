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

export const AGENTOS_RUN_MAX_RESPONSE_BYTES = 4 * 1_024 * 1_024;
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
  runAgentStream(input: AgentOSRunInput): AsyncIterable<string>;
  deleteSession(sessionId: string): Promise<void>;
};

export type AgentOSRunClientErrorCode =
  | Exclude<AgentOSTransportErrorCode, "unexpected_status">
  | AgentOSUnexpectedStatusCategory
  | "unexpected_status";

export type AgentOSRunDiagnostic =
  | "event_after_completion"
  | "event_frame_invalid"
  | "run_cancelled_event"
  | "run_error_event"
  | "stream_content_too_large"
  | "stream_empty_content"
  | "stream_trailing_data";

export class AgentOSRunClientError extends Error {
  declare readonly diagnostic?: AgentOSRunDiagnostic;

  constructor(
    readonly code: AgentOSRunClientErrorCode,
    diagnostic?: AgentOSRunDiagnostic,
  ) {
    super("AgentOS run request failed");
    Object.defineProperty(this, "name", {
      value: "AgentOSRunClientError",
      configurable: true,
    });
    Object.defineProperty(this, "diagnostic", {
      value: diagnostic,
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

function parseAgentOSEvent(frame: string): Record<string, unknown> {
  const lines = frame.replaceAll("\r\n", "\n").split("\n");
  if (lines.length !== 2) {
    throw new AgentOSRunClientError("invalid_response", "event_frame_invalid");
  }
  const [eventLine, dataLine] = lines;
  if (!eventLine?.startsWith("event: ") || !dataLine?.startsWith("data: ")) {
    throw new AgentOSRunClientError("invalid_response", "event_frame_invalid");
  }
  try {
    const body = JSON.parse(dataLine.slice(6));
    if (
      !isRecord(body) ||
      typeof body.event !== "string" ||
      body.event !== eventLine.slice(7)
    ) {
      throw new Error();
    }
    return body;
  } catch {
    throw new AgentOSRunClientError("invalid_response", "event_frame_invalid");
  }
}

async function* parseAgentOSRunStream(
  source: AsyncIterable<Uint8Array>,
): AsyncIterable<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let completed = false;
  let contentCodePoints = 0;
  let hasNonWhitespaceContent = false;

  const consumeFrame = function* (frame: string): Iterable<string> {
    const event = parseAgentOSEvent(frame);
    if (completed) {
      throw new AgentOSRunClientError(
        "invalid_response",
        "event_after_completion",
      );
    }
    if (event.event === "RunError") {
      throw new AgentOSRunClientError("invalid_response", "run_error_event");
    }
    if (event.event === "RunCancelled") {
      throw new AgentOSRunClientError(
        "invalid_response",
        "run_cancelled_event",
      );
    }
    if (event.event === "RunCompleted") {
      completed = true;
      return;
    }
    if (event.event !== "RunContent") return;
    if (typeof event.content !== "string") {
      if (typeof event.reasoning_content === "string") return;
      return;
    }
    if (event.content.length === 0) return;
    contentCodePoints += Array.from(event.content).length;
    if (contentCodePoints > ASSISTANT_CONTENT_MAX_CODE_POINTS) {
      throw new AgentOSRunClientError(
        "invalid_response",
        "stream_content_too_large",
      );
    }
    hasNonWhitespaceContent ||= event.content.trim().length > 0;
    yield event.content;
  };

  try {
    for await (const chunk of source) {
      buffer += decoder.decode(chunk, { stream: true });
      buffer = buffer.replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (frame.length > 0) yield* consumeFrame(frame);
        boundary = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    buffer = buffer.replaceAll("\r\n", "\n");
    if (buffer.trim().length > 0) {
      throw new AgentOSRunClientError(
        "invalid_response",
        "stream_trailing_data",
      );
    }
    if (!hasNonWhitespaceContent) {
      throw new AgentOSRunClientError(
        "invalid_response",
        "stream_empty_content",
      );
    }
  } catch (error) {
    throw sanitized(error);
  }
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
    runAgentStream(input) {
      const form = new FormData();
      form.set("message", input.message);
      form.set("stream", "true");
      form.set("stream_events", "false");
      if (input.sessionId !== undefined) {
        form.set("session_id", input.sessionId);
      }

      return parseAgentOSRunStream(
        transport.stream({
          method: "POST",
          path: "/agents/maduoduo/runs",
          body: form,
          acceptedStatuses: [200],
          acceptedMediaTypes: ["text/event-stream"],
          timeoutMs: options.settings.runTimeoutMs,
          maxResponseBytes: AGENTOS_RUN_MAX_RESPONSE_BYTES,
          signal: input.signal,
        }),
      );
    },

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

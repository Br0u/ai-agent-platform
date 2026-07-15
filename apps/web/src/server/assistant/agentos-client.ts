import "server-only";

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
  const rawUrl = environment.AGENTOS_INTERNAL_URL;
  let url: URL;
  try {
    if (!rawUrl) throw new Error();
    url = new URL(rawUrl);
  } catch {
    throw new Error("AGENTOS_INTERNAL_URL must be an exact HTTP(S) origin");
  }
  if (
    rawUrl !== url.origin ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("AGENTOS_INTERNAL_URL must be an exact HTTP(S) origin");
  }

  const securityKey = environment.OS_SECURITY_KEY;
  if (!securityKey || Buffer.byteLength(securityKey, "utf8") < 32) {
    throw new Error("OS_SECURITY_KEY must contain at least 32 bytes");
  }
  if (!/^[A-Za-z0-9._~+/-]+=*$/u.test(securityKey)) {
    throw new Error("OS_SECURITY_KEY must be a valid Bearer token");
  }
  return { baseUrl: url.origin, securityKey };
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

function declaredLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (raw === null) return null;
  if (!/^\d+$/u.test(raw)) throw new AgentOSClientError("invalid_response");
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new AgentOSClientError("invalid_response");
  }
  return value;
}

function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array> | null,
  response: Response | null,
): void {
  try {
    const cancellation = reader
      ? reader.cancel()
      : response?.body && !response.body.locked
        ? response.body.cancel()
        : null;
    if (cancellation) void cancellation.catch(() => undefined);
  } catch {
    // Resource cleanup must never replace the sanitized transport error.
  }
}

async function parseJson(
  response: Response,
  setReader: (reader: ReadableStreamDefaultReader<Uint8Array> | null) => void,
  timedOut: () => boolean,
): Promise<unknown> {
  const length = declaredLength(response);
  if (length !== null && length > MAX_RESPONSE_BYTES) {
    throw new AgentOSClientError("response_too_large");
  }
  const contentType = response.headers.get("content-type");
  if (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
  ) {
    throw new AgentOSClientError("invalid_content_type");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AgentOSClientError("invalid_response");
  setReader(reader);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    if (timedOut()) throw new AgentOSClientError("timeout");
    while (true) {
      const chunk = await reader.read();
      if (timedOut()) throw new AgentOSClientError("timeout");
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new AgentOSClientError("response_too_large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    setReader(null);
    try {
      reader.releaseLock();
    } catch {
      // A timed-out reader can remain locked until its source accepts cancel.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
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
  const fetcher = options.fetcher ?? fetch;
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
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${options.settings.securityKey}`,
  };

  async function request<T>(
    path: string,
    acceptedStatuses: readonly number[],
    validate: (status: number, body: unknown) => T,
  ): Promise<T> {
    const controller = new AbortController();
    let response: Response | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let didTimeout = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        didTimeout = true;
        controller.abort();
        cancelReader(reader, response);
        reject(new AgentOSClientError("timeout"));
      }, timeoutMs);
    });
    const operation = (async () => {
      let bodyWasConsumed = false;
      try {
        response = await fetcher(`${options.settings.baseUrl}${path}`, {
          method: "GET",
          headers,
          signal: controller.signal,
          redirect: "manual",
          cache: "no-store",
          credentials: "omit",
        });
        if (didTimeout) throw new AgentOSClientError("timeout");
        if (response.status >= 300 && response.status < 400) {
          throw new AgentOSClientError("redirect_rejected");
        }
        if (!acceptedStatuses.includes(response.status)) {
          throw new AgentOSClientError("unexpected_status");
        }
        const body = await parseJson(
          response,
          (activeReader) => {
            reader = activeReader;
          },
          () => didTimeout,
        );
        bodyWasConsumed = true;
        if (didTimeout) throw new AgentOSClientError("timeout");
        return validate(response.status, body);
      } catch (error) {
        if (error instanceof AgentOSClientError) throw error;
        throw new AgentOSClientError(
          didTimeout ? "timeout" : "transport_error",
        );
      } finally {
        if (!bodyWasConsumed) cancelReader(reader, response);
      }
    })();

    try {
      return await Promise.race([operation, deadline]);
    } finally {
      if (timer) clearTimeout(timer);
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

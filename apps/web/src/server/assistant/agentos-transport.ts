import "server-only";

export type AgentOSTransportEnvironment = {
  AGENTOS_INTERNAL_URL?: string;
  OS_SECURITY_KEY?: string;
};

export type AgentOSTransportSettings = {
  baseUrl: string;
  securityKey: string;
};

export type AgentOSTransportRequest = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: BodyInit;
  acceptedStatuses: readonly number[];
  acceptedMediaTypes?: readonly string[];
  timeoutMs: number;
  maxResponseBytes: number;
  signal?: AbortSignal;
};

export type AgentOSTransportResponse = {
  status: number;
  contentType: string | null;
  body: Uint8Array;
};

export type AgentOSTransportErrorCode =
  | "timeout"
  | "external_abort"
  | "invalid_request"
  | "transport_error"
  | "redirect_rejected"
  | "unexpected_status"
  | "invalid_content_type"
  | "response_too_large"
  | "invalid_response";

export type AgentOSUnexpectedStatusCategory =
  | "authentication"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "other_client_error";

export class AgentOSTransportError extends Error {
  declare readonly statusCategory?: AgentOSUnexpectedStatusCategory;

  constructor(
    readonly code: AgentOSTransportErrorCode,
    statusCategory?: AgentOSUnexpectedStatusCategory,
  ) {
    super("AgentOS request failed");
    Object.defineProperty(this, "name", {
      value: "AgentOSTransportError",
      configurable: true,
    });
    Object.defineProperty(this, "statusCategory", {
      value: statusCategory,
      configurable: true,
    });
  }
}

function classifyUnexpectedStatus(
  status: number,
): AgentOSUnexpectedStatusCategory | undefined {
  if (status === 401 || status === 403) return "authentication";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500 && status <= 599) return "server_error";
  if (status >= 400 && status <= 499) return "other_client_error";
  return undefined;
}

export function resolveAgentOSTransportSettings(
  environment: AgentOSTransportEnvironment,
): AgentOSTransportSettings {
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

function declaredLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (raw === null) return null;
  if (!/^\d+$/u.test(raw)) throw new AgentOSTransportError("invalid_response");
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new AgentOSTransportError("invalid_response");
  }
  return value;
}

function cancelBody(
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
    // Cleanup must not replace a sanitized transport error.
  }
}

function abortError(
  source: "timeout" | "external_abort" | null,
): AgentOSTransportError | null {
  return source ? new AgentOSTransportError(source) : null;
}

function resolveRequestUrl(
  settings: AgentOSTransportSettings,
  path: string,
): string {
  let url: URL;
  try {
    url = new URL(path, `${settings.baseUrl}/`);
  } catch {
    throw new AgentOSTransportError("invalid_request");
  }
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    url.origin !== settings.baseUrl ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== path ||
    url.search !== "" ||
    url.hash !== "" ||
    url.href !== `${settings.baseUrl}${path}`
  ) {
    throw new AgentOSTransportError("invalid_request");
  }
  return url.href;
}

function validateMediaType(
  contentType: string | null,
  acceptedMediaTypes: readonly string[] | undefined,
): void {
  if (acceptedMediaTypes === undefined) return;
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    mediaType === undefined ||
    !acceptedMediaTypes.some(
      (accepted) => accepted.trim().toLowerCase() === mediaType,
    )
  ) {
    throw new AgentOSTransportError("invalid_content_type");
  }
}

async function readBoundedBody(
  response: Response,
  maxResponseBytes: number,
  setReader: (reader: ReadableStreamDefaultReader<Uint8Array> | null) => void,
  abortedBy: () => "timeout" | "external_abort" | null,
): Promise<Uint8Array> {
  const length = declaredLength(response);
  if (length !== null && length > maxResponseBytes) {
    throw new AgentOSTransportError("response_too_large");
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  setReader(reader);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const beforeRead = abortError(abortedBy());
    if (beforeRead) throw beforeRead;
    while (true) {
      const chunk = await reader.read();
      const afterRead = abortError(abortedBy());
      if (afterRead) throw afterRead;
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxResponseBytes) {
        throw new AgentOSTransportError("response_too_large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    setReader(null);
    try {
      reader.releaseLock();
    } catch {
      // An aborted reader may stay locked until its source accepts cancellation.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function createAgentOSTransport(options: {
  settings: AgentOSTransportSettings;
  fetcher?: typeof fetch;
}): {
  request(request: AgentOSTransportRequest): Promise<AgentOSTransportResponse>;
} {
  const fetcher = options.fetcher ?? fetch;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${options.settings.securityKey}`,
  };

  return {
    async request(request) {
      const requestUrl = resolveRequestUrl(options.settings, request.path);
      const controller = new AbortController();
      let response: Response | null = null;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      let abortedBy: "timeout" | "external_abort" | null = null;
      let rejectExternalAbort: ((error: AgentOSTransportError) => void) | null =
        null;
      const externalAbort = new Promise<never>((_resolve, reject) => {
        rejectExternalAbort = reject;
      });
      const onExternalAbort = () => {
        if (abortedBy !== null) return;
        abortedBy = "external_abort";
        controller.abort();
        cancelBody(reader, response);
        rejectExternalAbort?.(new AgentOSTransportError("external_abort"));
      };
      request.signal?.addEventListener("abort", onExternalAbort, {
        once: true,
      });
      if (request.signal?.aborted) onExternalAbort();

      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          if (abortedBy !== null) return;
          abortedBy = "timeout";
          controller.abort();
          cancelBody(reader, response);
          reject(new AgentOSTransportError("timeout"));
        }, request.timeoutMs);
      });
      const operation = (async () => {
        let bodyWasConsumed = false;
        try {
          const beforeFetch = abortError(abortedBy);
          if (beforeFetch) throw beforeFetch;
          response = await fetcher(requestUrl, {
            method: request.method,
            headers,
            body: request.body,
            signal: controller.signal,
            redirect: "manual",
            cache: "no-store",
            credentials: "omit",
          });
          const afterFetch = abortError(abortedBy);
          if (afterFetch) throw afterFetch;
          if (response.status >= 300 && response.status < 400) {
            throw new AgentOSTransportError("redirect_rejected");
          }
          if (!request.acceptedStatuses.includes(response.status)) {
            throw new AgentOSTransportError(
              "unexpected_status",
              classifyUnexpectedStatus(response.status),
            );
          }
          validateMediaType(
            response.headers.get("content-type"),
            request.acceptedMediaTypes,
          );
          const body = await readBoundedBody(
            response,
            request.maxResponseBytes,
            (activeReader) => {
              reader = activeReader;
            },
            () => abortedBy,
          );
          bodyWasConsumed = true;
          const afterBody = abortError(abortedBy);
          if (afterBody) throw afterBody;
          return {
            status: response.status,
            contentType: response.headers.get("content-type"),
            body,
          };
        } catch (error) {
          if (error instanceof AgentOSTransportError) throw error;
          throw new AgentOSTransportError(abortedBy ?? "transport_error");
        } finally {
          if (!bodyWasConsumed) cancelBody(reader, response);
        }
      })();

      try {
        return await Promise.race([operation, deadline, externalAbort]);
      } finally {
        if (timer) clearTimeout(timer);
        request.signal?.removeEventListener("abort", onExternalAbort);
      }
    },
  };
}

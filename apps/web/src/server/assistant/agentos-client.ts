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

async function parseJson(response: Response): Promise<unknown> {
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
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new AgentOSClientError("response_too_large");
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

  async function request(path: string, acceptedStatuses: readonly number[]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetcher(`${options.settings.baseUrl}${path}`, {
        method: "GET",
        headers,
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
      });
    } catch {
      throw new AgentOSClientError(
        controller.signal.aborted ? "timeout" : "transport_error",
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      throw new AgentOSClientError("redirect_rejected");
    }
    if (!acceptedStatuses.includes(response.status)) {
      throw new AgentOSClientError("unexpected_status");
    }
    return { status: response.status, body: await parseJson(response) };
  }

  async function ready(): Promise<AgentOSReadyResponse> {
    const response = await request("/internal/health/ready", [200, 503]);
    if (
      !isReadyResponse(response.body) ||
      response.body.ready !== (response.status === 200) ||
      (response.body.ready && response.body.capability === "degraded")
    ) {
      throw new AgentOSClientError("invalid_response");
    }
    return response.body;
  }

  return {
    async live() {
      const response = await request("/internal/health/live", [200]);
      if (!isLiveResponse(response.body) || response.body.live !== true) {
        throw new AgentOSClientError("invalid_response");
      }
      return response.body;
    },
    ready,
    async capability() {
      return (await ready()).capability;
    },
  };
}

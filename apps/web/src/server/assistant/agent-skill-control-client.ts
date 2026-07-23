import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  parseAdminAgentSkillActivationResponse,
  parseAdminAgentSkillRuntime,
  type AdminAgentSkillActivationResponse,
  type AdminAgentSkillRuntime,
} from "@/features/assistant/admin-skill-runtime-contract";
import {
  AgentOSTransportError,
  createAgentOSTransport,
  resolveAgentOSTransportSettings,
  type AgentOSTransportEnvironment,
  type AgentOSTransportErrorCode,
} from "./agentos-transport";

export type AgentSkillControlEnvironment = AgentOSTransportEnvironment & {
  AGENT_CONFIG_CONTROL_KEY?: string;
};

export type AgentSkillControlSettings = {
  baseUrl: string;
  controlKey: string;
};

export type AgentSkillControlClient = {
  runtimeStatus(input: {
    actor: string;
    requestId: string;
  }): Promise<AdminAgentSkillRuntime>;
  activate(input: {
    actor: string;
    requestId: string;
    setId: string;
    expectedActivationVersion: number;
    assuredAt: number;
  }): Promise<AdminAgentSkillActivationResponse>;
};

export type AgentSkillControlDomainErrorCode =
  | "authentication_failed"
  | "authorization_failed"
  | "candidate_invalid"
  | "artifact_invalid"
  | "skill_validation_failed"
  | "activation_conflict"
  | "activation_busy"
  | "runtime_busy"
  | "activation_timeout"
  | "activation_result_unknown"
  | "runtime_degraded"
  | "storage_unavailable";

export type AgentSkillControlClientErrorCode =
  | AgentSkillControlDomainErrorCode
  | AgentOSTransportErrorCode;

export class AgentSkillControlClientError extends Error {
  constructor(readonly code: AgentSkillControlClientErrorCode) {
    super("Agent Skill control request failed");
    Object.defineProperty(this, "name", {
      value: "AgentSkillControlClientError",
      configurable: true,
    });
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BEARER = /^[A-Za-z0-9._~+/-]+=*$/u;
const DOMAIN = "ai-agent-platform:skill-control-assertion:v1";
const MAX_RESPONSE_BYTES = 8 * 1024;
const MAX_REQUEST_BYTES = 8 * 1024;
const ERROR_STATUS: Readonly<Record<AgentSkillControlDomainErrorCode, number>> =
  {
    authentication_failed: 401,
    authorization_failed: 403,
    candidate_invalid: 400,
    artifact_invalid: 422,
    skill_validation_failed: 422,
    activation_conflict: 409,
    activation_busy: 423,
    runtime_busy: 423,
    activation_timeout: 504,
    activation_result_unknown: 503,
    runtime_degraded: 503,
    storage_unavailable: 503,
  };

function sameUtf8(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function safeBearer(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Buffer.byteLength(value, "utf8") >= 32 &&
    BEARER.test(value)
  );
}

export function resolveAgentSkillControlSettings(
  environment: AgentSkillControlEnvironment,
): AgentSkillControlSettings {
  const agentOS = resolveAgentOSTransportSettings(environment);
  const controlKey = environment.AGENT_CONFIG_CONTROL_KEY;
  if (!safeBearer(controlKey) || sameUtf8(controlKey, agentOS.securityKey)) {
    throw new Error("AGENT_CONFIG_CONTROL_KEY configuration is invalid");
  }
  return { baseUrl: agentOS.baseUrl, controlKey };
}

function exactRecord(value: unknown, keys: readonly string[]) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      return null;
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function invalidRequest(): never {
  throw new AgentSkillControlClientError("invalid_request");
}

function invalidResponse(): never {
  throw new AgentSkillControlClientError("invalid_response");
}

function parseJson(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(body));
  } catch {
    invalidResponse();
  }
}

function sanitize(error: unknown): AgentSkillControlClientError {
  if (error instanceof AgentSkillControlClientError) return error;
  if (error instanceof AgentOSTransportError) {
    return new AgentSkillControlClientError(error.code);
  }
  return new AgentSkillControlClientError("transport_error");
}

function readError(
  status: number,
  value: unknown,
): AgentSkillControlDomainErrorCode | null {
  const one = exactRecord(value, ["error"]);
  const two = exactRecord(value, ["requestId", "error"]);
  const record = one ?? two;
  return record !== null &&
    typeof record.error === "string" &&
    Object.hasOwn(ERROR_STATUS, record.error) &&
    ERROR_STATUS[record.error as AgentSkillControlDomainErrorCode] === status &&
    (two === null ||
      (typeof two.requestId === "string" && UUID.test(two.requestId)))
    ? (record.error as AgentSkillControlDomainErrorCode)
    : null;
}

export function createAgentSkillControlClient(options: {
  settings: AgentSkillControlSettings;
  fetcher?: typeof fetch;
  clock?: () => number;
  nonceFactory?: () => string;
}): AgentSkillControlClient {
  if (!safeBearer(options.settings.controlKey)) invalidRequest();
  const transport = createAgentOSTransport({
    settings: {
      baseUrl: options.settings.baseUrl,
      securityKey: options.settings.controlKey,
    },
    fetcher: options.fetcher,
  });
  const clock = options.clock ?? (() => Math.floor(Date.now() / 1_000));
  const nonceFactory = options.nonceFactory ?? randomUUID;
  const signingKey = createHmac("sha256", options.settings.controlKey)
    .update(DOMAIN)
    .digest();

  function sign(input: {
    actor: string;
    requestId: string;
    action: "skill_runtime_status" | "skill_runtime_activate";
    target: string;
    assuredAt: number | null;
  }): string {
    const now = clock();
    const nonce = nonceFactory();
    const activation = input.action === "skill_runtime_activate";
    if (
      !UUID.test(input.actor) ||
      !UUID.test(input.requestId) ||
      !UUID.test(nonce) ||
      !Number.isSafeInteger(now) ||
      now < 0 ||
      (activation
        ? !Number.isSafeInteger(input.assuredAt) ||
          (input.assuredAt as number) > now ||
          (input.assuredAt as number) < now - 600
        : input.assuredAt !== null)
    ) {
      invalidRequest();
    }
    const payload = {
      action: input.action,
      actor: input.actor,
      assurance: activation ? "password+mfa" : "session",
      assuredAt: input.assuredAt,
      expiresAt: now + 5,
      issuedAt: now,
      nonce,
      permission: activation
        ? "admin:assistant:skills:configure"
        : "admin:assistant:skills",
      requestId: input.requestId,
      target: input.target,
    };
    const canonical = Buffer.from(JSON.stringify(payload));
    const signature = createHmac("sha256", signingKey)
      .update(canonical)
      .digest("base64url");
    return `${canonical.toString("base64url")}.${signature}`;
  }

  async function request<T>(input: {
    method: "GET" | "POST";
    path: string;
    requestId: string;
    assertion: string;
    body?: string;
    acceptedStatuses: readonly number[];
    timeoutMs: number;
    read(value: unknown): T | null;
  }): Promise<T> {
    try {
      const response = await transport.request({
        method: input.method,
        path: input.path,
        headers: {
          ...(input.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          "X-Agent-Control-Assertion": input.assertion,
          "X-Request-Id": input.requestId,
        },
        body: input.body,
        acceptedStatuses: input.acceptedStatuses,
        acceptedMediaTypes: ["application/json"],
        timeoutMs: input.timeoutMs,
        maxResponseBytes: MAX_RESPONSE_BYTES,
      });
      if (response.cacheControl?.trim().toLowerCase() !== "no-store") {
        invalidResponse();
      }
      const parsed = parseJson(response.body);
      if (response.status !== 200) {
        const code = readError(response.status, parsed);
        if (code === null) invalidResponse();
        throw new AgentSkillControlClientError(code);
      }
      const safe = input.read(parsed);
      if (safe === null) invalidResponse();
      return safe;
    } catch (error) {
      throw sanitize(error);
    }
  }

  return {
    async runtimeStatus(raw) {
      const input = exactRecord(raw, ["actor", "requestId"]);
      if (
        input === null ||
        typeof input.actor !== "string" ||
        !UUID.test(input.actor) ||
        typeof input.requestId !== "string" ||
        !UUID.test(input.requestId)
      ) {
        invalidRequest();
      }
      const assertion = sign({
        actor: input.actor,
        requestId: input.requestId,
        action: "skill_runtime_status",
        target: "maduoduo",
        assuredAt: null,
      });
      return request({
        method: "GET",
        path: "/internal/control/skill-runtime",
        requestId: input.requestId,
        assertion,
        acceptedStatuses: [200, 401, 403, 503],
        timeoutMs: 5_000,
        read: parseAdminAgentSkillRuntime,
      });
    },

    async activate(raw) {
      const input = exactRecord(raw, [
        "actor",
        "requestId",
        "setId",
        "expectedActivationVersion",
        "assuredAt",
      ]);
      if (
        input === null ||
        typeof input.actor !== "string" ||
        !UUID.test(input.actor) ||
        typeof input.requestId !== "string" ||
        !UUID.test(input.requestId) ||
        typeof input.setId !== "string" ||
        !UUID.test(input.setId) ||
        typeof input.expectedActivationVersion !== "number" ||
        !Number.isSafeInteger(input.expectedActivationVersion) ||
        input.expectedActivationVersion < 0 ||
        typeof input.assuredAt !== "number" ||
        !Number.isSafeInteger(input.assuredAt)
      ) {
        invalidRequest();
      }
      const assertion = sign({
        actor: input.actor,
        requestId: input.requestId,
        action: "skill_runtime_activate",
        target: `maduoduo:${input.setId}:${input.expectedActivationVersion}`,
        assuredAt: input.assuredAt,
      });
      const body = JSON.stringify({
        expectedActivationVersion: input.expectedActivationVersion,
        requestId: input.requestId,
      });
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) invalidRequest();
      return request({
        method: "POST",
        path: `/internal/control/skill-runtime/${input.setId}/activate`,
        requestId: input.requestId,
        assertion,
        body,
        acceptedStatuses: [200, 400, 401, 403, 409, 422, 423, 503, 504],
        timeoutMs: 65_000,
        read: (value) => {
          const parsed = parseAdminAgentSkillActivationResponse(value);
          return parsed !== null &&
            parsed.requestId === input.requestId &&
            parsed.setId === input.setId
            ? parsed
            : null;
        },
      });
    },
  };
}

import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  ADMIN_MODEL_PROVIDERS,
  isAdminModelConfigRevisionInput,
  isAdminModelConfigSaveInput,
  type AdminModelConfigRevisionInput,
  type AdminModelConfigSaveInput,
  type AdminModelProvider,
} from "@/features/assistant/admin-model-config-contract";
import {
  AgentOSTransportError,
  type AgentOSTransportEnvironment,
  type AgentOSTransportErrorCode,
  createAgentOSTransport,
  resolveAgentOSTransportSettings,
} from "./agentos-transport";

export type AgentModelControlEnvironment = AgentOSTransportEnvironment & {
  AGENT_CONFIG_CONTROL_KEY?: string;
};

export type AgentModelControlSettings = {
  baseUrl: string;
  controlKey: string;
};

export type AgentModelControlAction = "save" | "test_and_activate" | "reveal";
export type AgentModelControlPermission =
  | "admin:assistant:configure"
  | "admin:assistant:secret:reveal";

export type AgentModelControlAssertionInput = {
  actor: string;
  permission: AgentModelControlPermission;
  action: AgentModelControlAction;
  provider: AdminModelProvider;
  requestId: string;
};

export type AgentModelConfigMetadata = {
  provider: AdminModelProvider;
  modelId: string;
  endpointId: string;
  apiKeyLastFour: string;
  revision: number;
  testStatus: "untested" | "passed" | "failed";
};

export type AgentModelConfigListResponse = {
  version: "1";
  configs: AgentModelConfigMetadata[];
  endpoints: Array<{
    id: string;
    label: string;
    provider: AdminModelProvider;
  }>;
  bootstrap: null | {
    provider: AdminModelProvider;
    modelId: string;
    readOnly: true;
  };
  controlEnabled: boolean;
};

export type AgentModelRuntimeResponse = {
  version: "1";
  capability: "placeholder" | "available" | "degraded";
  source: "dynamic" | "deployment" | null;
  provider: AdminModelProvider | null;
  modelId: string | null;
  configRevision: number | null;
  activationVersion: number | null;
};

export type AgentModelConfigSaveResponse = {
  version: "1";
  config: AgentModelConfigMetadata;
};

export type AgentModelActivationResponse = {
  version: "1";
  provider: AdminModelProvider;
  configRevision: number;
  activationVersion: number;
};

export type AgentModelRevealResponse = { key: string };

export type AgentModelControlClient = {
  listModelConfigs(input: {
    requestId: string;
  }): Promise<AgentModelConfigListResponse>;
  runtimeStatus(input: {
    requestId: string;
  }): Promise<AgentModelRuntimeResponse>;
  saveModelConfig(input: {
    actor: string;
    provider: AdminModelProvider;
    requestId: string;
    input: AdminModelConfigSaveInput;
  }): Promise<AgentModelConfigSaveResponse>;
  testAndActivate(input: {
    actor: string;
    provider: AdminModelProvider;
    requestId: string;
    input: AdminModelConfigRevisionInput;
  }): Promise<AgentModelActivationResponse>;
  revealKey(input: {
    actor: string;
    provider: AdminModelProvider;
    requestId: string;
    input: AdminModelConfigRevisionInput;
  }): Promise<AgentModelRevealResponse>;
};

export type AgentModelControlDomainErrorCode =
  | "validation_error"
  | "endpoint_not_allowed"
  | "configuration_conflict"
  | "credential_rejected"
  | "model_not_found"
  | "provider_unreachable"
  | "provider_timeout"
  | "control_disabled"
  | "storage_unavailable"
  | "encryption_unavailable"
  | "assistant_unavailable"
  | "authentication_failed"
  | "authorization_failed";

export type AgentModelControlClientErrorCode =
  | AgentModelControlDomainErrorCode
  | AgentOSTransportErrorCode;

export class AgentModelControlClientError extends Error {
  constructor(readonly code: AgentModelControlClientErrorCode) {
    super("Agent model control request failed");
    Object.defineProperty(this, "name", {
      value: "AgentModelControlClientError",
      configurable: true,
    });
  }
}

const BEARER_TOKEN = /^[A-Za-z0-9._~+/-]+=*$/u;
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ASSERTION_DOMAIN = "ai-agent-platform:model-control-assertion:v1";
const ACTION_PERMISSION: Readonly<
  Record<AgentModelControlAction, AgentModelControlPermission>
> = {
  save: "admin:assistant:configure",
  test_and_activate: "admin:assistant:configure",
  reveal: "admin:assistant:secret:reveal",
};

function invalidRequest(): never {
  throw new AgentModelControlClientError("invalid_request");
}

function invalidResponse(): never {
  throw new AgentModelControlClientError("invalid_response");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isSafeBearer(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Buffer.byteLength(value, "utf8") >= 32 &&
    BEARER_TOKEN.test(value)
  );
}

function sameUtf8(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function isProvider(value: unknown): value is AdminModelProvider {
  return (
    typeof value === "string" &&
    (ADMIN_MODEL_PROVIDERS as readonly string[]).includes(value)
  );
}

export function resolveAgentModelControlSettings(
  environment: AgentModelControlEnvironment,
): AgentModelControlSettings {
  const agentOS = resolveAgentOSTransportSettings(environment);
  const controlKey = environment.AGENT_CONFIG_CONTROL_KEY;
  if (!isSafeBearer(controlKey) || sameUtf8(controlKey, agentOS.securityKey)) {
    throw new Error("AGENT_CONFIG_CONTROL_KEY configuration is invalid");
  }
  return { baseUrl: agentOS.baseUrl, controlKey };
}

export function createAgentModelControlAssertionSigner(options: {
  controlKey: string;
  clock?: () => number;
  nonceFactory?: () => string;
}): { sign(input: AgentModelControlAssertionInput): string } {
  if (!isSafeBearer(options.controlKey)) invalidRequest();
  const clock = options.clock ?? (() => Math.floor(Date.now() / 1_000));
  const nonceFactory = options.nonceFactory ?? randomUUID;
  const signingKey = createHmac(
    "sha256",
    Buffer.from(options.controlKey, "utf8"),
  )
    .update(ASSERTION_DOMAIN, "utf8")
    .digest();

  return {
    sign(input) {
      try {
        if (
          !isRecord(input) ||
          !hasExactKeys(input, [
            "actor",
            "permission",
            "action",
            "provider",
            "requestId",
          ])
        ) {
          invalidRequest();
        }
        const issuedAt = clock();
        const nonce = nonceFactory();
        if (
          typeof input.actor !== "string" ||
          !CANONICAL_UUID.test(input.actor) ||
          typeof input.requestId !== "string" ||
          !CANONICAL_UUID.test(input.requestId) ||
          typeof nonce !== "string" ||
          !CANONICAL_UUID.test(nonce) ||
          !isProvider(input.provider) ||
          typeof input.action !== "string" ||
          !Object.hasOwn(ACTION_PERMISSION, input.action) ||
          ACTION_PERMISSION[input.action as AgentModelControlAction] !==
            input.permission ||
          !Number.isSafeInteger(issuedAt) ||
          issuedAt < 0 ||
          issuedAt > Number.MAX_SAFE_INTEGER - 5
        ) {
          invalidRequest();
        }
        const payload = {
          action: input.action,
          actor: input.actor,
          expiresAt: issuedAt + 5,
          issuedAt,
          nonce,
          permission: input.permission,
          provider: input.provider,
          requestId: input.requestId,
        };
        const canonical = Buffer.from(JSON.stringify(payload), "utf8");
        const signature = createHmac("sha256", signingKey)
          .update(canonical)
          .digest("base64url");
        return `${canonical.toString("base64url")}.${signature}`;
      } catch (error) {
        if (error instanceof AgentModelControlClientError) throw error;
        invalidRequest();
      }
    },
  };
}

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const URL_LIKE = /(?:[a-z][a-z0-9+.-]*:\/\/|\/\/)/iu;
const ENDPOINT_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const ERROR_STATUS: Readonly<Record<AgentModelControlDomainErrorCode, number>> =
  {
    authentication_failed: 401,
    authorization_failed: 403,
    validation_error: 400,
    endpoint_not_allowed: 400,
    configuration_conflict: 409,
    credential_rejected: 422,
    model_not_found: 422,
    provider_unreachable: 502,
    provider_timeout: 504,
    control_disabled: 503,
    storage_unavailable: 503,
    encryption_unavailable: 503,
    assistant_unavailable: 503,
  };
const ACCEPTED_STATUSES = [200, 400, 401, 403, 409, 422, 502, 503, 504];
const RESPONSE_MAX_BYTES = 64 * 1_024;
const REQUEST_MAX_BYTES = 8 * 1_024;
const STANDARD_TIMEOUT_MS = 5_000;
const ACTIVATION_TIMEOUT_MS = 55_000;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isSafeText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    Array.from(value).length <= maximum &&
    !CONTROL_CHARACTER.test(value) &&
    !URL_LIKE.test(value)
  );
}

function isModelId(value: unknown): value is string {
  return isSafeText(value, 128);
}

function isEndpointId(value: unknown): value is string {
  return typeof value === "string" && ENDPOINT_ID.test(value);
}

function isSecret(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Array.from(value).length >= 8 &&
    Array.from(value).length <= 4_096 &&
    !/\s/u.test(value) &&
    !CONTROL_CHARACTER.test(value)
  );
}

function isMetadata(value: unknown): value is AgentModelConfigMetadata {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "provider",
      "modelId",
      "endpointId",
      "apiKeyLastFour",
      "revision",
      "testStatus",
    ]) &&
    isProvider(value.provider) &&
    isModelId(value.modelId) &&
    isEndpointId(value.endpointId) &&
    typeof value.apiKeyLastFour === "string" &&
    Array.from(value.apiKeyLastFour).length === 4 &&
    !/\s/u.test(value.apiKeyLastFour) &&
    !CONTROL_CHARACTER.test(value.apiKeyLastFour) &&
    isPositiveInteger(value.revision) &&
    ["untested", "passed", "failed"].includes(value.testStatus as string)
  );
}

function isEndpointOption(value: unknown): value is {
  id: string;
  label: string;
  provider: AdminModelProvider;
} {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "label", "provider"]) &&
    isEndpointId(value.id) &&
    isSafeText(value.label, 80) &&
    isProvider(value.provider)
  );
}

function isBootstrap(
  value: unknown,
): value is NonNullable<AgentModelConfigListResponse["bootstrap"]> {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["provider", "modelId", "readOnly"]) &&
    isProvider(value.provider) &&
    isModelId(value.modelId) &&
    value.readOnly === true
  );
}

function isListResponse(value: unknown): value is AgentModelConfigListResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "configs",
      "endpoints",
      "bootstrap",
      "controlEnabled",
    ]) ||
    value.version !== "1" ||
    !Array.isArray(value.configs) ||
    value.configs.length > ADMIN_MODEL_PROVIDERS.length ||
    !value.configs.every(isMetadata) ||
    !Array.isArray(value.endpoints) ||
    !value.endpoints.every(isEndpointOption) ||
    !(value.bootstrap === null || isBootstrap(value.bootstrap)) ||
    typeof value.controlEnabled !== "boolean"
  ) {
    return false;
  }
  const providers = value.configs.map(({ provider }) => provider);
  const endpointIds = value.endpoints.map(({ id }) => id);
  return (
    new Set(providers).size === providers.length &&
    new Set(endpointIds).size === endpointIds.length
  );
}

function isRuntimeResponse(value: unknown): value is AgentModelRuntimeResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "capability",
      "source",
      "provider",
      "modelId",
      "configRevision",
      "activationVersion",
    ]) ||
    value.version !== "1" ||
    !["placeholder", "available", "degraded"].includes(
      value.capability as string,
    )
  ) {
    return false;
  }
  if (value.source === null) {
    return (
      value.capability !== "available" &&
      value.provider === null &&
      value.modelId === null &&
      value.configRevision === null &&
      value.activationVersion === null
    );
  }
  if (!isProvider(value.provider) || !isModelId(value.modelId)) return false;
  if (value.source === "deployment") {
    return value.configRevision === null && value.activationVersion === null;
  }
  return (
    value.source === "dynamic" &&
    isPositiveInteger(value.configRevision) &&
    isPositiveInteger(value.activationVersion)
  );
}

function isErrorResponse(
  status: number,
  value: unknown,
): value is { error: AgentModelControlDomainErrorCode } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["error"]) &&
    typeof value.error === "string" &&
    Object.hasOwn(ERROR_STATUS, value.error) &&
    ERROR_STATUS[value.error as AgentModelControlDomainErrorCode] === status
  );
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    invalidResponse();
  }
}

function sanitized(error: unknown): AgentModelControlClientError {
  if (error instanceof AgentModelControlClientError) return error;
  if (error instanceof AgentOSTransportError) {
    return new AgentModelControlClientError(error.code);
  }
  return new AgentModelControlClientError("transport_error");
}

function mutationBody(value: object): string {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, "utf8") > REQUEST_MAX_BYTES) invalidRequest();
  return encoded;
}

function exactPrivateNoStore(
  cacheControl: string | null,
  pragma: string | null,
): boolean {
  const directives = cacheControl
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .sort();
  return (
    directives?.length === 2 &&
    directives[0] === "no-store" &&
    directives[1] === "private" &&
    pragma?.trim().toLowerCase() === "no-cache"
  );
}

export function createAgentModelControlClient(options: {
  settings: AgentModelControlSettings;
  fetcher?: typeof fetch;
  clock?: () => number;
  nonceFactory?: () => string;
}): AgentModelControlClient {
  const transport = createAgentOSTransport({
    settings: {
      baseUrl: options.settings.baseUrl,
      securityKey: options.settings.controlKey,
    },
    fetcher: options.fetcher,
  });
  const signer = createAgentModelControlAssertionSigner({
    controlKey: options.settings.controlKey,
    clock: options.clock,
    nonceFactory: options.nonceFactory,
  });

  async function request<T>(requestOptions: {
    method: "GET" | "POST" | "PUT";
    path: string;
    headers: Readonly<Record<string, string>>;
    body?: string;
    timeoutMs: number;
    privateNoStore?: boolean;
    validate(value: unknown): value is T;
  }): Promise<T> {
    try {
      const response = await transport.request({
        method: requestOptions.method,
        path: requestOptions.path,
        headers: requestOptions.headers,
        body: requestOptions.body,
        acceptedStatuses: ACCEPTED_STATUSES,
        acceptedMediaTypes: ["application/json"],
        timeoutMs: requestOptions.timeoutMs,
        maxResponseBytes: RESPONSE_MAX_BYTES,
      });
      if (
        requestOptions.privateNoStore &&
        !exactPrivateNoStore(response.cacheControl, response.pragma)
      ) {
        invalidResponse();
      }
      const parsed = parseJson(response.body);
      if (response.status !== 200) {
        if (!isErrorResponse(response.status, parsed)) invalidResponse();
        throw new AgentModelControlClientError(parsed.error);
      }
      if (!requestOptions.validate(parsed)) invalidResponse();
      return parsed;
    } catch (error) {
      throw sanitized(error);
    }
  }

  function readHeaders(requestId: unknown): Record<string, string> {
    if (typeof requestId !== "string" || !CANONICAL_UUID.test(requestId)) {
      invalidRequest();
    }
    return { "X-Request-Id": requestId };
  }

  function mutationHeaders(input: AgentModelControlAssertionInput) {
    return {
      "Content-Type": "application/json",
      "X-Agent-Control-Assertion": signer.sign(input),
      "X-Request-Id": input.requestId,
    };
  }

  function isReadInput(value: unknown): value is { requestId: string } {
    return (
      isRecord(value) &&
      hasExactKeys(value, ["requestId"]) &&
      typeof value.requestId === "string" &&
      CANONICAL_UUID.test(value.requestId)
    );
  }

  function isMutationCommand(
    value: unknown,
    inputGuard: (input: unknown) => boolean,
  ): value is {
    actor: string;
    provider: AdminModelProvider;
    requestId: string;
    input: AdminModelConfigSaveInput | AdminModelConfigRevisionInput;
  } {
    return (
      isRecord(value) &&
      hasExactKeys(value, ["actor", "provider", "requestId", "input"]) &&
      typeof value.actor === "string" &&
      CANONICAL_UUID.test(value.actor) &&
      isProvider(value.provider) &&
      typeof value.requestId === "string" &&
      CANONICAL_UUID.test(value.requestId) &&
      inputGuard(value.input)
    );
  }

  return {
    async listModelConfigs(input) {
      try {
        if (!isReadInput(input)) invalidRequest();
        return await request({
          method: "GET",
          path: "/internal/control/model-configs",
          headers: readHeaders(input.requestId),
          timeoutMs: STANDARD_TIMEOUT_MS,
          validate: isListResponse,
        });
      } catch (error) {
        throw sanitized(error);
      }
    },

    async runtimeStatus(input) {
      try {
        if (!isReadInput(input)) invalidRequest();
        return await request({
          method: "GET",
          path: "/internal/control/model-configs/runtime-status",
          headers: readHeaders(input.requestId),
          timeoutMs: STANDARD_TIMEOUT_MS,
          validate: isRuntimeResponse,
        });
      } catch (error) {
        throw sanitized(error);
      }
    },

    async saveModelConfig(command) {
      try {
        if (!isMutationCommand(command, isAdminModelConfigSaveInput)) {
          invalidRequest();
        }
        const input = command.input as AdminModelConfigSaveInput;
        if (input.expectedRevision >= Number.MAX_SAFE_INTEGER) invalidRequest();
        const payload = {
          modelId: input.modelId,
          endpointId: input.endpointId,
          ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
          expectedRevision: input.expectedRevision,
        };
        const response = await request({
          method: "PUT",
          path: `/internal/control/model-configs/${command.provider}`,
          headers: mutationHeaders({
            actor: command.actor,
            permission: "admin:assistant:configure",
            action: "save",
            provider: command.provider,
            requestId: command.requestId,
          }),
          body: mutationBody(payload),
          timeoutMs: STANDARD_TIMEOUT_MS,
          validate(value): value is AgentModelConfigSaveResponse {
            if (
              !isRecord(value) ||
              !hasExactKeys(value, ["version", "config"]) ||
              value.version !== "1" ||
              !isMetadata(value.config)
            ) {
              return false;
            }
            return (
              value.config.provider === command.provider &&
              value.config.modelId === input.modelId &&
              value.config.endpointId === input.endpointId &&
              value.config.revision === input.expectedRevision + 1 &&
              value.config.testStatus === "untested" &&
              (input.apiKey === undefined ||
                value.config.apiKeyLastFour ===
                  Array.from(input.apiKey).slice(-4).join(""))
            );
          },
        });
        return response;
      } catch (error) {
        throw sanitized(error);
      }
    },

    async testAndActivate(command) {
      try {
        if (!isMutationCommand(command, isAdminModelConfigRevisionInput)) {
          invalidRequest();
        }
        const input = command.input as AdminModelConfigRevisionInput;
        return await request({
          method: "POST",
          path: `/internal/control/model-configs/${command.provider}/test-and-activate`,
          headers: mutationHeaders({
            actor: command.actor,
            permission: "admin:assistant:configure",
            action: "test_and_activate",
            provider: command.provider,
            requestId: command.requestId,
          }),
          body: mutationBody({ revision: input.revision }),
          timeoutMs: ACTIVATION_TIMEOUT_MS,
          validate(value): value is AgentModelActivationResponse {
            return (
              isRecord(value) &&
              hasExactKeys(value, [
                "version",
                "provider",
                "configRevision",
                "activationVersion",
              ]) &&
              value.version === "1" &&
              value.provider === command.provider &&
              value.configRevision === input.revision &&
              isPositiveInteger(value.activationVersion)
            );
          },
        });
      } catch (error) {
        throw sanitized(error);
      }
    },

    async revealKey(command) {
      try {
        if (!isMutationCommand(command, isAdminModelConfigRevisionInput)) {
          invalidRequest();
        }
        const input = command.input as AdminModelConfigRevisionInput;
        return await request({
          method: "POST",
          path: `/internal/control/model-configs/${command.provider}/reveal-key`,
          headers: mutationHeaders({
            actor: command.actor,
            permission: "admin:assistant:secret:reveal",
            action: "reveal",
            provider: command.provider,
            requestId: command.requestId,
          }),
          body: mutationBody({ revision: input.revision }),
          timeoutMs: STANDARD_TIMEOUT_MS,
          privateNoStore: true,
          validate(value): value is AgentModelRevealResponse {
            return (
              isRecord(value) &&
              hasExactKeys(value, ["key"]) &&
              isSecret(value.key)
            );
          },
        });
      } catch (error) {
        throw sanitized(error);
      }
    },
  };
}

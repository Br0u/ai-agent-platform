import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  ADMIN_MODEL_PROVIDERS,
  parseAdminModelConfigRevisionInput,
  parseAdminModelConfigSaveInput,
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
  lastTestedAt: string | null;
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

function readExactDataRecord(
  value: unknown,
  expectedKeySets: readonly (readonly string[])[],
): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return null;
    const actual = new Set(ownKeys as string[]);
    const expected = expectedKeySets.find(
      (keys) =>
        keys.length === actual.size && keys.every((key) => actual.has(key)),
    );
    if (!expected) return null;

    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of expected) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function readExactDataArray(value: unknown, maximum: number): unknown[] | null {
  try {
    if (
      !Array.isArray(value) ||
      Reflect.getPrototypeOf(value) !== Array.prototype
    ) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return null;
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      lengthDescriptor.enumerable ||
      !("value" in lengthDescriptor) ||
      typeof lengthDescriptor.value !== "number" ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > maximum
    ) {
      return null;
    }
    const expected = new Set(["length"]);
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      expected.add(String(index));
    }
    if (
      ownKeys.length !== expected.size ||
      !(ownKeys as string[]).every((key) => expected.has(key))
    ) {
      return null;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return null;
      }
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return null;
  }
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
        const snapshot = readExactDataRecord(input, [
          ["actor", "permission", "action", "provider", "requestId"],
        ]);
        if (
          snapshot === null ||
          typeof snapshot.actor !== "string" ||
          !CANONICAL_UUID.test(snapshot.actor) ||
          typeof snapshot.requestId !== "string" ||
          !CANONICAL_UUID.test(snapshot.requestId) ||
          !isProvider(snapshot.provider) ||
          typeof snapshot.action !== "string" ||
          !Object.hasOwn(ACTION_PERMISSION, snapshot.action) ||
          ACTION_PERMISSION[snapshot.action as AgentModelControlAction] !==
            snapshot.permission
        ) {
          invalidRequest();
        }
        const issuedAt = clock();
        if (
          !Number.isSafeInteger(issuedAt) ||
          issuedAt < 0 ||
          issuedAt > Number.MAX_SAFE_INTEGER - 5
        ) {
          invalidRequest();
        }
        const nonce = nonceFactory();
        if (typeof nonce !== "string" || !CANONICAL_UUID.test(nonce)) {
          invalidRequest();
        }
        const payload = {
          action: snapshot.action,
          actor: snapshot.actor,
          expiresAt: issuedAt + 5,
          issuedAt,
          nonce,
          permission: snapshot.permission,
          provider: snapshot.provider,
          requestId: snapshot.requestId,
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
const AGENT_ENDPOINT_OPTIONS_MAX = 2_048;
const STANDARD_TIMEOUT_MS = 5_000;
const ACTIVATION_TIMEOUT_MS = 55_000;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function hasOnlyPairedSurrogates(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isSafeText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    Array.from(value).length <= maximum &&
    hasOnlyPairedSurrogates(value) &&
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
    !CONTROL_CHARACTER.test(value) &&
    hasOnlyPairedSurrogates(value)
  );
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function readMetadata(value: unknown): AgentModelConfigMetadata | null {
  const snapshot = readExactDataRecord(value, [
    [
      "provider",
      "modelId",
      "endpointId",
      "apiKeyLastFour",
      "revision",
      "testStatus",
      "lastTestedAt",
    ],
  ]);
  if (
    snapshot === null ||
    !isProvider(snapshot.provider) ||
    !isModelId(snapshot.modelId) ||
    !isEndpointId(snapshot.endpointId) ||
    typeof snapshot.apiKeyLastFour !== "string" ||
    Array.from(snapshot.apiKeyLastFour).length !== 4 ||
    /\s/u.test(snapshot.apiKeyLastFour) ||
    CONTROL_CHARACTER.test(snapshot.apiKeyLastFour) ||
    !hasOnlyPairedSurrogates(snapshot.apiKeyLastFour) ||
    !isPositiveInteger(snapshot.revision) ||
    typeof snapshot.testStatus !== "string" ||
    !["untested", "passed", "failed"].includes(snapshot.testStatus) ||
    !(
      snapshot.lastTestedAt === null ||
      isCanonicalTimestamp(snapshot.lastTestedAt)
    )
  ) {
    return null;
  }
  return {
    provider: snapshot.provider,
    modelId: snapshot.modelId,
    endpointId: snapshot.endpointId,
    apiKeyLastFour: snapshot.apiKeyLastFour,
    revision: snapshot.revision,
    testStatus: snapshot.testStatus as AgentModelConfigMetadata["testStatus"],
    lastTestedAt: snapshot.lastTestedAt as string | null,
  };
}

function readEndpointOption(value: unknown): {
  id: string;
  label: string;
  provider: AdminModelProvider;
} | null {
  const snapshot = readExactDataRecord(value, [["id", "label", "provider"]]);
  if (
    snapshot === null ||
    !isEndpointId(snapshot.id) ||
    !isSafeText(snapshot.label, 80) ||
    !isProvider(snapshot.provider)
  ) {
    return null;
  }
  return {
    id: snapshot.id,
    label: snapshot.label,
    provider: snapshot.provider,
  };
}

function readBootstrap(
  value: unknown,
): NonNullable<AgentModelConfigListResponse["bootstrap"]> | null {
  const snapshot = readExactDataRecord(value, [
    ["provider", "modelId", "readOnly"],
  ]);
  if (
    snapshot === null ||
    !isProvider(snapshot.provider) ||
    !isModelId(snapshot.modelId) ||
    snapshot.readOnly !== true
  ) {
    return null;
  }
  return {
    provider: snapshot.provider,
    modelId: snapshot.modelId,
    readOnly: true,
  };
}

function readListResponse(value: unknown): AgentModelConfigListResponse | null {
  const snapshot = readExactDataRecord(value, [
    ["version", "configs", "endpoints", "bootstrap", "controlEnabled"],
  ]);
  const rawConfigs = readExactDataArray(
    snapshot?.configs,
    ADMIN_MODEL_PROVIDERS.length,
  );
  const rawEndpoints = readExactDataArray(
    snapshot?.endpoints,
    AGENT_ENDPOINT_OPTIONS_MAX,
  );
  if (
    snapshot?.version !== "1" ||
    rawConfigs === null ||
    rawEndpoints === null ||
    typeof snapshot.controlEnabled !== "boolean"
  ) {
    return null;
  }
  const configs: AgentModelConfigMetadata[] = [];
  for (const raw of rawConfigs) {
    const config = readMetadata(raw);
    if (config === null) return null;
    configs.push(config);
  }
  const endpoints: AgentModelConfigListResponse["endpoints"] = [];
  for (const raw of rawEndpoints) {
    const endpoint = readEndpointOption(raw);
    if (endpoint === null) return null;
    endpoints.push(endpoint);
  }
  const providers = configs.map(({ provider }) => provider);
  const endpointIds = endpoints.map(({ id }) => id);
  if (
    new Set(providers).size !== providers.length ||
    new Set(endpointIds).size !== endpointIds.length
  ) {
    return null;
  }
  const bootstrap =
    snapshot.bootstrap === null ? null : readBootstrap(snapshot.bootstrap);
  if (snapshot.bootstrap !== null && bootstrap === null) return null;
  return {
    version: "1",
    configs,
    endpoints,
    bootstrap,
    controlEnabled: snapshot.controlEnabled,
  };
}

function readRuntimeResponse(value: unknown): AgentModelRuntimeResponse | null {
  const snapshot = readExactDataRecord(value, [
    [
      "version",
      "capability",
      "source",
      "provider",
      "modelId",
      "configRevision",
      "activationVersion",
    ],
  ]);
  if (
    snapshot?.version !== "1" ||
    typeof snapshot.capability !== "string" ||
    !["placeholder", "available", "degraded"].includes(snapshot.capability)
  ) {
    return null;
  }
  if (snapshot.source === null) {
    if (
      snapshot.capability === "available" ||
      snapshot.provider !== null ||
      snapshot.modelId !== null ||
      snapshot.configRevision !== null ||
      snapshot.activationVersion !== null
    ) {
      return null;
    }
    return {
      version: "1",
      capability: snapshot.capability as "placeholder" | "degraded",
      source: null,
      provider: null,
      modelId: null,
      configRevision: null,
      activationVersion: null,
    };
  }
  if (!isProvider(snapshot.provider) || !isModelId(snapshot.modelId))
    return null;
  if (snapshot.source === "deployment") {
    if (
      snapshot.configRevision !== null ||
      snapshot.activationVersion !== null
    ) {
      return null;
    }
    return {
      version: "1",
      capability:
        snapshot.capability as AgentModelRuntimeResponse["capability"],
      source: "deployment",
      provider: snapshot.provider,
      modelId: snapshot.modelId,
      configRevision: null,
      activationVersion: null,
    };
  }
  if (
    snapshot.source !== "dynamic" ||
    !isPositiveInteger(snapshot.configRevision) ||
    !isPositiveInteger(snapshot.activationVersion)
  ) {
    return null;
  }
  return {
    version: "1",
    capability: snapshot.capability as AgentModelRuntimeResponse["capability"],
    source: "dynamic",
    provider: snapshot.provider,
    modelId: snapshot.modelId,
    configRevision: snapshot.configRevision,
    activationVersion: snapshot.activationVersion,
  };
}

function readErrorResponse(
  status: number,
  value: unknown,
): AgentModelControlDomainErrorCode | null {
  const snapshot = readExactDataRecord(value, [["error"]]);
  if (
    snapshot === null ||
    typeof snapshot.error !== "string" ||
    !Object.hasOwn(ERROR_STATUS, snapshot.error) ||
    ERROR_STATUS[snapshot.error as AgentModelControlDomainErrorCode] !== status
  ) {
    return null;
  }
  return snapshot.error as AgentModelControlDomainErrorCode;
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
    read(value: unknown): T | null;
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
        const errorCode = readErrorResponse(response.status, parsed);
        if (errorCode === null) invalidResponse();
        throw new AgentModelControlClientError(errorCode);
      }
      let safe: T | null = null;
      try {
        safe = requestOptions.read(parsed);
      } catch {
        invalidResponse();
      }
      if (safe === null) invalidResponse();
      return safe;
    } catch (error) {
      throw sanitized(error);
    }
  }

  function readHeaders(requestId: string): Record<string, string> {
    return { "X-Request-Id": requestId };
  }

  function mutationHeaders(input: AgentModelControlAssertionInput) {
    return {
      "Content-Type": "application/json",
      "X-Agent-Control-Assertion": signer.sign(input),
      "X-Request-Id": input.requestId,
    };
  }

  function readReadInput(value: unknown): { requestId: string } | null {
    const snapshot = readExactDataRecord(value, [["requestId"]]);
    return snapshot !== null &&
      typeof snapshot.requestId === "string" &&
      CANONICAL_UUID.test(snapshot.requestId)
      ? { requestId: snapshot.requestId }
      : null;
  }

  function readMutationCommand<T>(
    value: unknown,
    parseInput: (input: unknown) => T | null,
  ): {
    actor: string;
    provider: AdminModelProvider;
    requestId: string;
    input: T;
  } | null {
    const snapshot = readExactDataRecord(value, [
      ["actor", "provider", "requestId", "input"],
    ]);
    if (
      snapshot === null ||
      typeof snapshot.actor !== "string" ||
      !CANONICAL_UUID.test(snapshot.actor) ||
      !isProvider(snapshot.provider) ||
      typeof snapshot.requestId !== "string" ||
      !CANONICAL_UUID.test(snapshot.requestId)
    ) {
      return null;
    }
    const input = parseInput(snapshot.input);
    return input === null
      ? null
      : {
          actor: snapshot.actor,
          provider: snapshot.provider,
          requestId: snapshot.requestId,
          input,
        };
  }

  return {
    async listModelConfigs(input) {
      try {
        const safe = readReadInput(input);
        if (safe === null) invalidRequest();
        return await request({
          method: "GET",
          path: "/internal/control/model-configs",
          headers: readHeaders(safe.requestId),
          timeoutMs: STANDARD_TIMEOUT_MS,
          read: readListResponse,
        });
      } catch (error) {
        throw sanitized(error);
      }
    },

    async runtimeStatus(input) {
      try {
        const safe = readReadInput(input);
        if (safe === null) invalidRequest();
        return await request({
          method: "GET",
          path: "/internal/control/model-configs/runtime-status",
          headers: readHeaders(safe.requestId),
          timeoutMs: STANDARD_TIMEOUT_MS,
          read: readRuntimeResponse,
        });
      } catch (error) {
        throw sanitized(error);
      }
    },

    async saveModelConfig(command) {
      try {
        const safe = readMutationCommand(
          command,
          parseAdminModelConfigSaveInput,
        );
        if (safe === null) invalidRequest();
        const input = safe.input;
        if (input.expectedRevision >= Number.MAX_SAFE_INTEGER) invalidRequest();
        const payload = {
          modelId: input.modelId,
          endpointId: input.endpointId,
          ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
          expectedRevision: input.expectedRevision,
        };
        const response = await request({
          method: "PUT",
          path: `/internal/control/model-configs/${safe.provider}`,
          headers: mutationHeaders({
            actor: safe.actor,
            permission: "admin:assistant:configure",
            action: "save",
            provider: safe.provider,
            requestId: safe.requestId,
          }),
          body: mutationBody(payload),
          timeoutMs: STANDARD_TIMEOUT_MS,
          read(value): AgentModelConfigSaveResponse | null {
            const snapshot = readExactDataRecord(value, [
              ["version", "config"],
            ]);
            const config = readMetadata(snapshot?.config);
            if (
              snapshot?.version !== "1" ||
              config === null ||
              config.provider !== safe.provider ||
              config.modelId !== input.modelId ||
              config.endpointId !== input.endpointId ||
              config.revision !== input.expectedRevision + 1 ||
              config.testStatus !== "untested" ||
              (input.apiKey !== undefined &&
                config.apiKeyLastFour !==
                  Array.from(input.apiKey).slice(-4).join(""))
            ) {
              return null;
            }
            return { version: "1", config };
          },
        });
        return response;
      } catch (error) {
        throw sanitized(error);
      }
    },

    async testAndActivate(command) {
      try {
        const safe = readMutationCommand(
          command,
          parseAdminModelConfigRevisionInput,
        );
        if (safe === null) invalidRequest();
        const input = safe.input;
        return await request({
          method: "POST",
          path: `/internal/control/model-configs/${safe.provider}/test-and-activate`,
          headers: mutationHeaders({
            actor: safe.actor,
            permission: "admin:assistant:configure",
            action: "test_and_activate",
            provider: safe.provider,
            requestId: safe.requestId,
          }),
          body: mutationBody({ revision: input.revision }),
          timeoutMs: ACTIVATION_TIMEOUT_MS,
          read(value): AgentModelActivationResponse | null {
            const snapshot = readExactDataRecord(value, [
              ["version", "provider", "configRevision", "activationVersion"],
            ]);
            if (
              snapshot?.version !== "1" ||
              snapshot.provider !== safe.provider ||
              snapshot.configRevision !== input.revision ||
              !isPositiveInteger(snapshot.activationVersion)
            ) {
              return null;
            }
            return {
              version: "1",
              provider: safe.provider,
              configRevision: input.revision,
              activationVersion: snapshot.activationVersion,
            };
          },
        });
      } catch (error) {
        throw sanitized(error);
      }
    },

    async revealKey(command) {
      try {
        const safe = readMutationCommand(
          command,
          parseAdminModelConfigRevisionInput,
        );
        if (safe === null) invalidRequest();
        const input = safe.input;
        return await request({
          method: "POST",
          path: `/internal/control/model-configs/${safe.provider}/reveal-key`,
          headers: mutationHeaders({
            actor: safe.actor,
            permission: "admin:assistant:secret:reveal",
            action: "reveal",
            provider: safe.provider,
            requestId: safe.requestId,
          }),
          body: mutationBody({ revision: input.revision }),
          timeoutMs: STANDARD_TIMEOUT_MS,
          privateNoStore: true,
          read(value): AgentModelRevealResponse | null {
            const snapshot = readExactDataRecord(value, [["key"]]);
            return snapshot !== null && isSecret(snapshot.key)
              ? { key: snapshot.key }
              : null;
          },
        });
      } catch (error) {
        throw sanitized(error);
      }
    },
  };
}

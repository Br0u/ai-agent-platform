import {
  ASSISTANT_ACTION_HREF_MAX_CODE_POINTS,
  ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS,
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  ASSISTANT_MAX_SUGGESTED_ACTIONS,
  isAssistantMessageId,
  isAssistantRequestId,
  type AssistantMode,
  type AssistantResponseMessage,
  type AssistantSuggestedAction,
} from "./assistant-contract";
import {
  ADMIN_MODEL_PROVIDERS,
  type AdminModelProvider,
} from "./admin-model-config-contract";

export type AdminAssistantServiceState = {
  id: "agentos" | "database" | "model" | "public_entry";
  label: string;
  state:
    | "ready"
    | "degraded"
    | "not_connected"
    | "not_configured"
    | "placeholder";
  detail: string;
};

export type AdminAssistantStatusSnapshot = {
  mode: AssistantMode;
  runtime: {
    live: boolean;
    ready: boolean;
    capability: "placeholder" | "available" | "degraded";
    providerMode: AssistantMode;
    selectedProvider: AssistantMode | "unavailable";
    persistence: "disabled" | "agentos" | "unavailable";
    circuits: {
      readiness: {
        state: "closed" | "open" | "half-open";
        consecutiveFailures: number;
      };
      execution: {
        state: "closed" | "open" | "half-open";
        consecutiveFailures: number;
      };
    };
    readiness: {
      cacheTtlMs: number;
      probeTimeoutMs: number;
      failureThreshold: number;
    };
    source: "none" | "deployment" | "dynamic";
    provider: AdminModelProvider | null;
    modelId: string | null;
    configRevision: number | null;
    activationVersion: number | null;
    testStatus: "not_configured" | "untested" | "passed" | "unavailable";
  };
  services: AdminAssistantServiceState[];
  configuration: {
    defaultAgent: string;
    model: string;
    skills: string;
    sessionStorage: string;
  };
  message: string;
};

export type AdminAssistantSessionsSnapshot = {
  persistence: "disabled" | "agentos" | "unavailable";
  listing: "not_available";
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

export type AdminAssistantChatResponse = {
  version: "1";
  requestId: string;
  mode: AssistantMode;
  message: AssistantResponseMessage;
  suggestedActions: AssistantSuggestedAction[];
};

export type AdminAssistantErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "validation_error"
  | "rate_limited"
  | "assistant_unavailable";

export type AdminAssistantErrorResponse = {
  version: "1";
  requestId: string;
  error: {
    code: AdminAssistantErrorCode;
    message: string;
    retryable: boolean;
  };
};

const ERROR_MESSAGES: Record<AdminAssistantErrorCode, string> = {
  authentication_required: "Authentication required",
  permission_denied: "Permission denied",
  validation_error: "Invalid assistant request",
  rate_limited: "Too many assistant test requests",
  assistant_unavailable: "AI assistant service is unavailable",
};

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

function readExactDataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      return null;
    }
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
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

function readExactDataArray(value: unknown, length: number): unknown[] | null {
  try {
    if (
      !Array.isArray(value) ||
      Reflect.getPrototypeOf(value) !== Array.prototype
    ) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    const expected = new Set(["length"]);
    for (let index = 0; index < length; index += 1) {
      expected.add(String(index));
    }
    if (
      ownKeys.length !== expected.size ||
      ownKeys.some((key) => typeof key !== "string" || !expected.has(key))
    ) {
      return null;
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      lengthDescriptor.enumerable ||
      !("value" in lengthDescriptor) ||
      lengthDescriptor.value !== length
    ) {
      return null;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
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

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value >= 1;
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

function isSafeModelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    Array.from(value).length <= 128 &&
    hasOnlyPairedSurrogates(value) &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value) &&
    !/(?:[a-z][a-z0-9+.-]*:\/\/|\/\/)/iu.test(value)
  );
}

function isProvider(value: unknown): value is AdminModelProvider {
  return (
    typeof value === "string" &&
    (ADMIN_MODEL_PROVIDERS as readonly string[]).includes(value)
  );
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Array.from(value).length <= maximum
  );
}

function isSuggestedAction(value: unknown): value is AssistantSuggestedAction {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["href", "label"]) &&
    isBoundedString(value.label, ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS) &&
    isBoundedString(value.href, ASSISTANT_ACTION_HREF_MAX_CODE_POINTS)
  );
}

function readCircuitInspection(
  value: unknown,
): AdminAssistantStatusSnapshot["runtime"]["circuits"]["readiness"] | null {
  const snapshot = readExactDataRecord(value, ["state", "consecutiveFailures"]);
  if (
    snapshot === null ||
    (snapshot.state !== "closed" &&
      snapshot.state !== "open" &&
      snapshot.state !== "half-open") ||
    !isNonNegativeSafeInteger(snapshot.consecutiveFailures)
  ) {
    return null;
  }
  return {
    state: snapshot.state,
    consecutiveFailures: snapshot.consecutiveFailures,
  };
}

function readAdminRuntimeMetadata(
  value: unknown,
): AdminAssistantStatusSnapshot["runtime"] | null {
  const snapshot = readExactDataRecord(value, [
    "live",
    "ready",
    "capability",
    "providerMode",
    "selectedProvider",
    "persistence",
    "circuits",
    "readiness",
    "source",
    "provider",
    "modelId",
    "configRevision",
    "activationVersion",
    "testStatus",
  ]);
  if (
    snapshot === null ||
    typeof snapshot.live !== "boolean" ||
    typeof snapshot.ready !== "boolean" ||
    (snapshot.capability !== "placeholder" &&
      snapshot.capability !== "available" &&
      snapshot.capability !== "degraded") ||
    (snapshot.providerMode !== "placeholder" &&
      snapshot.providerMode !== "agentos") ||
    (snapshot.selectedProvider !== "placeholder" &&
      snapshot.selectedProvider !== "agentos" &&
      snapshot.selectedProvider !== "unavailable") ||
    (snapshot.persistence !== "disabled" &&
      snapshot.persistence !== "agentos" &&
      snapshot.persistence !== "unavailable")
  ) {
    return null;
  }
  const circuitSnapshot = readExactDataRecord(snapshot.circuits, [
    "readiness",
    "execution",
  ]);
  const readinessCircuit = readCircuitInspection(circuitSnapshot?.readiness);
  const executionCircuit = readCircuitInspection(circuitSnapshot?.execution);
  const readinessSnapshot = readExactDataRecord(snapshot.readiness, [
    "cacheTtlMs",
    "probeTimeoutMs",
    "failureThreshold",
  ]);
  if (
    readinessCircuit === null ||
    executionCircuit === null ||
    readinessSnapshot === null ||
    !isNonNegativeSafeInteger(readinessSnapshot.cacheTtlMs) ||
    !isNonNegativeSafeInteger(readinessSnapshot.probeTimeoutMs) ||
    !isNonNegativeSafeInteger(readinessSnapshot.failureThreshold) ||
    (snapshot.ready
      ? !snapshot.live || snapshot.capability === "degraded"
      : snapshot.capability !== "degraded")
  ) {
    return null;
  }

  if (
    (snapshot.capability === "degraded" &&
      snapshot.selectedProvider !== "unavailable") ||
    (snapshot.capability === "placeholder" &&
      snapshot.selectedProvider !==
        (snapshot.providerMode === "placeholder"
          ? "placeholder"
          : "unavailable")) ||
    (snapshot.capability === "available" &&
      (snapshot.providerMode !== "agentos" ||
        snapshot.selectedProvider !== "agentos"))
  ) {
    return null;
  }

  const common: Omit<
    AdminAssistantStatusSnapshot["runtime"],
    | "source"
    | "provider"
    | "modelId"
    | "configRevision"
    | "activationVersion"
    | "testStatus"
  > = {
    live: snapshot.live,
    ready: snapshot.ready,
    capability: snapshot.capability,
    providerMode: snapshot.providerMode,
    selectedProvider: snapshot.selectedProvider,
    persistence: snapshot.persistence,
    circuits: {
      readiness: readinessCircuit,
      execution: executionCircuit,
    },
    readiness: {
      cacheTtlMs: readinessSnapshot.cacheTtlMs,
      probeTimeoutMs: readinessSnapshot.probeTimeoutMs,
      failureThreshold: readinessSnapshot.failureThreshold,
    },
  };

  if (snapshot.source === "none") {
    return snapshot.provider === null &&
      snapshot.modelId === null &&
      snapshot.configRevision === null &&
      snapshot.activationVersion === null &&
      ((snapshot.capability === "placeholder" &&
        snapshot.testStatus === "not_configured") ||
        (snapshot.capability === "degraded" &&
          (snapshot.testStatus === "not_configured" ||
            snapshot.testStatus === "unavailable")))
      ? {
          ...common,
          source: "none",
          provider: null,
          modelId: null,
          configRevision: null,
          activationVersion: null,
          testStatus: snapshot.testStatus,
        }
      : null;
  }
  if (
    !isProvider(snapshot.provider) ||
    !isSafeModelId(snapshot.modelId) ||
    snapshot.capability === "placeholder"
  ) {
    return null;
  }
  if (snapshot.source === "deployment") {
    return snapshot.configRevision === null &&
      snapshot.activationVersion === null &&
      snapshot.testStatus === "untested"
      ? {
          ...common,
          source: "deployment",
          provider: snapshot.provider,
          modelId: snapshot.modelId,
          configRevision: null,
          activationVersion: null,
          testStatus: "untested",
        }
      : null;
  }
  return snapshot.source === "dynamic" &&
    isPositiveSafeInteger(snapshot.configRevision) &&
    isPositiveSafeInteger(snapshot.activationVersion) &&
    snapshot.testStatus === "passed"
    ? {
        ...common,
        source: "dynamic",
        provider: snapshot.provider,
        modelId: snapshot.modelId,
        configRevision: snapshot.configRevision,
        activationVersion: snapshot.activationVersion,
        testStatus: "passed",
      }
    : null;
}

function readAdminServiceState(
  value: unknown,
  expectedId: AdminAssistantServiceState["id"],
): AdminAssistantServiceState | null {
  const snapshot = readExactDataRecord(value, [
    "id",
    "label",
    "state",
    "detail",
  ]);
  if (
    snapshot === null ||
    snapshot.id !== expectedId ||
    !isBoundedString(snapshot.label, ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS) ||
    (snapshot.state !== "ready" &&
      snapshot.state !== "degraded" &&
      snapshot.state !== "not_connected" &&
      snapshot.state !== "not_configured" &&
      snapshot.state !== "placeholder") ||
    !isBoundedString(snapshot.detail, ASSISTANT_CONTENT_MAX_CODE_POINTS)
  ) {
    return null;
  }
  return {
    id: expectedId,
    label: snapshot.label,
    state: snapshot.state,
    detail: snapshot.detail,
  };
}

export function parseAdminAssistantStatusResponse(
  input: unknown,
): AdminAssistantStatusResponse | null {
  try {
    const response = readExactDataRecord(input, [
      "version",
      "requestId",
      "status",
    ]);
    const status = readExactDataRecord(response?.status, [
      "mode",
      "runtime",
      "services",
      "configuration",
      "message",
    ]);
    const runtime = readAdminRuntimeMetadata(status?.runtime);
    if (
      response?.version !== "1" ||
      !isAssistantRequestId(response.requestId) ||
      status === null ||
      (status.mode !== "placeholder" && status.mode !== "agentos") ||
      runtime === null ||
      !isBoundedString(status.message, ASSISTANT_CONTENT_MAX_CODE_POINTS)
    ) {
      return null;
    }
    if (runtime.providerMode !== status.mode) return null;

    const serviceSources = readExactDataArray(status.services, 4);
    const serviceIds = [
      "agentos",
      "database",
      "model",
      "public_entry",
    ] as const;
    if (serviceSources === null) return null;
    const services: AdminAssistantServiceState[] = [];
    for (let index = 0; index < serviceIds.length; index += 1) {
      const service = readAdminServiceState(
        serviceSources[index],
        serviceIds[index],
      );
      if (service === null) return null;
      services.push(service);
    }
    const configuration = readExactDataRecord(status.configuration, [
      "defaultAgent",
      "model",
      "skills",
      "sessionStorage",
    ]);
    if (
      configuration === null ||
      !isBoundedString(
        configuration.defaultAgent,
        ASSISTANT_CONTENT_MAX_CODE_POINTS,
      ) ||
      !isBoundedString(
        configuration.model,
        ASSISTANT_CONTENT_MAX_CODE_POINTS,
      ) ||
      !isBoundedString(
        configuration.skills,
        ASSISTANT_CONTENT_MAX_CODE_POINTS,
      ) ||
      !isBoundedString(
        configuration.sessionStorage,
        ASSISTANT_CONTENT_MAX_CODE_POINTS,
      )
    ) {
      return null;
    }
    return {
      version: "1",
      requestId: response.requestId,
      status: {
        mode: status.mode,
        runtime,
        services,
        configuration: {
          defaultAgent: configuration.defaultAgent,
          model: configuration.model,
          skills: configuration.skills,
          sessionStorage: configuration.sessionStorage,
        },
        message: status.message,
      },
    };
  } catch {
    return null;
  }
}

export function isAdminAssistantStatusResponse(
  input: unknown,
): input is AdminAssistantStatusResponse {
  return parseAdminAssistantStatusResponse(input) !== null;
}

export function isAdminAssistantChatResponse(
  input: unknown,
): input is AdminAssistantChatResponse {
  return (
    isRecord(input) &&
    hasExactKeys(input, [
      "version",
      "requestId",
      "mode",
      "message",
      "suggestedActions",
    ]) &&
    input.version === "1" &&
    isAssistantRequestId(input.requestId) &&
    (input.mode === "placeholder" || input.mode === "agentos") &&
    isRecord(input.message) &&
    hasExactKeys(input.message, ["content", "id", "role"]) &&
    isAssistantMessageId(input.message.id) &&
    input.message.role === "assistant" &&
    isBoundedString(input.message.content, ASSISTANT_CONTENT_MAX_CODE_POINTS) &&
    Array.isArray(input.suggestedActions) &&
    input.suggestedActions.length <= ASSISTANT_MAX_SUGGESTED_ACTIONS &&
    input.suggestedActions.every(isSuggestedAction)
  );
}

export function createAdminAssistantErrorResponse(
  requestId: string,
  code: AdminAssistantErrorCode,
): AdminAssistantErrorResponse {
  return {
    version: "1",
    requestId,
    error: {
      code,
      message: ERROR_MESSAGES[code],
      retryable: code === "rate_limited" || code === "assistant_unavailable",
    },
  };
}

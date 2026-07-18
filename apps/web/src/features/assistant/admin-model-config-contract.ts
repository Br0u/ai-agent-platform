export const ADMIN_MODEL_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "dashscope",
  "deepseek",
  "minimax",
] as const;

export type AdminModelProvider = (typeof ADMIN_MODEL_PROVIDERS)[number];
export type AdminModelTestStatus =
  | "not_configured"
  | "untested"
  | "passed"
  | "failed";

export type AdminModelConfigItem = {
  provider: AdminModelProvider;
  displayName: string;
  modelId: string | null;
  endpointId: string | null;
  revision: number | null;
  testStatus: AdminModelTestStatus;
  lastTestedAt: string | null;
  apiKey: null | { configured: true; lastFour: string };
  activeRevision: number | null;
};

export type AdminModelEndpointOption = {
  id: string;
  label: string;
};

export type AdminModelRuntimeMetadata = {
  capability: "placeholder" | "available" | "degraded";
  source: "dynamic" | "deployment" | null;
  provider: AdminModelProvider | null;
  modelId: string | null;
  configRevision: number | null;
  activationVersion: number | null;
};

export type AdminModelConfigSnapshot = {
  version: "1";
  configs: AdminModelConfigItem[];
  endpoints: Record<AdminModelProvider, AdminModelEndpointOption[]>;
  runtime: AdminModelRuntimeMetadata;
  canConfigure: boolean;
  canReveal: boolean;
  controlEnabled: boolean;
};

export type AdminModelConfigSaveInput = {
  modelId: string;
  endpointId: string;
  apiKey?: string;
  expectedRevision: number;
};

export type AdminModelConfigRevisionInput = {
  revision: number;
};

const DISPLAY_NAMES: Readonly<Record<AdminModelProvider, string>> = {
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Gemini",
  dashscope: "Qwen / DashScope",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
};
const MODEL_ID_MAX_CODE_POINTS = 128;
const ENDPOINT_ID_MAX_CODE_POINTS = 64;
const ENDPOINT_LABEL_MAX_CODE_POINTS = 128;
const API_KEY_MIN_CODE_POINTS = 8;
const API_KEY_MAX_CODE_POINTS = 4_096;
const ENDPOINTS_PER_PROVIDER_MAX = 64;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const URL_LIKE = /(?:[a-z][a-z0-9+.-]*:\/\/|\/\/)/iu;
const ENDPOINT_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

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

function isProvider(value: unknown): value is AdminModelProvider {
  return (
    typeof value === "string" &&
    (ADMIN_MODEL_PROVIDERS as readonly string[]).includes(value)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
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
  return isSafeText(value, MODEL_ID_MAX_CODE_POINTS);
}

function isEndpointId(value: unknown): value is string {
  return (
    isSafeText(value, ENDPOINT_ID_MAX_CODE_POINTS) && ENDPOINT_ID.test(value)
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

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value);
}

function isMaskedApiKey(
  value: unknown,
): value is { configured: true; lastFour: string } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["configured", "lastFour"]) &&
    value.configured === true &&
    typeof value.lastFour === "string" &&
    Array.from(value.lastFour).length === 4 &&
    !/\s/u.test(value.lastFour) &&
    !CONTROL_CHARACTER.test(value.lastFour)
  );
}

function isConfigItem(
  value: unknown,
  provider: AdminModelProvider,
): value is AdminModelConfigItem {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "provider",
      "displayName",
      "modelId",
      "endpointId",
      "revision",
      "testStatus",
      "lastTestedAt",
      "apiKey",
      "activeRevision",
    ]) ||
    value.provider !== provider ||
    value.displayName !== DISPLAY_NAMES[provider] ||
    !["not_configured", "untested", "passed", "failed"].includes(
      value.testStatus as string,
    ) ||
    !(
      value.lastTestedAt === null || isCanonicalTimestamp(value.lastTestedAt)
    ) ||
    !(value.apiKey === null || isMaskedApiKey(value.apiKey)) ||
    !isNullablePositiveInteger(value.activeRevision)
  ) {
    return false;
  }

  if (value.testStatus === "not_configured") {
    return (
      value.modelId === null &&
      value.endpointId === null &&
      value.revision === null &&
      value.lastTestedAt === null &&
      value.apiKey === null &&
      value.activeRevision === null
    );
  }
  return (
    isModelId(value.modelId) &&
    isEndpointId(value.endpointId) &&
    isPositiveInteger(value.revision) &&
    isMaskedApiKey(value.apiKey)
  );
}

function isEndpointOption(value: unknown): value is AdminModelEndpointOption {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "label"]) &&
    isEndpointId(value.id) &&
    isSafeText(value.label, ENDPOINT_LABEL_MAX_CODE_POINTS)
  );
}

function isProviderEndpoints(
  value: unknown,
): value is Record<AdminModelProvider, AdminModelEndpointOption[]> {
  if (!isRecord(value) || !hasExactKeys(value, ADMIN_MODEL_PROVIDERS)) {
    return false;
  }
  const ids = new Set<string>();
  for (const provider of ADMIN_MODEL_PROVIDERS) {
    const options = value[provider];
    if (
      !Array.isArray(options) ||
      options.length > ENDPOINTS_PER_PROVIDER_MAX
    ) {
      return false;
    }
    for (const option of options) {
      if (!isEndpointOption(option) || ids.has(option.id)) return false;
      ids.add(option.id);
    }
  }
  return true;
}

function isRuntimeMetadata(value: unknown): value is AdminModelRuntimeMetadata {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "capability",
      "source",
      "provider",
      "modelId",
      "configRevision",
      "activationVersion",
    ]) ||
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

export function isAdminModelConfigSnapshot(
  value: unknown,
): value is AdminModelConfigSnapshot {
  if (
    !(
      isRecord(value) &&
      hasExactKeys(value, [
        "version",
        "configs",
        "endpoints",
        "runtime",
        "canConfigure",
        "canReveal",
        "controlEnabled",
      ]) &&
      value.version === "1" &&
      Array.isArray(value.configs) &&
      value.configs.length === ADMIN_MODEL_PROVIDERS.length &&
      value.configs.every((config, index) =>
        isConfigItem(config, ADMIN_MODEL_PROVIDERS[index]!),
      ) &&
      isProviderEndpoints(value.endpoints) &&
      isRuntimeMetadata(value.runtime) &&
      typeof value.canConfigure === "boolean" &&
      typeof value.canReveal === "boolean" &&
      typeof value.controlEnabled === "boolean"
    )
  ) {
    return false;
  }

  const active = value.configs.filter(
    (config) => config.activeRevision !== null,
  );
  if (value.runtime.source === "dynamic") {
    return (
      active.length === 1 &&
      active[0]?.provider === value.runtime.provider &&
      active[0].activeRevision === value.runtime.configRevision &&
      active[0].revision !== null &&
      value.runtime.configRevision !== null &&
      value.runtime.configRevision <= active[0].revision
    );
  }
  return active.length === 0;
}

export function isAdminModelConfigSaveInput(
  value: unknown,
): value is AdminModelConfigSaveInput {
  if (!isRecord(value)) return false;
  const keys = Object.hasOwn(value, "apiKey")
    ? ["modelId", "endpointId", "apiKey", "expectedRevision"]
    : ["modelId", "endpointId", "expectedRevision"];
  if (!hasExactKeys(value, keys)) return false;
  if (Object.hasOwn(value, "apiKey")) {
    const apiKey = value.apiKey;
    if (
      typeof apiKey !== "string" ||
      Array.from(apiKey).length < API_KEY_MIN_CODE_POINTS ||
      Array.from(apiKey).length > API_KEY_MAX_CODE_POINTS ||
      /\s/u.test(apiKey) ||
      CONTROL_CHARACTER.test(apiKey)
    ) {
      return false;
    }
  }
  return (
    isModelId(value.modelId) &&
    isEndpointId(value.endpointId) &&
    isNonNegativeInteger(value.expectedRevision)
  );
}

export function isAdminModelConfigRevisionInput(
  value: unknown,
): value is AdminModelConfigRevisionInput {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["revision"]) &&
    isPositiveInteger(value.revision)
  );
}

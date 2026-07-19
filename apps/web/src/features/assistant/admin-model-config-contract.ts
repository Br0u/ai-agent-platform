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
    const length = lengthDescriptor.value;
    const expected = new Set(["length"]);
    for (let index = 0; index < length; index += 1) {
      expected.add(String(index));
    }
    if (
      ownKeys.length !== expected.size ||
      !(ownKeys as string[]).every((key) => expected.has(key))
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

function isProvider(value: unknown): value is AdminModelProvider {
  return (
    typeof value === "string" &&
    (ADMIN_MODEL_PROVIDERS as readonly string[]).includes(value)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 1;
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

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
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

export function isAdminModelId(value: unknown): value is string {
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

function readMaskedApiKey(
  value: unknown,
): { configured: true; lastFour: string } | null {
  const snapshot = readExactDataRecord(value, [["configured", "lastFour"]]);
  if (
    snapshot?.configured !== true ||
    typeof snapshot.lastFour !== "string" ||
    Array.from(snapshot.lastFour).length !== 4 ||
    /\s/u.test(snapshot.lastFour) ||
    CONTROL_CHARACTER.test(snapshot.lastFour) ||
    !hasOnlyPairedSurrogates(snapshot.lastFour)
  ) {
    return null;
  }
  return { configured: true, lastFour: snapshot.lastFour };
}

function readConfigItem(
  value: unknown,
  provider: AdminModelProvider,
): AdminModelConfigItem | null {
  const snapshot = readExactDataRecord(value, [
    [
      "provider",
      "displayName",
      "modelId",
      "endpointId",
      "revision",
      "testStatus",
      "lastTestedAt",
      "apiKey",
      "activeRevision",
    ],
  ]);
  if (
    snapshot === null ||
    snapshot.provider !== provider ||
    snapshot.displayName !== DISPLAY_NAMES[provider] ||
    typeof snapshot.testStatus !== "string" ||
    !["not_configured", "untested", "passed", "failed"].includes(
      snapshot.testStatus,
    ) ||
    !(
      snapshot.lastTestedAt === null ||
      isCanonicalTimestamp(snapshot.lastTestedAt)
    ) ||
    !isNullablePositiveInteger(snapshot.activeRevision)
  ) {
    return null;
  }

  if (snapshot.testStatus === "not_configured") {
    if (
      snapshot.modelId !== null ||
      snapshot.endpointId !== null ||
      snapshot.revision !== null ||
      snapshot.lastTestedAt !== null ||
      snapshot.apiKey !== null ||
      snapshot.activeRevision !== null
    ) {
      return null;
    }
    return {
      provider,
      displayName: DISPLAY_NAMES[provider],
      modelId: null,
      endpointId: null,
      revision: null,
      testStatus: "not_configured",
      lastTestedAt: null,
      apiKey: null,
      activeRevision: null,
    };
  }
  const apiKey = readMaskedApiKey(snapshot.apiKey);
  if (
    !isAdminModelId(snapshot.modelId) ||
    !isEndpointId(snapshot.endpointId) ||
    !isPositiveInteger(snapshot.revision) ||
    apiKey === null
  ) {
    return null;
  }
  return {
    provider,
    displayName: DISPLAY_NAMES[provider],
    modelId: snapshot.modelId,
    endpointId: snapshot.endpointId,
    revision: snapshot.revision,
    testStatus: snapshot.testStatus as Exclude<
      AdminModelTestStatus,
      "not_configured"
    >,
    lastTestedAt: snapshot.lastTestedAt as string | null,
    apiKey,
    activeRevision: snapshot.activeRevision,
  };
}

function readEndpointOption(value: unknown): AdminModelEndpointOption | null {
  const snapshot = readExactDataRecord(value, [["id", "label"]]);
  if (
    snapshot === null ||
    !isEndpointId(snapshot.id) ||
    !isSafeText(snapshot.label, ENDPOINT_LABEL_MAX_CODE_POINTS)
  ) {
    return null;
  }
  return { id: snapshot.id, label: snapshot.label };
}

function readProviderEndpoints(
  value: unknown,
): Record<AdminModelProvider, AdminModelEndpointOption[]> | null {
  const snapshot = readExactDataRecord(value, [ADMIN_MODEL_PROVIDERS]);
  if (snapshot === null) return null;
  const ids = new Set<string>();
  const result = {} as Record<AdminModelProvider, AdminModelEndpointOption[]>;
  for (const provider of ADMIN_MODEL_PROVIDERS) {
    const options = readExactDataArray(
      snapshot[provider],
      ENDPOINTS_PER_PROVIDER_MAX,
    );
    if (options === null) return null;
    const parsed: AdminModelEndpointOption[] = [];
    for (const option of options) {
      const safe = readEndpointOption(option);
      if (safe === null || ids.has(safe.id)) return null;
      ids.add(safe.id);
      parsed.push(safe);
    }
    result[provider] = parsed;
  }
  return result;
}

function readRuntimeMetadata(value: unknown): AdminModelRuntimeMetadata | null {
  const snapshot = readExactDataRecord(value, [
    [
      "capability",
      "source",
      "provider",
      "modelId",
      "configRevision",
      "activationVersion",
    ],
  ]);
  if (
    snapshot === null ||
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
      capability: snapshot.capability as "placeholder" | "degraded",
      source: null,
      provider: null,
      modelId: null,
      configRevision: null,
      activationVersion: null,
    };
  }
  if (!isProvider(snapshot.provider) || !isAdminModelId(snapshot.modelId))
    return null;
  if (snapshot.source === "deployment") {
    if (
      snapshot.configRevision !== null ||
      snapshot.activationVersion !== null
    ) {
      return null;
    }
    return {
      capability:
        snapshot.capability as AdminModelRuntimeMetadata["capability"],
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
    capability: snapshot.capability as AdminModelRuntimeMetadata["capability"],
    source: "dynamic",
    provider: snapshot.provider,
    modelId: snapshot.modelId,
    configRevision: snapshot.configRevision,
    activationVersion: snapshot.activationVersion,
  };
}

export function isAdminModelConfigSnapshot(
  value: unknown,
): value is AdminModelConfigSnapshot {
  try {
    const snapshot = readExactDataRecord(value, [
      [
        "version",
        "configs",
        "endpoints",
        "runtime",
        "canConfigure",
        "canReveal",
        "controlEnabled",
      ],
    ]);
    const rawConfigs = readExactDataArray(
      snapshot?.configs,
      ADMIN_MODEL_PROVIDERS.length,
    );
    if (
      snapshot?.version !== "1" ||
      rawConfigs?.length !== ADMIN_MODEL_PROVIDERS.length ||
      readProviderEndpoints(snapshot.endpoints) === null ||
      typeof snapshot.canConfigure !== "boolean" ||
      typeof snapshot.canReveal !== "boolean" ||
      typeof snapshot.controlEnabled !== "boolean"
    ) {
      return false;
    }
    const configs: AdminModelConfigItem[] = [];
    for (let index = 0; index < ADMIN_MODEL_PROVIDERS.length; index += 1) {
      const config = readConfigItem(
        rawConfigs[index],
        ADMIN_MODEL_PROVIDERS[index]!,
      );
      if (config === null) return false;
      configs.push(config);
    }
    const runtime = readRuntimeMetadata(snapshot.runtime);
    if (runtime === null) return false;
    const active = configs.filter((config) => config.activeRevision !== null);
    if (runtime.source === "dynamic") {
      return (
        active.length === 1 &&
        active[0]?.provider === runtime.provider &&
        active[0].activeRevision === runtime.configRevision &&
        active[0].revision !== null &&
        runtime.configRevision !== null &&
        runtime.configRevision <= active[0].revision
      );
    }
    return active.length === 0;
  } catch {
    return false;
  }
}

export function parseAdminModelConfigSaveInput(
  value: unknown,
): AdminModelConfigSaveInput | null {
  const snapshot = readExactDataRecord(value, [
    ["modelId", "endpointId", "apiKey", "expectedRevision"],
    ["modelId", "endpointId", "expectedRevision"],
  ]);
  if (snapshot === null) return null;
  if (Object.hasOwn(snapshot, "apiKey")) {
    const apiKey = snapshot.apiKey;
    if (
      typeof apiKey !== "string" ||
      Array.from(apiKey).length < API_KEY_MIN_CODE_POINTS ||
      Array.from(apiKey).length > API_KEY_MAX_CODE_POINTS ||
      /\s/u.test(apiKey) ||
      CONTROL_CHARACTER.test(apiKey) ||
      !hasOnlyPairedSurrogates(apiKey)
    ) {
      return null;
    }
  }
  if (
    !isAdminModelId(snapshot.modelId) ||
    !isEndpointId(snapshot.endpointId) ||
    !isNonNegativeInteger(snapshot.expectedRevision)
  ) {
    return null;
  }
  return {
    modelId: snapshot.modelId,
    endpointId: snapshot.endpointId,
    ...(typeof snapshot.apiKey === "string" ? { apiKey: snapshot.apiKey } : {}),
    expectedRevision: snapshot.expectedRevision,
  };
}

export function isAdminModelConfigSaveInput(
  value: unknown,
): value is AdminModelConfigSaveInput {
  return parseAdminModelConfigSaveInput(value) !== null;
}

export function parseAdminModelConfigRevisionInput(
  value: unknown,
): AdminModelConfigRevisionInput | null {
  const snapshot = readExactDataRecord(value, [["revision"]]);
  return snapshot !== null && isPositiveInteger(snapshot.revision)
    ? { revision: snapshot.revision }
    : null;
}

export function isAdminModelConfigRevisionInput(
  value: unknown,
): value is AdminModelConfigRevisionInput {
  return parseAdminModelConfigRevisionInput(value) !== null;
}

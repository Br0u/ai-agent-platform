import {
  ASSISTANT_INPUT_POLICY_MAX_SOURCE_BYTES,
  ASSISTANT_INPUT_POLICY_MAX_TERM_CODE_POINTS,
  ASSISTANT_INPUT_POLICY_MAX_TERMS,
} from "./assistant-input-policy";

export type AdminInputPolicySnapshot = {
  version: "1";
  revision: number;
  termCount: number;
  terms?: string[];
  updatedAt: string | null;
  canConfigure: boolean;
};

export type AdminInputPolicySaveInput = {
  source: string;
  expectedRevision: number;
};

function exactRecord(
  value: unknown,
  expected: readonly (readonly string[])[],
): Record<string, unknown> | null {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Reflect.getPrototypeOf(value) !== Object.prototype
    ) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return null;
    const allowed = expected.find(
      (set) =>
        set.length === keys.length && set.every((key) => keys.includes(key)),
    );
    if (!allowed) return null;

    const result: Record<string, unknown> = Object.create(null);
    for (const key of allowed) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function canonicalTimestamp(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function stringTerms(value: unknown): string[] | null {
  try {
    if (
      !Array.isArray(value) ||
      Reflect.getPrototypeOf(value) !== Array.prototype ||
      value.length > ASSISTANT_INPUT_POLICY_MAX_TERMS ||
      Reflect.ownKeys(value).length !== value.length + 1
    ) {
      return null;
    }
    const terms: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      const term = descriptor.value;
      if (
        typeof term !== "string" ||
        Array.from(term).length > ASSISTANT_INPUT_POLICY_MAX_TERM_CODE_POINTS
      ) {
        return null;
      }
      terms.push(term);
    }
    return terms;
  } catch {
    return null;
  }
}

export function isAdminInputPolicySnapshot(
  value: unknown,
): value is AdminInputPolicySnapshot {
  const record = exactRecord(value, [
    ["version", "revision", "termCount", "updatedAt", "canConfigure"],
    ["version", "revision", "termCount", "terms", "updatedAt", "canConfigure"],
  ]);
  if (
    record === null ||
    record.version !== "1" ||
    !nonNegativeInteger(record.revision) ||
    !nonNegativeInteger(record.termCount) ||
    record.termCount > ASSISTANT_INPUT_POLICY_MAX_TERMS ||
    !canonicalTimestamp(record.updatedAt) ||
    typeof record.canConfigure !== "boolean"
  ) {
    return false;
  }
  const hasTerms = Object.hasOwn(record, "terms");
  if (hasTerms !== record.canConfigure) return false;
  if (!hasTerms) return true;
  const terms = stringTerms(record.terms);
  return terms !== null && terms.length === record.termCount;
}

export function parseAdminInputPolicySaveInput(
  value: unknown,
): AdminInputPolicySaveInput | null {
  const record = exactRecord(value, [["source", "expectedRevision"]]);
  if (
    record === null ||
    typeof record.source !== "string" ||
    new TextEncoder().encode(record.source).byteLength >
      ASSISTANT_INPUT_POLICY_MAX_SOURCE_BYTES ||
    !nonNegativeInteger(record.expectedRevision)
  ) {
    return null;
  }
  return {
    source: record.source,
    expectedRevision: record.expectedRevision,
  };
}

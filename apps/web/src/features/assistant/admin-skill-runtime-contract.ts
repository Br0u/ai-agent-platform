export type AdminSkillSetState =
  | "candidate"
  | "active"
  | "superseded"
  | "failed"
  | "discarded";

export type AdminSkillSetSummary = {
  id: string;
  state: AdminSkillSetState;
  revisionIds: string[];
  itemCount: number;
  totalExtractedSize: number;
  failureCode: string | null;
};

export type AdminPublishedSkillRevision = {
  skillId: string;
  revisionId: string;
  slug: string;
  revisionNo: number;
  artifactSha256: string;
  extractedSize: number;
};

export type AdminAvailableSkillRevisions = {
  items: AdminPublishedSkillRevision[];
  limit: number;
  offset: number;
  total: number;
};

export type AdminSkillRegistryRuntime = {
  active: AdminSkillSetSummary | null;
  previous: AdminSkillSetSummary | null;
  activationVersion: number;
  candidateCount: number;
  candidates: AdminSkillSetSummary[];
};

export type AdminAgentSkillRuntime = {
  skillCapability: "unconfigured" | "ready" | "preparing" | "degraded";
  configured: boolean;
  activeSetId: string | null;
  loadedSetId: string | null;
  previousSetId: string | null;
  activationVersion: number;
  failureCode: string | null;
};

export type AdminSkillRuntimePermissions = {
  canRead: boolean;
  canConfigure: boolean;
};

export type AdminSkillRuntimeSnapshot = {
  version: "1";
  available: AdminAvailableSkillRevisions;
  registry: AdminSkillRegistryRuntime;
  agent: AdminAgentSkillRuntime;
  permissions: AdminSkillRuntimePermissions;
};

export type AdminSkillSetMutationResponse = {
  set: Omit<AdminSkillSetSummary, "failureCode">;
  replayed: boolean;
};

export type AdminAgentSkillActivationResponse = {
  requestId: string;
  setId: string;
  activationVersion: number;
};

export type AdminSkillCandidateCommand = {
  agentId: "maduoduo";
  revisionIds: string[];
  requestId: string;
};

export type AdminSkillActivationCommand = {
  expectedActivationVersion: number;
  requestId: string;
};

export type AdminSkillDiscardCommand = { requestId: string };

export type AdminSkillRollbackCommand = {
  expectedActivationVersion: number;
  expectedPreviousSetId: string;
  requestId: string;
  activationRequestId: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u;
const FAILURE_CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const SET_STATES = new Set<AdminSkillSetState>([
  "candidate",
  "active",
  "superseded",
  "failed",
  "discarded",
]);

function exactRecord(
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

function exactArray(value: unknown, maximum: number): unknown[] | null {
  try {
    if (
      !Array.isArray(value) ||
      Reflect.getPrototypeOf(value) !== Array.prototype
    ) {
      return null;
    }
    const length = Reflect.getOwnPropertyDescriptor(value, "length");
    if (
      !length ||
      length.enumerable ||
      !("value" in length) ||
      typeof length.value !== "number" ||
      !Number.isSafeInteger(length.value) ||
      length.value < 0 ||
      length.value > maximum
    ) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length.value + 1) return null;
    const result: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positive(value: unknown): value is number {
  return nonNegative(value) && value >= 1;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function failure(value: unknown): value is string | null {
  return (
    value === null || (typeof value === "string" && FAILURE_CODE.test(value))
  );
}

function readSet(
  value: unknown,
  withFailure: boolean,
): AdminSkillSetSummary | null {
  const record = exactRecord(
    value,
    withFailure
      ? [
          "id",
          "state",
          "revisionIds",
          "itemCount",
          "totalExtractedSize",
          "failureCode",
        ]
      : ["id", "state", "revisionIds", "itemCount", "totalExtractedSize"],
  );
  const revisions = exactArray(record?.revisionIds, 16);
  if (
    record === null ||
    !uuid(record.id) ||
    typeof record.state !== "string" ||
    !SET_STATES.has(record.state as AdminSkillSetState) ||
    revisions === null ||
    revisions.some((item) => !uuid(item)) ||
    new Set(revisions).size !== revisions.length ||
    !nonNegative(record.itemCount) ||
    record.itemCount !== revisions.length ||
    !nonNegative(record.totalExtractedSize) ||
    record.totalExtractedSize > 24 * 1024 * 1024 ||
    (withFailure && !failure(record.failureCode))
  ) {
    return null;
  }
  return {
    id: record.id,
    state: record.state as AdminSkillSetState,
    revisionIds: revisions as string[],
    itemCount: record.itemCount,
    totalExtractedSize: record.totalExtractedSize,
    failureCode: withFailure ? (record.failureCode as string | null) : null,
  };
}

export function parseAdminSkillSetMutationResponse(
  value: unknown,
): AdminSkillSetMutationResponse | null {
  const record = exactRecord(value, ["set", "replayed"]);
  const set = readSet(record?.set, false);
  if (record === null || set === null || typeof record.replayed !== "boolean") {
    return null;
  }
  return {
    set: {
      id: set.id,
      state: set.state,
      revisionIds: set.revisionIds,
      itemCount: set.itemCount,
      totalExtractedSize: set.totalExtractedSize,
    },
    replayed: record.replayed,
  };
}

export function parseAdminAvailableSkillRevisions(
  value: unknown,
): AdminAvailableSkillRevisions | null {
  const record = exactRecord(value, ["items", "limit", "offset", "total"]);
  const rawItems = exactArray(record?.items, 100);
  if (
    record === null ||
    rawItems === null ||
    !positive(record.limit) ||
    record.limit > 100 ||
    !nonNegative(record.offset) ||
    !nonNegative(record.total) ||
    record.offset + rawItems.length > record.total
  ) {
    return null;
  }
  const items: AdminPublishedSkillRevision[] = [];
  for (const raw of rawItems) {
    const item = exactRecord(raw, [
      "skillId",
      "revisionId",
      "slug",
      "revisionNo",
      "artifactSha256",
      "extractedSize",
    ]);
    if (
      item === null ||
      !uuid(item.skillId) ||
      !uuid(item.revisionId) ||
      typeof item.slug !== "string" ||
      !SLUG.test(item.slug) ||
      !positive(item.revisionNo) ||
      typeof item.artifactSha256 !== "string" ||
      !SHA256.test(item.artifactSha256) ||
      !nonNegative(item.extractedSize) ||
      item.extractedSize > 5 * 1024 * 1024
    ) {
      return null;
    }
    items.push(item as AdminPublishedSkillRevision);
  }
  if (
    new Set(items.map((item) => item.skillId)).size !== items.length ||
    new Set(items.map((item) => item.revisionId)).size !== items.length ||
    new Set(items.map((item) => item.slug)).size !== items.length
  ) {
    return null;
  }
  return {
    items,
    limit: record.limit,
    offset: record.offset,
    total: record.total,
  };
}

export function parseAdminSkillRegistryRuntime(
  value: unknown,
): AdminSkillRegistryRuntime | null {
  const record = exactRecord(value, [
    "active",
    "previous",
    "activationVersion",
    "candidateCount",
    "candidates",
  ]);
  const rawCandidates = exactArray(record?.candidates, 20);
  if (
    record === null ||
    rawCandidates === null ||
    !nonNegative(record.activationVersion) ||
    !nonNegative(record.candidateCount) ||
    record.candidateCount !== rawCandidates.length
  ) {
    return null;
  }
  const active = record.active === null ? null : readSet(record.active, true);
  const previous =
    record.previous === null ? null : readSet(record.previous, true);
  const candidates = rawCandidates.map((item) => readSet(item, true));
  if (
    (record.active !== null && active === null) ||
    (record.previous !== null && previous === null) ||
    candidates.some((item) => item === null) ||
    (active === null) !== (record.activationVersion === 0) ||
    (active !== null && active.state !== "active") ||
    (previous !== null && previous.state !== "superseded") ||
    candidates.some((item) => item?.state !== "candidate")
  ) {
    return null;
  }
  const all = [active, previous, ...candidates].filter(
    (item): item is AdminSkillSetSummary => item !== null,
  );
  if (new Set(all.map((item) => item.id)).size !== all.length) return null;
  return {
    active,
    previous,
    activationVersion: record.activationVersion,
    candidateCount: record.candidateCount,
    candidates: candidates as AdminSkillSetSummary[],
  };
}

export function parseAdminAgentSkillRuntime(
  value: unknown,
): AdminAgentSkillRuntime | null {
  const record = exactRecord(value, [
    "skillCapability",
    "configured",
    "activeSetId",
    "loadedSetId",
    "previousSetId",
    "activationVersion",
    "failureCode",
  ]);
  if (
    record === null ||
    typeof record.skillCapability !== "string" ||
    !["unconfigured", "ready", "preparing", "degraded"].includes(
      record.skillCapability,
    ) ||
    typeof record.configured !== "boolean" ||
    !(record.activeSetId === null || uuid(record.activeSetId)) ||
    !(record.loadedSetId === null || uuid(record.loadedSetId)) ||
    !(record.previousSetId === null || uuid(record.previousSetId)) ||
    !nonNegative(record.activationVersion) ||
    !failure(record.failureCode) ||
    record.configured !== (record.loadedSetId !== null)
  ) {
    return null;
  }
  if (record.skillCapability !== "degraded") {
    const configured = record.configured === true;
    if (
      (configured &&
        (record.activeSetId !== record.loadedSetId ||
          !positive(record.activationVersion))) ||
      (!configured &&
        (record.activeSetId !== null ||
          record.loadedSetId !== null ||
          record.previousSetId !== null ||
          record.activationVersion !== 0)) ||
      (record.skillCapability === "unconfigured") !== !configured
    ) {
      return null;
    }
  }
  return record as AdminAgentSkillRuntime;
}

export function parseAdminAgentSkillActivationResponse(
  value: unknown,
): AdminAgentSkillActivationResponse | null {
  const record = exactRecord(value, [
    "requestId",
    "setId",
    "activationVersion",
  ]);
  return record !== null &&
    uuid(record.requestId) &&
    uuid(record.setId) &&
    positive(record.activationVersion)
    ? (record as AdminAgentSkillActivationResponse)
    : null;
}

export function parseAdminSkillRuntimeSnapshot(
  value: unknown,
): AdminSkillRuntimeSnapshot | null {
  const record = exactRecord(value, [
    "version",
    "available",
    "registry",
    "agent",
    "permissions",
  ]);
  const available = parseAdminAvailableSkillRevisions(record?.available);
  const registry = parseAdminSkillRegistryRuntime(record?.registry);
  const agent = parseAdminAgentSkillRuntime(record?.agent);
  const permissions = exactRecord(record?.permissions, [
    "canRead",
    "canConfigure",
  ]);
  if (
    record?.version !== "1" ||
    available === null ||
    registry === null ||
    agent === null ||
    permissions === null ||
    typeof permissions.canRead !== "boolean" ||
    typeof permissions.canConfigure !== "boolean" ||
    (permissions.canConfigure && !permissions.canRead)
  ) {
    return null;
  }
  if (
    agent.skillCapability !== "degraded" &&
    ((registry.active === null && agent.configured) ||
      (registry.active !== null &&
        (!agent.configured ||
          agent.activeSetId !== registry.active.id ||
          agent.loadedSetId !== registry.active.id ||
          agent.activationVersion !== registry.activationVersion)))
  ) {
    return null;
  }
  return {
    version: "1",
    available,
    registry,
    agent,
    permissions: {
      canRead: permissions.canRead,
      canConfigure: permissions.canConfigure,
    },
  };
}

export function parseAdminSkillCandidateInput(
  value: unknown,
): { revisionIds: string[] } | null {
  const record = exactRecord(value, ["revisionIds"]);
  const revisions = exactArray(record?.revisionIds, 16);
  return record !== null &&
    revisions !== null &&
    revisions.every(uuid) &&
    new Set(revisions).size === revisions.length
    ? { revisionIds: revisions as string[] }
    : null;
}

export function parseAdminSkillCandidateCommand(
  value: unknown,
): AdminSkillCandidateCommand | null {
  const record = exactRecord(value, ["agentId", "revisionIds", "requestId"]);
  const revisions = exactArray(record?.revisionIds, 16);
  return record?.agentId === "maduoduo" &&
    revisions !== null &&
    revisions.every(uuid) &&
    new Set(revisions).size === revisions.length &&
    uuid(record.requestId)
    ? {
        agentId: "maduoduo",
        revisionIds: revisions as string[],
        requestId: record.requestId,
      }
    : null;
}

export function parseAdminSkillActivationCommand(
  value: unknown,
): AdminSkillActivationCommand | null {
  const record = exactRecord(value, ["expectedActivationVersion", "requestId"]);
  return record !== null &&
    nonNegative(record.expectedActivationVersion) &&
    uuid(record.requestId)
    ? {
        expectedActivationVersion: record.expectedActivationVersion,
        requestId: record.requestId,
      }
    : null;
}

export function parseAdminSkillDiscardCommand(
  value: unknown,
): AdminSkillDiscardCommand | null {
  const record = exactRecord(value, ["requestId"]);
  return record !== null && uuid(record.requestId)
    ? { requestId: record.requestId }
    : null;
}

export function parseAdminSkillRollbackCommand(
  value: unknown,
): AdminSkillRollbackCommand | null {
  const record = exactRecord(value, [
    "expectedActivationVersion",
    "expectedPreviousSetId",
    "requestId",
    "activationRequestId",
  ]);
  return record !== null &&
    positive(record.expectedActivationVersion) &&
    uuid(record.expectedPreviousSetId) &&
    uuid(record.requestId) &&
    uuid(record.activationRequestId) &&
    record.requestId !== record.activationRequestId
    ? {
        expectedActivationVersion: record.expectedActivationVersion,
        expectedPreviousSetId: record.expectedPreviousSetId,
        requestId: record.requestId,
        activationRequestId: record.activationRequestId,
      }
    : null;
}

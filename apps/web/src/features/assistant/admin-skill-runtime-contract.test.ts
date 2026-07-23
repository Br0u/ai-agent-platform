import { describe, expect, it } from "vitest";

import {
  parseAdminAgentSkillRuntime,
  parseAdminSkillActivationCommand,
  parseAdminSkillCandidateCommand,
  parseAdminSkillCandidateInput,
  parseAdminSkillDiscardCommand,
  parseAdminSkillRollbackCommand,
  parseAdminSkillRuntimeSnapshot,
} from "./admin-skill-runtime-contract";

const ACTIVE = "11111111-1111-4111-8111-111111111111";
const PREVIOUS = "22222222-2222-4222-8222-222222222222";
const REVISION = "33333333-3333-4333-8333-333333333333";
const SKILL = "44444444-4444-4444-8444-444444444444";

function snapshot() {
  return {
    version: "1",
    available: {
      items: [
        {
          skillId: SKILL,
          revisionId: REVISION,
          slug: "safe-skill",
          revisionNo: 1,
          artifactSha256: "a".repeat(64),
          extractedSize: 123,
        },
      ],
      limit: 100,
      offset: 0,
      total: 1,
    },
    registry: {
      active: {
        id: ACTIVE,
        state: "active",
        revisionIds: [REVISION],
        itemCount: 1,
        totalExtractedSize: 123,
        failureCode: null,
      },
      previous: {
        id: PREVIOUS,
        state: "superseded",
        revisionIds: [],
        itemCount: 0,
        totalExtractedSize: 0,
        failureCode: null,
      },
      activationVersion: 3,
      candidateCount: 0,
      candidates: [],
    },
    agent: {
      skillCapability: "ready",
      configured: true,
      activeSetId: ACTIVE,
      loadedSetId: ACTIVE,
      previousSetId: PREVIOUS,
      activationVersion: 3,
      failureCode: null,
    },
    permissions: { canRead: true, canConfigure: true },
  };
}

describe("admin Skill runtime contract", () => {
  it("accepts exact published, Registry, Agent, and permission truth", () => {
    const parsed = parseAdminSkillRuntimeSnapshot(snapshot());
    expect(parsed).toEqual(snapshot());
    expect(Object.getPrototypeOf(parsed?.agent)).toBe(Object.prototype);
  });

  it("returns plain published revisions for Server-to-Client serialization", () => {
    const parsed = parseAdminSkillRuntimeSnapshot(snapshot());

    expect(Object.getPrototypeOf(parsed?.available.items[0])).toBe(
      Object.prototype,
    );
  });

  it("accepts multiple published revisions of the same Skill", () => {
    const value = snapshot();
    value.available.items.push({
      ...value.available.items[0]!,
      revisionId: "55555555-5555-4555-8555-555555555555",
      revisionNo: 2,
      artifactSha256: "b".repeat(64),
    });
    value.available.total = 2;

    expect(parseAdminSkillRuntimeSnapshot(value)?.available.items).toHaveLength(
      2,
    );
  });

  it.each([
    [
      "top-level extra",
      (value: ReturnType<typeof snapshot>) =>
        Reflect.set(value, "path", "/run/private"),
    ],
    [
      "revision extra",
      (value: ReturnType<typeof snapshot>) =>
        Reflect.set(value.available.items[0]!, "archive", "private"),
    ],
    [
      "candidate count",
      (value: ReturnType<typeof snapshot>) =>
        (value.registry.candidateCount = 1),
    ],
    [
      "registry mismatch",
      (value: ReturnType<typeof snapshot>) =>
        (value.agent.loadedSetId = PREVIOUS),
    ],
    [
      "version mismatch",
      (value: ReturnType<typeof snapshot>) =>
        (value.agent.activationVersion = 2),
    ],
    [
      "configure without read",
      (value: ReturnType<typeof snapshot>) =>
        (value.permissions.canRead = false),
    ],
  ])("rejects %s", (_name, mutate) => {
    const value = snapshot();
    mutate(value);
    expect(parseAdminSkillRuntimeSnapshot(value)).toBeNull();
  });

  it("allows an explicit degraded mismatch but rejects a healthy mismatch", () => {
    const degraded = snapshot();
    degraded.agent.skillCapability = "degraded";
    degraded.agent.loadedSetId = PREVIOUS;
    expect(parseAdminSkillRuntimeSnapshot(degraded)).not.toBeNull();

    degraded.agent.skillCapability = "ready";
    expect(parseAdminSkillRuntimeSnapshot(degraded)).toBeNull();
  });

  it("requires unconfigured truth to be entirely empty", () => {
    expect(
      parseAdminAgentSkillRuntime({
        skillCapability: "unconfigured",
        configured: false,
        activeSetId: null,
        loadedSetId: null,
        previousSetId: null,
        activationVersion: 0,
        failureCode: null,
      }),
    ).not.toBeNull();
    expect(
      parseAdminAgentSkillRuntime({
        skillCapability: "unconfigured",
        configured: false,
        activeSetId: ACTIVE,
        loadedSetId: null,
        previousSetId: null,
        activationVersion: 3,
        failureCode: null,
      }),
    ).toBeNull();
  });

  it("rejects unknown, duplicate, noncanonical, and oversized candidate inputs", () => {
    expect(parseAdminSkillCandidateInput({ revisionIds: [REVISION] })).toEqual({
      revisionIds: [REVISION],
    });
    expect(
      parseAdminSkillCandidateInput({ revisionIds: [REVISION, REVISION] }),
    ).toBeNull();
    expect(
      parseAdminSkillCandidateInput({ revisionIds: [REVISION], path: "/tmp" }),
    ).toBeNull();
    expect(
      parseAdminSkillCandidateInput({ revisionIds: Array(17).fill(REVISION) }),
    ).toBeNull();
  });

  it("requires caller-stable UUIDs for every mutation and distinct rollback IDs", () => {
    expect(
      parseAdminSkillCandidateCommand({
        agentId: "maduoduo",
        revisionIds: [REVISION],
        requestId: ACTIVE,
      }),
    ).not.toBeNull();
    expect(
      parseAdminSkillActivationCommand({
        expectedActivationVersion: 0,
        requestId: ACTIVE,
      }),
    ).not.toBeNull();
    expect(parseAdminSkillDiscardCommand({ requestId: ACTIVE })).not.toBeNull();
    expect(
      parseAdminSkillRollbackCommand({
        expectedActivationVersion: 3,
        expectedPreviousSetId: PREVIOUS,
        requestId: ACTIVE,
        activationRequestId: REVISION,
      }),
    ).not.toBeNull();
    expect(
      parseAdminSkillRollbackCommand({
        expectedActivationVersion: 3,
        expectedPreviousSetId: PREVIOUS,
        requestId: ACTIVE,
        activationRequestId: ACTIVE,
      }),
    ).toBeNull();
    expect(
      parseAdminSkillCandidateCommand({
        agentId: "other",
        revisionIds: [],
        requestId: ACTIVE,
      }),
    ).toBeNull();
  });

  it("rejects hidden, accessor, symbol, array-extra, and hostile proxy input", () => {
    const hidden = snapshot();
    Object.defineProperty(hidden, "path", { value: "/run/private" });
    expect(parseAdminSkillRuntimeSnapshot(hidden)).toBeNull();

    const accessor = snapshot();
    Object.defineProperty(accessor, "version", {
      enumerable: true,
      get: () => "1",
    });
    expect(parseAdminSkillRuntimeSnapshot(accessor)).toBeNull();

    const symbol = snapshot();
    Reflect.set(symbol, Symbol("secret"), true);
    expect(parseAdminSkillRuntimeSnapshot(symbol)).toBeNull();

    const arrayExtra = snapshot();
    Reflect.set(arrayExtra.available.items, "path", "/private");
    expect(parseAdminSkillRuntimeSnapshot(arrayExtra)).toBeNull();

    const hostile = new Proxy(snapshot(), {
      getPrototypeOf() {
        throw new Error("private");
      },
    });
    expect(() => parseAdminSkillRuntimeSnapshot(hostile)).not.toThrow();
    expect(parseAdminSkillRuntimeSnapshot(hostile)).toBeNull();
  });
});

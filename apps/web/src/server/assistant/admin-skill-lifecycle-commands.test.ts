import { describe, expect, it, vi } from "vitest";

import type { WorkforceActor } from "@/server/auth/access";
import { AgentSkillControlClientError } from "./agent-skill-control-client";
import {
  AdminSkillLifecycleCommandError,
  createAdminSkillLifecycleCommands,
} from "./admin-skill-lifecycle-commands";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";
const SET_ID = "55555555-5555-4555-8555-555555555555";

const actor: WorkforceActor = {
  userId: ACTOR_ID,
  realm: "workforce",
  status: "active",
  displayName: "Admin",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: ["admin:assistant:skills:configure"],
};

function setup() {
  const registryStatus = {
    active: null,
    previous: null,
    activationVersion: 0,
    candidateCount: 0,
    candidates: [],
  };
  const agentStatus = {
    skillCapability: "unconfigured" as const,
    configured: false,
    activeSetId: null,
    loadedSetId: null,
    previousSetId: null,
    activationVersion: 0,
    failureCode: null,
  };
  const registry = {
    runtimeStatus: vi
      .fn()
      .mockResolvedValueOnce(registryStatus)
      .mockResolvedValue({
        ...registryStatus,
        active: {
          id: SET_ID,
          state: "active",
          revisionIds: [REVISION_ID],
          itemCount: 1,
          totalExtractedSize: 42,
          failureCode: null,
        },
        activationVersion: 1,
      }),
    listAvailableRevisions: vi.fn(),
    createSkillSet: vi.fn(async () => ({
      set: {
        id: SET_ID,
        state: "candidate" as const,
        revisionIds: [REVISION_ID],
        itemCount: 1,
        totalExtractedSize: 42,
      },
      replayed: false,
    })),
    discardSkillSet: vi.fn(),
    clonePreviousSkillSet: vi.fn(),
  };
  const agent = {
    runtimeStatus: vi
      .fn()
      .mockResolvedValueOnce(agentStatus)
      .mockResolvedValue({
        ...agentStatus,
        skillCapability: "ready" as const,
        configured: true,
        activeSetId: SET_ID,
        loadedSetId: SET_ID,
        activationVersion: 1,
      }),
    activate: vi.fn(async () => ({
      requestId: REQUEST_ID,
      setId: SET_ID,
      activationVersion: 1,
    })),
  };
  const audit = { write: vi.fn(async () => undefined) };
  const commands = createAdminSkillLifecycleCommands({
    requireTrustedMutation: vi.fn(),
    requireSensitiveAction: vi.fn(async () => ({
      actor,
      assuredAt: 2_000_000_000,
    })),
    registry,
    agent,
    audit,
  });
  return { commands, registry, agent, audit };
}

describe("admin Skill lifecycle commands", () => {
  it("creates, activates, reconciles, and audits one Skill-level operation", async () => {
    const { commands, registry, agent, audit } = setup();
    const context = await commands.authorize(
      new Request("https://example.test/api", { method: "POST" }),
    );

    await expect(
      commands.applySkillSet(context, {
        operation: "enable",
        skillId: SKILL_ID,
        expectedActivationVersion: 0,
        nextRevisionIds: [REVISION_ID],
        requestId: REQUEST_ID,
      }),
    ).resolves.toEqual({ activationVersion: 1 });

    expect(registry.createSkillSet).toHaveBeenCalledOnce();
    expect(agent.activate).toHaveBeenCalledWith(
      expect.objectContaining({ setId: SET_ID, expectedActivationVersion: 0 }),
    );
    expect(registry.runtimeStatus).toHaveBeenCalledTimes(2);
    expect(agent.runtimeStatus).toHaveBeenCalledTimes(2);
    expect(audit.write).toHaveBeenCalledOnce();
  });

  it("discards a candidate when activation does not start", async () => {
    const { commands, registry, agent } = setup();
    agent.activate.mockRejectedValueOnce(new Error("not started"));
    registry.discardSkillSet.mockResolvedValueOnce({
      set: {
        id: SET_ID,
        state: "discarded",
        revisionIds: [],
        itemCount: 0,
        totalExtractedSize: 0,
      },
      replayed: false,
    });
    const context = await commands.authorize(
      new Request("https://example.test/api", { method: "POST" }),
    );

    await expect(
      commands.applySkillSet(context, {
        operation: "disable",
        skillId: SKILL_ID,
        expectedActivationVersion: 0,
        nextRevisionIds: [],
        requestId: REQUEST_ID,
      }),
    ).rejects.toBeInstanceOf(AdminSkillLifecycleCommandError);
    expect(registry.discardSkillSet).toHaveBeenCalledWith(
      expect.objectContaining({ setId: SET_ID }),
    );
  });

  it("keeps the prior runtime untouched when activation result is unknown", async () => {
    const { commands, registry, agent } = setup();
    agent.activate.mockRejectedValueOnce(
      new AgentSkillControlClientError("activation_result_unknown"),
    );
    const context = await commands.authorize(
      new Request("https://example.test/api", { method: "POST" }),
    );

    await expect(
      commands.applySkillSet(context, {
        operation: "replace",
        skillId: SKILL_ID,
        expectedActivationVersion: 0,
        nextRevisionIds: [REVISION_ID],
        requestId: REQUEST_ID,
      }),
    ).rejects.toMatchObject({ code: "result_unknown" });
    expect(registry.discardSkillSet).not.toHaveBeenCalled();
  });
});

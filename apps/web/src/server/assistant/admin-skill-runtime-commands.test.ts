import { describe, expect, it, vi } from "vitest";

import type { WorkforceActor } from "@/server/auth/access";
import {
  AdminSkillRuntimeCommandError,
  createAdminSkillRuntimeCommands,
} from "./admin-skill-runtime-commands";
import { AgentSkillControlClientError } from "./agent-skill-control-client";
import type { SkillRegistryRuntimeClient } from "./skill-registry-client";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVATION_REQUEST_ID = "66666666-6666-4666-8666-666666666666";
const REVISION = "33333333-3333-4333-8333-333333333333";
const SET_ID = "44444444-4444-4444-8444-444444444444";
const PREVIOUS = "55555555-5555-4555-8555-555555555555";

const actor: WorkforceActor = {
  userId: ACTOR_ID,
  realm: "workforce",
  status: "active",
  displayName: "Admin",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: ["admin:assistant:skills:configure"],
};

function mutation(state: "candidate" | "discarded", id = SET_ID) {
  return {
    set: {
      id,
      state,
      revisionIds: state === "candidate" ? [REVISION] : [],
      itemCount: state === "candidate" ? 1 : 0,
      totalExtractedSize: state === "candidate" ? 42 : 0,
    },
    replayed: false,
  } as const;
}

function setup() {
  const registry = {
    runtimeStatus: vi.fn(),
    listAvailableRevisions: vi.fn(),
    createSkillSet: vi.fn(async () => mutation("candidate")),
    discardSkillSet: vi.fn(async () => mutation("discarded")),
    clonePreviousSkillSet: vi.fn(async () => mutation("candidate")),
  } satisfies SkillRegistryRuntimeClient;
  const agent = {
    runtimeStatus: vi.fn(),
    activate: vi.fn(async (input: { requestId: string; setId: string }) => ({
      requestId: input.requestId,
      setId: input.setId,
      activationVersion: 4,
    })),
  };
  const audit = { write: vi.fn(async () => undefined) };
  const trusted = vi.fn();
  const sensitive = vi.fn(async () => ({ actor, assuredAt: 2_000_000_000 }));
  const commands = createAdminSkillRuntimeCommands({
    requireTrustedMutation: trusted,
    requireSensitiveAction: sensitive,
    audit,
    registry,
    agent,
  });
  return { commands, registry, agent, audit, trusted, sensitive };
}

describe("admin Skill runtime commands", () => {
  it("requires trusted recent MFA and creates an audited candidate", async () => {
    const { commands, registry, audit, trusted, sensitive } = setup();
    const request = new Request("https://example.test/api", { method: "POST" });
    const context = await commands.authorize(request);
    await expect(
      commands.createCandidate(context, {
        agentId: "maduoduo",
        revisionIds: [REVISION],
        requestId: REQUEST_ID,
      }),
    ).resolves.toMatchObject({ set: { state: "candidate" } });

    expect(trusted).toHaveBeenCalledWith(request);
    expect(sensitive).toHaveBeenCalledWith("admin:assistant:skills:configure", {
      recentWithinSeconds: 600,
      mfaRequired: true,
    });
    expect(registry.createSkillSet).toHaveBeenCalledWith({
      actor: ACTOR_ID,
      requestId: REQUEST_ID,
      assuredAt: 2_000_000_000,
      revisionIds: [REVISION],
    });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "assistant.skill_runtime_changed",
        metadata: expect.objectContaining({
          operation: "create",
          revisionCount: 1,
          requestId: REQUEST_ID,
          activationRequestId: null,
          result: "success",
        }),
      }),
    );
  });

  it("makes an authorization context one-use", async () => {
    const { commands } = setup();
    const context = await commands.authorize(
      new Request("https://example.test/api", { method: "POST" }),
    );
    await commands.discardCandidate(context, SET_ID, { requestId: REQUEST_ID });
    await expect(
      commands.discardCandidate(context, SET_ID, { requestId: REQUEST_ID }),
    ).rejects.toEqual(
      new AdminSkillRuntimeCommandError("authorization_failed"),
    );
  });

  it("clones previous then activates the new immutable candidate", async () => {
    const { commands, registry, agent } = setup();
    const context = await commands.authorize(
      new Request("https://example.test/api", { method: "POST" }),
    );
    await commands.rollback(context, {
      expectedActivationVersion: 3,
      expectedPreviousSetId: PREVIOUS,
      requestId: REQUEST_ID,
      activationRequestId: ACTIVATION_REQUEST_ID,
    });

    expect(registry.clonePreviousSkillSet).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedActivationVersion: 3,
        expectedPreviousSetId: PREVIOUS,
      }),
    );
    expect(agent.activate).toHaveBeenCalledWith(
      expect.objectContaining({
        setId: SET_ID,
        expectedActivationVersion: 3,
        requestId: ACTIVATION_REQUEST_ID,
      }),
    );
    expect(
      registry.clonePreviousSkillSet.mock.invocationCallOrder[0],
    ).toBeLessThan(agent.activate.mock.invocationCallOrder[0]!);
  });

  it("sanitizes Agent errors and audits failure", async () => {
    const { commands, agent, audit } = setup();
    agent.activate.mockRejectedValueOnce(
      new AgentSkillControlClientError("activation_busy"),
    );
    const context = await commands.authorize(
      new Request("https://example.test/api", { method: "POST" }),
    );

    await expect(
      commands.activateCandidate(context, SET_ID, {
        expectedActivationVersion: 3,
        requestId: REQUEST_ID,
      }),
    ).rejects.toEqual(new AdminSkillRuntimeCommandError("activation_busy"));
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ result: "failure" }),
      }),
    );
  });

  it("reports an unknown result without writing a false failure after a committed mutation", async () => {
    const { commands, registry, audit } = setup();
    audit.write.mockRejectedValueOnce(new Error("audit storage unavailable"));
    const context = await commands.authorize(
      new Request("https://example.test/api", { method: "POST" }),
    );

    await expect(
      commands.createCandidate(context, {
        agentId: "maduoduo",
        revisionIds: [REVISION],
        requestId: REQUEST_ID,
      }),
    ).rejects.toEqual(
      new AdminSkillRuntimeCommandError("activation_result_unknown"),
    );
    expect(registry.createSkillSet).toHaveBeenCalledOnce();
    expect(audit.write).toHaveBeenCalledOnce();
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ result: "success" }),
      }),
    );
  });
});

import { describe, expect, it, vi } from "vitest";

import type { WorkforceActor } from "@/server/auth/access";
import { AdminSkillRuntimeCommandError } from "@/server/assistant/admin-skill-runtime-commands";
import {
  createSkillCandidateActivateHandler,
  createSkillCandidateDiscardHandler,
  createSkillCandidateHandler,
  createSkillRollbackHandler,
  createSkillRuntimeListHandler,
} from "./handler";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVATION_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const SET_ID = "22222222-2222-4222-8222-222222222222";
const PREVIOUS = "33333333-3333-4333-8333-333333333333";
const REVISION = "44444444-4444-4444-8444-444444444444";

const actor: WorkforceActor = {
  userId: REQUEST_ID,
  realm: "workforce",
  status: "active",
  displayName: "Admin",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: ["admin:assistant:skills", "admin:assistant:skills:configure"],
};

const context = { actor, assuredAt: 2_000_000_000 };
const candidate = {
  id: SET_ID,
  state: "candidate" as const,
  revisionIds: [REVISION],
  itemCount: 1,
  totalExtractedSize: 42,
};

function commands(overrides: Record<string, unknown> = {}) {
  return {
    authorize: vi.fn(async () => context),
    createCandidate: vi.fn(async () => ({ set: candidate, replayed: false })),
    activateCandidate: vi.fn(async () => ({
      requestId: REQUEST_ID,
      setId: SET_ID,
      activationVersion: 4,
    })),
    discardCandidate: vi.fn(async () => ({
      set: { ...candidate, state: "discarded" as const },
      replayed: false,
    })),
    rollback: vi.fn(async () => ({
      requestId: REQUEST_ID,
      setId: SET_ID,
      activationVersion: 4,
    })),
    ...overrides,
  };
}

function post(body: object) {
  return new Request(
    "https://example.test/api/v1/admin/assistant/skill-runtime",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("admin Skill runtime BFF", () => {
  it("loads one no-store snapshot under read permission", async () => {
    const loadSnapshot = vi.fn(async () => ({
      version: "1" as const,
      available: { items: [], limit: 100, offset: 0, total: 0 },
      registry: {
        active: null,
        previous: null,
        activationVersion: 0,
        candidateCount: 0,
        candidates: [],
      },
      agent: {
        skillCapability: "unconfigured" as const,
        configured: false,
        activeSetId: null,
        loadedSetId: null,
        previousSetId: null,
        activationVersion: 0,
        failureCode: null,
      },
      permissions: { canRead: true, canConfigure: true },
    }));
    const response = await createSkillRuntimeListHandler({
      requirePermission: vi.fn(async () => actor),
      loadSnapshot,
      requestIdFactory: () => REQUEST_ID,
    })(new Request("https://example.test/api"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      version: "1",
      requestId: REQUEST_ID,
      agent: { skillCapability: "unconfigured" },
    });
  });

  it("creates an immutable candidate from exact revision IDs", async () => {
    const active = commands();
    const response = await createSkillCandidateHandler({
      commands: active as never,
    })(
      post({
        agentId: "maduoduo",
        revisionIds: [REVISION],
        requestId: REQUEST_ID,
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ set: candidate });
    expect(active.createCandidate).toHaveBeenCalledWith(context, {
      agentId: "maduoduo",
      revisionIds: [REVISION],
      requestId: REQUEST_ID,
    });
  });

  it("activates and discards one canonical candidate", async () => {
    const activationCommands = commands();
    const activated = await createSkillCandidateActivateHandler({
      commands: activationCommands as never,
    })(post({ expectedActivationVersion: 3, requestId: REQUEST_ID }), {
      params: Promise.resolve({ setId: SET_ID }),
    });
    expect(activated.status).toBe(200);
    expect(activationCommands.activateCandidate).toHaveBeenCalledWith(
      context,
      SET_ID,
      { expectedActivationVersion: 3, requestId: REQUEST_ID },
    );

    const discardCommands = commands();
    const discarded = await createSkillCandidateDiscardHandler({
      commands: discardCommands as never,
    })(post({ requestId: REQUEST_ID }), {
      params: Promise.resolve({ setId: SET_ID }),
    });
    expect(discarded.status).toBe(200);
    expect(discardCommands.discardCandidate).toHaveBeenCalledWith(
      context,
      SET_ID,
      { requestId: REQUEST_ID },
    );
  });

  it("clones previous and activates rollback through one command", async () => {
    const active = commands();
    const response = await createSkillRollbackHandler({
      commands: active as never,
    })(
      post({
        expectedActivationVersion: 3,
        expectedPreviousSetId: PREVIOUS,
        requestId: REQUEST_ID,
        activationRequestId: ACTIVATION_REQUEST_ID,
      }),
    );
    expect(response.status).toBe(200);
    expect(active.rollback).toHaveBeenCalledWith(context, {
      expectedActivationVersion: 3,
      expectedPreviousSetId: PREVIOUS,
      requestId: REQUEST_ID,
      activationRequestId: ACTIVATION_REQUEST_ID,
    });
  });

  it("maps stable busy errors and rejects unknown JSON", async () => {
    const active = commands({
      activateCandidate: vi.fn(async () => {
        throw new AdminSkillRuntimeCommandError("activation_busy");
      }),
    });
    const busy = await createSkillCandidateActivateHandler({
      commands: active as never,
    })(post({ expectedActivationVersion: 3, requestId: REQUEST_ID }), {
      params: Promise.resolve({ setId: SET_ID }),
    });
    expect(busy.status).toBe(423);
    expect(await busy.json()).toMatchObject({
      error: { code: "activation_busy", retryable: true },
    });

    const invalid = await createSkillCandidateHandler({
      commands: commands() as never,
    })(
      post({
        agentId: "maduoduo",
        revisionIds: [REVISION],
        requestId: REQUEST_ID,
        path: "/private",
      }),
    );
    expect(invalid.status).toBe(400);
  });
});

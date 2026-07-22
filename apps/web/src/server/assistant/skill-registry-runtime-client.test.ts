import { describe, expect, it, vi } from "vitest";

import {
  createSkillRegistryClient,
  resolveSkillRegistrySettings,
  type SkillRegistryTransport,
} from "./skill-registry-client";

const CONTROL_KEY = "registry-control-key-0123456789abcdef";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const REVISION = "33333333-3333-4333-8333-333333333333";
const SET_ID = "44444444-4444-4444-8444-444444444444";
const PREVIOUS = "55555555-5555-4555-8555-555555555555";
const NOW = 2_000_000_000;

function json(value: object, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function runtimeClient(transport: SkillRegistryTransport) {
  return createSkillRegistryClient({
    settings: resolveSkillRegistrySettings({
      NODE_ENV: "development",
      SKILL_REGISTRY_ALLOW_LOOPBACK: "true",
      SKILL_REGISTRY_INTERNAL_URL: "http://127.0.0.1:7788",
      SKILL_REGISTRY_CONTROL_KEY: CONTROL_KEY,
    }),
    resolver: async () => [{ address: "127.0.0.1", family: 4 }],
    transport,
    clock: () => NOW,
    nonceFactory: () => "66666666-6666-4666-8666-666666666666",
  });
}

function assertion(input: Parameters<SkillRegistryTransport>[0]) {
  const raw = input.headers["X-Skill-Registry-Assertion"]!;
  return JSON.parse(Buffer.from(raw.split(".")[0]!, "base64url").toString());
}

describe("Skill Registry runtime client", () => {
  it("reads Registry truth and published revisions with session assertions", async () => {
    const transport = vi.fn<SkillRegistryTransport>(async (input) => {
      if (input.path.includes("runtime-status")) {
        expect(assertion(input)).toMatchObject({
          action: "skill_set_status",
          assurance: "session",
          target: "maduoduo",
        });
        return json({
          active: null,
          previous: null,
          activationVersion: 0,
          candidateCount: 0,
          candidates: [],
        });
      }
      expect(input.path).toBe(
        "/internal/skill-sets/available-revisions?limit=100&offset=0",
      );
      expect(assertion(input)).toMatchObject({
        action: "skill_set_available",
        target: "published-revisions",
      });
      return json({ items: [], limit: 100, offset: 0, total: 0 });
    });
    const client = runtimeClient(transport);

    await expect(
      client.runtimeStatus({ actor: ACTOR, requestId: REQUEST_ID }),
    ).resolves.toMatchObject({ activationVersion: 0 });
    await expect(
      client.listAvailableRevisions({
        actor: ACTOR,
        requestId: REQUEST_ID,
        limit: 100,
        offset: 0,
      }),
    ).resolves.toMatchObject({ total: 0 });
  });

  it("creates a candidate with request ID reused as mutation nonce", async () => {
    const transport = vi.fn<SkillRegistryTransport>(async (input) => {
      expect(input.method).toBe("POST");
      expect(input.path).toBe("/internal/skill-sets");
      expect(JSON.parse(input.body as string)).toEqual({
        agentId: "maduoduo",
        requestId: REQUEST_ID,
        revisionIds: [REVISION],
      });
      expect(assertion(input)).toMatchObject({
        action: "skill_set_create",
        assurance: "password+mfa",
        assuredAt: NOW - 10,
        nonce: REQUEST_ID,
        requestId: REQUEST_ID,
      });
      return json(
        {
          set: {
            id: SET_ID,
            state: "candidate",
            revisionIds: [REVISION],
            itemCount: 1,
            totalExtractedSize: 42,
          },
          replayed: false,
        },
        201,
      );
    });

    await expect(
      runtimeClient(transport).createSkillSet({
        actor: ACTOR,
        requestId: REQUEST_ID,
        assuredAt: NOW - 10,
        revisionIds: [REVISION],
      }),
    ).resolves.toMatchObject({ set: { id: SET_ID, state: "candidate" } });
  });

  it("binds discard and rollback mutations to exact targets", async () => {
    const transport = vi.fn<SkillRegistryTransport>(async (input) => {
      const signed = assertion(input);
      if (input.path.includes("discard")) {
        expect(signed).toMatchObject({
          action: "skill_set_discard",
          target: `maduoduo:${SET_ID}`,
          nonce: REQUEST_ID,
        });
        return json({
          set: {
            id: SET_ID,
            state: "discarded",
            revisionIds: [],
            itemCount: 0,
            totalExtractedSize: 0,
          },
          replayed: false,
        });
      }
      expect(signed).toMatchObject({
        action: "skill_set_rollback",
        target: "maduoduo:previous",
        nonce: REQUEST_ID,
      });
      expect(JSON.parse(input.body as string)).toMatchObject({
        expectedActivationVersion: 3,
        expectedPreviousSetId: PREVIOUS,
      });
      return json(
        {
          set: {
            id: SET_ID,
            state: "candidate",
            revisionIds: [],
            itemCount: 0,
            totalExtractedSize: 0,
          },
          replayed: false,
        },
        201,
      );
    });
    const client = runtimeClient(transport);

    await client.discardSkillSet({
      actor: ACTOR,
      requestId: REQUEST_ID,
      assuredAt: NOW,
      setId: SET_ID,
    });
    await client.clonePreviousSkillSet({
      actor: ACTOR,
      requestId: REQUEST_ID,
      assuredAt: NOW,
      expectedActivationVersion: 3,
      expectedPreviousSetId: PREVIOUS,
    });
  });
});

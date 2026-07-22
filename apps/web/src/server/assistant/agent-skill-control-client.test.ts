import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  AgentSkillControlClientError,
  createAgentSkillControlClient,
  resolveAgentSkillControlSettings,
} from "./agent-skill-control-client";

const BASE_URL = "http://agent:7777";
const OS_KEY = "agent-os-key-0123456789abcdef012345";
const CONTROL_KEY = "agent-control-key-0123456789abcdef";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const NONCE = "33333333-3333-4333-8333-333333333333";
const SET_ID = "44444444-4444-4444-8444-444444444444";
const NOW = 2_000_000_000;

function response(value: object, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function client(fetcher: typeof fetch) {
  return createAgentSkillControlClient({
    settings: { baseUrl: BASE_URL, controlKey: CONTROL_KEY },
    fetcher,
    clock: () => NOW,
    nonceFactory: () => NONCE,
  });
}

function decodeAssertion(request: Request) {
  const raw = request.headers.get("x-agent-control-assertion")!;
  const [payload, signature] = raw.split(".");
  const bytes = Buffer.from(payload!, "base64url");
  const key = createHmac("sha256", CONTROL_KEY)
    .update("ai-agent-platform:skill-control-assertion:v1")
    .digest();
  expect(signature).toBe(
    createHmac("sha256", key).update(bytes).digest("base64url"),
  );
  return JSON.parse(bytes.toString("utf8"));
}

describe("Agent Skill control client", () => {
  it("resolves a distinct control key on the AgentOS origin", () => {
    expect(
      resolveAgentSkillControlSettings({
        AGENTOS_INTERNAL_URL: BASE_URL,
        OS_SECURITY_KEY: OS_KEY,
        AGENT_CONFIG_CONTROL_KEY: CONTROL_KEY,
      }),
    ).toEqual({ baseUrl: BASE_URL, controlKey: CONTROL_KEY });
    expect(() =>
      resolveAgentSkillControlSettings({
        AGENTOS_INTERNAL_URL: BASE_URL,
        OS_SECURITY_KEY: OS_KEY,
        AGENT_CONFIG_CONTROL_KEY: OS_KEY,
      }),
    ).toThrow("AGENT_CONFIG_CONTROL_KEY");
  });

  it("signs a session status assertion and validates exact runtime truth", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      expect(request.url).toBe(`${BASE_URL}/internal/control/skill-runtime`);
      expect(request.headers.get("authorization")).toBe(
        `Bearer ${CONTROL_KEY}`,
      );
      expect(decodeAssertion(request)).toEqual({
        action: "skill_runtime_status",
        actor: ACTOR,
        assurance: "session",
        assuredAt: null,
        expiresAt: NOW + 5,
        issuedAt: NOW,
        nonce: NONCE,
        permission: "admin:assistant:skills",
        requestId: REQUEST_ID,
        target: "maduoduo",
      });
      return response({
        skillCapability: "unconfigured",
        configured: false,
        activeSetId: null,
        loadedSetId: null,
        previousSetId: null,
        activationVersion: 0,
        failureCode: null,
      });
    });

    await expect(
      client(fetcher).runtimeStatus({ actor: ACTOR, requestId: REQUEST_ID }),
    ).resolves.toMatchObject({ skillCapability: "unconfigured" });
  });

  it("binds recent MFA, set ID, version, and body to one activation", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      expect(request.url).toBe(
        `${BASE_URL}/internal/control/skill-runtime/${SET_ID}/activate`,
      );
      expect(await request.json()).toEqual({
        expectedActivationVersion: 7,
        requestId: REQUEST_ID,
      });
      expect(decodeAssertion(request)).toMatchObject({
        action: "skill_runtime_activate",
        actor: ACTOR,
        assurance: "password+mfa",
        assuredAt: NOW - 100,
        permission: "admin:assistant:skills:configure",
        requestId: REQUEST_ID,
        target: `maduoduo:${SET_ID}:7`,
      });
      return response({
        requestId: REQUEST_ID,
        setId: SET_ID,
        activationVersion: 8,
      });
    });

    await expect(
      client(fetcher).activate({
        actor: ACTOR,
        requestId: REQUEST_ID,
        setId: SET_ID,
        expectedActivationVersion: 7,
        assuredAt: NOW - 100,
      }),
    ).resolves.toEqual({
      requestId: REQUEST_ID,
      setId: SET_ID,
      activationVersion: 8,
    });
  });

  it("rejects stale assurance before transport", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      client(fetcher).activate({
        actor: ACTOR,
        requestId: REQUEST_ID,
        setId: SET_ID,
        expectedActivationVersion: 0,
        assuredAt: NOW - 601,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps only exact stable errors and rejects malformed success", async () => {
    const conflict = client(
      vi.fn<typeof fetch>(async () =>
        response({ requestId: REQUEST_ID, error: "activation_conflict" }, 409),
      ),
    );
    await expect(
      conflict.activate({
        actor: ACTOR,
        requestId: REQUEST_ID,
        setId: SET_ID,
        expectedActivationVersion: 7,
        assuredAt: NOW,
      }),
    ).rejects.toEqual(new AgentSkillControlClientError("activation_conflict"));

    const malformed = client(
      vi.fn<typeof fetch>(async () =>
        response({
          requestId: REQUEST_ID,
          setId: SET_ID,
          activationVersion: 8,
          path: "/run",
        }),
      ),
    );
    await expect(
      malformed.activate({
        actor: ACTOR,
        requestId: REQUEST_ID,
        setId: SET_ID,
        expectedActivationVersion: 7,
        assuredAt: NOW,
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});

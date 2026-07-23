import { describe, expect, it, vi } from "vitest";

import { AuthAccessError, type WorkforceActor } from "@/server/auth/access";
import { SkillRegistryClientError } from "@/server/assistant/skill-registry-client";
import { createAdminSkillRevisionHandler } from "../../../handler";

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";
const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  permissions: ["admin:assistant:skills"],
} as WorkforceActor;

function fixture() {
  const access = { requirePermission: vi.fn(async () => actor) };
  const client = { getRevision: vi.fn(async () => ({ version: "1" })) };
  return {
    access,
    client,
    handler: createAdminSkillRevisionHandler({
      access,
      client: client as never,
      requestIdFactory: () => REQUEST_ID,
    }),
  };
}

describe("admin skill revision detail route", () => {
  it("uses a fresh Registry UUID while preserving a non-UUID correlation ID", async () => {
    const current = fixture();
    const response = await current.handler(
      new Request("https://admin.example.test/detail", {
        headers: { "x-request-id": "trace-123" },
      }),
      {
        params: Promise.resolve({ skillId: SKILL_ID, revisionId: REVISION_ID }),
      },
    );

    expect(current.client.getRevision).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID }),
    );
    await expect(response.json()).resolves.toMatchObject({
      requestId: "trace-123",
    });
  });

  it("requires review permission, not read-only permission", async () => {
    const current = fixture();
    current.access.requirePermission.mockRejectedValueOnce(
      new AuthAccessError("AUTH_PERMISSION_DENIED", 403),
    );
    const response = await current.handler(
      new Request("https://admin.example.test/detail"),
      {
        params: Promise.resolve({ skillId: SKILL_ID, revisionId: REVISION_ID }),
      },
    );
    expect(current.access.requirePermission).toHaveBeenCalledWith(
      "admin:assistant:skills:review",
    );
    expect(response.status).toBe(403);
    expect(current.client.getRevision).not.toHaveBeenCalled();
  });

  it("rejects bad UUIDs and maps invalid upstream responses to 502", async () => {
    const current = fixture();
    const invalid = await current.handler(
      new Request("https://admin.example.test/detail"),
      {
        params: Promise.resolve({ skillId: "../bad", revisionId: REVISION_ID }),
      },
    );
    expect(invalid.status).toBe(400);
    current.client.getRevision.mockRejectedValueOnce(
      new SkillRegistryClientError("invalid_response"),
    );
    const upstream = await current.handler(
      new Request("https://admin.example.test/detail"),
      {
        params: Promise.resolve({ skillId: SKILL_ID, revisionId: REVISION_ID }),
      },
    );
    expect(upstream.status).toBe(502);
    expect(upstream.headers.get("cache-control")).toBe("no-store");
  });
});

import { describe, expect, it, vi } from "vitest";

import { AuthAccessError, type WorkforceActor } from "@/server/auth/access";
import { SkillRegistryClientError } from "@/server/assistant/skill-registry-client";
import { createAdminSkillListHandler } from "./handler";

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const actor: WorkforceActor = {
  userId: ACTOR_ID,
  realm: "workforce",
  status: "active",
  displayName: "Reader",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: ["admin:assistant:skills"],
};

function fixture() {
  const access = { requirePermission: vi.fn(async () => actor) };
  const client = {
    listSkills: vi.fn(async () => ({
      version: "1" as const,
      skills: [],
      page: { limit: 25, offset: 0, returned: 0 },
    })),
  };
  return {
    access,
    client,
    handler: createAdminSkillListHandler({
      access,
      client: client as never,
      requestIdFactory: () => REQUEST_ID,
    }),
  };
}

describe("admin skill list route", () => {
  it("keeps a public correlation ID separate from the Registry UUID", async () => {
    const current = fixture();
    const response = await current.handler(
      new Request("https://admin.example.test/api/v1/admin/assistant/skills", {
        headers: { "x-request-id": "trace-123" },
      }),
    );

    expect(current.client.listSkills).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID }),
    );
    await expect(response.json()).resolves.toMatchObject({
      requestId: "trace-123",
    });
  });

  it.each([
    ["non UUID", () => "trace-123"],
    [
      "throwing",
      () => {
        throw new Error("private factory failure");
      },
    ],
  ])(
    "fails closed for a %s Registry request ID factory",
    async (_name, factory) => {
      const current = fixture();
      const handler = createAdminSkillListHandler({
        access: current.access,
        client: current.client as never,
        requestIdFactory: factory,
      });

      const response = await handler(
        new Request(
          "https://admin.example.test/api/v1/admin/assistant/skills",
          {
            headers: { "x-request-id": "trace-123" },
          },
        ),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        requestId: "trace-123",
        error: { code: "registry_unavailable" },
      });
      expect(current.client.listSkills).not.toHaveBeenCalled();
    },
  );

  it("requires exact read permission and returns permission flags no-store", async () => {
    const current = fixture();
    const response = await current.handler(
      new Request("https://admin.example.test/api/v1/admin/assistant/skills"),
    );

    expect(current.access.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant:skills",
    );
    expect(current.client.listSkills).toHaveBeenCalledWith({
      actor: ACTOR_ID,
      requestId: REQUEST_ID,
      limit: 25,
      offset: 0,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      version: "1",
      requestId: REQUEST_ID,
      permissions: {
        canUpload: false,
        canManageConnections: false,
        canReview: false,
        canConfigure: false,
      },
    });
  });

  it.each([
    [401, new AuthAccessError("AUTH_SESSION_REQUIRED", 401)],
    [403, new AuthAccessError("AUTH_PERMISSION_DENIED", 403)],
  ])("maps customer/workforce denial to %s", async (status, error) => {
    const current = fixture();
    current.access.requirePermission.mockRejectedValueOnce(error);
    const response = await current.handler(
      new Request("https://admin.example.test/api/v1/admin/assistant/skills"),
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(current.client.listSkills).not.toHaveBeenCalled();
  });

  it("validates pagination and sanitizes Registry unavailability", async () => {
    const current = fixture();
    const invalid = await current.handler(
      new Request(
        "https://admin.example.test/api/v1/admin/assistant/skills?limit=101&offset=0",
      ),
    );
    expect(invalid.status).toBe(400);
    expect(current.client.listSkills).not.toHaveBeenCalled();

    current.client.listSkills.mockRejectedValueOnce(
      new SkillRegistryClientError("REGISTRY_UNAVAILABLE"),
    );
    const unavailable = await current.handler(
      new Request("https://admin.example.test/api/v1/admin/assistant/skills"),
    );
    expect(unavailable.status).toBe(503);
    const body = await unavailable.json();
    expect(body).toMatchObject({
      error: { code: "registry_unavailable" },
    });
    expect(JSON.stringify(body)).not.toContain("REGISTRY_UNAVAILABLE");
  });
});

import { describe, expect, it, vi } from "vitest";

import { AuthAccessError, type WorkforceActor } from "@/server/auth/access";
import { createAdminSkillFileHandler } from "../../../../../handler";

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";
const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
} as WorkforceActor;

function fixture() {
  const access = { requirePermission: vi.fn(async () => actor) };
  const client = {
    getFile: vi.fn(async () => ({
      version: "1" as const,
      path: "references/a b.md",
      content: "safe",
    })),
  };
  return {
    access,
    client,
    handler: createAdminSkillFileHandler({
      access,
      client: client as never,
      requestIdFactory: () => REQUEST_ID,
    }),
  };
}

describe("admin skill file route", () => {
  it("uses a fresh Registry UUID while preserving a non-UUID correlation ID", async () => {
    const current = fixture();
    const response = await current.handler(
      new Request("https://admin.example.test/file", {
        headers: { "x-request-id": "trace-123" },
      }),
      {
        params: Promise.resolve({
          skillId: SKILL_ID,
          revisionId: REVISION_ID,
          path: ["SKILL.md"],
        }),
      },
    );

    expect(current.client.getFile).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID }),
    );
    await expect(response.json()).resolves.toMatchObject({
      requestId: "trace-123",
    });
  });

  it("requires review permission and forwards a canonical relative path", async () => {
    const current = fixture();
    const response = await current.handler(
      new Request("https://admin.example.test/file"),
      {
        params: Promise.resolve({
          skillId: SKILL_ID,
          revisionId: REVISION_ID,
          path: ["references", "a b.md"],
        }),
      },
    );
    expect(current.access.requirePermission).toHaveBeenCalledWith(
      "admin:assistant:skills:review",
    );
    expect(current.client.getFile).toHaveBeenCalledWith({
      actor: actor.userId,
      requestId: REQUEST_ID,
      skillId: SKILL_ID,
      revisionId: REVISION_ID,
      path: "references/a b.md",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("allows a literal percent in a canonical file name", async () => {
    const current = fixture();
    const response = await current.handler(
      new Request("https://admin.example.test/file"),
      {
        params: Promise.resolve({
          skillId: SKILL_ID,
          revisionId: REVISION_ID,
          path: ["references", "100%.md"],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(current.client.getFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "references/100%.md" }),
    );
  });

  it.each(["run%2Fhidden.py", "run%5Chidden.py"])(
    "treats encoded-looking separators as literal file-name text: %s",
    async (fileName) => {
      const current = fixture();
      const response = await current.handler(
        new Request("https://admin.example.test/file"),
        {
          params: Promise.resolve({
            skillId: SKILL_ID,
            revisionId: REVISION_ID,
            path: ["scripts", fileName],
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(current.client.getFile).toHaveBeenCalledWith(
        expect.objectContaining({ path: `scripts/${fileName}` }),
      );
    },
  );

  it.each([[".."], ["a/b"], ["a\\b"], [""]])(
    "rejects an unsafe catch-all segment %s",
    async (segment) => {
      const current = fixture();
      const response = await current.handler(
        new Request("https://admin.example.test/file"),
        {
          params: Promise.resolve({
            skillId: SKILL_ID,
            revisionId: REVISION_ID,
            path: [segment],
          }),
        },
      );
      expect(response.status).toBe(400);
      expect(current.client.getFile).not.toHaveBeenCalled();
    },
  );

  it("denies read-only users", async () => {
    const current = fixture();
    current.access.requirePermission.mockRejectedValueOnce(
      new AuthAccessError("AUTH_PERMISSION_DENIED", 403),
    );
    const response = await current.handler(
      new Request("https://admin.example.test/file"),
      {
        params: Promise.resolve({
          skillId: SKILL_ID,
          revisionId: REVISION_ID,
          path: ["SKILL.md"],
        }),
      },
    );
    expect(response.status).toBe(403);
  });
});

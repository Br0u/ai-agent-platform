import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthAccessError, type WorkforceActor } from "@/server/auth/access";
import {
  AssistantInputPolicyConflictError,
  AssistantInputPolicyStorageError,
} from "@/server/assistant/assistant-input-policy";
import { MutationRequestError } from "@/server/http/require-trusted-mutation";
import { createAdminInputPolicyHandlers } from "./handler";

const ACTOR: WorkforceActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  realm: "workforce",
  status: "active",
  displayName: "Admin",
  mustChangePassword: false,
  permissions: ["admin:assistant", "admin:assistant:configure"],
};

function setup(actor: WorkforceActor = ACTOR) {
  const access = { requirePermission: vi.fn(async () => actor) };
  const repository = {
    load: vi.fn(async () => ({
      terms: ["example", "敏感"],
      revision: 3,
      updatedAt: "2026-08-12T01:02:03.000Z",
      updatedBy: ACTOR.userId,
    })),
    save: vi.fn(async () => ({
      terms: ["example", "敏感"],
      revision: 4,
      updatedAt: "2026-08-12T02:03:04.000Z",
      updatedBy: ACTOR.userId,
    })),
  };
  const requireTrustedMutation = vi.fn();
  const handlers = createAdminInputPolicyHandlers({
    access,
    repository,
    requireTrustedMutation,
    requestIdFactory: () => "generated-request-id",
    resolveIpAddress: () => "203.0.113.9",
  });
  return { access, repository, requireTrustedMutation, ...handlers };
}

function putRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(
    "https://portal.example.com/api/v1/admin/assistant/input-policy",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "user-agent": "Admin Browser/1.0",
        "x-request-id": "client-request-id",
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => vi.restoreAllMocks());

describe("GET /api/v1/admin/assistant/input-policy", () => {
  it.each([
    [401, "authentication_required"],
    [403, "permission_denied"],
  ] as const)("returns %s before repository access", async (status, code) => {
    const context = setup();
    context.access.requirePermission.mockRejectedValueOnce(
      new AuthAccessError(
        status === 401 ? "AUTH_SESSION_REQUIRED" : "AUTH_PERMISSION_DENIED",
        status,
      ),
    );

    const response = await context.GET(
      new Request("https://portal.example.com"),
    );

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code },
    });
    expect(context.repository.load).not.toHaveBeenCalled();
  });

  it("omits terms for read-only administrators", async () => {
    const context = setup({ ...ACTOR, permissions: ["admin:assistant"] });

    const response = await context.GET(
      new Request("https://portal.example.com"),
    );

    expect(context.access.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      version: "1",
      revision: 3,
      termCount: 2,
      updatedAt: "2026-08-12T01:02:03.000Z",
      canConfigure: false,
    });
  });

  it("returns terms to configurators", async () => {
    const context = setup();
    const response = await context.GET(
      new Request("https://portal.example.com"),
    );

    await expect(response.json()).resolves.toEqual({
      version: "1",
      revision: 3,
      termCount: 2,
      terms: ["example", "敏感"],
      updatedAt: "2026-08-12T01:02:03.000Z",
      canConfigure: true,
    });
  });
});

describe("PUT /api/v1/admin/assistant/input-policy", () => {
  it("rejects an untrusted mutation before saving", async () => {
    const context = setup();
    context.requireTrustedMutation.mockImplementationOnce(() => {
      throw new MutationRequestError();
    });

    const response = await context.PUT(
      putRequest({ source: "example", expectedRevision: 3 }),
    );

    expect(response.status).toBe(403);
    expect(context.repository.save).not.toHaveBeenCalled();
  });

  it("requires configure permission", async () => {
    const context = setup({ ...ACTOR, permissions: ["admin:assistant"] });
    context.access.requirePermission.mockRejectedValueOnce(
      new AuthAccessError("AUTH_PERMISSION_DENIED", 403),
    );

    const response = await context.PUT(
      putRequest({ source: "example", expectedRevision: 3 }),
    );

    expect(context.access.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant:configure",
    );
    expect(response.status).toBe(403);
    expect(context.repository.save).not.toHaveBeenCalled();
  });

  it("normalizes, saves once, and returns the saved snapshot directly", async () => {
    const context = setup();

    const response = await context.PUT(
      putRequest({ source: " Example \nexample\n敏感\n", expectedRevision: 3 }),
    );

    expect(context.repository.save).toHaveBeenCalledExactlyOnceWith({
      terms: ["example", "敏感"],
      expectedRevision: 3,
      actor: { realm: "workforce", userId: ACTOR.userId },
      requestId: "client-request-id",
      ipAddress: "203.0.113.9",
      userAgent: "Admin Browser/1.0",
    });
    expect(context.repository.load).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      version: "1",
      revision: 4,
      termCount: 2,
      terms: ["example", "敏感"],
      updatedAt: "2026-08-12T02:03:04.000Z",
      canConfigure: true,
    });
  });

  it.each([
    [
      "conflict",
      () => new AssistantInputPolicyConflictError(),
      409,
      "configuration_conflict",
    ],
    [
      "storage",
      () => new AssistantInputPolicyStorageError(),
      503,
      "storage_unavailable",
    ],
  ] as const)("maps %s errors", async (_label, error, status, code) => {
    const context = setup();
    context.repository.save.mockRejectedValueOnce(error());

    const response = await context.PUT(
      putRequest({ source: "example", expectedRevision: 3 }),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });

  it("returns 422 for invalid or out-of-bounds content", async () => {
    const context = setup();
    const response = await context.PUT(
      putRequest({ source: "x".repeat(32 * 1024 + 1), expectedRevision: 3 }),
    );

    expect(response.status).toBe(422);
    expect(context.repository.save).not.toHaveBeenCalled();
  });

  it("omits an unsafe user agent from audit context", async () => {
    const context = setup();
    await context.PUT(
      putRequest(
        { source: "example", expectedRevision: 3 },
        { "user-agent": "x".repeat(513) },
      ),
    );

    expect(context.repository.save).toHaveBeenCalledWith(
      expect.not.objectContaining({ userAgent: expect.anything() }),
    );
  });
});

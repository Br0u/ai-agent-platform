import { describe, expect, it, vi } from "vitest";

import { createAuditLogQueryService } from "./audit-logs";

const actor = {
  userId: "auditor",
  realm: "workforce" as const,
  status: "active" as const,
  displayName: "Auditor",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: ["admin:audit"],
};

describe("append-only audit query", () => {
  it("filters and paginates while redacting sensitive metadata", async () => {
    const search = vi.fn(async () => ({
      items: [
        {
          id: "audit-1",
          actorUserId: "staff-1",
          actorRealm: "workforce" as const,
          action: "session.revoked",
          targetType: "session",
          targetId: "session-1",
          metadata: {
            reason: "admin",
            token: "raw-token",
            password: "secret",
            email: "private@example.test",
            nested: { secret: "no" },
          },
          createdAt: new Date("2026-07-12T00:00:00Z"),
        },
      ],
      total: 1,
    }));
    const result = await createAuditLogQueryService({ search }).list(actor, {
      actor: "staff-1",
      action: "session.revoked",
      target: "session-1",
      from: new Date("2026-07-01T00:00:00Z"),
      to: new Date("2026-07-12T23:59:59Z"),
      page: 1,
      pageSize: 20,
    });
    expect(result.items[0]?.metadata).toEqual({ reason: "admin" });
    expect(JSON.stringify(result)).not.toContain("raw-token");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("private@example.test");
  });

  it("requires audit permission and exposes no update or delete API", async () => {
    const service = createAuditLogQueryService({ search: vi.fn() });
    await expect(
      service.list({ ...actor, permissions: [] }, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ code: "AUTH_PERMISSION_DENIED" });
    expect(service).not.toHaveProperty("update");
    expect(service).not.toHaveProperty("delete");
  });
});

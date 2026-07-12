import { describe, expect, it, vi } from "vitest";

import {
  createAdminSessionService,
  createCustomerSessionService,
  type CustomerSessionRepository,
  type SessionMutationRepository,
} from "./sessions";

describe("session administration", () => {
  it("lets customers list only their own safe sessions without raw tokens", async () => {
    const findByUser = vi.fn(async () => [
      {
        id: "session-1",
        realm: "customer" as const,
        createdAt: new Date("2026-07-12T00:00:00Z"),
        expiresAt: new Date("2026-07-13T00:00:00Z"),
        ipAddress: "10.0.0.1",
        userAgent: "Browser",
        token: "must-not-leak",
      },
    ]);
    const service = createCustomerSessionService({
      repository: {
        read: { findByUser, revokeOwned: vi.fn(), writeAudit: vi.fn() },
        transaction: vi.fn(),
      },
    });
    const result = await service.list("customer-1");
    expect(findByUser).toHaveBeenCalledWith("customer-1", "customer");
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("cannot revoke another customer's session", async () => {
    const repository = {
      findByUser: vi.fn(async () => []),
      revokeOwned: vi.fn(async () => false),
      writeAudit: vi.fn(),
    };
    const service = createCustomerSessionService({
      repository: { read: repository, transaction: (work) => work(repository) },
    });
    await expect(
      service.revoke("customer-1", "other-session"),
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    expect(repository.writeAudit).not.toHaveBeenCalled();
  });

  it("revokes a customer session and writes its audit in one transaction", async () => {
    const operations: string[] = [];
    const tx = {
      findByUser: vi.fn(async () => []),
      revokeOwned: vi.fn(async () => {
        operations.push("revoke");
        return true;
      }),
      writeAudit: vi.fn(async () => {
        operations.push("audit");
      }),
    };
    const transaction = async <T>(
      work: (repository: CustomerSessionRepository) => Promise<T>,
    ): Promise<T> => {
      operations.push("tx");
      return work(tx);
    };
    const service = createCustomerSessionService({
      repository: { transaction, read: tx },
    });
    await service.revoke("customer-1", "session-1");
    expect(operations).toEqual(["tx", "revoke", "audit"]);
  });

  it("guards admin revocation then transactionally rechecks permission and target realm", async () => {
    const tx: SessionMutationRepository = {
      hasPermission: vi.fn(async () => true),
      findTargetUser: vi.fn(async () => ({ realm: "workforce" as const })),
      revokeOne: vi.fn(async () => true),
      revokeAll: vi.fn(async () => 2),
      writeAudit: vi.fn(),
    };
    const requireSensitiveAction = vi.fn(async () => ({ userId: "admin-1" }));
    const service = createAdminSessionService({
      requireSensitiveAction,
      repository: { transaction: (work) => work(tx) },
    });
    await service.revokeAll("staff-1", "workforce");
    expect(requireSensitiveAction).toHaveBeenCalledWith("admin:users");
    expect(tx.hasPermission).toHaveBeenCalledWith("admin-1", "admin:users");
    expect(tx.writeAudit).toHaveBeenCalledWith({
      actorId: "admin-1",
      targetUserId: "staff-1",
      targetSessionId: null,
      revokedCount: 2,
    });
  });
});

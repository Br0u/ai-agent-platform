import { describe, expect, it, vi } from "vitest";

import {
  WorkforceMutationError,
  createWorkforceUserService,
  type WorkforceMutationRepository,
} from "./users";

const superActor = {
  userId: "super-1",
  role: "super_admin" as const,
  permissions: ["admin:users", "admin:roles"],
};

function fixture() {
  const users = new Map([
    [
      "super-1",
      {
        id: "super-1",
        realm: "workforce" as const,
        status: "active" as const,
        role: "super_admin" as const,
      },
    ],
    [
      "admin-1",
      {
        id: "admin-1",
        realm: "workforce" as const,
        status: "active" as const,
        role: "admin" as const,
      },
    ],
    [
      "admin-2",
      {
        id: "admin-2",
        realm: "workforce" as const,
        status: "active" as const,
        role: "admin" as const,
      },
    ],
    [
      "employee-1",
      {
        id: "employee-1",
        realm: "workforce" as const,
        status: "active" as const,
        role: "employee" as const,
      },
    ],
    [
      "customer-1",
      {
        id: "customer-1",
        realm: "customer" as const,
        status: "active" as const,
        role: null,
      },
    ],
  ]);
  const operations: string[] = [];
  const tx: WorkforceMutationRepository = {
    findTarget: vi.fn(async (id) => users.get(id) ?? null),
    countActiveSuperAdmins: vi.fn(async () => 1),
    hasPermission: vi.fn(async (userId, permission) => {
      operations.push(`permission:${userId}:${permission}`);
      return superActor.permissions.includes(permission);
    }),
    createWorkforceIdentity: vi.fn(async (input) => {
      operations.push("create");
      return { id: "staff-new", ...input };
    }),
    assignOnlyRole: vi.fn(async (_id, role) => {
      operations.push(`role:${role}`);
    }),
    setStatus: vi.fn(async (_id, status) => {
      operations.push(`status:${status}`);
    }),
    replacePassword: vi.fn(async () => {
      operations.push("password");
    }),
    revokeSessions: vi.fn(async () => {
      operations.push("revoke");
      return 2;
    }),
    writeAudit: vi.fn(async (event) => {
      operations.push(`audit:${event.event}`);
    }),
  };
  const transaction = vi.fn(
    async (
      work: (repository: WorkforceMutationRepository) => Promise<unknown>,
    ) => {
      operations.push("tx:start");
      const result = await work(tx);
      operations.push("tx:commit");
      return result;
    },
  );
  const repository = {
    transaction: transaction as unknown as <T>(
      work: (repository: WorkforceMutationRepository) => Promise<T>,
    ) => Promise<T>,
  };
  const requireSensitiveAction = vi.fn(async () => superActor);
  const hashPassword = vi.fn(async () => "argon-hash");
  return {
    operations,
    repository,
    service: createWorkforceUserService({
      repository,
      hashPassword,
      requireSensitiveAction,
    }),
    hashPassword,
    requireSensitiveAction,
    tx,
    users,
  };
}

describe("workforce user administration", () => {
  it.each([
    ["createUser", "admin:users"],
    ["setRole", "admin:roles"],
    ["disableUser", "admin:users"],
    ["reactivateUser", "admin:users"],
    ["replaceTemporaryPassword", "admin:users"],
  ] as const)(
    "uses the central sensitive-action guard for %s",
    async (method, permission) => {
      const { service, requireSensitiveAction, tx } = fixture();
      if (method === "createUser")
        await service.createUser(superActor, {
          name: "Ops",
          email: "ops2@example.test",
          username: "ops2",
          temporaryPassword: "Temporary#123",
          initialRole: "employee",
        });
      if (method === "setRole")
        await service.setRole(superActor, "employee-1", "support_operator");
      if (method === "disableUser")
        await service.disableUser(superActor, "employee-1");
      if (method === "reactivateUser") {
        tx.findTarget = vi.fn(async (id) =>
          id === "super-1"
            ? {
                id: "super-1",
                realm: "workforce" as const,
                status: "active" as const,
                role: "super_admin" as const,
              }
            : {
                id: "employee-1",
                realm: "workforce" as const,
                status: "disabled" as const,
                role: "employee" as const,
              },
        );
        await service.reactivateUser(superActor, "employee-1");
      }
      if (method === "replaceTemporaryPassword")
        await service.replaceTemporaryPassword(
          superActor,
          "employee-1",
          "Replacement#123",
        );
      expect(requireSensitiveAction).toHaveBeenCalledWith(permission);
    },
  );

  it("stops before hashing or opening a mutation transaction when sensitive assurance is denied", async () => {
    const { hashPassword, repository, requireSensitiveAction, service } =
      fixture();
    requireSensitiveAction.mockRejectedValueOnce(
      new Error("AUTH_REAUTH_REQUIRED"),
    );
    await expect(
      service.createUser(superActor, {
        name: "Denied",
        email: "denied@example.test",
        username: "denied",
        temporaryPassword: "Temporary#123",
        initialRole: "employee",
      }),
    ).rejects.toThrow("AUTH_REAUTH_REQUIRED");
    expect(hashPassword).not.toHaveBeenCalled();
    expect(repository.transaction).not.toHaveBeenCalled();
  });
  it("creates only workforce identities with an allowed initial role and temporary-password flag inside one transaction", async () => {
    const { operations, service, tx } = fixture();
    const result = await service.createUser(superActor, {
      name: "Ops User",
      email: "OPS@EXAMPLE.TEST",
      username: " OPS.USER ",
      temporaryPassword: "Temporary#123",
      initialRole: "content_operator",
    });

    expect(result).toEqual({ id: "staff-new" });
    expect(tx.createWorkforceIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        realm: "workforce",
        status: "active",
        email: "ops@example.test",
        username: "ops.user",
        mustChangePassword: true,
        passwordHash: "argon-hash",
      }),
    );
    expect(operations).toEqual([
      "tx:start",
      "permission:super-1:admin:users",
      "create",
      "role:content_operator",
      "audit:workforce.user_created",
      "tx:commit",
    ]);
  });

  it.each(["customer_member", "customer_admin", "owner"])(
    "rejects customer or unknown role %s",
    async (initialRole) => {
      const { service, tx } = fixture();
      await expect(
        service.createUser(superActor, {
          name: "Bad Role",
          email: "bad@example.test",
          username: "bad-role",
          temporaryPassword: "Temporary#123",
          initialRole,
        }),
      ).rejects.toMatchObject({ code: "WORKFORCE_ROLE_INVALID" });
      expect(tx.createWorkforceIdentity).not.toHaveBeenCalled();
    },
  );

  it("prevents an admin from granting super_admin while allowing a super_admin", async () => {
    const first = fixture();
    first.requireSensitiveAction.mockResolvedValueOnce({
      ...superActor,
      userId: "admin-1",
    });
    await expect(
      first.service.setRole(
        { ...superActor, userId: "admin-1", role: "admin" },
        "employee-1",
        "super_admin",
      ),
    ).rejects.toMatchObject({ code: "WORKFORCE_SUPER_ADMIN_REQUIRED" });
    first.requireSensitiveAction.mockResolvedValueOnce(superActor);
    await expect(
      first.service.setRole(superActor, "employee-1", "super_admin"),
    ).resolves.toBeUndefined();
  });

  it("uses the transactional actor role instead of a caller-supplied role claim", async () => {
    const { requireSensitiveAction, service } = fixture();
    requireSensitiveAction.mockResolvedValueOnce({
      ...superActor,
      userId: "admin-1",
    });
    await expect(
      service.setRole(
        { ...superActor, userId: "admin-1", role: "super_admin" },
        "employee-1",
        "super_admin",
      ),
    ).rejects.toMatchObject({ code: "WORKFORCE_SUPER_ADMIN_REQUIRED" });
  });

  it.each([
    ["disableUser", "super-1", "WORKFORCE_SELF_MUTATION_FORBIDDEN"],
    ["setRole", "super-1", "WORKFORCE_SELF_MUTATION_FORBIDDEN"],
  ] as const)(
    "rejects self-disable and self-demotion",
    async (method, target, code) => {
      const { service } = fixture();
      const promise =
        method === "disableUser"
          ? service.disableUser(superActor, target)
          : service.setRole(superActor, target, "employee");
      await expect(promise).rejects.toMatchObject({ code });
    },
  );

  it("protects the last active super admin", async () => {
    const { service, tx } = fixture();
    tx.findTarget = vi.fn(async () => ({
      id: "super-2",
      realm: "workforce" as const,
      status: "active" as const,
      role: "super_admin" as const,
    }));
    await expect(
      service.disableUser(superActor, "super-2"),
    ).rejects.toMatchObject({ code: "WORKFORCE_LAST_SUPER_ADMIN" });
  });

  it("prevents an admin from modifying another admin", async () => {
    const { requireSensitiveAction, service } = fixture();
    requireSensitiveAction.mockResolvedValueOnce({
      ...superActor,
      userId: "admin-2",
    });
    await expect(
      service.disableUser(
        { ...superActor, userId: "admin-2", role: "admin" },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "WORKFORCE_SUPER_ADMIN_REQUIRED" });
  });

  it("rejects cross-realm targets", async () => {
    const { service } = fixture();
    await expect(
      service.disableUser(superActor, "customer-1"),
    ).rejects.toMatchObject({ code: "WORKFORCE_TARGET_REALM_INVALID" });
  });

  it("disables and revokes sessions atomically, then permits explicit reactivation", async () => {
    const { operations, service } = fixture();
    await service.disableUser(superActor, "employee-1");
    expect(operations).toContain("status:disabled");
    expect(operations).toContain("revoke");
    expect(operations.at(-1)).toBe("tx:commit");

    operations.length = 0;
    const { tx } = fixture();
    tx.findTarget = vi.fn(async (id) =>
      id === "super-1"
        ? {
            id: "super-1",
            realm: "workforce" as const,
            status: "active" as const,
            role: "super_admin" as const,
          }
        : {
            id: "employee-1",
            realm: "workforce" as const,
            status: "disabled" as const,
            role: "employee" as const,
          },
    );
    const second = createWorkforceUserService({
      repository: { transaction: async (work) => work(tx) },
      hashPassword: async () => "hash",
      requireSensitiveAction: async () => superActor,
    });
    await second.reactivateUser(superActor, "employee-1");
    expect(tx.setStatus).toHaveBeenCalledWith("employee-1", "active");
  });

  it("rejects reactivation of an already-active account", async () => {
    const { service } = fixture();
    await expect(
      service.reactivateUser(superActor, "employee-1"),
    ).rejects.toMatchObject({ code: "WORKFORCE_REACTIVATION_INVALID" });
  });

  it("replaces a password, restores forced change, revokes every session, and audits atomically", async () => {
    const { operations, service, tx } = fixture();
    await service.replaceTemporaryPassword(
      superActor,
      "employee-1",
      "Replacement#123",
    );
    expect(tx.replacePassword).toHaveBeenCalledWith(
      "employee-1",
      "argon-hash",
      true,
    );
    expect(operations.slice(-4)).toEqual([
      "password",
      "revoke",
      "audit:workforce.user_updated",
      "tx:commit",
    ]);
  });

  it("requires the exact permission within the mutation transaction", async () => {
    const { service, tx } = fixture();
    tx.hasPermission = vi.fn(async () => false);
    await expect(
      service.disableUser(superActor, "employee-1"),
    ).rejects.toMatchObject({ code: "AUTH_PERMISSION_DENIED" });
    expect(tx.setStatus).not.toHaveBeenCalled();
  });

  it("does not commit partial role/session/audit writes when the audit fails", async () => {
    const { repository, service, tx } = fixture();
    tx.writeAudit = vi.fn(async () => {
      throw new Error("audit unavailable");
    });
    await expect(
      service.setRole(superActor, "employee-1", "support_operator"),
    ).rejects.toThrow("audit unavailable");
    expect(repository.transaction).toHaveBeenCalledOnce();
  });

  it("audits role replacement as one role_changed event with before and after roles", async () => {
    const { service, tx } = fixture();
    await service.setRole(superActor, "employee-1", "support_operator");
    expect(tx.writeAudit).toHaveBeenCalledWith({
      event: "workforce.user_updated",
      actorId: "super-1",
      targetId: "employee-1",
      change: "role_changed",
      fromRole: "employee",
      toRole: "support_operator",
    });
  });
});

it("exposes stable typed mutation errors", () => {
  expect(new WorkforceMutationError("WORKFORCE_TARGET_NOT_FOUND").code).toBe(
    "WORKFORCE_TARGET_NOT_FOUND",
  );
});

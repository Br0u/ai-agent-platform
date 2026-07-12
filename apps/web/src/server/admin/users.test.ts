import { describe, expect, it, vi } from "vitest";

import {
  WorkforceMutationError,
  createWorkforceUserQueryService,
  createWorkforceUserService,
  type WorkforceMutationRepository,
  type WorkforceRole,
} from "./users";

describe("workforce user query", () => {
  it("paginates distinct users first, then batch-aggregates deterministic scoped roles and safe sessions", async () => {
    const searchUsers = vi.fn(async () => ({
      items: [
        {
          id: "staff-1",
          name: "Staff",
          email: "staff@example.test",
          username: "staff",
          realm: "workforce" as const,
          status: "active" as const,
        },
        {
          id: "staff-2",
          name: "Other",
          email: "other@example.test",
          username: "other",
          realm: "workforce" as const,
          status: "active" as const,
        },
      ],
      total: 3,
    }));
    const findRolesByUserIds = vi.fn(async () => [
      {
        userId: "staff-1",
        name: "support_operator",
        scope: "workforce" as const,
      },
      { userId: "staff-1", name: "employee", scope: "workforce" as const },
      { userId: "staff-2", name: "employee", scope: "workforce" as const },
    ]);
    const findSessionsByUserIds = vi.fn(async () => [
      {
        userId: "staff-1",
        id: "session-1",
        createdAt: new Date("2026-07-12T00:00:00Z"),
        expiresAt: new Date("2026-07-13T00:00:00Z"),
        token: "raw-token",
      },
    ]);
    const result = await createWorkforceUserQueryService({
      searchUsers,
      findRolesByUserIds,
      findSessionsByUserIds,
    }).list(superActor, {
      search: "staff",
      realm: "workforce",
      status: "active",
      page: 1,
      pageSize: 2,
    });
    expect(searchUsers).toHaveBeenCalledWith({
      search: "staff",
      realm: "workforce",
      status: "active",
      page: 1,
      pageSize: 2,
    });
    expect(findRolesByUserIds).toHaveBeenCalledOnce();
    expect(findRolesByUserIds).toHaveBeenCalledWith(["staff-1", "staff-2"]);
    expect(findSessionsByUserIds).toHaveBeenCalledOnce();
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.roles).toEqual([
      { name: "employee", scope: "workforce" },
      { name: "support_operator", scope: "workforce" },
    ]);
    expect(result.items[0]?.role).toBe("employee");
    expect(JSON.stringify(result)).not.toContain("raw-token");
    expect(result.items[0]?.sessions[0]?.id).toBe("session-1");
  });

  it("rejects queries without admin users permission", async () => {
    const service = createWorkforceUserQueryService({
      searchUsers: vi.fn(),
      findRolesByUserIds: vi.fn(),
      findSessionsByUserIds: vi.fn(),
    });
    await expect(
      service.list(
        { ...superActor, permissions: [] },
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({ code: "AUTH_PERMISSION_DENIED" });
  });
});

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
    listRoles: vi.fn(async (id) => {
      const role = users.get(id)?.role;
      return role ? [role] : [];
    }),
    addRole: vi.fn(async (_id, role) => {
      operations.push(`role:add:${role}`);
    }),
    removeRole: vi.fn(async (_id, role) => {
      operations.push(`role:remove:${role}`);
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
    ["addRole", "admin:roles"],
    ["removeRole", "admin:roles"],
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
      if (method === "addRole")
        await service.addRole(superActor, "employee-1", "support_operator");
      if (method === "removeRole") {
        tx.listRoles = vi.fn(
          async (id): Promise<WorkforceRole[]> =>
            id === "employee-1"
              ? ["employee", "support_operator"]
              : ["super_admin"],
        );
        await service.removeRole(superActor, "employee-1", "employee");
      }
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

  it.each(["addRole", "removeRole"] as const)(
    "stops before opening a transaction when the sensitive guard denies %s",
    async (method) => {
      const { repository, requireSensitiveAction, service } = fixture();
      requireSensitiveAction.mockRejectedValueOnce(
        new Error("AUTH_REAUTH_REQUIRED"),
      );
      const operation =
        method === "addRole"
          ? service.addRole(superActor, "employee-1", "support_operator")
          : service.removeRole(superActor, "employee-1", "employee");
      await expect(operation).rejects.toThrow("AUTH_REAUTH_REQUIRED");
      expect(repository.transaction).not.toHaveBeenCalled();
    },
  );
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

  it.each(["admin", "super_admin"])(
    "prevents an admin from creating or promoting privileged role %s",
    async (role) => {
      const created = fixture();
      created.requireSensitiveAction.mockResolvedValueOnce({
        ...superActor,
        userId: "admin-1",
      });
      await expect(
        created.service.createUser(
          { ...superActor, userId: "admin-1", role: "admin" },
          {
            name: "Privileged",
            email: `${role}@example.test`,
            username: role,
            temporaryPassword: "Temporary#123",
            initialRole: role,
          },
        ),
      ).rejects.toMatchObject({ code: "WORKFORCE_SUPER_ADMIN_REQUIRED" });

      const promoted = fixture();
      promoted.requireSensitiveAction.mockResolvedValueOnce({
        ...superActor,
        userId: "admin-1",
      });
      await expect(
        promoted.service.setRole(
          { ...superActor, userId: "admin-1", role: "admin" },
          "employee-1",
          role,
        ),
      ).rejects.toMatchObject({ code: "WORKFORCE_SUPER_ADMIN_REQUIRED" });
    },
  );

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
    tx.listRoles = vi.fn(async (): Promise<WorkforceRole[]> => ["super_admin"]);
    await expect(
      service.disableUser(superActor, "super-2"),
    ).rejects.toMatchObject({ code: "WORKFORCE_LAST_SUPER_ADMIN" });
  });

  it("protects a last super admin even when the target's first role is non-privileged", async () => {
    const { service, tx } = fixture();
    tx.findTarget = vi.fn(async (id) =>
      id === "super-1"
        ? {
            id,
            realm: "workforce" as const,
            status: "active" as const,
            role: "super_admin" as const,
          }
        : {
            id,
            realm: "workforce" as const,
            status: "active" as const,
            role: "employee" as const,
          },
    );
    tx.listRoles = vi.fn(
      async (id): Promise<WorkforceRole[]> =>
        id === "super-1" ? ["super_admin"] : ["employee", "super_admin"],
    );

    await expect(
      service.disableUser(superActor, "super-2"),
    ).rejects.toMatchObject({ code: "WORKFORCE_LAST_SUPER_ADMIN" });
    expect(tx.setStatus).not.toHaveBeenCalled();
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

  it.each(["addRole", "removeRole"] as const)(
    "rejects cross-realm targets for explicit %s",
    async (method) => {
      const { service, tx } = fixture();
      const operation =
        method === "addRole"
          ? service.addRole(superActor, "customer-1", "employee")
          : service.removeRole(superActor, "customer-1", "employee");
      await expect(operation).rejects.toMatchObject({
        code: "WORKFORCE_TARGET_REALM_INVALID",
      });
      expect(tx.addRole).not.toHaveBeenCalled();
      expect(tx.removeRole).not.toHaveBeenCalled();
    },
  );

  it("disables and revokes sessions atomically, then permits explicit reactivation", async () => {
    const { operations, service, tx: disabledTx } = fixture();
    await service.disableUser(superActor, "employee-1");
    expect(operations).toContain("status:disabled");
    expect(operations).toContain("revoke");
    expect(operations.at(-1)).toBe("tx:commit");
    expect(disabledTx.writeAudit).toHaveBeenCalledWith({
      event: "workforce.user_updated",
      actorId: "super-1",
      targetId: "employee-1",
      change: "disabled",
    });

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
    expect(tx.writeAudit).toHaveBeenCalledWith({
      event: "workforce.user_updated",
      actorId: "super-1",
      targetId: "employee-1",
      change: "reactivated",
    });
  });

  it.each(["reactivateUser", "replaceTemporaryPassword"] as const)(
    "protects multi-role privileged targets during %s",
    async (method) => {
      const { requireSensitiveAction, service, tx } = fixture();
      requireSensitiveAction.mockResolvedValueOnce({
        ...superActor,
        userId: "admin-2",
      });
      tx.findTarget = vi.fn(async (id) =>
        id === "admin-2"
          ? {
              id,
              realm: "workforce" as const,
              status: "active" as const,
              role: "admin" as const,
            }
          : {
              id,
              realm: "workforce" as const,
              status:
                method === "reactivateUser"
                  ? ("disabled" as const)
                  : ("active" as const),
              role: "employee" as const,
            },
      );
      tx.listRoles = vi.fn(
        async (id): Promise<WorkforceRole[]> =>
          id === "admin-2" ? ["admin"] : ["employee", "admin"],
      );
      const actor = {
        ...superActor,
        userId: "admin-2",
        role: "admin" as const,
      };
      const operation =
        method === "reactivateUser"
          ? service.reactivateUser(actor, "admin-1")
          : service.replaceTemporaryPassword(
              actor,
              "admin-1",
              "Replacement#123",
            );
      await expect(operation).rejects.toMatchObject({
        code: "WORKFORCE_SUPER_ADMIN_REQUIRED",
      });
    },
  );

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

  it.each(["addRole", "removeRole"] as const)(
    "does not commit explicit %s when its audit write fails",
    async (method) => {
      const { operations, service, tx } = fixture();
      tx.listRoles = vi.fn(
        async (id): Promise<WorkforceRole[]> =>
          id === "employee-1"
            ? ["employee", "support_operator"]
            : ["super_admin"],
      );
      tx.writeAudit = vi.fn(async () => {
        operations.push("audit:failed");
        throw new Error("audit unavailable");
      });
      const operation =
        method === "addRole"
          ? service.addRole(superActor, "employee-1", "content_operator")
          : service.removeRole(superActor, "employee-1", "support_operator");
      await expect(operation).rejects.toThrow("audit unavailable");
      expect(operations).not.toContain("tx:commit");
    },
  );

  it.each(["disableUser", "reactivateUser"] as const)(
    "does not commit %s when its audit write fails",
    async (method) => {
      const { operations, service, tx } = fixture();
      if (method === "reactivateUser") {
        tx.findTarget = vi.fn(async (id) =>
          id === "super-1"
            ? {
                id,
                realm: "workforce" as const,
                status: "active" as const,
                role: "super_admin" as const,
              }
            : {
                id,
                realm: "workforce" as const,
                status: "disabled" as const,
                role: "employee" as const,
              },
        );
      }
      tx.writeAudit = vi.fn(async () => {
        operations.push("audit:failed");
        throw new Error("audit unavailable");
      });
      const operation =
        method === "disableUser"
          ? service.disableUser(superActor, "employee-1")
          : service.reactivateUser(superActor, "employee-1");
      await expect(operation).rejects.toThrow("audit unavailable");
      expect(operations).not.toContain("tx:commit");
    },
  );

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

  it("adds a distinct workforce role and audits exact actor, target, and role atomically", async () => {
    const { operations, service, tx } = fixture();
    await service.addRole(superActor, "employee-1", "support_operator");
    expect(tx.addRole).toHaveBeenCalledWith(
      "employee-1",
      "support_operator",
      "super-1",
    );
    expect(tx.revokeSessions).toHaveBeenCalledWith("employee-1");
    expect(tx.writeAudit).toHaveBeenCalledWith({
      event: "workforce.user_updated",
      actorId: "super-1",
      targetId: "employee-1",
      change: "role_added",
      role: "support_operator",
    });
    expect(operations.slice(-4)).toEqual([
      "role:add:support_operator",
      "revoke",
      "audit:workforce.user_updated",
      "tx:commit",
    ]);
  });

  it("removes an assigned role and audits exact actor, target, and role atomically", async () => {
    const { operations, service, tx } = fixture();
    tx.listRoles = vi.fn(
      async (id): Promise<WorkforceRole[]> =>
        id === "employee-1"
          ? ["employee", "support_operator"]
          : ["super_admin"],
    );
    await service.removeRole(superActor, "employee-1", "employee");
    expect(tx.removeRole).toHaveBeenCalledWith("employee-1", "employee");
    expect(tx.revokeSessions).toHaveBeenCalledWith("employee-1");
    expect(tx.writeAudit).toHaveBeenCalledWith({
      event: "workforce.user_updated",
      actorId: "super-1",
      targetId: "employee-1",
      change: "role_removed",
      role: "employee",
    });
    expect(operations.slice(-4)).toEqual([
      "role:remove:employee",
      "revoke",
      "audit:workforce.user_updated",
      "tx:commit",
    ]);
  });

  it("rejects removing the user's last assigned role", async () => {
    const { service } = fixture();
    await expect(
      service.removeRole(superActor, "employee-1", "employee"),
    ).rejects.toMatchObject({ code: "WORKFORCE_LAST_ROLE" });
  });

  it("rejects adding an already assigned role and removing an unassigned role", async () => {
    const added = fixture();
    await expect(
      added.service.addRole(superActor, "employee-1", "employee"),
    ).rejects.toMatchObject({ code: "WORKFORCE_ROLE_ALREADY_ASSIGNED" });
    const removed = fixture();
    removed.tx.listRoles = vi.fn(
      async (id): Promise<WorkforceRole[]> =>
        id === "employee-1"
          ? ["employee", "support_operator"]
          : ["super_admin"],
    );
    await expect(
      removed.service.removeRole(superActor, "employee-1", "content_operator"),
    ).rejects.toMatchObject({ code: "WORKFORCE_ROLE_NOT_ASSIGNED" });
  });

  it.each(["addRole", "removeRole"] as const)(
    "uses authoritative transaction state to stop an admin from %s on privileged accounts",
    async (method) => {
      const { requireSensitiveAction, service, tx } = fixture();
      requireSensitiveAction.mockResolvedValueOnce({
        ...superActor,
        userId: "admin-2",
      });
      tx.listRoles = vi.fn(
        async (id): Promise<WorkforceRole[]> =>
          id === "admin-1"
            ? ["admin", "employee"]
            : id === "admin-2"
              ? ["admin"]
              : [],
      );
      const operation =
        method === "addRole"
          ? service.addRole(
              { ...superActor, userId: "admin-2", role: "admin" },
              "admin-1",
              "support_operator",
            )
          : service.removeRole(
              { ...superActor, userId: "admin-2", role: "admin" },
              "admin-1",
              "employee",
            );
      await expect(operation).rejects.toMatchObject({
        code: "WORKFORCE_SUPER_ADMIN_REQUIRED",
      });
    },
  );

  it("protects the last active super-admin role during explicit removal", async () => {
    const { service, tx } = fixture();
    tx.findTarget = vi.fn(async (id) => ({
      id,
      realm: "workforce" as const,
      status: "active" as const,
      role: "super_admin" as const,
    }));
    tx.listRoles = vi.fn(
      async (): Promise<WorkforceRole[]> => ["super_admin", "employee"],
    );
    await expect(
      service.removeRole(superActor, "super-2", "super_admin"),
    ).rejects.toMatchObject({ code: "WORKFORCE_LAST_SUPER_ADMIN" });
    expect(tx.removeRole).not.toHaveBeenCalled();
  });

  it("protects the last super admin during legacy role replacement even when another role is selected first", async () => {
    const { service, tx } = fixture();
    tx.findTarget = vi.fn(async (id) =>
      id === "super-1"
        ? {
            id,
            realm: "workforce" as const,
            status: "active" as const,
            role: "super_admin" as const,
          }
        : {
            id,
            realm: "workforce" as const,
            status: "active" as const,
            role: "employee" as const,
          },
    );
    tx.listRoles = vi.fn(
      async (id): Promise<WorkforceRole[]> =>
        id === "super-1" ? ["super_admin"] : ["employee", "super_admin"],
    );
    await expect(
      service.setRole(superActor, "super-2", "support_operator"),
    ).rejects.toMatchObject({ code: "WORKFORCE_LAST_SUPER_ADMIN" });
    expect(tx.assignOnlyRole).not.toHaveBeenCalled();
  });
});

it("exposes stable typed mutation errors", () => {
  expect(new WorkforceMutationError("WORKFORCE_TARGET_NOT_FOUND").code).toBe(
    "WORKFORCE_TARGET_NOT_FOUND",
  );
});

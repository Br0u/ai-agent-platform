import { describe, expect, it } from "vitest";

import {
  runSeedAccessControl,
  seedAccessControl,
  type AccessControlSeedRepository,
  type PermissionSeed,
  type RoleRealm,
  type RoleSeed,
} from "./seed-access-control";

class InMemoryRepository implements AccessControlSeedRepository {
  readonly permissions = new Map<string, PermissionSeed>();
  readonly roles = new Map<string, RoleSeed>();
  readonly grants = new Map<string, Set<string>>();
  transactions = 0;

  async transaction<T>(
    work: (repository: AccessControlSeedRepository) => Promise<T>,
  ): Promise<T> {
    this.transactions += 1;
    return work(this);
  }

  async upsertPermission(permission: PermissionSeed): Promise<void> {
    this.permissions.set(permission.key, permission);
  }

  async upsertRole(role: RoleSeed): Promise<void> {
    this.roles.set(roleKey(role.name, role.realmScope), role);
  }

  async replaceRolePermissions(
    roleName: string,
    realmScope: RoleRealm,
    permissionKeys: readonly string[],
  ): Promise<void> {
    this.grants.set(roleKey(roleName, realmScope), new Set(permissionKeys));
  }

  async acquireSeedLock(): Promise<void> {}
}

const permissionKeys = [
  "console:access",
  "console:team",
  "admin:site",
  "admin:assistant",
  "admin:navigation",
  "admin:products",
  "admin:releases",
  "admin:docs",
  "admin:blog",
  "admin:cases",
  "admin:faq",
  "admin:compatibility",
  "admin:marketplace",
  "admin:analytics",
  "admin:registrations",
  "admin:users",
  "admin:roles",
  "admin:audit",
] as const;

const adminPermissions = permissionKeys.filter((key) =>
  key.startsWith("admin:"),
);

const contentPermissions = [
  "admin:site",
  "admin:navigation",
  "admin:products",
  "admin:releases",
  "admin:docs",
  "admin:blog",
  "admin:cases",
  "admin:faq",
  "admin:compatibility",
  "admin:marketplace",
];

function roleKey(name: string, realmScope: RoleRealm): string {
  return `${realmScope}:${name}`;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe("seedAccessControl", () => {
  it("upserts the exact role, permission, and grant matrix", async () => {
    const repository = new InMemoryRepository();

    await seedAccessControl(repository);

    expect([...repository.permissions.keys()]).toEqual(permissionKeys);
    expect(repository.permissions.get("admin:assistant")).toEqual({
      key: "admin:assistant",
      name: "管理 AI 助理",
    });
    expect([...repository.roles.keys()]).toEqual([
      "customer:customer_member",
      "customer:customer_admin",
      "workforce:employee",
      "workforce:content_operator",
      "workforce:support_operator",
      "workforce:admin",
      "workforce:super_admin",
    ]);
    expect(
      sorted(repository.grants.get("customer:customer_member") ?? []),
    ).toEqual(["console:access"]);
    expect(
      sorted(repository.grants.get("customer:customer_admin") ?? []),
    ).toEqual(sorted(["console:access", "console:team"]));
    expect(sorted(repository.grants.get("workforce:employee") ?? [])).toEqual(
      [],
    );
    expect(
      sorted(repository.grants.get("workforce:content_operator") ?? []),
    ).toEqual(sorted(contentPermissions));
    expect(
      sorted(repository.grants.get("workforce:support_operator") ?? []),
    ).toEqual(["admin:registrations"]);
    expect(sorted(repository.grants.get("workforce:admin") ?? [])).toEqual(
      sorted(adminPermissions),
    );
    expect(
      sorted(repository.grants.get("workforce:super_admin") ?? []),
    ).toEqual(sorted(adminPermissions));
    for (const role of ["employee", "content_operator", "support_operator"]) {
      expect(
        repository.grants.get(`workforce:${role}`)?.has("admin:assistant") ??
          false,
      ).toBe(false);
    }
    expect(
      repository.grants.get("workforce:admin")?.has("admin:assistant"),
    ).toBe(true);
    expect(
      repository.grants.get("workforce:super_admin")?.has("admin:assistant"),
    ).toBe(true);
    for (const [role, grants] of repository.grants) {
      if (role.startsWith("workforce:")) {
        expect([...grants].some((key) => key.startsWith("console:"))).toBe(
          false,
        );
      }
    }
  });

  it("is idempotent and replaces stale grants", async () => {
    const repository = new InMemoryRepository();
    repository.grants.set(
      "workforce:support_operator",
      new Set(["admin:users", "console:access"]),
    );

    await seedAccessControl(repository);
    await seedAccessControl(repository);

    expect(repository.transactions).toBe(2);
    expect(repository.permissions.size).toBe(18);
    expect(repository.roles.size).toBe(7);
    expect(repository.grants.size).toBe(7);
    expect(
      sorted(repository.grants.get("workforce:support_operator") ?? []),
    ).toEqual(["admin:registrations"]);
  });

  it("preserves unknown catalog entries and their grants", async () => {
    const repository = new InMemoryRepository();
    repository.roles.set("workforce:legacy_role", {
      name: "legacy_role",
      realmScope: "workforce",
    });
    repository.roles.set("workforce:custom_role", {
      name: "custom_role",
      realmScope: "workforce",
    });
    repository.permissions.set("legacy:permission", {
      key: "legacy:permission",
      name: "Legacy",
    });
    repository.permissions.set("custom:permission", {
      key: "custom:permission",
      name: "Custom",
    });
    repository.grants.set(
      "workforce:legacy_role",
      new Set(["legacy:permission"]),
    );

    await seedAccessControl(repository);

    expect(repository.roles.has("workforce:legacy_role")).toBe(true);
    expect(repository.permissions.has("legacy:permission")).toBe(true);
    expect(repository.grants.get("workforce:legacy_role")).toEqual(
      new Set(["legacy:permission"]),
    );
    expect(repository.roles.has("workforce:custom_role")).toBe(true);
    expect(repository.permissions.has("custom:permission")).toBe(true);
  });

  it("closes the database after seeding", async () => {
    const repository = new InMemoryRepository();
    let closed = false;

    await runSeedAccessControl(repository, async () => {
      closed = true;
    });

    expect(closed).toBe(true);
    expect(repository.roles.size).toBe(7);
  });

  it("closes the database when seeding fails", async () => {
    const repository = new InMemoryRepository();
    repository.upsertPermission = async () => {
      throw new Error("seed failed");
    };
    let closed = false;

    await expect(
      runSeedAccessControl(repository, async () => {
        closed = true;
      }),
    ).rejects.toThrow("seed failed");
    expect(closed).toBe(true);
  });
});

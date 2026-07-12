import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), list: vi.fn() }));
vi.mock("@/server/auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/admin/roles", () => ({
  createDefaultRoleQueryService: () => ({ list: mocks.list }),
}));
vi.mock("@/server/admin/actions", () => ({
  addUserRoleAction: vi.fn(),
  removeUserRoleAction: vi.fn(),
  replaceRolePermissionsAction: vi.fn(),
  setUserRoleAction: vi.fn(),
}));
import RolesPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("admin roles page", () => {
  it("renders workforce scope labels and guarded mutation forms", async () => {
    const actor = { userId: "admin", permissions: ["admin:roles"] };
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.list.mockResolvedValue({
      items: [
        {
          id: "role-1",
          name: "support_operator",
          description: "Support",
          realmScope: "workforce",
          permissionKeys: ["admin:tickets"],
        },
        {
          id: "super-role",
          name: "super_admin",
          description: "System administrator",
          realmScope: "workforce",
          permissionKeys: ["admin:roles", "admin:users"],
        },
      ],
      total: 21,
      page: 1,
      pageSize: 20,
    });
    render(
      await RolesPage({ searchParams: Promise.resolve({ search: "support" }) }),
    );
    expect(screen.getAllByText("内部员工域")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "更新权限" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "添加角色" })).toBeVisible();
    expect(screen.getByRole("button", { name: "移除角色" })).toBeVisible();
    expect(screen.getByText("系统基线：admin:roles 不可移除")).toBeVisible();
    expect(screen.getByRole("link", { name: "下一页" })).toHaveAttribute(
      "href",
      expect.stringContaining("search=support"),
    );
  });
});

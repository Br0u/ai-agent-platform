import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), list: vi.fn() }));
vi.mock("@/server/auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/admin/users", () => ({
  WORKFORCE_ROLES: ["employee", "admin", "super_admin"],
  createDefaultWorkforceUserQueryService: () => ({ list: mocks.list }),
}));
vi.mock("@/server/admin/actions", () => ({
  createEmployeeAction: vi.fn(),
  disableUserAction: vi.fn(),
  reactivateUserAction: vi.fn(),
  replacePasswordAction: vi.fn(),
  revokeAdminSessionAction: vi.fn(),
  revokeAllAdminSessionsAction: vi.fn(),
}));

import UsersPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("admin users page", () => {
  it("renders GET filters and small forms for every required account/session action", async () => {
    const actor = { userId: "admin", permissions: ["admin:users"] };
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.list.mockResolvedValue({
      items: [
        {
          id: "staff-1",
          name: "林青",
          email: "lin@example.test",
          username: "lin",
          realm: "workforce",
          status: "active",
          role: "employee",
          sessions: [
            {
              id: "session-1",
              createdAt: "2026-07-12T00:00:00.000Z",
              expiresAt: "2026-07-13T00:00:00.000Z",
            },
          ],
        },
      ],
      total: 21,
      page: 1,
      pageSize: 20,
    });
    render(
      await UsersPage({
        searchParams: Promise.resolve({
          realm: "workforce",
          status: "active",
          search: "lin",
        }),
      }),
    );
    expect(mocks.list).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        realm: "workforce",
        status: "active",
        search: "lin",
      }),
    );
    expect(screen.getByRole("combobox", { name: "用户类型" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "状态" })).toBeVisible();
    for (const name of [
      "创建员工",
      "停用账号",
      "替换临时密码",
      "撤销此会话",
      "撤销全部会话",
    ])
      expect(screen.getByRole("button", { name })).toBeVisible();
    expect(screen.getByRole("link", { name: "下一页" })).toHaveAttribute(
      "href",
      expect.stringContaining("realm=workforce"),
    );
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), list: vi.fn() }));
vi.mock("@/server/auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/admin/audit-logs", () => ({
  createDefaultAuditLogQueryService: () => ({ list: mocks.list }),
}));
import AuditLogsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("audit logs page", () => {
  it("renders actor/action/target/time GET filters and append-only results", async () => {
    mocks.requirePermission.mockResolvedValue({
      userId: "auditor",
      permissions: ["admin:audit"],
    });
    mocks.list.mockResolvedValue({
      items: [
        {
          id: "audit-1",
          actorUserId: "staff-1",
          actorRealm: "workforce",
          action: "session.revoked",
          targetType: "session",
          targetId: "session-1",
          metadata: { revokedCount: 1 },
          createdAt: "2026-07-12T00:00:00.000Z",
        },
      ],
      total: 21,
      page: 1,
      pageSize: 20,
    });
    render(
      await AuditLogsPage({
        searchParams: Promise.resolve({ action: "session.revoked" }),
      }),
    );
    for (const name of ["操作人", "事件", "目标", "开始时间", "结束时间"])
      expect(screen.getByLabelText(name)).toBeVisible();
    expect(screen.getByText("session.revoked")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /删除|编辑/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下一页" })).toHaveAttribute(
      "href",
      expect.stringContaining("action=session.revoked"),
    );
  });
});

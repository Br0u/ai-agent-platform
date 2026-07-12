import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), list: vi.fn() }));
vi.mock("@/server/auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/registration/actions", () => ({
  createDefaultRegistrationService: () => ({
    listRegistrationRequests: mocks.list,
  }),
}));
import RegistrationsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("RegistrationsPage", () => {
  it("rechecks permission, parses pagination and renders authorized PII", async () => {
    const actor = {
      userId: "staff",
      realm: "workforce",
      status: "active",
      permissions: ["admin:registrations"],
    };
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.list.mockResolvedValue({
      items: [
        {
          id: "d9428888-122b-11e1-b85c-61cd3cbb3210",
          applicantName: "林青",
          email: "lin@example.com",
          companyName: "青云科技",
          createdAt: "2026-07-12T00:00:00.000Z",
          status: "pending_review",
        },
      ],
      total: 21,
      page: 2,
      pageSize: 10,
    });
    render(
      await RegistrationsPage({
        searchParams: Promise.resolve({
          status: "pending_review",
          page: "2",
          pageSize: "10",
        }),
      }),
    );
    expect(mocks.requirePermission).toHaveBeenCalledWith("admin:registrations");
    expect(mocks.list).toHaveBeenCalledWith(
      { status: "pending_review", page: 2, pageSize: 10 },
      actor,
    );
    expect(screen.getByText("lin@example.com")).toBeVisible();
    expect(screen.getByRole("link", { name: "下一页" })).toHaveAttribute(
      "href",
      "/admin/registrations?status=pending_review&page=3&pageSize=10",
    );
  });
  it("uses safe defaults and renders deterministic empty state", async () => {
    mocks.requirePermission.mockResolvedValue({
      userId: "staff",
      realm: "workforce",
      status: "active",
      permissions: ["admin:registrations"],
    });
    mocks.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    render(
      await RegistrationsPage({
        searchParams: Promise.resolve({
          status: "bogus",
          page: "-1",
          pageSize: "999",
        }),
      }),
    );
    expect(mocks.list.mock.calls[0][0]).toEqual({
      status: "pending_review",
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByText("当前筛选条件下没有注册申请")).toBeVisible();
  });
});

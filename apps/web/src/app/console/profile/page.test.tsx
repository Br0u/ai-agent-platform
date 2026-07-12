import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireConsolePage: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/server/auth/workspace-route-guards", () => ({
  requireConsolePage: mocks.requireConsolePage,
}));
vi.mock("@/server/admin/sessions", () => ({
  createDefaultCustomerSessionService: () => ({ list: mocks.list }),
}));
vi.mock("@/server/admin/actions", () => ({
  revokeCustomerSessionAction: vi.fn(),
}));
import ProfilePage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("customer profile page", () => {
  it("lists own sessions and provides revoke without exposing raw token", async () => {
    mocks.requireConsolePage.mockResolvedValue({
      userId: "customer-1",
      displayName: "客户",
    });
    mocks.list.mockResolvedValue([
      {
        id: "session-1",
        realm: "customer",
        createdAt: "2026-07-12T00:00:00.000Z",
        expiresAt: "2026-07-13T00:00:00.000Z",
        ipAddress: null,
        userAgent: "Browser",
      },
    ]);
    const { container } = render(await ProfilePage());
    expect(mocks.list).toHaveBeenCalledWith("customer-1");
    expect(screen.getByRole("button", { name: "退出此设备" })).toBeVisible();
    expect(container.textContent).not.toContain("token");
  });
});

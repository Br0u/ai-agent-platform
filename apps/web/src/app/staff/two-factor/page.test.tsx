import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  requireWorkforce: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/server/auth/access", () => ({
  getCurrentActor: mocks.getCurrentActor,
  requireWorkforce: mocks.requireWorkforce,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth/server-actions", () => ({
  enrollStaffTwoFactorAction: vi.fn(),
  verifyStaffTwoFactorAction: vi.fn(),
}));

import Page from "./page";

const actor = (overrides: Record<string, unknown> = {}) => ({
  userId: "staff-1",
  realm: "workforce",
  status: "active",
  displayName: "Staff",
  mustChangePassword: false,
  twoFactorEnabled: false,
  permissions: [],
  ...overrides,
});

describe("staff two-factor page", () => {
  beforeEach(() => vi.clearAllMocks());
  it("allows only an incomplete actor into initial enrollment", async () => {
    mocks.getCurrentActor.mockResolvedValueOnce(actor());
    mocks.requireWorkforce.mockResolvedValueOnce(actor());
    render(
      await Page({
        searchParams: Promise.resolve({ returnTo: "/admin/users" }),
      }),
    );
    expect(mocks.requireWorkforce).toHaveBeenCalledWith({
      setupFlow: "two-factor",
    });
    expect(screen.getByRole("button", { name: "开始设置" })).toBeEnabled();
  });

  it("redirects an already-enrolled actor instead of exposing enableTwoFactor", async () => {
    mocks.getCurrentActor.mockResolvedValueOnce(
      actor({ twoFactorEnabled: true }),
    );
    await expect(
      Page({ searchParams: Promise.resolve({ returnTo: "/admin/users" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/users");
    expect(mocks.requireWorkforce).not.toHaveBeenCalled();
  });
});

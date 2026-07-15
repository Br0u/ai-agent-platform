import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  removeStaffTwoFactorAction: vi.fn(),
  verifyStaffRecoveryCodeAction: vi.fn(),
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
  afterEach(cleanup);
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
    expect(screen.getByText("Two-Factor Authentication")).toBeVisible();
    expect(screen.getByRole("heading", { name: "双因素认证" })).toBeVisible();
    expect(
      screen.getByText("使用身份验证器完成管理员 TOTP 设置。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "开始设置" })).toBeEnabled();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开 AI 助理" }),
    ).not.toBeInTheDocument();
  });

  it("renders management/removal mode for an already-enrolled actor instead of initial enable mode", async () => {
    mocks.getCurrentActor.mockResolvedValueOnce(
      actor({ twoFactorEnabled: true }),
    );
    mocks.requireWorkforce.mockResolvedValueOnce(
      actor({ twoFactorEnabled: true }),
    );
    render(
      await Page({
        searchParams: Promise.resolve({ returnTo: "/admin/users" }),
      }),
    );
    expect(mocks.requireWorkforce).toHaveBeenCalledWith();
    expect(
      screen.getByRole("button", { name: "移除双因素认证" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "开始设置" }),
    ).not.toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

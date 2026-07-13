import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireWorkforce: vi.fn() }));
vi.mock("@/server/auth/access", () => ({
  requireWorkforce: mocks.requireWorkforce,
}));
vi.mock("@/server/auth/server-actions", () => ({
  changeStaffPasswordAction: vi.fn(),
}));

import Page from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("initial password page", () => {
  it("uses the shared auth shell while preserving the guarded setup flow", async () => {
    const { container } = render(
      await Page({
        searchParams: Promise.resolve({ returnTo: "/admin/users" }),
      }),
    );

    expect(mocks.requireWorkforce).toHaveBeenCalledWith({
      setupFlow: "change-password",
    });
    expect(screen.getByText("Workforce Security")).toBeVisible();
    expect(screen.getByRole("heading", { name: "修改初始密码" })).toBeVisible();
    expect(screen.getByText(/首次登录必须更换/)).toBeVisible();
    expect(container.querySelector('input[name="returnTo"]')).toHaveValue(
      "/admin/users",
    );
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkforce: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/server/auth/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/access")>()),
  requireWorkforce: mocks.requireWorkforce,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth/server-actions", () => ({
  reauthenticateStaffAction: vi.fn(),
}));

import { AuthAccessError } from "@/server/auth/access";
import Page from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("staff re-authentication page", () => {
  it("uses the shared auth shell while preserving the sensitive-operation form", async () => {
    const { container } = render(
      await Page({
        searchParams: Promise.resolve({ returnTo: "/admin/audit" }),
      }),
    );

    expect(mocks.requireWorkforce).toHaveBeenCalledOnce();
    expect(screen.getByText("Sensitive Operation")).toBeVisible();
    expect(screen.getByRole("heading", { name: "重新验证身份" })).toBeVisible();
    expect(screen.getByText(/十分钟内完成密码和 TOTP 验证/)).toBeVisible();
    expect(container.querySelector('input[name="returnTo"]')).toHaveValue(
      "/admin/audit",
    );
    expect(screen.getByLabelText("六位验证码")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
  });

  it("uses a fresh staff login when the old session no longer exists", async () => {
    mocks.requireWorkforce.mockRejectedValueOnce(
      new AuthAccessError("AUTH_SESSION_REQUIRED", 401),
    );

    await expect(
      Page({
        searchParams: Promise.resolve({ returnTo: "/admin/assistant" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/staff/login?returnTo=%2Fadmin%2Fassistant",
    );
  });
});

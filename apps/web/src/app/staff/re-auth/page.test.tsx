import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireWorkforce: vi.fn() }));
vi.mock("@/server/auth/access", () => ({
  requireWorkforce: mocks.requireWorkforce,
}));
vi.mock("@/server/auth/server-actions", () => ({
  reauthenticateStaffAction: vi.fn(),
}));

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
});

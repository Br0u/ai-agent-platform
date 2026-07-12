import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/server-actions", () => ({
  changeStaffPasswordAction: vi.fn(),
}));

import { ChangePasswordForm } from "./change-password-form";

afterEach(cleanup);

describe("ChangePasswordForm", () => {
  it("labels current and new password fields and applies the password contract", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByLabelText("当前密码")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByLabelText("新密码")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("新密码")).toHaveAttribute("minlength", "12");
    expect(screen.getByRole("button", { name: "更新密码" })).toBeEnabled();
  });
});

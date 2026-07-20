import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/server-actions", () => ({
  staffLoginAction: vi.fn(),
}));

import { StaffLoginForm } from "./staff-login-form";

afterEach(cleanup);

describe("StaffLoginForm", () => {
  it("renders the workforce identifier and no public registration entry", () => {
    render(<StaffLoginForm />);

    expect(screen.getByLabelText("员工用户名或邮箱")).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(screen.getByLabelText("员工用户名或邮箱")).toHaveAttribute(
      "name",
      "identifier",
    );
    expect(screen.getByLabelText("员工用户名或邮箱")).toHaveAttribute(
      "placeholder",
      "请输入用户名或企业邮箱",
    );
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("密码")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByLabelText("密码")).toHaveAttribute("name", "password");
    expect(screen.getByLabelText("密码")).toHaveAttribute(
      "placeholder",
      "请输入登录密码",
    );
    expect(screen.getByRole("button", { name: "安全登录" })).toBeEnabled();
    expect(
      screen.queryByRole("link", { name: /注册/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});

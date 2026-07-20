import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthActionState } from "@/contracts/auth-action-state";

vi.mock("@/server/auth/server-actions", () => ({
  customerLoginAction: vi.fn(),
}));

import { CustomerLoginForm } from "./customer-login-form";

afterEach(cleanup);

describe("CustomerLoginForm", () => {
  it("renders labeled customer credentials and the future registration entry", () => {
    render(<CustomerLoginForm />);

    expect(screen.getByLabelText("邮箱")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "password");
    expect(screen.getByRole("link", { name: "注册客户账号" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(
      screen.getByRole("button", { name: "登录客户控制台" }),
    ).toBeEnabled();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("shows only the stable generic error", () => {
    const initialState: AuthActionState = {
      kind: "error",
      code: "AUTH_INVALID_CREDENTIALS",
    };
    render(<CustomerLoginForm initialState={initialState} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "邮箱或密码不正确，请重试。",
    );
    expect(screen.queryByText(/token|database|stack/i)).not.toBeInTheDocument();
  });
});

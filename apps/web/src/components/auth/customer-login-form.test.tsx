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
    expect(screen.getByLabelText("邮箱")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("邮箱")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText("邮箱")).toHaveAttribute(
      "placeholder",
      "请输入邮箱地址",
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
    expect(screen.getByRole("link", { name: "注册客户账号" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.getByRole("button", { name: "立即登录" })).toBeEnabled();
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

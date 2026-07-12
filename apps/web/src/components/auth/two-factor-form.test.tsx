import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/server-actions", () => ({
  enrollStaffTwoFactorAction: vi.fn(),
  removeStaffTwoFactorAction: vi.fn(),
  verifyStaffRecoveryCodeAction: vi.fn(),
  verifyStaffTwoFactorAction: vi.fn(),
}));

import { TwoFactorForm } from "./two-factor-form";

afterEach(cleanup);

describe("TwoFactorForm", () => {
  it("renders a locally generated QR image, manual URI, and one-time recovery warning", () => {
    render(
      <TwoFactorForm
        enrollment={{
          totpURI: "otpauth://totp/AI%20Agent%20Platform:staff",
          qrDataUrl: "data:image/png;base64,local",
          recoveryCodes: ["AAAAA-BBBBB-CCCCC-DDDDD"],
        }}
        verificationInitialState={{
          kind: "error",
          code: "AUTH_INVALID_CREDENTIALS",
        }}
      />,
    );
    expect(
      screen.getByRole("img", { name: "使用身份验证器扫描此 TOTP 二维码" }),
    ).toHaveAttribute("src", "data:image/png;base64,local");
    expect(
      screen.getByText("otpauth://totp/AI%20Agent%20Platform:staff"),
    ).toBeVisible();
    expect(screen.getByText(/恢复码只显示这一次/)).toBeVisible();
    expect(screen.getByText("AAAAA-BBBBB-CCCCC-DDDDD")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("验证码无效");
  });

  it("requires an exactly six-digit verification code and never offers trusted-device state", () => {
    render(<TwoFactorForm returnTo="/admin/users" />);
    const code = screen.getByLabelText("六位验证码");
    expect(code).toHaveAttribute("pattern", "[0-9]{6}");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(screen.queryByLabelText(/信任/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "验证并继续" })).toBeEnabled();
    expect(screen.getByLabelText("恢复码")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
    expect(screen.getByRole("button", { name: "使用恢复码" })).toBeEnabled();
  });

  it("renders an accessible password-confirmed removal form for enrolled staff", () => {
    render(
      <TwoFactorForm
        mode="manage"
        removalInitialState={{ kind: "error", code: "AUTH_REAUTH_REQUIRED" }}
        returnTo="/admin/users"
      />,
    );
    expect(screen.getByLabelText("当前密码")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByRole("status")).toHaveTextContent("重新验证");
    expect(
      screen.getByRole("button", { name: "移除双因素认证" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "开始设置" }),
    ).not.toBeInTheDocument();
  });

  it("announces pending TOTP removal and disables duplicate submission", async () => {
    let resolve!: (value: { kind: "success"; redirectTo: string }) => void;
    const removeAction = vi.fn(
      () =>
        new Promise<{ kind: "success"; redirectTo: string }>((done) => {
          resolve = done;
        }),
    );
    render(<TwoFactorForm mode="manage" removeAction={removeAction} />);
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "Permanent#1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "移除双因素认证" }));
    expect(
      await screen.findByRole("button", { name: "正在移除…" }),
    ).toBeDisabled();
    await act(async () =>
      resolve({ kind: "success", redirectTo: "/staff/two-factor" }),
    );
  });
});

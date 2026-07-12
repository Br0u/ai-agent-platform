import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/server-actions", () => ({
  enrollStaffTwoFactorAction: vi.fn(),
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
  });
});

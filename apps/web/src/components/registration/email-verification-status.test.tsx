import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmailVerificationStatus } from "./email-verification-status";

describe("EmailVerificationStatus", () => {
  afterEach(cleanup);
  it.each([
    ["unverified", "邮箱未验证", "邮箱验证状态：未验证"],
    ["pending", "邮箱等待验证", "邮箱验证状态：等待验证"],
    ["verified", "邮箱已验证", "邮箱验证状态：已验证"],
  ] as const)("renders distinct %s state", (status, heading, label) => {
    const { container } = render(<EmailVerificationStatus status={status} />);
    expect(screen.getByRole("region", { name: label })).toHaveAttribute(
      "data-state",
      status,
    );
    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(container.textContent).not.toMatch(/邮件已发送|已重新发送/);
  });

  it.each(["unverified", "pending"] as const)(
    "keeps the disabled resend placeholder inaccessible for %s",
    (status) => {
      render(<EmailVerificationStatus status={status} />);
      const button = screen.getByRole("button", {
        name: "重新发送验证邮件",
      });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute(
        "aria-describedby",
        "email-verification-resend-help",
      );
      expect(screen.getByText("验证邮件发送通道暂未启用。")).toHaveAttribute(
        "id",
        "email-verification-resend-help",
      );
      expect(screen.queryByText(/已发送/)).not.toBeInTheDocument();
    },
  );

  it("shows verified state without offering a provider action", () => {
    render(<EmailVerificationStatus status="verified" />);
    expect(screen.getByText("邮箱已验证")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

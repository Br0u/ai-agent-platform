import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    "announces disabled resend for %s without claiming an email was sent",
    async (status) => {
      const action = async () => ({
        ok: false as const,
        status: 501 as const,
        code: "EMAIL_VERIFICATION_DISABLED" as const,
      });
      render(<EmailVerificationStatus resendAction={action} status={status} />);
      fireEvent.click(screen.getByRole("button", { name: "重新发送验证邮件" }));
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "验证邮件暂时无法发送",
        ),
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

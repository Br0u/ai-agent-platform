import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmailVerificationStatus } from "./email-verification-status";

describe("EmailVerificationStatus", () => {
  afterEach(cleanup);
  it.each(["unverified", "pending"] as const)(
    "keeps %s honest while provider is disabled",
    (status) => {
      render(<EmailVerificationStatus status={status} />);
      expect(screen.getByText("邮箱验证暂未启用")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "重新发送验证邮件" }),
      ).toBeDisabled();
      expect(screen.queryByText(/已发送/)).not.toBeInTheDocument();
    },
  );

  it("shows verified state without offering a provider action", () => {
    render(<EmailVerificationStatus status="verified" />);
    expect(screen.getByText("邮箱已验证")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

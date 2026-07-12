import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createRegistrationActions } from "@/server/registration/actions";
import { CustomerRegistrationForm } from "./customer-registration-form";

describe("CustomerRegistrationForm", () => {
  afterEach(cleanup);
  it("submits Task 7 field names and associates field errors", async () => {
    const action = vi.fn().mockResolvedValue({
      kind: "validation_error",
      fieldErrors: { email: ["邮箱格式不正确"] },
    });
    render(<CustomerRegistrationForm action={action} />);

    fireEvent.change(screen.getByLabelText("姓名"), {
      target: { value: "林青" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "bad" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "long-enough-password" },
    });
    fireEvent.change(screen.getByLabelText("公司名称"), {
      target: { value: "青云科技" },
    });
    fireEvent.click(screen.getByLabelText(/同意/));
    fireEvent.click(screen.getByRole("button", { name: "提交注册申请" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = action.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(formData)).toMatchObject({
      applicantName: "林青",
      email: "bad",
      password: "long-enough-password",
      companyName: "青云科技",
      acceptedTerms: "on",
    });
    expect(await screen.findByText("邮箱格式不正确")).toHaveAttribute(
      "id",
      "registration-email-error",
    );
    expect(screen.getByLabelText("邮箱")).toHaveAttribute(
      "aria-describedby",
      "registration-email-error",
    );
    expect(screen.getByLabelText("密码")).toHaveValue("");
  });

  it("announces domain and session failures without claiming success", () => {
    const { unmount } = render(
      <CustomerRegistrationForm
        initialState={{
          kind: "domain_error",
          code: "REGISTRATION_NOT_ACCEPTED",
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("无法接受该注册申请");

    unmount();
    render(
      <CustomerRegistrationForm
        initialState={{
          kind: "session_issue_failed",
          code: "AUTH_SESSION_ISSUE_FAILED",
          retryPath: "/login",
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "申请已记录，但自动登录失败",
    );
    expect(screen.getByRole("link", { name: "前往登录" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("renders the real action's Chinese validation messages", async () => {
    const unexpected = vi.fn(() => {
      throw new Error("validation must stop before dependencies are called");
    });
    const action = createRegistrationActions({
      service: {
        submitRegistration: unexpected,
        approveRegistration: unexpected,
        rejectRegistration: unexpected,
      },
      customerAuth: {
        signInEmail: unexpected,
        revokeNewSession: unexpected,
      },
      access: { requirePermission: unexpected },
      provider: {
        getStatus: unexpected,
        requestVerification: unexpected,
        verifyToken: unexpected,
        resendVerification: unexpected,
      },
      commitCookies: unexpected,
      clearCustomerCookies: unexpected,
      reportInternalError: unexpected,
      getClientIp: unexpected,
      getHeaders: unexpected,
    }).submitRegistrationAction;

    render(<CustomerRegistrationForm action={action} />);
    fireEvent.change(screen.getByLabelText("姓名"), {
      target: { value: "林青" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "lin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("公司名称"), {
      target: { value: "青云科技" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交注册申请" }));

    expect(await screen.findByText("密码至少需要 12 个字符")).toBeVisible();
    expect(screen.getByText("请同意平台服务条款与隐私规则")).toBeVisible();
    expect(unexpected).not.toHaveBeenCalled();
  });
});

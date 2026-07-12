import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationReviewForm } from "./registration-review-form";

const request = {
  id: "d9428888-122b-11e1-b85c-61cd3cbb3210",
  companyName: "青云科技",
};

describe("RegistrationReviewForm", () => {
  afterEach(cleanup);
  it("requires confirmation and submits an explicit create decision", async () => {
    const approveAction = vi.fn().mockResolvedValue({ kind: "success" });
    render(
      <RegistrationReviewForm
        request={request}
        approveAction={approveAction}
        rejectAction={vi.fn()}
      />,
    );
    const approve = screen.getByRole("button", { name: "批准注册" });
    expect(approve).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/确认激活客户账号/));
    fireEvent.click(approve);
    await waitFor(() => expect(approveAction).toHaveBeenCalled());
    const data = approveAction.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(data)).toMatchObject({
      organizationKind: "create",
      legalName: "青云科技",
    });
  });

  it("requires a rejection note and explains review conflicts", () => {
    render(
      <RegistrationReviewForm
        request={request}
        initialRejectState={{
          kind: "domain_error",
          code: "REGISTRATION_ALREADY_REVIEWED",
        }}
      />,
    );
    expect(screen.getByLabelText("拒绝说明")).toBeRequired();
    expect(
      screen.getByText("该申请已被其他审核人处理，请刷新列表。"),
    ).toBeVisible();
  });

  it("associates approval field errors with create-organization controls", () => {
    render(
      <RegistrationReviewForm
        request={request}
        initialApproveState={{
          kind: "validation_error",
          fieldErrors: {
            legalName: ["请输入组织法定名称"],
            reviewNote: ["审核备注不能超过 2000 个字符"],
          },
        }}
      />,
    );

    const legalName = screen.getByLabelText(/^组织法定名称/);
    expect(legalName).toHaveAttribute("type", "text");
    expect(legalName).toHaveAttribute("aria-invalid", "true");
    expect(legalName).toHaveAttribute(
      "aria-describedby",
      "approve-legalName-error",
    );
    expect(screen.getByText("请输入组织法定名称")).toHaveAttribute(
      "id",
      "approve-legalName-error",
    );

    const reviewNote = screen.getByLabelText(/^审核备注（可选）/);
    expect(reviewNote).toHaveAttribute("aria-invalid", "true");
    expect(reviewNote).toHaveAttribute(
      "aria-describedby",
      "approve-reviewNote-error",
    );
    expect(screen.getByText("审核备注不能超过 2000 个字符")).toHaveAttribute(
      "id",
      "approve-reviewNote-error",
    );
  });

  it("associates organization and rejection errors with their controls", () => {
    render(
      <RegistrationReviewForm
        request={request}
        initialApproveState={{
          kind: "validation_error",
          fieldErrors: { organizationId: ["请输入有效的组织 ID"] },
        }}
        initialRejectState={{
          kind: "validation_error",
          fieldErrors: { reviewNote: ["请输入拒绝说明"] },
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText("关联现有组织"));
    const organizationId = screen.getByLabelText(/^现有组织 ID/);
    expect(organizationId).toHaveAttribute("aria-invalid", "true");
    expect(organizationId).toHaveAttribute(
      "aria-describedby",
      "organization-id-help approve-organizationId-error",
    );
    expect(screen.getByText("请输入有效的组织 ID")).toHaveAttribute(
      "id",
      "approve-organizationId-error",
    );

    const rejectionNote = screen.getByLabelText(/^拒绝说明/);
    expect(rejectionNote).toHaveAttribute("aria-invalid", "true");
    expect(rejectionNote).toHaveAttribute(
      "aria-describedby",
      "reject-reviewNote-error",
    );
    expect(screen.getByText("请输入拒绝说明")).toHaveAttribute(
      "id",
      "reject-reviewNote-error",
    );
  });
});

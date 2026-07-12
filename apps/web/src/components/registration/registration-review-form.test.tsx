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
    const legalNameError = screen.getByText("请输入组织法定名称");
    expect(legalName).toHaveAttribute("type", "text");
    expect(legalName).toHaveAttribute("aria-invalid", "true");
    expect(legalName).toHaveAttribute("aria-describedby", legalNameError.id);

    const reviewNote = screen.getByLabelText(/^审核备注（可选）/);
    const reviewNoteError = screen.getByText("审核备注不能超过 2000 个字符");
    expect(reviewNote).toHaveAttribute("aria-invalid", "true");
    expect(reviewNote).toHaveAttribute("aria-describedby", reviewNoteError.id);
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
    const organizationHelp = screen.getByText(/当前页面不提供组织检索/);
    const organizationError = screen.getByText("请输入有效的组织 ID");
    expect(organizationId).toHaveAttribute("aria-invalid", "true");
    expect(organizationId).toHaveAttribute(
      "aria-describedby",
      `${organizationHelp.id} ${organizationError.id}`,
    );

    const rejectionNote = screen.getByLabelText(/^拒绝说明/);
    const rejectionError = screen.getByText("请输入拒绝说明");
    expect(rejectionNote).toHaveAttribute("aria-invalid", "true");
    expect(rejectionNote).toHaveAttribute(
      "aria-describedby",
      rejectionError.id,
    );
  });

  it("uses unique described-by targets for every review form instance", () => {
    const approveState = {
      kind: "validation_error" as const,
      fieldErrors: {
        legalName: ["请输入组织法定名称"],
        organizationId: ["请输入有效的组织 ID"],
        reviewNote: ["审核备注不能超过 2000 个字符"],
      },
    };
    const rejectState = {
      kind: "validation_error" as const,
      fieldErrors: { reviewNote: ["请输入拒绝说明"] },
    };
    const { container } = render(
      <>
        <RegistrationReviewForm
          request={request}
          initialApproveState={approveState}
          initialRejectState={rejectState}
        />
        <RegistrationReviewForm
          request={{
            id: "e052a4a8-6ccd-4a7f-a85a-9a95a7426e8b",
            companyName: "星河科技",
          }}
          initialApproveState={approveState}
          initialRejectState={rejectState}
        />
      </>,
    );

    const expectUniqueLocalDescriptions = () => {
      const ids = Array.from(
        container.querySelectorAll<HTMLElement>(".review-form"),
      )
        .flatMap((form) =>
          Array.from(form.querySelectorAll<HTMLElement>("[id]"), (node) =>
            node.getAttribute("id"),
          ),
        )
        .filter((id): id is string => Boolean(id));
      expect(new Set(ids).size).toBe(ids.length);

      for (const control of document.querySelectorAll<HTMLElement>(
        "[aria-describedby]",
      )) {
        const owner = control.closest("form");
        for (const id of control.getAttribute("aria-describedby")!.split(" ")) {
          expect(document.getElementById(id)?.closest("form")).toBe(owner);
        }
      }
    };

    expectUniqueLocalDescriptions();
    for (const linkOption of screen.getAllByLabelText("关联现有组织")) {
      fireEvent.click(linkOption);
    }
    expectUniqueLocalDescriptions();
  });
});

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
});

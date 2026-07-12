import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  reject: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./actions", () => ({
  approveRegistrationAction: mocks.approve,
  rejectRegistrationAction: mocks.reject,
  submitRegistrationAction: vi.fn(),
}));

import { approveRegistration, rejectRegistration } from "./server-actions";

const previous = { kind: "validation_error", fieldErrors: {} } as const;

describe("registration review server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["approval", approveRegistration, mocks.approve],
    ["rejection", rejectRegistration, mocks.reject],
  ] as const)(
    "revalidates the review list after successful %s",
    async (_, action, inner) => {
      inner.mockResolvedValue({ kind: "success" });

      await expect(action(previous, new FormData())).resolves.toEqual({
        kind: "success",
      });

      expect(mocks.revalidatePath).toHaveBeenCalledOnce();
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/registrations");
    },
  );

  it("does not revalidate the review list when review fails", async () => {
    mocks.approve.mockResolvedValue({
      kind: "domain_error",
      code: "REGISTRATION_REVIEW_FAILED",
    });

    await approveRegistration(previous, new FormData());

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects stale sensitive review sessions to re-authentication", async () => {
    mocks.approve.mockResolvedValue({
      kind: "reauth_required",
      redirectTo: "/staff/re-auth?returnTo=%2Fadmin%2Fregistrations",
    });

    await approveRegistration(previous, new FormData());

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/staff/re-auth?returnTo=%2Fadmin%2Fregistrations",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireCustomer: vi.fn(),
  getStatus: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/server/auth/access", () => ({
  requireCustomer: mocks.requireCustomer,
}));
vi.mock("@/server/registration/actions", () => ({
  createDefaultRegistrationService: () => ({
    getRegistrationStatus: mocks.getStatus,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import OnboardingPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("OnboardingPage", () => {
  it("shows pending status and disabled email verification honestly", async () => {
    mocks.requireCustomer.mockResolvedValue({
      userId: "u1",
      realm: "customer",
      status: "pending_review",
      displayName: "林青",
      emailVerificationStatus: "unverified",
    });
    mocks.getStatus.mockResolvedValue({ status: "pending_review" });
    render(await OnboardingPage());
    expect(mocks.requireCustomer).toHaveBeenCalledWith({
      onboardingAllowed: true,
    });
    expect(screen.getByText("林青")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "注册申请审核中" }),
    ).toBeVisible();
    expect(screen.getByText("邮箱验证暂未启用")).toBeVisible();
  });
  it("redirects active customers to console", async () => {
    mocks.requireCustomer.mockResolvedValue({
      realm: "customer",
      status: "active",
    });
    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/console");
  });
  it("does not expose an internal review note for rejected customers", async () => {
    mocks.requireCustomer.mockResolvedValue({
      userId: "u1",
      realm: "customer",
      status: "rejected",
      displayName: "林青",
      emailVerificationStatus: "pending",
    });
    mocks.getStatus.mockResolvedValue({
      status: "rejected",
      reviewNote: "internal secret",
    });
    render(await OnboardingPage());
    expect(
      screen.getByRole("heading", { name: "注册申请未通过" }),
    ).toBeVisible();
    expect(screen.queryByText("internal secret")).not.toBeInTheDocument();
  });
});

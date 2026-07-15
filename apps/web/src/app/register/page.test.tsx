import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/server/auth/access", () => ({
  getCurrentActor: mocks.getCurrentActor,
  AuthAccessError: class AuthAccessError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import RegisterPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("RegisterPage", () => {
  it("forces request-time rendering before checking the live customer session", () => {
    expect(readFileSync("src/app/register/page.tsx", "utf8")).toContain(
      'export const dynamic = "force-dynamic"',
    );
  });
  it("renders a public registration form for visitors", async () => {
    mocks.getCurrentActor.mockResolvedValue(null);
    render(await RegisterPage());
    expect(screen.getByText("Customer Registration")).toBeVisible();
    expect(screen.getByRole("heading", { name: "申请客户账号" })).toBeVisible();
    expect(screen.getByText(/填写真实的联系人与公司信息/)).toBeVisible();
    expect(screen.getByLabelText("公司名称")).toBeVisible();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开 AI 助理" }),
    ).not.toBeInTheDocument();
  });
  it.each([
    ["active", "/console"],
    ["pending_review", "/console/onboarding"],
    ["rejected", "/console/onboarding"],
  ])("redirects %s customer", async (status, destination) => {
    mocks.getCurrentActor.mockResolvedValue({ realm: "customer", status });
    await expect(RegisterPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(destination);
  });
});
import { readFileSync } from "node:fs";

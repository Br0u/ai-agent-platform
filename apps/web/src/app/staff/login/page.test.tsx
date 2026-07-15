import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/server-actions", () => ({ staffLoginAction: vi.fn() }));

import Page from "./page";

afterEach(cleanup);

describe("staff login page", () => {
  it("uses the shared auth shell with workforce context and preserves returnTo", async () => {
    const { container } = render(
      await Page({ searchParams: Promise.resolve({ returnTo: "/admin" }) }),
    );

    expect(screen.getByText("Workforce Access")).toBeVisible();
    expect(screen.getByRole("heading", { name: "员工安全登录" })).toBeVisible();
    expect(screen.getByText(/仅限已由企业管理员开通/)).toBeVisible();
    expect(container.querySelector('input[name="returnTo"]')).toHaveValue(
      "/admin",
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

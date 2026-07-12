import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminMutationForm } from "./admin-mutation-form";

describe("AdminMutationForm", () => {
  it("renders a stable domain-error state without exposing raw exceptions", async () => {
    const action = vi.fn().mockResolvedValue({
      kind: "domain_error",
      code: "WORKFORCE_TARGET_NOT_FOUND",
    });
    render(
      <AdminMutationForm action={action}>
        <button type="submit">停用账号</button>
      </AdminMutationForm>,
    );

    fireEvent.click(screen.getByRole("button", { name: "停用账号" }));

    expect(
      await screen.findByText("操作未完成，请刷新页面后重试。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("WORKFORCE_TARGET_NOT_FOUND")).toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("presents the enterprise platform and solution hierarchy", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "让企业 AI 从模型走向业务" }),
    ).toBeVisible();
    expect(screen.getByText("华鲲元启 AI开发赋能平台")).toBeVisible();
    expect(screen.getByRole("link", { name: "了解平台" })).toHaveAttribute(
      "href",
      "/product",
    );
    expect(screen.getByRole("link", { name: "阅读文档" })).toHaveAttribute(
      "href",
      "/docs",
    );
    expect(
      screen.getByRole("img", { name: "华鲲元启应用广场界面" }),
    ).toBeVisible();
    expect(screen.getByText("基于华鲲元启的行业子能力")).toBeVisible();
    expect(screen.queryByText("AI Agent Platform")).not.toBeInTheDocument();
  });
});

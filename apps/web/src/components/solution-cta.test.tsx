import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SolutionCTA } from "./solution-cta";

afterEach(cleanup);

describe("SolutionCTA", () => {
  it("provides stable return and consultation paths", () => {
    render(
      <SolutionCTA
        title="开始验证方案"
        description="结合业务边界确认交付范围。"
      />,
    );

    expect(screen.getByRole("heading", { name: "开始验证方案" })).toBeVisible();
    expect(screen.getByText("结合业务边界确认交付范围。")).toBeVisible();
    expect(screen.getByRole("link", { name: "返回解决方案" })).toHaveAttribute(
      "href",
      "/solutions",
    );
    expect(screen.getByRole("link", { name: "联系方案顾问" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });
});

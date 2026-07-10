import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("presents the product and primary documentation action", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: /AI Agent Platform/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "阅读文档" })).toHaveAttribute(
      "href",
      "/docs",
    );
  });
});

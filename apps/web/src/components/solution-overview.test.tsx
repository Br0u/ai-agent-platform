import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/solutions/finance-compliance",
}));

import { SolutionOverview } from "./solution-overview";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("V2 solution directory", () => {
  it("starts collapsed, keeps the current route marked, and uses the shared 900px boundary", () => {
    const matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMedia);
    const { container } = render(<SolutionOverview>content</SolutionOverview>);

    expect(container.querySelector(".solution-shell")).toHaveAttribute(
      "data-directory-collapsed",
      "true",
    );
    expect(screen.getByTestId("directory-progress-rail")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "贷款合规智能审查",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(matchMedia).toHaveBeenCalledWith("(max-width: 900px)");

    fireEvent.click(screen.getByRole("button", { name: "展开解决方案目录" }));
    expect(
      screen.queryByTestId("directory-progress-rail"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "贷款合规智能审查",
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("searches and folds the exact industry tree", () => {
    render(<SolutionOverview>content</SolutionOverview>);
    expect(
      screen.getByRole("link", {
        name: "贷款合规智能审查",
        current: "page",
      }),
    ).toBeVisible();

    const search = screen.getByRole("searchbox", {
      name: "在解决方案目录中筛选",
    });
    fireEvent.change(search, { target: { value: "森林火灾" } });
    expect(screen.getByRole("link", { name: "森林火灾预警" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "贷款合规智能审查" }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    const toggle = screen.getByRole("button", {
      name: "展开或收起金融行业解决方案",
    });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: "贷款合规智能审查" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the mobile directory modal and focus trap", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const { container } = render(<SolutionOverview>content</SolutionOverview>);
    fireEvent.click(screen.getByRole("button", { name: "解决方案目录" }));
    const dialog = screen.getByRole("dialog", { name: "解决方案目录" });
    expect(container.querySelector(".solution-content")).toHaveAttribute(
      "inert",
    );
    expect(
      within(dialog).getByRole("searchbox", {
        name: "在解决方案目录中筛选",
      }),
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "解决方案目录" })).toHaveFocus();
  });
});
